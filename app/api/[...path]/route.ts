import { getChatGPTUser } from '../../chatgpt-auth';
import { sql } from '../../../lib/db';
import { encrypt,decrypt,hash,randomToken,callbackSecret,verifyWebhook,rateLimit } from '../../../lib/security';
import { pagg,paymentStatus,PaymentError } from '../../../lib/paggpay';
import { z } from 'zod';
export const dynamic='force-dynamic';
const uuid=z.string().uuid();
const productSchema=z.object({name:z.string().trim().min(2).max(160),description:z.string().max(3000).default(''),price:z.number().int().min(1).max(10000000),cover_url:z.string().max(2000).default(''),delivery_url:z.string().max(2000).default(''),delivery_text:z.string().max(10000).default(''),file_name:z.string().max(180).nullable().optional(),file_data:z.string().max(11200000).nullable().optional(),active:z.boolean().default(true)});
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
function response(data:any,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
function validUrl(value:string){if(!value)return;try{const u=new URL(value);if(u.protocol!=='https:')fail('Use links HTTPS.');}catch{fail('Informe um link HTTPS válido.');}}
async function seller(){const user=await getChatGPTUser();if(!user)fail('Entre na sua conta para continuar.',401);await sql(`INSERT INTO zenpay_sellers(id,email,name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`,[user.userId,user.email,user.displayName]);const [s]=await sql('SELECT * FROM zenpay_sellers WHERE id=$1',[user.userId]);return s;}
async function credential(s:any){if(!s.api_key_encrypted)fail('Conecte sua chave PAGGPAY nas configurações.');return decrypt(s.api_key_encrypted);}
async function orderAuth(id:string,req:Request){uuid.parse(id);const token=req.headers.get('X-Order-Token')||new URL(req.url).searchParams.get('token');if(!token||token.length>100)fail('Acesso à compra inválido.',403);const [o]=await sql('SELECT * FROM zenpay_orders WHERE id=$1 AND access_hash=$2',[id,await hash(token)]);if(!o)fail('Compra não encontrada.',404);return o;}
function publicOrder(o:any){return {id:o.id,status:o.status,amount:o.amount,product_name:o.product_name,pix_code:o.pix_code,pix_qr:o.pix_qr,expires_at:o.expires_at,created_at:o.created_at,paid_at:o.paid_at};}
async function syncOrder(o:any,force=false){if(!o.provider_id)return o;if(!force&&o.checked_at&&Date.now()-Date.parse(o.checked_at)<6000)return o;const data=await pagg(await decrypt(o.credential_encrypted),o.environment,'/pix/'+encodeURIComponent(o.provider_id));const tid=data?.transaction?.id;if(tid!==o.provider_id)fail('Pagamento não corresponde ao pedido.',502);if(data.pix?.value!=null&&Number(data.pix.value)!==o.amount)fail('Valor do pagamento não corresponde ao pedido.',502);const status=paymentStatus(data);const [updated]=await sql(`UPDATE zenpay_orders SET status=$2,paid_at=CASE WHEN $2='paid' THEN COALESCE(paid_at,now()) ELSE paid_at END,checked_at=now() WHERE id=$1 RETURNING *`,[o.id,status]);return updated;}
async function handle(req:Request){
 const url=new URL(req.url);const p=url.pathname.split('/').filter(Boolean).slice(1);const action=p[0], id=p[1];
 if(!['GET','HEAD'].includes(req.method)&&action!=='webhooks'){const origin=req.headers.get('Origin');if(origin&&origin!==url.origin)fail('Origem não permitida.',403);}
 if(Number(req.headers.get('Content-Length')||0)>12500000)fail('Arquivo muito grande. Use um link de entrega.',413);
 const body=async()=>{try{return await req.json();}catch{fail('Dados inválidos.');}};
 if(action==='public'&&req.method==='GET'){
  uuid.parse(id);const [p]=await sql(`SELECT p.id,p.name,p.description,p.price,p.cover_url,p.active,s.store_name,s.name as seller_name,s.whatsapp,(s.api_key_encrypted IS NOT NULL) as connected,s.environment FROM zenpay_products p JOIN zenpay_sellers s ON s.id=p.seller_id WHERE p.id=$1 AND p.active=true`,[id]);if(!p)fail('Este produto não está disponível.',404);return response(p);
 }
 if(action==='orders'&&req.method==='POST'&&!id){
  const b=z.object({product_id:uuid,request_key:uuid,token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254),phone:z.string().max(25).default('')}).parse(await body());
  const [existing]=await sql('SELECT * FROM zenpay_orders WHERE request_key=$1',[b.request_key]);if(existing){if(existing.access_hash!==await hash(b.token))fail('Pedido inválido.',403);return response(publicOrder(existing));}
  const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';await rateLimit('checkout:'+await hash(ip),20,600);await rateLimit('product:'+b.product_id,100,600);
  const [p]=await sql(`SELECT p.*,s.api_key_encrypted,s.environment FROM zenpay_products p JOIN zenpay_sellers s ON s.id=p.seller_id WHERE p.id=$1 AND p.active=true`,[b.product_id]);if(!p)fail('Produto indisponível.',404);if(!p.api_key_encrypted)fail('O vendedor ainda não conectou os pagamentos.');
  const oid=crypto.randomUUID();const [o]=await sql(`INSERT INTO zenpay_orders(id,product_id,seller_id,request_key,access_hash,customer_name,customer_email,customer_phone,amount,product_name,delivery_url,delivery_text,file_name,file_data,environment,credential_encrypted) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(request_key) DO NOTHING RETURNING *`,[oid,p.id,p.seller_id,b.request_key,await hash(b.token),b.name,b.email.toLowerCase(),b.phone,p.price,p.name,p.delivery_url,p.delivery_text,p.file_name,p.file_data,p.environment,p.api_key_encrypted]);
  if(!o){const [prior]=await sql('SELECT * FROM zenpay_orders WHERE request_key=$1',[b.request_key]);if(prior?.access_hash!==await hash(b.token))fail('Pedido inválido.',403);return response(publicOrder(prior));}
  try{const d=await pagg(await decrypt(p.api_key_encrypted),p.environment,'/pix','POST',{value:p.price,reference_id:oid,payer_name:b.name,payer_email:b.email,payer_phone:b.phone,description:p.name,payer_pays_fee:false,webhook_url:url.origin+'/api/webhooks/'+oid},{'X-Paggpay-Webhook-Secret':await callbackSecret(oid)});
   if(!d?.transaction?.id||!d?.pix?.code)throw new PaymentError('A PAGGPAY não retornou o código Pix.',502);
   const [updated]=await sql(`UPDATE zenpay_orders SET provider_id=$2,status='pending',pix_code=$3,pix_qr=$4,expires_at=$5 WHERE id=$1 RETURNING *`,[oid,d.transaction.id,d.pix.code,d.pix.qrcode||null,d.pix.expiration_date||null]);return response(publicOrder(updated),201);
  }catch(e){await sql(`UPDATE zenpay_orders SET status=$2 WHERE id=$1`,[oid,(e as any).status===503?'verification_required':'creation_failed']);throw e;}
 }
 if(action==='orders'&&id&&req.method==='GET'){let o=await orderAuth(id,req);if(['pending','paid','refund_pending'].includes(o.status))o=await syncOrder(o);const [s]=await sql('SELECT whatsapp,store_name FROM zenpay_sellers WHERE id=$1',[o.seller_id]);return response({...publicOrder(o),...s});}
 if(action==='delivery'&&req.method==='GET'){
  let o=await orderAuth(id,req);o=await syncOrder(o,true);if(o.status!=='paid')fail('A entrega será liberada após a confirmação do pagamento.',403);
  await sql('UPDATE zenpay_orders SET delivered_at=COALESCE(delivered_at,now()) WHERE id=$1',[id]);return response({name:o.product_name,delivery_url:o.delivery_url,delivery_text:o.delivery_text,file_name:o.file_name,file_data:o.file_data});
 }
 if(action==='webhooks'&&req.method==='POST'){
  uuid.parse(id);const raw=await req.text();if(raw.length>100000)fail('Evento inválido.',413);if(!await verifyWebhook(raw,req.headers.get('X-Paggpay-Webhook-Signature')||'',id))fail('Assinatura inválida.',401);
  let event:any;try{event=JSON.parse(raw);}catch{fail('Evento inválido.');}if(typeof event.id!=='string'||event.id.length>120)fail('Evento inválido.');const [seen]=await sql('SELECT id FROM zenpay_events WHERE id=$1',[event.id]);if(seen)return response({received:true});const [o]=await sql('SELECT * FROM zenpay_orders WHERE id=$1',[id]);if(!o)fail('Pedido não encontrado.',404);if(!o.provider_id)fail('Pedido ainda em processamento.',409);await syncOrder(o,true);await sql('INSERT INTO zenpay_events(id,order_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[event.id,id]);return response({received:true});
 }
 const s=await seller();
 if(action==='me'&&req.method==='GET')return response({id:s.id,name:s.name,email:s.email,store_name:s.store_name,whatsapp:s.whatsapp,connected:!!s.api_key_encrypted,api_key_hint:s.api_key_hint,environment:s.environment});
 if(action==='settings'&&req.method==='PUT'){
  const b=z.object({store_name:z.string().trim().min(2).max(100),whatsapp:z.string().regex(/^\d{10,15}$/,'Informe o WhatsApp com DDI, apenas números.'),environment:z.enum(['production','sandbox']),api_key:z.string().max(500).optional(),disconnect:z.boolean().optional()}).parse(await body());
  let encrypted=s.api_key_encrypted,hint=s.api_key_hint;
  if(b.api_key?.trim()){const k=b.api_key.trim();await rateLimit('key:'+s.id,10,600);await pagg(k,b.environment,'/transactions?per_page=1');encrypted=await encrypt(k);hint=k.slice(-4);}
  else if(b.environment!==s.environment&&!b.disconnect)fail('Informe a chave do novo ambiente para mudar entre produção e sandbox.');
  if(b.disconnect){encrypted=null;hint=null;}
  await sql('UPDATE zenpay_sellers SET store_name=$2,whatsapp=$3,environment=$4,api_key_encrypted=$5,api_key_hint=$6 WHERE id=$1',[s.id,b.store_name,b.whatsapp,b.environment,encrypted,hint]);return response({saved:true});
 }
 if(action==='products'){
  if(req.method==='GET')return response(await sql('SELECT id,name,description,price,cover_url,delivery_url,delivery_text,file_name,active,created_at FROM zenpay_products WHERE seller_id=$1 ORDER BY created_at DESC',[s.id]));
  if(['POST','PUT'].includes(req.method)){
   if(id)uuid.parse(id);const b=productSchema.parse(await body());validUrl(b.cover_url);validUrl(b.delivery_url);if(b.file_data&&!/^[A-Za-z0-9+/]*={0,2}$/.test(b.file_data))fail('Arquivo inválido.');if(b.file_data&&!b.file_name)fail('Nome do arquivo obrigatório.');if(b.file_name&&/\.(html?|svg|js|exe|bat|cmd)$/i.test(b.file_name))fail('Use PDF, ZIP, imagens ou um link de entrega.');
   if(req.method==='POST'&&!b.delivery_url&&!b.delivery_text&&!b.file_data)fail('Adicione o conteúdo de entrega.');
   if(req.method==='POST'){const pid=crypto.randomUUID();await sql('INSERT INTO zenpay_products(id,seller_id,name,description,price,cover_url,delivery_url,delivery_text,file_name,file_data,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[pid,s.id,b.name,b.description,b.price,b.cover_url,b.delivery_url,b.delivery_text,b.file_name||null,b.file_data||null,b.active]);return response({id:pid},201);}
   const [current]=await sql('SELECT file_data,file_name FROM zenpay_products WHERE id=$1 AND seller_id=$2',[id,s.id]);if(!current)fail('Produto não encontrado.',404);const file=b.file_data===undefined?current.file_data:b.file_data;const fileName=b.file_name===undefined?current.file_name:b.file_name;if(!b.delivery_url&&!b.delivery_text&&!file)fail('Adicione o conteúdo de entrega.');await sql('UPDATE zenpay_products SET name=$3,description=$4,price=$5,cover_url=$6,delivery_url=$7,delivery_text=$8,file_name=$9,file_data=$10,active=$11,updated_at=now() WHERE id=$1 AND seller_id=$2',[id,s.id,b.name,b.description,b.price,b.cover_url,b.delivery_url,b.delivery_text,fileName,file,b.active]);return response({saved:true});
  }
 }
 if(action==='sales'&&req.method==='GET')return response(await sql('SELECT id,product_id,product_name,customer_name,customer_email,customer_phone,amount,status,created_at,paid_at,delivered_at FROM zenpay_orders WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 1000',[s.id]));
 if(action==='sales'&&id&&req.method==='POST'){
  uuid.parse(id);const [o]=await sql('SELECT * FROM zenpay_orders WHERE id=$1 AND seller_id=$2',[id,s.id]);if(!o)fail('Venda não encontrada.',404);const updated=await syncOrder(o,true);return response(publicOrder(updated));
 }
 if(action==='access'&&id&&req.method==='POST'){
  uuid.parse(id);let [o]=await sql('SELECT * FROM zenpay_orders WHERE id=$1 AND seller_id=$2',[id,s.id]);if(!o)fail('Venda não encontrada.',404);o=await syncOrder(o,true);if(o.status!=='paid')fail('Pagamento ainda não aprovado.');const token=randomToken();await sql('UPDATE zenpay_orders SET access_hash=$2 WHERE id=$1',[id,await hash(token)]);return response({url:url.origin+'/access/'+id+'#'+token});
 }
 if(action==='finance'&&req.method==='GET'){
  const key=await credential(s);const balance=await pagg(key,s.environment,'/balance');const history=await sql('SELECT id,amount,status,result,created_at FROM zenpay_withdrawals WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 100',[s.id]);return response({balance,history});
 }
 if(action==='cashout-context'&&req.method==='GET')return response(await pagg(await credential(s),s.environment,'/balance/cash-out/context'));
 if(action==='resolve'&&req.method==='POST'){
  const b=z.union([z.object({destination_id:z.string().min(1).max(150)}),z.object({pix_key:z.string().min(3).max(254),pix_key_type:z.enum(['cpf','cnpj','email','phone','evp'])})]).parse(await body());return response(await pagg(await credential(s),s.environment,'/balance/cash-out/destinations/resolve','POST',b));
 }
 if(action==='cashout'&&req.method==='POST'){
  const b=z.object({value:z.number().int().min(1).max(100000000),idempotency_key:uuid,destination_resolution_token:z.string().max(4000).optional(),pin:z.string().regex(/^\d{4}$/),two_factor_code:z.string().regex(/^\d{6}$/).optional()}).parse(await body());
  await rateLimit('cashout:'+s.id,6,600);const key=await credential(s);const context=await pagg(key,s.environment,'/balance/cash-out/context');if(context.security?.cash_out_frozen)fail('Saques estão bloqueados na PAGGPAY.');if(!context.security?.pin_configured)fail('Configure seu PIN de saque no painel da PAGGPAY.');if(b.value>context.available_minor)fail('Saldo insuficiente.');
  const own=context.destination_policy==='own_document';if(!own&&!b.destination_resolution_token)fail('Selecione e confirme o destino do saque.');
  const [existing]=await sql('SELECT * FROM zenpay_withdrawals WHERE id=$1',[b.idempotency_key]);if(existing&&existing.seller_id!==s.id)fail('Solicitação inválida.',403);if(existing&&existing.amount!==b.value)fail('O valor desta solicitação não pode ser alterado.');if(existing?.result)return response(existing.result);
  const payload:any={value:b.value,idempotency_key:b.idempotency_key,account_pays_fee:true,authorization:{pin:b.pin,...(b.two_factor_code?{two_factor_code:b.two_factor_code}:{})}};if(own){if(!context.own_document?.document)fail('Destino cadastrado não disponível.');payload.pix_key=context.own_document.document;payload.pix_key_type='national_registration';}else payload.destination_resolution_token=b.destination_resolution_token;
  await sql('INSERT INTO zenpay_withdrawals(id,seller_id,amount) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[b.idempotency_key,s.id,b.value]);
  try{const result=await pagg(key,s.environment,'/balance/cash-out','POST',payload);await sql('UPDATE zenpay_withdrawals SET status=$2,result=$3::jsonb WHERE id=$1',[b.idempotency_key,result.cash_out?.status||'accepted',JSON.stringify(result)]);return response(result,201);}catch(e){await sql(`UPDATE zenpay_withdrawals SET status=$2 WHERE id=$1`,[b.idempotency_key,(e as any).status===503?'verification_required':'rejected']);throw e;}
 }
 fail('Rota não encontrada.',404);
}
async function dispatch(req:Request){try{return await handle(req);}catch(e){if(e instanceof z.ZodError)return response({error:e.issues.map(i=>i.path.join('.')+': '+i.message).join(' ').slice(0,600)},400);const error=e as any;return response({error:error.status?error.message:'Não foi possível concluir a operação. Tente novamente.'},error.status||500);}}
export const GET=dispatch;export const POST=dispatch;export const PUT=dispatch;
