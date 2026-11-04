export async function sql(query:string,params:any[]=[]):Promise<any[]> {
 const url=process.env.DATABASE_URL; if(!url) throw new Error('Banco de dados indisponível.');
 const host=new URL(url).hostname;
 const res=await fetch(`https://${host}/sql`,{method:'POST',headers:{'Content-Type':'application/json','Neon-Connection-String':url,'Neon-Raw-Text-Output':'false','Neon-Array-Mode':'false'},body:JSON.stringify({query,params}),signal:AbortSignal.timeout(20000)});
 if(!res.ok){console.error('Neon query failed',res.status);throw new Error('Não foi possível acessar os dados. Tente novamente.');}
 const data=await res.json() as any;return data.rows||[];
}
export function secretKey(){const key=process.env.ENCRYPTION_KEY;if(!key)throw new Error('Configuração de segurança indisponível.');return key as string;}
