export class PaymentError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}
export async function pagg(key:string,environment:string,path:string,method='GET',body?:any,extra:Record<string,string>={}){
 const base=environment==='sandbox'?'https://sandbox-api.paggpay.com/v1':'https://api.paggpay.com/v1';
 let r:Response;try{r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${key}`,Accept:'application/json','Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});}catch{throw new PaymentError('A PAGGPAY não respondeu a tempo. Consulte a operação antes de tentar novamente.',503);}
 let j:any;try{j=await r.json();}catch{throw new PaymentError('Resposta inválida da PAGGPAY.',502);}
 if(!r.ok){const errors=j.errors?Object.values(j.errors).flat().join(' '):'';let msg=errors||j.message||'Operação recusada pela PAGGPAY.';if(r.status===401)msg='Chave PAGGPAY inválida ou expirada. Atualize nas configurações.';if(r.status===403)msg='Sua chave ou conta PAGGPAY não tem permissão para esta operação.';throw new PaymentError(String(msg).slice(0,500),r.status===429?429:400);}
 const data=j?.data ?? j;
 if(path==='/pix'||path.startsWith('/pix/txn_'))return normalizePixResponse(data);
 return data;

}
export function paymentStatus(data:any){const s=String(data?.transaction?.status||data?.status||data?.pix?.status||'').toLowerCase();if(['succeeded','paid','completed','approved'].includes(s))return 'paid';if(['refunded','refund_pending','refund_failed','failed','cancelled','canceled','expired'].includes(s))return s;return 'pending';}

// Some Pix responses return the transaction directly instead of a transaction block.
export function normalizePixResponse(data:any){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.transaction)return data;
 if(typeof data.id!=='string'||!data.id.startsWith('txn_'))return data;
 return {
  ...data,
  transaction:{id:data.id,status:data.status,reference_id:data.reference_id??data.pix?.reference_id},
  pix:data.pix?{...data.pix,value:data.pix.value??data.amount,qrcode:data.pix.qrcode??data.pix.qr_code}:undefined,
 };
}
