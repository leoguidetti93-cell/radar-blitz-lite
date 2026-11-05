const SOURCE='https://api.core.public.tipminer.com/v1/double/rounds/20686b4a-e703-46b4-9f4d-d4b45a280145/history?limit=200&timezone=America%2FSao_Paulo';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});
function extract(v){return Array.isArray(v)?v:(Array.isArray(v?.data)?v.data:Array.isArray(v?.history)?v.history:Array.isArray(v?.results)?v.results:Array.isArray(v?.items)?v.items:Array.isArray(v?.rounds)?v.rounds:[])}
async function collect(env){
 const resp=await fetch(SOURCE,{headers:{accept:'application/json'}});
 if(!resp.ok)throw Error('TipMiner HTTP '+resp.status);
 const payload=extract(await resp.json());
 if(!Array.isArray(payload)||!payload.length)throw Error('TipMiner retornou lista vazia');
 const rows=payload.map(x=>({id:String(x.uuid??x.id??''),number:Number(x.number??x.result),instant:String(x.instant??x.created_at_utc??x.created_at??'')})).filter(x=>x.id&&Number.isInteger(x.number)&&x.number>=0&&x.number<=14&&Number.isFinite(Date.parse(x.instant)));
 if(!rows.length)throw Error('Sem rodadas válidas');
 // Batch in groups: D1 batch is atomic, and INSERT OR IGNORE makes retries idempotent.
 for(let i=0;i<rows.length;i+=40){const statements=rows.slice(i,i+40).map(r=>env.DB.prepare('INSERT OR IGNORE INTO rounds (id,number,instant) VALUES (?,?,?)').bind(r.id,r.number,new Date(r.instant).toISOString()));await env.DB.batch(statements)}
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM rounds').first();
 const at=new Date().toISOString();
 await env.DB.prepare("INSERT INTO metadata(key,value) VALUES('last_sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(at).run();
 await env.DB.prepare("INSERT INTO metadata(key,value) VALUES('last_error','') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
 return {fetched:rows.length,total:count?.n??0,last_sync:at};
}
async function runCollect(env){try{return await collect(env)}catch(e){try{await env.DB.prepare("INSERT INTO metadata(key,value) VALUES('last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(e.message).slice(0,300)).run()}catch{}throw e}}
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(runCollect(env))},
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS'}});
  if(path==='/api/health'){
   try{const r=await env.DB.prepare('SELECT COUNT(*) AS total, MAX(instant) AS latest FROM rounds').first();const m=await env.DB.prepare('SELECT key,value FROM metadata').all();return json({ok:true,...r,metadata:Object.fromEntries((m.results||[]).map(x=>[x.key,x.value]))})}catch(e){return json({ok:false,error:'Banco D1 indisponível ou não inicializado'},503)}
  }
  if(path==='/api/rounds'){
   const limit=Math.max(1,Math.min(600,Number(url.searchParams.get('limit'))||200));
   try{const r=await env.DB.prepare('SELECT id,number,instant FROM rounds ORDER BY instant DESC,id DESC LIMIT ?').bind(limit).all();return json({data:r.results||[],source:'d1'})}catch{return json({error:'Falha ao ler histórico D1'},503)}
  }
  if(path==='/api/history'){
   const start=url.searchParams.get('start'),end=url.searchParams.get('end');
   if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start))return json({error:'Intervalo inválido'},400);
   const maxSpan=31*86400000;if(Date.parse(end)-Date.parse(start)>maxSpan)return json({error:'Limite de 31 dias por consulta'},400);
   const page=Math.max(0,Math.min(500,Number(url.searchParams.get('page'))||0));
   const size=1000;
   try{const r=await env.DB.prepare('SELECT id,number,instant FROM rounds WHERE instant>=? AND instant<? ORDER BY instant DESC,id DESC LIMIT ? OFFSET ?').bind(new Date(start).toISOString(),new Date(end).toISOString(),size,page*size).all();return json({data:r.results||[],page,has_more:(r.results||[]).length===size})}catch{return json({error:'Falha ao consultar período'},503)}
  }
  if(path==='/api/bootstrap'){
   if(request.method!=='POST')return json({error:'Método não permitido'},405);
   if(!env.BOOTSTRAP_SECRET||request.headers.get('authorization')!==`Bearer ${env.BOOTSTRAP_SECRET}`)return json({error:'Não autorizado'},401);
   try{return json(await runCollect(env))}catch(e){return json({error:String(e.message)},502)}
  }
  return json({error:'Rota não encontrada'},404);
 }
};
