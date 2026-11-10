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
// Motor global V3.0.5: sinal único, SG/G1/G2, nunca reescreve resultado encerrado.
// Frequência limitada e validação cronológica. NÃO representa vantagem garantida.
async function signalEngine(env){
 const recent=await env.DB.prepare('SELECT id,number,instant FROM rounds ORDER BY instant DESC LIMIT 420').all();
 const a=(recent.results||[]).reverse();if(a.length<160)return;
 const current=await env.DB.prepare("SELECT * FROM suggestions WHERE status IN ('pending','active') ORDER BY target_instant DESC LIMIT 1").first();
 if(current){
  const after=a.filter(x=>x.instant>=current.target_instant);
  let hit=-1,complete=0;
  for(let i=0;i<Math.min(3,after.length);i++){
   // Não classificar se houver lacuna de coleta superior a 3 minutos.
   if(i>0&&Date.parse(after[i].instant)-Date.parse(after[i-1].instant)>180000)break;
   complete++;
   const n=after[i].number;
   if(n===0||(current.color==='black'?n>=8:n>=1&&n<=7)){hit=i;break}
  }
  if(hit>=0){const outcome=['SG','G1','G2'][hit]+':'+after[hit].number;await env.DB.prepare("UPDATE suggestions SET status='done',outcome=?,resolved_at=? WHERE id=? AND status!='done'").bind(outcome,new Date().toISOString(),current.id).run();return}
  if(complete>=3){await env.DB.prepare("UPDATE suggestions SET status='done',outcome='LOSS',resolved_at=? WHERE id=? AND status!='done'").bind(new Date().toISOString(),current.id).run();return}
  // Se não chegaram três resultados em 10 min, registrar ausência de dados, não LOSS.
  if(Date.now()-Date.parse(current.target_instant)>600000){await env.DB.prepare("UPDATE suggestions SET status='done',outcome='SEM DADOS',resolved_at=? WHERE id=? AND status!='done'").bind(new Date().toISOString(),current.id).run()}
  else return;
 }
 const last=await env.DB.prepare('SELECT target_instant FROM suggestions ORDER BY target_instant DESC LIMIT 1').first();
 if(last&&Date.now()-Date.parse(last.target_instant)<15*60000)return;
 // Condição: último par de cores observado; testar a regra em passado (primeiros 70%)
 // e validação cronológica (30%). Não ajustar o limiar com base em resultados futuros.
 const key=x=>x.number===0?'w':x.number<=7?'y':'b';const pattern=key(a.at(-2))+key(a.at(-1));
 const candidates=['black','yellow'].map(c=>{const samples=[];
  for(let i=2;i+2<a.length;i++){
   if(key(a[i-2])+key(a[i-1])!==pattern)continue;
   if(Date.parse(a[i+2].instant)-Date.parse(a[i].instant)>180000)continue;
   const hit=[a[i],a[i+1],a[i+2]].some(r=>r.number===0||(c==='black'?r.number>=8:r.number>=1&&r.number<=7));
   samples.push({i,hit});
  }
  const split=Math.floor(a.length*.7),train=samples.filter(x=>x.i<split),test=samples.filter(x=>x.i>=split);
  return {c,train,test,score:test.length?test.filter(x=>x.hit).length/test.length:0};
 }).filter(x=>x.train.length>=20&&x.test.length>=10&&x.score>=.9&&x.train.filter(y=>y.hit).length/x.train.length>=.88)
 .sort((x,y)=>y.score-x.score||y.test.length-x.test.length);
 if(!candidates.length)return;
 const choice=candidates[0];const latest=a.at(-1);if(Date.now()-Date.parse(latest.instant)>180000)return;
 // Publicar com antecedência: próximo minuto cheio a pelo menos 5 minutos do momento atual.
 // Não modificar o alvo depois de criado; created_at permite auditar a antecedência.
 const target=new Date(Math.ceil((Date.now()+5*60000)/60000)*60000).toISOString();
 const id='rb-'+target.replace(/[^0-9]/g,'')+'-'+choice.c;
 await env.DB.prepare("INSERT OR IGNORE INTO suggestions (id,target_instant,color,status,created_at,model_version,sample_train,sample_test,validation_rate) VALUES (?,?,?,'pending',?,'306-pair-holdout-5min',?,?,?)").bind(id,target,choice.c,new Date().toISOString(),choice.train.length,choice.test.length,choice.score).run();
}
async function safeSignalEngine(env){try{await signalEngine(env)}catch(e){console.log('signalEngine',String(e))}}
// V3.0.7: padrões agregados no servidor, cache compartilhado de 30 minutos.
// A consulta é limitada para proteger a cota gratuita do D1; cobertura parcial é declarada.
async function findPatterns(env){
 const cap=50000,chunk=5000,all=[];
 for(let offset=0;offset<cap;offset+=chunk){
  const q=await env.DB.prepare('SELECT number,instant FROM rounds ORDER BY instant DESC,id DESC LIMIT ? OFFSET ?').bind(chunk,offset).all();
  const r=q.results||[];all.push(...r);if(r.length<chunk)break;
 }
 const truncated=all.length===cap;
 const a=all.reverse();const cutoff=Date.now()-3*3600000;
 const stats=new Map();
 for(let i=0;i<a.length;i++)for(const len of [2,3]){
  if(i+len+5>a.length)continue; // exige cinco resultados futuros completos
  const seq=a.slice(i,i+len).map(x=>Number(x.number));
  if(seq.some(n=>!Number.isInteger(n)||n<0||n>14))continue;
  const key=seq.join('>');let x=stats.get(key);
  if(!x){x={key,numbers:seq,total:0,hits:0,recentTotal:0,recentHits:0};stats.set(key,x)}
  const hit=a.slice(i+len,i+len+5).some(x=>Number(x.number)===0);
  x.total++;if(hit)x.hits++;
  const t=Date.parse(a[i+len-1].instant);
  if(t>=cutoff){x.recentTotal++;if(hit)x.recentHits++}
 }
 const patterns=[...stats.values()].filter(x=>x.total>=10&&x.recentTotal>=2&&x.hits/x.total>=.4)
 .sort((a,b)=>b.recentHits-a.recentHits||(b.hits/b.total)-(a.hits/a.total)||b.total-a.total).slice(0,12);
 return {patterns,coverage:{scanned:all.length,truncated,window_hours:3,minimum_total:10,minimum_recent:2,minimum_rate:.4}};
}
export default {
 async scheduled(event,env,ctx){ctx.waitUntil((async()=>{await runCollect(env);await safeSignalEngine(env)})())},
 async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS'}});
  if(path==='/api/patterns'){
   return cached(request,ctx,1800,async()=>{try{return json(await findPatterns(env))}catch(e){return json({error:'Falha na análise de padrões'},503)}});
  }
  if(path==='/api/signal'){
   return cached(request,ctx,30,async()=>{try{const r=await env.DB.prepare("SELECT id,target_instant,color,status,outcome,created_at FROM suggestions WHERE status IN ('pending','active') ORDER BY target_instant DESC LIMIT 1").first();return json({signal:r||null})}catch{return json({error:'Sugestões indisponíveis'},503)}});
  }
  if(path==='/api/signals'){
   const page=Math.max(0,Math.min(10000,Number(url.searchParams.get('page'))||0));
   return cached(request,ctx,60,async()=>{try{const r=await env.DB.prepare('SELECT id,target_instant,color,status,outcome,created_at FROM suggestions ORDER BY target_instant DESC LIMIT 21 OFFSET ?').bind(page*20).all();return json({data:(r.results||[]).slice(0,20),has_more:(r.results||[]).length>20})}catch{return json({error:'Histórico de sugestões indisponível'},503)}});
  }
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
