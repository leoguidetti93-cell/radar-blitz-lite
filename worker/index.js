const SOURCE='https://api.core.public.tipminer.com/v1/double/rounds/20686b4a-e703-46b4-9f4d-d4b45a280145/history?limit=200&timezone=America%2FSao_Paulo';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});
// Cache compartilhado na borda: respostas públicas não precisam consultar D1 em cada visita.
// Cache é por datacenter; um MISS ou expiração ainda consulta o D1.
async function cached(request,ctx,ttl,handler){
 const cache=caches.default;
 const key=new Request(request.url,{method:'GET'});
 try{const hit=await cache.match(key);if(hit)return hit}catch{}
 const response=await handler();
 if(response.ok){
  const headers=new Headers(response.headers);
  headers.set('Cache-Control',`public, max-age=${ttl}`);
  headers.set('X-Radar-Cache','MISS');
  const result=new Response(response.body,{status:response.status,headers});
  try{ctx.waitUntil(cache.put(key,result.clone()))}catch{}
  return result;
 }
 return response;
}
function extract(v){return Array.isArray(v)?v:(Array.isArray(v?.data)?v.data:Array.isArray(v?.history)?v.history:Array.isArray(v?.results)?v.results:Array.isArray(v?.items)?v.items:Array.isArray(v?.rounds)?v.rounds:[])}
async function collect(env){
 const resp=await fetch(SOURCE,{headers:{accept:'application/json'}});
 if(!resp.ok)throw Error('TipMiner HTTP '+resp.status);
 const payload=extract(await resp.json());
 if(!Array.isArray(payload)||!payload.length)throw Error('TipMiner retornou lista vazia');
 const rows=payload.map(x=>({id:String(x.uuid??x.id??''),number:Number(x.number??x.result),instant:String(x.instant??x.created_at_utc??x.created_at??'')})).filter(x=>x.id&&Number.isInteger(x.number)&&x.number>=0&&x.number<=14&&Number.isFinite(Date.parse(x.instant)));
 if(!rows.length)throw Error('Sem rodadas válidas');
 // Consultar somente IDs da janela recente (índice da chave primária).
 // Evita regravar 200 registros por minuto e evita COUNT(*) a cada coleta.
 const unique=[...new Map(rows.map(r=>[r.id,r])).values()];
 const missing=[];
 for(let i=0;i<unique.length;i+=40){
  const chunk=unique.slice(i,i+40);
  const q=await env.DB.prepare(`SELECT id FROM rounds WHERE id IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk.map(r=>r.id)).all();
  const existing=new Set((q.results||[]).map(r=>r.id));
  missing.push(...chunk.filter(r=>!existing.has(r.id)));
 }
 for(let i=0;i<missing.length;i+=40){
  const statements=missing.slice(i,i+40).map(r=>env.DB.prepare('INSERT OR IGNORE INTO rounds (id,number,instant) VALUES (?,?,?)').bind(r.id,r.number,new Date(r.instant).toISOString()));
  await env.DB.batch(statements);
 }
 // Uma contagem inicial, depois total incremental; não faz scan do banco a cada minuto.
 const totalRow=await env.DB.prepare("SELECT value FROM metadata WHERE key='rounds_total'").first();
 let total;
 if(totalRow){total=Number(totalRow.value)+missing.length}
 else{const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM rounds').first();total=count?.n??0}
 const at=new Date().toISOString();
 await env.DB.prepare("INSERT INTO metadata(key,value) VALUES('rounds_total',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(total)).run();
 await env.DB.prepare("INSERT INTO metadata(key,value) VALUES('last_sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(at).run();
 await env.DB.prepare("INSERT INTO metadata(key,value) VALUES('last_error','') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
 return {fetched:rows.length,total,inserted:missing.length,last_sync:at};
}
async function runCollect(env){try{return await collect(env)}catch(e){try{await env.DB.prepare("INSERT INTO metadata(key,value) VALUES('last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(e.message).slice(0,300)).run()}catch{}throw e}}
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(runCollect(env))},
 async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS'}});
  if(path==='/api/health'){
   return cached(request,ctx,30,async()=>{try{const m=await env.DB.prepare('SELECT key,value FROM metadata').all();const metadata=Object.fromEntries((m.results||[]).map(x=>[x.key,x.value]));const total=Number(metadata.rounds_total||0);return json({ok:true,total,latest:metadata.last_sync||null,metadata})}catch(e){return json({ok:false,error:'Banco D1 indisponível ou não inicializado'},503)}});
  }
  if(path==='/api/rounds'){
   return cached(request,ctx,30,async()=>{const limit=Math.max(1,Math.min(600,Number(url.searchParams.get('limit'))||200));
   try{const r=await env.DB.prepare('SELECT id,number,instant FROM rounds ORDER BY instant DESC,id DESC LIMIT ?').bind(limit).all();return json({data:r.results||[],source:'d1'})}catch{return json({error:'Falha ao ler histórico D1'},503)}});
  }
  if(path==='/api/history'){
   const start=url.searchParams.get('start'),end=url.searchParams.get('end');
   if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start))return json({error:'Intervalo inválido'},400);
   const maxSpan=31*86400000;if(Date.parse(end)-Date.parse(start)>maxSpan)return json({error:'Limite de 31 dias por consulta'},400);
   const page=Math.max(0,Math.min(500,Number(url.searchParams.get('page'))||0));
   const size=1000;
   return cached(request,ctx,300,async()=>{try{const r=await env.DB.prepare('SELECT id,number,instant FROM rounds WHERE instant>=? AND instant<? ORDER BY instant DESC,id DESC LIMIT ? OFFSET ?').bind(new Date(start).toISOString(),new Date(end).toISOString(),size,page*size).all();return json({data:r.results||[],page,has_more:(r.results||[]).length===size})}catch{return json({error:'Falha ao consultar período'},503)}});
  }
  if(path==='/api/bootstrap'){
   if(request.method!=='POST')return json({error:'Método não permitido'},405);
   if(!env.BOOTSTRAP_SECRET||request.headers.get('authorization')!==`Bearer ${env.BOOTSTRAP_SECRET}`)return json({error:'Não autorizado'},401);
   try{return json(await runCollect(env))}catch(e){return json({error:String(e.message)},502)}
  }
  return json({error:'Rota não encontrada'},404);
 }
};
