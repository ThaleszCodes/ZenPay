import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import readline from 'node:readline';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),ts=require('typescript');
const dir=new URL('../.sites-runtime/test-build/',import.meta.url);mkdirSync(dir,{recursive:true});
for(const file of ['db','security','paggpay']){let src=readFileSync(new URL('../lib/'+file+'.ts',import.meta.url),'utf8');src=src.replace("import { env } from 'cloudflare:workers';","const env = globalThis.__zenpayEnv;").replaceAll("'./db'","'./db.mjs'");writeFileSync(new URL(file+'.mjs',dir),ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}
let route=readFileSync(new URL('../app/api/[...path]/route.ts',import.meta.url),'utf8').replace("import { getChatGPTUser } from '../../chatgpt-auth';","const getChatGPTUser = async () => globalThis.__zenpayTestUser;").replaceAll("'../../../lib/db'","'./db.mjs'").replaceAll("'../../../lib/security'","'./security.mjs'").replaceAll("'../../../lib/paggpay'","'./paggpay.mjs'").replace("from 'zod'","from "+JSON.stringify(require.resolve('zod')));
writeFileSync(new URL('route.mjs',dir),ts.transpileModule(route,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
console.log('Ready for test configuration on stdin (input hidden).');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
let input='';const config=await new Promise(resolve=>{process.stdin.on('data',function onData(c){input+=c.toString();if(input.includes('\n')||input.includes('\r')){process.stdin.off('data',onData);if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();resolve(JSON.parse(input.trim()));}})});
globalThis.__zenpayEnv=config;
const originalFetch=globalThis.fetch;
let providerCalls=0,providerStatus='pending',cashoutCalls=0;
const payments=new Map();
globalThis.fetch=async(url,opts={})=>{
 if(!String(url).includes('paggpay.com'))return originalFetch(url,opts);
 providerCalls++;const path=new URL(url).pathname;const body=opts.body?JSON.parse(opts.body):null;
 if(path.endsWith('/transactions'))return Response.json({data:[]});
 if(path.endsWith('/balance/cash-out/context'))return Response.json({data:{available_minor:10000,fee_minor:100,destination_policy:'own_document',own_document:{name:'QA seller',document:'00000000000'},security:{pin_configured:true,cash_out_frozen:false}}});
 if(path.endsWith('/balance/cash-out')){cashoutCalls++;assert.equal(body.authorization.pin,'1234');return Response.json({data:{cash_out:{id:'cash_test',status:'pending',value:body.value},fee_minor:100}},{status:201});}
 if(path.endsWith('/balance'))return Response.json({data:{available_minor:10000,pending_minor:0,blocked_minor:0,cash_out_fee_minor:100}});
 if(path.endsWith('/pix')&&opts.method==='POST'){assert.equal(body.value,490,'price must be server-authoritative');assert.ok(opts.headers['X-Paggpay-Webhook-Secret']);const tid='txn_'+crypto.randomUUID();payments.set(tid,body);return Response.json({data:{transaction:{id:tid,status:'pending',reference_id:body.reference_id},pix:{code:'000201_test_only',qrcode:'',value:490}}},{status:201});}
 const tid=decodeURIComponent(path.split('/').at(-1));if(payments.has(tid))return Response.json({data:{transaction:{id:tid,status:providerStatus},pix:{value:490}}});
 throw new Error('Unexpected provider request: '+path);
};
const r=await import(new URL('route.mjs',dir));const security=await import(new URL('security.mjs',dir));const db=await import(new URL('db.mjs',dir));
let checks=0;
async function request(path,method='GET',body,headers={}){const req=new Request('https://zenpay.test/api/'+path,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});const res=await r[method](req);return {status:res.status,data:await res.json()};}
function check(condition,name){assert.ok(condition,name);console.log('PASS '+name);checks++;}
const suffix=crypto.randomUUID();const sellerA={userId:'qa_a_'+suffix,email:'qa-a@example.invalid',displayName:'QA A'},sellerB={userId:'qa_b_'+suffix,email:'qa-b@example.invalid',displayName:'QA B'};
globalThis.__zenpayTestUser=null;check((await request('sales')).status===401,'anonymous seller data blocked');
globalThis.__zenpayTestUser=sellerA;check((await request('me')).status===200,'seller persisted in Neon');
check((await request('settings','PUT',{store_name:'QA Store',whatsapp:'5553999999999',environment:'sandbox',api_key:'mock-key-not-a-real-secret'})).status===200,'individual credential saved');
const [seller]=await db.sql('SELECT api_key_encrypted FROM zenpay_sellers WHERE id=$1',[sellerA.userId]);check(!seller.api_key_encrypted.includes('mock-key')&&await security.decrypt(seller.api_key_encrypted)==='mock-key-not-a-real-secret','credential encrypted at rest');
const me=await request('me');check(!JSON.stringify(me.data).includes('mock-key')&&me.data.connected,'credential excluded from seller response');
const p=await request('products','POST',{name:'QA digital pack',price:490,delivery_url:'https://example.com/qa-delivery',delivery_text:'Private delivery instructions',active:true});check(p.status===201,'product persisted');const pid=p.data.id;
const pub=await request('public/'+pid);check(pub.status===200&&!JSON.stringify(pub.data).includes('Private delivery')&&!JSON.stringify(pub.data).includes('qa-delivery'),'public product excludes delivery and credentials');
globalThis.__zenpayTestUser=sellerB;check((await request('products/'+pid,'PUT',{name:'Hacked',price:1,delivery_text:'hacked',active:true})).status===404,'cross-seller product mutation blocked');check((await request('products')).data.length===0,'seller product lists isolated');
globalThis.__zenpayTestUser=null;const token=security.randomToken(),requestKey=crypto.randomUUID();const payload={product_id:pid,request_key:requestKey,token,name:'QA Buyer',email:'qa-buyer@example.invalid',phone:'',amount:1};const order=await request('orders','POST',payload);check(order.status===201&&order.data.amount===490,'checkout ignores tampered client price');const oid=order.data.id;
const calls=providerCalls;const duplicate=await request('orders','POST',payload);check(duplicate.data.id===oid&&providerCalls===calls,'checkout retry does not create duplicate Pix');
check((await request('orders/'+oid)).status===403,'order requires private access token');check((await request('delivery/'+oid,'GET',null,{'X-Order-Token':security.randomToken()})).status===404,'wrong delivery token rejected');
check((await request('delivery/'+oid,'GET',null,{'X-Order-Token':token})).status===403,'unpaid delivery blocked');
check((await request('webhooks/'+oid,'POST',{id:'forged'})).status===401,'unsigned webhook rejected');
providerStatus='succeeded';const event={id:'evt_'+crypto.randomUUID(),event:'transaction.succeeded',data:{}};const raw=JSON.stringify(event);const t=String(Math.floor(Date.now()/1000));const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(await security.callbackSecret(oid)),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+raw))).toString('hex');
const headers={'X-Paggpay-Webhook-Signature':`t=${t},v1=${sig}`};check((await request('webhooks/'+oid,'POST',raw,headers)).status===200,'signed webhook confirms provider status');const before=providerCalls;check((await request('webhooks/'+oid,'POST',raw,headers)).status===200&&providerCalls===before,'duplicate webhook deduplicated');
const delivery=await request('delivery/'+oid,'GET',null,{'X-Order-Token':token});check(delivery.status===200&&delivery.data.delivery_text==='Private delivery instructions','confirmed payment unlocks delivery');
globalThis.__zenpayTestUser=sellerB;check((await request('access/'+oid,'POST',{})).status===404,'cross-seller access recovery blocked');
globalThis.__zenpayTestUser=sellerA;const recovered=await request('access/'+oid,'POST',{});check(recovered.status===200,'seller can recover approved delivery');check((await request('delivery/'+oid,'GET',null,{'X-Order-Token':token})).status===404,'recovery revokes old access token');const newToken=recovered.data.url.split('#')[1];providerStatus='refunded';check((await request('delivery/'+oid,'GET',null,{'X-Order-Token':newToken})).status===403,'refunded order loses delivery access');
const withdrawal={value:5000,idempotency_key:crypto.randomUUID(),pin:'1234'};check((await request('cashout','POST',withdrawal)).status===201,'cashout uses account destination and PIN');check((await request('cashout','POST',withdrawal)).status===200&&cashoutCalls===1,'cashout retry is idempotent');const [w]=await db.sql('SELECT result FROM zenpay_withdrawals WHERE id=$1',[withdrawal.idempotency_key]);check(!JSON.stringify(w.result).includes('1234'),'cashout PIN is not persisted');
check((await request('settings','PUT',{store_name:'QA Store',whatsapp:'5553999999999',environment:'sandbox',api_key:'mock'},{Origin:'https://attacker.invalid'})).status===403,'cross-origin write rejected');
console.log(JSON.stringify({passed:checks,database:'isolated Neon QA',provider:'mocked at HTTP boundary; no real payments or withdrawals'}));
