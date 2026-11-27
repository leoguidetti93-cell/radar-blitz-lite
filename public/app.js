'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const API=(window.RADAR_API_BASE||'').replace(/\/$/,'');
const color=n=>n===0?'white':n<=7?'yellow':'black';
const names={white:'BRANCO',yellow:'AMARELO',black:'PRETO'};
const dt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const parts=t=>Object.fromEntries(dt.formatToParts(new Date(t)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
const stamp=t=>{let p=parts(t);return `${p.day}/${p.month} ${p.hour}:${p.minute}:${p.second}`};
const fmt=n=>Number(n||0).toLocaleString('pt-BR');
const pct=(n,total)=>total?`${(100*n/total).toFixed(1).replace('.',',')}%`:'—';
const parse=a=>(a||[]).map(r=>({id:r.id,n:Number(r.number),ts:Date.parse(r.instant)})).filter(r=>Number.isFinite(r.ts)&&Number.isInteger(r.n)&&r.n>=0&&r.n<=14).sort((a,b)=>b.ts-a.ts);
const safe=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalogLimit=200,catalogRows=[],analysisRows=[],previousRows=[],health=null,refreshing=false;
let recognizedPatterns=[],patternCoverage=null;
let toolMode='',selectionMode='manual',picked=new Map(),matchValue=null,chosenPattern=[],cardPattern=null;

const SNAPSHOT_KEY='radar-blitz-v304-last-good';
let lastGoodAt=0, lastHistoryWindow='';
function saveSnapshot(){try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({at:Date.now(),catalogRows,analysisRows,previousRows,health,window:lastHistoryWindow}))}catch(e){console.warn('Cache local indisponível',e)}}
function restoreSnapshot(){try{const s=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'null');if(!s||!Array.isArray(s.catalogRows)||!s.catalogRows.length)return false;catalogRows=s.catalogRows;alertReady=true;lastAlertId=catalogRows[0]?.id||null;analysisRows=Array.isArray(s.analysisRows)?s.analysisRows:[];previousRows=Array.isArray(s.previousRows)?s.previousRows:[];health=s.health||null;lastGoodAt=s.at||0;lastHistoryWindow=s.window||'';render();$('#synced').textContent=health?.metadata?.last_sync?stamp(Date.parse(health.metadata.last_sync)):'—';$('#coverage').textContent='Exibindo último histórico salvo neste navegador';status('DADOS SALVOS • OFFLINE');setDataAge();return true}catch(e){console.warn('Snapshot inválido',e);return false}}
function setDataAge(){const el=$('#dataAge');if(!el)return;if(!lastGoodAt){el.textContent='';return}const min=Math.max(0,Math.floor((Date.now()-lastGoodAt)/60000));el.textContent=min<1?'Dados recebidos há menos de 1 min':`Últimos dados recebidos há ${min} min`}

const whiteMark='<span class="white-emblem"><svg viewBox="0 0 36 36" aria-hidden="true"><rect x="5" y="5" width="26" height="26" rx="6" fill="#f2c62f"/><path d="M20 7 11 20h7l-3 9 12-16h-8l4-6z" fill="#111"/></svg></span>';
const stone=(r,mark='')=>`<span class="stone ${color(r.n)} ${mark?'pattern-'+mark:''}" title="${stamp(r.ts)} • ${r.n}${mark?' • padrão '+(mark==='selected'?'selecionado':mark==='hit'?'confirmado':mark==='watch'?'em observação':'sem branco nas 5 rodadas'):''}">${r.n===0?whiteMark:r.n}</span>`;
async function get(path){const r=await fetch(API+path,{cache:'no-store'});if(!r.ok)throw Error(`API ${r.status}`);return r.json()}
function status(msg,ok=false){$('#status').textContent='● '+msg;$('#status').classList.toggle('ok',ok)}
function windowDates(){let now=new Date(),h=$('#period').value;if(h==='custom'){
 const a=new Date($('#start').value),b=new Date($('#end').value);if(!Number.isFinite(+a)||!Number.isFinite(+b)||b<=a)throw Error('Selecione um período válido');if(b-a>31*86400000)throw Error('Máximo de 31 dias por consulta');return [a,b]}
 // Janela estável de 5 minutos: consultas idênticas podem aproveitar o cache compartilhado.
 const hours=Number(h),bucket=hours>=24?1800000:hours>=6?900000:300000;
 const anchor=new Date(Math.floor(now.getTime()/bucket)*bucket);return [new Date(anchor-hours*3600000),anchor]}
async function loadHistory(start,end){let all=[];for(let page=0;page<110;page++){
 const j=await get(`/api/history?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&page=${page}`);
 all.push(...(j.data||[]));if(!j.has_more)break;if(page===109)throw Error('Período excedeu limite de paginação; reduza o intervalo');
 }return parse(all)}
function metric(rows){const first=catalogRows[0];$('#lastStone').innerHTML=first?stone(first):'—';$('#lastTime').textContent=first?stamp(first.ts):'—';const w=catalogRows.findIndex(x=>x.n===0);$('#recovery').textContent=w<0?'≥ '+catalogRows.length:w;const indexes=catalogRows.map((r,i)=>r.n===0?i:-1).filter(i=>i>=0).slice(0,5);let gaps=indexes.slice(1).map((x,i)=>x-indexes[i]);$('#avgWhite').textContent=gaps.length?(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(1).replace('.',','):'—';$('#total').textContent=fmt(health?.total||0)}
function frequencies(rows){const n=rows.length;$('#freqN').textContent=fmt(n)+' rodadas';$('#freq').innerHTML=['black','yellow','white'].map(c=>{let k=rows.filter(r=>color(r.n)===c).length;return `<div class="freqline"><b>${names[c]}</b><div class="track"><div class="fill ${c}" style="width:${n?100*k/n:0}%"></div></div><strong>${fmt(k)} <small>${pct(k,n)}</small></strong></div>`}).join('')}
function flow(rows){const scale=Number($('#flowScale').value),size=scale*60000;const end=Date.now();let start=Math.floor((end-24*size)/size)*size;const counts=new Map();rows.forEach(r=>{const k=Math.floor(r.ts/size)*size;if(r.n===0)counts.set(k,(counts.get(k)||0)+1)});
 const min=rows.length?Math.min(...rows.map(r=>r.ts)):Infinity,max=rows.length?Math.max(...rows.map(r=>r.ts)):-Infinity;
 let html='';for(let i=0;i<24;i++){let t=start+i*size,v=counts.get(t)||0,complete=t>=min&&t+size<=max,valid=complete&&t+size<=end;html+=`<div class="plotitem" title="${stamp(t)} • ${valid?v+' brancos':'cobertura incompleta'}"><span class="bar ${valid?'':'unknown'}" style="height:${valid?Math.max(4,Math.min(100,v*15)):5}%"></span><small>${i%4===0?parts(t).hour+':'+parts(t).minute:''}</small></div>`}$('#flow').innerHTML=html}
function intervals(rows){const a=[...rows].reverse(),idx=a.map((r,i)=>r.n===0?i:-1).filter(x=>x>=0),gaps=idx.slice(1).map((x,i)=>x-idx[i]-1);const ranges=[[0,4],[5,9],[10,14],[15,19],[20,29],[30,Infinity]],counts=ranges.map(([a,b])=>gaps.filter(g=>g>=a&&g<=b).length),max=Math.max(1,...counts);
 $('#intervals').innerHTML=ranges.map(([a,b],i)=>`<div class="barline"><span>${a}–${b===Infinity?'∞':b}</span><div class="track"><div class="fill yellow" style="width:${100*counts[i]/max}%"></div></div><b>${counts[i]}</b></div>`).join('');const sorted=[...gaps].sort((a,b)=>a-b),median=sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2:0;$('#intervalSummary').textContent=gaps.length?`${gaps.length} intervalos • média ${(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(1)} • mediana ${median} • máximo ${Math.max(...gaps)}`:'Dados insuficientes para intervalos entre brancos'}
function streaks(rows){const a=[...rows].reverse();let runs=[],last='',len=0;for(const r of a){const c=color(r.n);if(c!==last){if(len)runs.push({c:last,len});last=c;len=1}else len++}if(len)runs.push({c:last,len});$('#streaks').innerHTML=['black','yellow','white'].map(c=>{const r=runs.filter(x=>x.c===c);return `<div class="stat"><small>${names[c]}</small><strong>${Math.max(0,...r.map(x=>x.len))}</strong><span>Maior sequência • média ${r.length?(r.reduce((s,x)=>s+x.len,0)/r.length).toFixed(1):'—'}</span></div>`}).join('')+`<div class="stat"><small>SEQUÊNCIA ATUAL</small><strong>${runs.at(-1)?.len||0}</strong><span>${names[runs.at(-1)?.c]||'—'}</span></div>`}
function transitions(rows){const a=[...rows].reverse(),cs=['black','yellow','white'],m=Object.fromEntries(cs.map(c=>[c,Object.fromEntries(cs.map(d=>[d,0]))]));for(let i=1;i<a.length;i++)m[color(a[i-1].n)][color(a[i].n)]++;$('#transitions').innerHTML=`<table><thead><tr><th>DE ↓ / PARA →</th>${cs.map(c=>`<th>${names[c]}</th>`).join('')}</tr></thead><tbody>${cs.map(c=>{let total=Object.values(m[c]).reduce((a,b)=>a+b,0);return `<tr><th>${names[c]}</th>${cs.map(d=>`<td>${m[c][d]}<small>${pct(m[c][d],total)}</small></td>`).join('')}</tr>`}).join('')}</tbody></table>`}
function heat(rows){const cnt=Array(24).fill(0),exposure=Array(24).fill(0);for(const r of rows){let h=Number(parts(r.ts).hour);exposure[h]++;if(r.n===0)cnt[h]++}const max=Math.max(1,...cnt);$('#heat').innerHTML=cnt.map((v,i)=>`<div class="heatcell" title="${String(i).padStart(2,'0')}h • ${v} brancos / ${exposure[i]} rodadas" style="--intensity:${exposure[i]?0.13+0.87*v/max:0}"><b>${String(i).padStart(2,'0')}h</b><strong>${exposure[i]?v:'—'}</strong><small>${exposure[i]?exposure[i]+' giros':'sem dados'}</small></div>`).join('')}
function numbers(rows){let count=Array(15).fill(0);rows.forEach(r=>count[r.n]++);const max=Math.max(1,...count);$('#numbers').innerHTML=count.map((v,i)=>`<div class="barline"><span>${String(i).padStart(2,'0')}</span><div class="track"><div class="fill ${color(i)}" style="width:${100*v/max}%"></div></div><b>${v}</b></div>`).join('')}
function comparison(now,prev){const a=now.length,b=prev.length;$('#comparison').innerHTML=['white','yellow','black'].map(c=>{let x=now.filter(r=>color(r.n)===c).length,y=prev.filter(r=>color(r.n)===c).length;return `<div class="stat"><small>${names[c]}</small><strong>${pct(x,a)}</strong><span>Anterior: ${pct(y,b)}</span></div>`}).join('')+`<div class="stat"><small>AMOSTRA</small><strong>${fmt(a)}</strong><span>Anterior: ${fmt(b)}</span></div>`}
function blockKey(t){const p=parts(t);return `${p.year}-${p.month}-${p.day}T${p.hour}:${String(Math.floor(+p.minute/10)*10).padStart(2,'0')}`}
function strongLines(rows){
 const groups=Array.from({length:6},(_,i)=>({start:i*10,whites:0,total:0}));
 for(const r of rows){const m=Number(parts(r.ts).minute);const g=groups[Math.floor(m/10)];g.total++;if(r.n===0)g.whites++}
 const ranked=groups.sort((a,b)=>b.whites-a.whites||(b.total?b.whites/b.total:0)-(a.total?a.whites/a.total:0));
 const max=Math.max(1,...ranked.map(g=>g.whites));
 $('#strongLines').innerHTML=ranked.map((g,i)=>`<div class="barline"><span>${i+1}º ${String(g.start).padStart(2,'0')}–${String(g.start+9).padStart(2,'0')}</span><div class="track"><div class="fill yellow" style="width:${100*g.whites/max}%"></div></div><b>${g.whites} ⚪ <small>${pct(g.whites,g.total)} • ${g.total} rod.</small></b></div>`).join('');
}
function patternKey(a){return a.join('>')}
function patternMarks(rows){
 const selected=new Set(cardPattern?[cardPattern]:[]);const marks=new Map();
 const a=[...rows].reverse();
 for(let i=0;i<a.length;i++)for(const len of [2,3]){
  if(i+len>a.length)continue;const key=patternKey(a.slice(i,i+len).map(r=>r.n));if(!selected.has(key))continue;
  const next=a.slice(i+len,i+len+5);const complete=next.length===5;
  const hit=next.some(r=>r.n===0);const state=hit?'hit':complete?'miss':'watch';
  for(let j=i;j<i+len;j++){const id=String(a[j].id),prev=marks.get(id);if(!prev||({hit:3,watch:2,miss:1}[state]>{hit:3,watch:2,miss:1}[prev]))marks.set(id,state)}
 }
 return marks;
}
function showPatterns(){
 const el=$('#patternList');const summary=$('#patternSummary');if(!recognizedPatterns.length){el.innerHTML='<div class="emptymsg">Nenhum padrão com amostra suficiente identificado.</div>';return}
 const st=n=>`<span class="mini-pattern-stone ${color(n)}">${n===0?'⚡':n}</span>`;
 el.innerHTML=recognizedPatterns.slice(0,5).map(p=>`<button type="button" class="pattern-item" data-pattern="${safe(p.key)}" aria-pressed="${cardPattern===p.key}"><div class="pattern-stones">${p.numbers.map(st).join('<span class="pattern-arrow">›</span>')}</div><div class="pattern-count"><strong>${p.recentHits}/${p.recentTotal} <small>3H</small></strong><span>${pct(p.hits,p.total)} global • ${p.hits}/${p.total}</span></div></button>`).join('');
 summary.textContent=`${recognizedPatterns.length} padrões qualificados • últimas 3 horas vs. ${patternCoverage?.scanned?.toLocaleString('pt-BR')||'—'} rodadas históricas${patternCoverage?.truncated?' (histórico parcial; limite de segurança)':''}`;
}
async function loadPatterns(){try{const r=await get('/api/patterns');recognizedPatterns=(r.patterns||[]).slice(0,5);patternCoverage=r.coverage;showPatterns();catalog(catalogRows)}catch(e){if(!recognizedPatterns.length)$('#patternSummary').textContent='Padrões indisponíveis. Verifique se o Worker V3.0.7 foi publicado.'}}
function catalog(rows){updateTool();g1Update();const marks=toolMarks(rows),g1m=g1Marks();const groups=new Map();for(const r of rows){const k=blockKey(r.ts);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}let html='';for(const [key,list] of groups){const slots=Array.from({length:10},()=>[]);for(const r of list){const minute=Number(parts(r.ts).minute)%10;slots[minute].push(r)}slots.forEach(x=>x.sort((a,b)=>a.ts-b.ts));const label=key.slice(11);html+=`<div class="catalogrow"><div class="rowtime">${safe(label)}</div><div class="minutes">${slots.map((arr,i)=>`<div class="minute"><span class="minute-label">${String((+label.slice(3)+i)%60).padStart(2,'0')}</span><div class="pair">${[0,1].map(j=>arr[j]?catalogStone(arr[j],marks.get(String(arr[j].id))||'',g1m.get(String(arr[j].id))||''):'<span class="stone empty">·</span>').join('')}</div></div>`).join('')}</div></div>`}$('#catalog').innerHTML=html||'<div class="emptymsg">Ainda não existem rodadas armazenadas.</div>';$('#catalogFoot').textContent=`${rows.length} rodadas disponíveis • ${groups.size} blocos de 10 minutos • até ${catalogLimit} solicitadas`}

function stat(label,value,detail=''){return `<div class="stat"><small>${label}</small><strong>${value}</strong><span>${detail}</span></div>`}
function gapsOf(rows){const a=[...rows].reverse(),idx=a.map((r,i)=>r.n===0?i:-1).filter(i=>i>=0);return idx.slice(1).map((x,i)=>x-idx[i]-1)}
function percentile(sorted,p){if(!sorted.length)return null;return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]}
function recoveryAnalysis(rows){const gaps=gapsOf(rows).sort((a,b)=>a-b),r=catalogRows.findIndex(x=>x.n===0);const current=r<0?'≥ '+catalogRows.length:String(r);$('#recoveryAnalysis').innerHTML=stat('SEM BRANCO AGORA',current,'rodadas desde o último branco')+stat('MEDIANA',gaps.length?percentile(gaps,.5):'—',gaps.length+' intervalos completos')+stat('PERCENTIL 75',gaps.length?percentile(gaps,.75):'—','rodadas sem branco')+stat('PERCENTIL 90',gaps.length?percentile(gaps,.9):'—','rodadas sem branco')}
function minuteAnalysis(rows){const w=Array(60).fill(0),ex=Array(60).fill(0);rows.forEach(r=>{const m=+parts(r.ts).minute;ex[m]++;if(r.n===0)w[m]++});const max=Math.max(1,...w);$('#minuteAnalysis').innerHTML=w.map((n,i)=>`<div class="minute-cell" title="${String(i).padStart(2,'0')} min • ${n} brancos em ${ex[i]} rodadas" style="--heat:${ex[i]?(.1+.85*n/max):0}"><small>${String(i).padStart(2,'0')}</small><b>${ex[i]?n:'—'}</b></div>`).join('')}
function positions(rows){const a=[...rows].reverse(),m=new Map();a.forEach(r=>{const p=parts(r.ts),key=`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;if(!m.has(key))m.set(key,[]);m.get(key).push(r)});const counts=[Array(3).fill(0),Array(3).fill(0)];let pairs=0;for(const arr of m.values()){if(arr.length!==2)continue;pairs++;arr.forEach((r,i)=>counts[i][r.n===0?0:r.n<=7?1:2]++)}$('#positions').innerHTML=`<table><thead><tr><th>POSIÇÃO</th><th>BRANCO</th><th>AMARELO</th><th>PRETO</th></tr></thead><tbody>${counts.map((a,i)=>`<tr><th>${i+1}ª</th>${a.map(v=>`<td>${v}<small>${pct(v,pairs)}</small></td>`).join('')}</tr>`).join('')}</tbody></table><div class="foot">${pairs} minutos completos analisados</div>`}
function whitePatterns(rows){const a=[...rows].reverse(),runs=[];let len=0,mirror=0,tooth=0;for(let i=0;i<a.length;i++){if(a[i].n===0){len++;if(i>=2&&a[i-2].n===0&&a[i-1].n!==0)mirror++;if(i>=3&&a[i-3].n===0&&a[i-2].n!==0&&a[i-1].n!==0)tooth++}else if(len){runs.push(len);len=0}}if(len)runs.push(len);$('#whitePatterns').innerHTML=stat('BRANCO SIMPLES',runs.filter(x=>x===1).length,'sequências isoladas')+stat('DUPLOS',runs.filter(x=>x===2).length,'sequências de 2')+stat('TRIPLOS',runs.filter(x=>x===3).length,'sequências de 3')+stat('4 OU MAIS',runs.filter(x=>x>=4).length,'sequências longas')+stat('ESPELHADOS',mirror,'1 rodada entre brancos')+stat('DENTADOS',tooth,'2 rodadas entre brancos')}
function deviations(rows){const n=rows.length;$('#deviations').innerHTML=[['BRANCO',0,1/15],['AMARELO',1,7/15],['PRETO',2,7/15]].map(([name,id,p])=>{const k=rows.filter(r=>(r.n===0?0:r.n<=7?1:2)===id).length,observed=n?k/n:0,delta=n?(observed-p)*100:0;return stat(name,n?`${delta>=0?'+':''}${delta.toFixed(2).replace('.',',')} pp`:'—',n?`${pct(k,n)} observado • ${(p*100).toFixed(2).replace('.',',')}% teórico`:'Sem amostra')}).join('')}
function payingStones(rows){const a=[...rows].reverse(),counts=Array(15).fill(0),windows=Array(15).fill(0);let whites=0,complete=0;for(let i=0;i<a.length;i++){if(a[i].n!==0)continue;whites++;if(i>=5)complete++;const seen=new Set();for(let j=Math.max(0,i-5);j<i;j++){counts[a[j].n]++;seen.add(a[j].n)}seen.forEach(n=>windows[n]++)}const top=counts.map((count,n)=>({n,count,windows:windows[n]})).sort((x,y)=>y.count-x.count||x.n-y.n).slice(0,3);$('#payingStones').innerHTML=top.some(x=>x.count>0)?top.map((x,i)=>`<div class="paying-card"><span class="rank">#${i+1}</span>${stone({n:x.n,ts:Date.now()})}<strong>${x.count}×</strong><small>${x.windows} de ${whites} brancos • ${pct(x.windows,whites)}</small></div>`).join(''):'<div class="emptymsg">Aguardando brancos com rodadas anteriores no período.</div>';$('#payingFoot').textContent=`${whites} brancos no período • ${complete} com 5 rodadas anteriores no período • conta ocorrências (inclusive pedra 0), janelas sobrepostas permitidas. As primeiras janelas podem ter menos de 5 rodadas.`}
const COLLAPSE_KEY='rb301_panels_closed';let closedPanels={};try{closedPanels=JSON.parse(localStorage.getItem(COLLAPSE_KEY)||'{}')}catch{}
function setupCollapse(){document.querySelectorAll('.panels > .panel').forEach((panel,i)=>{const head=panel.querySelector('.panelhead');if(!head)return;const key='tool-'+i;panel.classList.toggle('collapsed',!!closedPanels[key]);const b=document.createElement('button');b.type='button';b.className='collapse-toggle';b.setAttribute('aria-label','Recolher ou expandir ferramenta');b.setAttribute('aria-expanded',String(!closedPanels[key]));b.textContent=closedPanels[key]?'＋ EXPANDIR':'－ RECOLHER';b.addEventListener('click',()=>{const closed=panel.classList.toggle('collapsed');closedPanels[key]=closed;b.textContent=closed?'＋ EXPANDIR':'－ RECOLHER';b.setAttribute('aria-expanded',String(!closed));try{localStorage.setItem(COLLAPSE_KEY,JSON.stringify(closedPanels))}catch{}});head.append(b)});}
let alertReady=false,lastAlertId=null,whiteAlertTimer=null;
function notifyWhites(rows){if(!rows.length)return;const newest=rows[0];if(!alertReady){lastAlertId=newest.id;alertReady=true;return}if(newest.id===lastAlertId)return;const idx=rows.findIndex(r=>r.id===lastAlertId);const fresh=(idx>0?rows.slice(0,idx):[newest]).reverse();lastAlertId=newest.id;const events=fresh.filter(r=>r.n===0);if(!events.length)return;const chronological=[...rows].reverse();const target=events.at(-1),pos=chronological.findIndex(r=>r.id===target.id);if(pos<0)return;let run=1;for(let i=pos-1;i>=0&&chronological[i].n===0;i--)run++;const prev=chronological[pos-1],prev2=chronological[pos-2],prev3=chronological[pos-3];let label=run>=4?'SEQUÊNCIA DE '+run+' BRANCOS':run===3?'BRANCO TRIPLO':run===2?'BRANCO DUPLO':prev2?.n===0&&prev?.n!==0?'BRANCO ESPELHADO':prev3?.n===0&&prev?.n!==0&&prev2?.n!==0?'BRANCO DENTADO':'BRANCO!';const el=$('#whiteAlert');el.innerHTML=`<div class="alert-stone">${whiteMark}</div><div><small>RADAR BLITZ • EVENTO REAL</small><strong>${label}</strong><span>${stamp(target.ts)} • pedra 0</span></div>`;el.classList.remove('active');void el.offsetWidth;el.classList.add('active');clearTimeout(whiteAlertTimer);whiteAlertTimer=setTimeout(()=>el.classList.remove('active'),7000)}

function render(){metric(catalogRows);frequencies(analysisRows);flow(analysisRows);intervals(analysisRows);streaks(analysisRows);transitions(analysisRows);heat(analysisRows);numbers(analysisRows);comparison(analysisRows,previousRows);recoveryAnalysis(analysisRows);minuteAnalysis(analysisRows);positions(analysisRows);whitePatterns(analysisRows);deviations(analysisRows);payingStones(analysisRows);strongLines(analysisRows);showPatterns();catalog(catalogRows);$('#sample').textContent=fmt(analysisRows.length)+' RODADAS ANALISADAS'}
async function refresh(full=false){
 if(refreshing)return;refreshing=true;
 try{
  if(API.includes('SEU_SUBDOMINIO'))throw Error('Configure public/config.js com a URL do Worker publicado');
  const [a,b]=windowDates();
  const wantedWindow=a.toISOString()+'|'+b.toISOString();
  // A API de rodadas é prioritária: falha do endpoint de saúde não derruba o catálogo.
  const settled=await Promise.allSettled([get('/api/health'),get('/api/rounds?limit='+catalogLimit)]);
  const h=settled[0].status==='fulfilled'?settled[0].value:null;
  const c=settled[1].status==='fulfilled'?settled[1].value:null;
  let received=false;
  if(h?.ok){health=h;received=true;$('#synced').textContent=h.metadata?.last_sync?stamp(Date.parse(h.metadata.last_sync)):'AINDA NÃO SINCRONIZADO';$('#coverage').textContent=h.metadata?.last_error?'ERRO NA COLETA: '+h.metadata.last_error:`${fmt(h.total)} rodadas armazenadas`}
  if(c?.data?.length){const newRows=parse(c.data);if(newRows.length){catalogRows=newRows;notifyWhites(newRows);received=true}}
  // O histórico de análises pode falhar independentemente do catálogo.
  let historyError=null;
  if(full||!analysisRows.length||lastHistoryWindow!==wantedWindow){
   try{const fresh=await loadHistory(a,b);const delta=b-a;const prior=await loadHistory(new Date(a-delta),a);analysisRows=fresh;previousRows=prior;lastHistoryWindow=wantedWindow;received=true}
   catch(e){historyError=e;console.warn('Histórico indisponível; preservando análises anteriores',e)}
  }
  if(received){lastGoodAt=Date.now();render();saveSnapshot();setDataAge()}
  const failed=settled.some(x=>x.status==='rejected')||!h?.ok||!c?.data||!!historyError;
  if(failed){const details=[...settled.filter(x=>x.status==='rejected').map(x=>x.reason?.message||'API indisponível'),historyError?.message].filter(Boolean);status('CONEXÃO INSTÁVEL');$('#error').textContent='Exibindo os últimos dados disponíveis. Tentando reconectar automaticamente. '+details.join(' • ');$('#dataAge').textContent=lastGoodAt?'Últimos dados disponíveis • '+Math.floor((Date.now()-lastGoodAt)/60000)+' min desde a última resposta':'Sem dados salvos neste navegador'}
  else{const fresh=h.metadata?.last_sync&&Date.now()-Date.parse(h.metadata.last_sync)<180000;status(fresh?'DADOS ATUALIZADOS':'COLETA ATRASADA',!!fresh);$('#error').textContent=''}
  if(!received&&!catalogRows.length&&!analysisRows.length)throw Error('API indisponível e nenhum histórico local salvo');
 }catch(e){status('SEM CONEXÃO');$('#error').textContent=(catalogRows.length?'Exibindo dados salvos. ':'')+e.message;setDataAge();console.error(e)}
 finally{refreshing=false}
}
$('#period').addEventListener('change',()=>{const custom=$('#period').value==='custom';$('#startWrap').classList.toggle('hidden',!custom);$('#endWrap').classList.toggle('hidden',!custom)});
$('#apply').addEventListener('click',()=>refresh(true));$('#flowScale').addEventListener('change',()=>flow(analysisRows));
$$('[data-limit]').forEach(b=>b.addEventListener('click',()=>{catalogLimit=Number(b.dataset.limit);$$('[data-limit]').forEach(x=>x.classList.toggle('selected',x===b));refresh(false)}));
$('#csv').addEventListener('click',()=>{const text='id;data_hora_utc;numero;cor\n'+catalogRows.map(r=>`${r.id};${new Date(r.ts).toISOString()};${r.n};${names[color(r.n)]}`).join('\n');const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='radar-blitz-rodadas.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),500)});
function catalogStone(r,mark,g1mark){return stone(r,mark).replace('<span class="stone ',`<span data-round="${safe(r.id)}" role="button" tabindex="0" class="stone ${g1mark||''} `);}
function scanPattern(rows,pattern){const a=[...rows].sort((x,y)=>x.ts-y.ts);const marks=new Map();let found=0,complete=0,wins=0,whites=0;const positions=Array(6).fill(0);if(!pattern.length)return {marks,found,complete,wins,whites,positions};for(let i=0;i+pattern.length<=a.length;i++){if(!pattern.every((n,j)=>a[i+j].n===n))continue;found++;for(let j=0;j<pattern.length;j++)marks.set(String(a[i+j].id),'selected');const next=a.slice(i+pattern.length,i+pattern.length+6);for(const r of next)if(r.n===0&&!marks.has(String(r.id)))marks.set(String(r.id),'hit');if(next.length!==6)continue;complete++;const first=next.findIndex(r=>r.n===0);if(first>=0){wins++;positions[first]++;}whites+=next.filter(r=>r.n===0).length;}return {marks,found,complete,wins,whites,positions};}
function toolMarks(rows){if(toolMode==='card')return patternMarks(rows);if(toolMode==='detect')return chosenPattern.length===Number($('#detectSize').value)?scanPattern(rows,chosenPattern).marks:new Map();const m=new Map();for(const r of rows){if((toolMode==='sum'||toolMode==='select'&&selectionMode==='manual')&&picked.has(String(r.id))||toolMode==='select'&&matchValue!==null&&(selectionMode==='number'&&r.n===matchValue||selectionMode==='color'&&color(r.n)===matchValue))m.set(String(r.id),'selected');}return m;}
function updateTool(){const active=toolMode;$('#toolClear').classList.toggle('hidden',!active);for(const [id,mode] of [['toolSelect','select'],['toolSum','sum'],['toolDetect','detect']])$('#'+id).classList.toggle('selected',active===mode);for(const [id,mode] of [['selectOptions','select'],['sumOptions','sum'],['detectOptions','detect']])$('#'+id).classList.toggle('hidden',active!==mode);$('#toolStatus').textContent=active==='card'?'Sequência selecionada: '+cardPattern:active==='select'?'Clique nas pedras para destacar.':active==='sum'?'Clique nas pedras para somar.':active==='detect'?'Escolha os números na ordem cronológica.':'';if(active==='sum'){const nums=[...picked.values()].map(r=>r.n),sum=nums.reduce((a,b)=>a+b,0),base=$('#sumBase').value;let result='—';if(nums.length&&/^\d{2}:\d{2}$/.test(base)){const [h,m]=base.split(':').map(Number),t=h*60+m+sum;result=String(Math.floor(t%1440/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')+(t>=1440?' (+'+Math.floor(t/1440)+'d)':'');}$('#sumResult').innerHTML=stat('SOMA',sum,nums.join(' + '))+stat('PROJEÇÃO',result,'Horário base + soma em minutos');}if(active==='detect'){const size=Number($('#detectSize').value);$('#detectSequence').textContent='Sequência: '+Array.from({length:size},(_,i)=>chosenPattern[i]??'—').join(' → ');const r=scanPattern(analysisRows.length?analysisRows:catalogRows,chosenPattern.length===size?chosenPattern:[]);$('#detectStats').innerHTML=stat('OCORRÊNCIAS',r.found,'Janelas completas: '+r.complete)+stat('COM BRANCO',r.wins,'Até 6 rodadas')+stat('SEM BRANCO',r.complete-r.wins,'Pendentes: '+(r.found-r.complete))+stat('FREQUÊNCIA',pct(r.wins,r.complete),'Brancos nas janelas: '+r.whites)+stat('PRIMEIRO BRANCO POR CASA',r.positions.join(' / '),'1ª a 6ª casa')+stat('AMOSTRA',analysisRows.length||catalogRows.length,analysisRows.length?'Período de análise':'Catalogador');}}
function activateTool(mode){toolMode=mode;picked.clear();matchValue=null;chosenPattern=[];cardPattern=null;$('#sumBase').value='';showPatterns();catalog(catalogRows);}
function setupCatalogTools(){for(const [id,mode] of [['toolSelect','select'],['toolSum','sum'],['toolDetect','detect'],['toolClear','']])$('#'+id).addEventListener('click',()=>activateTool(mode));$('#selectMode').addEventListener('change',e=>{selectionMode=e.target.value;picked.clear();matchValue=null;catalog(catalogRows)});$('#sumBase').addEventListener('input',updateTool);$('#detectSize').addEventListener('change',()=>{chosenPattern=[];catalog(catalogRows)});$('#detectPalette').innerHTML=Array.from({length:15},(_,n)=>`<button type="button" class="stone ${color(n)}" data-num="${n}">${n}</button>`).join('');function add(n){if(chosenPattern.length>=Number($('#detectSize').value))chosenPattern=[];chosenPattern.push(n);catalog(catalogRows)}$('#detectPalette').addEventListener('click',e=>{const b=e.target.closest('[data-num]');if(b)add(Number(b.dataset.num))});$('#detectUndo').addEventListener('click',()=>{chosenPattern.pop();catalog(catalogRows)});function clickStone(e){const b=e.target.closest('[data-round]');if(!b)return;const r=catalogRows.find(r=>String(r.id)===b.dataset.round);if(!r)return;if(toolMode==='detect'){add(r.n);return}if(toolMode==='sum'||toolMode==='select'&&selectionMode==='manual'){const id=String(r.id);if(picked.has(id))picked.delete(id);else{if(toolMode==='sum'&&!$('#sumBase').value){const p=parts(r.ts);$('#sumBase').value=p.hour+':'+p.minute;}picked.set(id,r)}}else if(toolMode==='select')matchValue=selectionMode==='number'?r.n:color(r.n);else return;catalog(catalogRows)}$('#catalog').addEventListener('click',clickStone);$('#catalog').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();clickStone(e)}});$('#patternList').addEventListener('click',e=>{const b=e.target.closest('[data-pattern]');if(!b)return;const key=b.dataset.pattern;activateTool('card');cardPattern=key;showPatterns();catalog(catalogRows);$('#catalogTools').scrollIntoView({behavior:'smooth',block:'start'})});}

// V3.0.20 — lista local G1; não modifica sugestões globais G2.
const G1_KEY='rb320_g1_list',G1_MIN=60000,G1_WINDOW=4*G1_MIN;
let g1State=null,g1Recovering=false,g1LastRecovery=0,g1Generating=false,g1GenerationId=0;
const g1Emoji=c=>c==='black'?'⚫':c==='white'?'⚪️':'🟡';
const g1Time=t=>{const p=parts(t);return p.hour+':'+p.minute};
const g1Win=(n,c)=>n===0||color(n)===c;
function g1Rows(...lists){return [...new Map(lists.flat().map(r=>[String(r.id),r])).values()].sort((a,b)=>a.ts-b.ts||String(a.id).localeCompare(String(b.id)));}
// V3.0.22 — perfil temporal histórico. O par futuro do G2 não é observável.
const G1_DAY=86400000,G1_MIN_GAP=5*G1_MIN,G1_BASELINE=1-(7/15)**2;
let g1ProfileCache=null;
function g1HistoryEnd(now){return Math.floor((now-3*3600000)/G1_DAY)*G1_DAY+3*3600000;}
function g1Lower(h,n){if(!n)return 0;const p=h/n,z=1.96,z2=z*z;return (p+z2/(2*n)-z*Math.sqrt((p*(1-p)+z2/(4*n))/n))/(1+z2/n);}
function g1Rank(rows,end){
 const start=end-3*G1_DAY,split=end-G1_DAY;
 const buckets=new Map();
 for(const r of g1Rows(rows)){
  if(r.ts<start||r.ts>=end)continue;
  const t=Math.floor(r.ts/G1_MIN)*G1_MIN;
  if(!buckets.has(t))buckets.set(t,[]);buckets.get(t).push(r);
 }
 const profile=Array.from({length:60},()=>({black:{train:0,test:0,trainHits:0,testHits:0},yellow:{train:0,test:0,trainHits:0,testHits:0}}));
 for(const [t,pair] of buckets){
  // Apenas minutos completos, com duas rodadas distintas e continuidade anterior.
  const prior=buckets.get(t-G1_MIN);
  if(pair.length!==2||!prior||prior.length!==2||pair[0].ts>=pair[1].ts||pair[0].ts-prior[1].ts>90000||pair[1].ts-pair[0].ts>90000)continue;
  const slot=profile[new Date(t).getUTCMinutes()],phase=t<split?'train':'test';
  for(const c of ['black','yellow']){const x=slot[c];x[phase]++;if(pair.some(r=>g1Win(r.n,c)))x[phase+'Hits']++;}
 }
 return profile.map(slot=>{
  // Escolher a cor usando somente treino; teste separado serve de filtro, não de ajuste.
  const ranked=['black','yellow'].map(c=>{const x=slot[c];return {...x,c,trainRate:x.train?x.trainHits/x.train:0,score:x.test?x.testHits/x.test:0,rank:g1Lower(x.trainHits,x.train)};})
   .filter(x=>x.train>=30&&x.trainRate>=G1_BASELINE)
   .sort((a,b)=>b.rank-a.rank||b.trainRate-a.trainRate||a.c.localeCompare(b.c));
  const best=ranked[0];return best&&best.test>=15&&best.score>=G1_BASELINE?best:null;
 });
}
async function g1LoadProfile(now){
 const end=g1HistoryEnd(now);
 if(g1ProfileCache?.end===end)return g1ProfileCache.profile;
 // Janelas diárias fechadas e iguais para todos, aproveitando o cache da API.
 const rows=[];
 for(let day=3;day>=1;day--)rows.push(...await loadHistory(new Date(end-day*G1_DAY),new Date(end-(day-1)*G1_DAY)));
 const profile=g1Rank(rows,end);g1ProfileCache={end,profile};return profile;
}
function g1Build(profile,rows,minutes,quantity,now){
 const latest=g1Rows(rows).at(-1);if(!latest||now-latest.ts>180000||latest.ts>now+G1_MIN)throw Error('Coleta atrasada. Aguarde rodadas atualizadas.');
 const first=Math.ceil((now+5*G1_MIN)/G1_MIN)*G1_MIN,last=Math.floor((now+minutes*G1_MIN)/G1_MIN)*G1_MIN;
 const candidates=[];
 for(let t=first;t<=last;t+=G1_MIN){const x=profile[new Date(t).getUTCMinutes()];if(x)candidates.push({...x,target:t});}
 // Ordenar pela evidência no treino; não forçar alternância, quantidade ou intervalos fixos.
 candidates.sort((a,b)=>b.rank-a.rank||b.trainRate-a.trainRate||a.target-b.target);
 const items=[];
 for(const x of candidates){if(items.length>=quantity)break;if(items.some(y=>Math.abs(y.target-x.target)<G1_MIN_GAP))continue;items.push({target:x.target,c:x.c,status:'pending',train:x.train,test:x.test,trainRate:x.trainRate,score:x.score});}
 if(!items.length)throw Error('Nenhum horário passou pelos critérios históricos. Tente outro período ou aguarde novos dados.');
 items.sort((a,b)=>a.target-b.target);
 return {created:now,active:false,model:{version:'322-minute-profile',days:3,requested:quantity,period:minutes},items};
}
function g1Resolve(item,rows,now){
 if(item.status!=='pending'||now<item.target)return item;
 const before=rows.filter(r=>r.ts<item.target).at(-1),after=rows.filter(r=>r.ts>=item.target&&r.ts<item.target+G1_WINDOW).slice(0,2);
 // Não usar uma rodada tardia como SG quando o início da janela não foi observado.
 const valid=before&&item.target-before.ts<=180000&&after[0]&&after[0].ts-item.target<=90000&&after[0].ts-before.ts<=180000;
 if(valid){
  if(g1Win(after[0].n,item.c))return {...item,status:'SG',n:after[0].n,roundId:String(after[0].id)};
  if(after[1]&&after[1].ts-after[0].ts<=90000){const r=after[1];return {...item,status:g1Win(r.n,item.c)?'G1':'LOSS',n:r.n,roundId:String(r.id)};}
 }
 // Sem dados ainda? Aguarda recuperação, em vez de inventar um LOSS.
 return item;
}
function g1Save(){try{if(g1State)localStorage.setItem(G1_KEY,JSON.stringify(g1State));else localStorage.removeItem(G1_KEY)}catch(e){$('#g1Message').textContent='Armazenamento local indisponível; a lista pode não sobreviver ao recarregamento.';}}
function g1Restore(){try{const s=JSON.parse(localStorage.getItem(G1_KEY)||'null');if(s&&Array.isArray(s.items)&&s.items.length<=20&&s.items.length&&s.items.every(x=>Number.isFinite(x.target)&&['yellow','black'].includes(x.c)&&['pending','SG','G1','LOSS','SEM DADOS'].includes(x.status)))g1State=s}catch{}}
function g1Text(){return 'LISTA BLITZ RADAR G1\n\n'+g1State.items.map(x=>g1Time(x.target)+g1Emoji(x.c)+'⚪️').join('\n');}
function g1Render(){
 const s=g1State;$('#g1List').classList.toggle('hidden',!s);$('#g1Copy').disabled=!s;$('#g1Follow').disabled=!s||!!s.active;$('#g1Stop').classList.toggle('hidden',!s?.active);$('#g1Generate').disabled=g1Generating||!!s?.active;$('#g1Reset').disabled=!s&&!g1Generating;
 if(!s){for(const id of ['g1Rows','g1Stats','g1Meta','g1Status'])$('#'+id).textContent='';return;}
 $('#g1Status').textContent=s.active?'ACOMPANHANDO':'LISTA GERADA';
 const sg=s.items.filter(x=>x.status==='SG').length,g1=s.items.filter(x=>x.status==='G1').length,loss=s.items.filter(x=>x.status==='LOSS').length,missing=s.items.filter(x=>x.status==='SEM DADOS').length;
 $('#g1Stats').innerHTML=stat('SG',sg)+stat('G1',g1)+stat('LOSS',loss)+stat('ASSERTIVIDADE',pct(sg+g1,sg+g1+loss));
 $('#g1Rows').innerHTML=s.items.map(x=>{const win=x.status==='SG'||x.status==='G1',label=win?'WIN '+g1Emoji(color(x.n))+'✅ '+x.status:x.status==='LOSS'?'LOSS ❌':x.status==='SEM DADOS'?'SEM DADOS':'AGUARDANDO';return `<div class="g1-row"><b>${g1Time(x.target)}${g1Emoji(x.c)}⚪️</b><span class="${win?'g1-ok':x.status==='LOSS'?'g1-bad':''}">${label}</span></div>`}).join('');
 const m=s.model;$('#g1Meta').textContent=`${s.items.length} horários • Brasília • ${s.items.length-sg-g1-loss-missing} pendentes • ${missing} sem dados. ${m?.version==='322-minute-profile'?'Perfil por minuto da hora: 2 dias de treino, 1 de teste; seleção limitada à quantidade máxima. Não é previsão comprovada.':'Lista criada pelo motor anterior. Use RESETAR LISTA para gerar com o novo modelo.'}`;
}
function g1Update(){
 if(!g1State?.active)return;
 const rows=g1Rows(analysisRows,catalogRows),now=Date.now();let changed=false;
 g1State.items=g1State.items.map(x=>{const y=g1Resolve(x,rows,now);if(y!==x)changed=true;return y});
 if(changed)g1Save();g1Render();
 // Após ausência prolongada, consulta uma janela histórica fechada apenas quando necessário.
 if(!g1Recovering&&now-g1LastRecovery>60000&&g1State.items.some(x=>x.status==='pending'&&now>x.target+10*G1_MIN))void g1Recover();
}
async function g1Recover(){
 const state=g1State;if(!state?.active)return;
 const now=Date.now(),late=state.items.filter(x=>x.status==='pending'&&now>x.target+10*G1_MIN);if(!late.length)return;
 g1Recovering=true;g1LastRecovery=now;
 try{const rows=g1Rows(await loadHistory(new Date(late[0].target-3*G1_MIN),new Date(late.at(-1).target+G1_WINDOW)),analysisRows,catalogRows);
  if(g1State!==state||!state.active)return;
  const targets=new Set(late.map(x=>x.target));state.items=state.items.map(x=>{if(!targets.has(x.target)||x.status!=='pending')return x;const y=g1Resolve(x,rows,now);return y===x?{...x,status:'SEM DADOS'}:y});g1Save();g1Render();catalog(catalogRows);
 }catch(e){if(g1State===state&&state.active)$('#g1Message').textContent='Histórico indisponível; resultados pendentes serão reconsultados.'}finally{g1Recovering=false}
}
function g1Marks(){const m=new Map();if(g1State?.active)for(const x of g1State.items)if(x.roundId)m.set(x.roundId,x.status==='LOSS'?'g1-loss':x.status==='SG'||x.status==='G1'?'g1-win':'');return m;}
function setupG1(){
 g1Restore();g1Render();if(g1State?.active)$('#g1Options').classList.remove('hidden');
 $('#toolG1').addEventListener('click',()=>{$('#g1Options').classList.toggle('hidden');$('#toolG1').classList.toggle('selected',!$('#g1Options').classList.contains('hidden'))});
 $('#g1Reset').addEventListener('click',()=>{
  if(g1State?.active&&!window.confirm('Encerrar o acompanhamento e apagar esta lista e seus resultados locais?'))return;
  ++g1GenerationId;g1Generating=false;g1State=null;g1LastRecovery=0;
  $('#g1Message').textContent='Lista resetada. Escolha o período e a quantidade e gere uma nova lista.';
  g1Save();g1Render();catalog(catalogRows);
 });
 $('#g1Generate').addEventListener('click',async()=>{
  if(g1State?.active||g1Generating)return;
  const request=++g1GenerationId,minutes=Number($('#g1Period').value),quantity=Number($('#g1Quantity').value);
  g1Generating=true;g1Render();$('#g1Message').textContent='Calculando…';
  try{
   const profile=await g1LoadProfile(Date.now());
   if(request!==g1GenerationId)return;
   let rows=g1Rows(analysisRows,catalogRows);
   if(Date.now()-(rows.at(-1)?.ts||0)>180000)rows=g1Rows(rows,parse((await get('/api/rounds?limit=420')).data));
   if(request!==g1GenerationId)return;
   g1State=g1Build(profile,rows,minutes,quantity,Date.now());g1Save();$('#g1Message').textContent=`Lista criada: ${g1State.items.length} de até ${quantity} horários. Clique em ACOMPANHAR NO SITE para iniciar a apuração.`;
  }catch(e){if(request===g1GenerationId)$('#g1Message').textContent=e.message+(g1State?' A lista anterior foi mantida; use RESETAR LISTA para removê-la.':'');}
  finally{if(request===g1GenerationId){g1Generating=false;g1Render();}}
 });
 $('#g1Copy').addEventListener('click',async()=>{if(!g1State)return;try{await navigator.clipboard.writeText(g1Text());$('#g1Message').textContent='Lista copiada.'}catch{const t=document.createElement('textarea');t.value=g1Text();$('#g1Options').append(t);t.select();const ok=document.execCommand('copy');t.remove();$('#g1Message').textContent=ok?'Lista copiada.':'Não foi possível copiar.'}});
 $('#g1Follow').addEventListener('click',()=>{if(!g1State)return;g1State.active=true;g1Save();g1Render();catalog(catalogRows);$('#g1Message').textContent='Acompanhamento ativo neste navegador.'});
 $('#g1Stop').addEventListener('click',()=>{if(!g1State)return;g1State.active=false;g1Save();g1Render();catalog(catalogRows);$('#g1Message').textContent='Acompanhamento encerrado. Lista mantida para consulta.'});
}

// A coleta NÃO depende desta atualização do navegador: o Worker agendado a executa.
setupCatalogTools();setupG1();setupCollapse();restoreSnapshot();refresh(true);loadPatterns();setInterval(loadPatterns,300000);setInterval(()=>refresh(false),30000);setInterval(()=>refresh(true),300000);setInterval(setDataAge,60000);

// V3.0.5 — leitura apenas de sinais oficiais gerados no Worker e persistidos no D1.
const guideSections=[
['01 • Ferramentas do catalogador','Selecione pedras, some valores a um horário editável ou analise sequências de 2 a 4 números. Use LIMPAR para voltar ao normal. A lista G1 é independente e local; ENCERRAR ACOMPANHAMENTO remove suas marcações. RESETAR LISTA apaga a lista local e seu placar, sem afetar outras ferramentas.'],
['03 • Frequência das cores','Mostra a proporção de branco, amarelo e preto no período escolhido. Compare com as proporções teóricas (6,67%, 46,67% e 46,67%).'],
['04 • Fluxo de brancos','Quantidade de brancos em blocos de 10, 15 ou 60 minutos; lacunas de coleta não devem ser tratadas como zero.'],
['05 • Intervalos entre brancos','Distribuição das quantidades de rodadas entre resultados brancos. Não indica quando o próximo branco deverá ocorrer.'],
['06 • Sequências de cores','Comprimento das séries consecutivas de amarelo ou preto.'],
['07 • Transições entre cores','Frequência com que uma cor aparece depois de outra no histórico.'],
['08 • Brancos por hora','Contagem de brancos por hora do dia. Horas com quantidades diferentes de rodadas não são diretamente comparáveis.'],
['09 • Frequência das pedras','Quantidade de vezes que cada número de 0 a 14 apareceu.'],
['10 • Período atual × anterior','Compara a janela escolhida com outra janela de mesma duração imediatamente anterior.'],
['11 • Radar de recuperação','Compara o intervalo atual sem branco com percentis de intervalos passados; não prevê recuperação.'],
['12 • Análise por minuto','Distribui brancos pelos minutos 00–59; amostras pequenas podem criar concentrações ocasionais.'],
['13 • 1ª × 2ª rodada','Compara a primeira e a segunda rodada dos minutos que tiveram exatamente duas rodadas registradas.'],
['14 • Padrões de brancos','Duplo/triplo: brancos consecutivos. Espelhado: uma rodada entre brancos. Dentado: duas rodadas entre brancos.'],
['15 • Identificador de padrões','Compara sequências exatas de 2 ou 3 pedras no histórico armazenado com as últimas 3 horas. Conta um acerto se aparecer branco nas cinco rodadas seguintes; exige amostra mínima. Clique na sequência para destacar. Contornos no catalogador: verde = confirmado, amarelo = em observação, cinza = sem branco nas cinco rodadas. Padrões não garantem resultados futuros.'],
['16 • Linhas fortes','Classifica as seis linhas de dez minutos por brancos no período selecionado. Mostra também brancos/rodadas para comparar exposição desigual.'],
['17 • Desvios estatísticos','pp significa pontos percentuais. Exemplo: amarelo observado 48,2% menos teórico 46,67% = +1,53 pp. Valor positivo significa que apareceu mais que o esperado; negativo, menos. Não significa que a cor esteja atrasada ou vá compensar.'],
['19 • Pedras pagantes','As três pedras (inclusive 0) mais frequentes nas cinco rodadas anteriores a cada branco. Janelas podem se sobrepor.'],
['18 • Sugestão inteligente','Sugestões experimentais calculadas no servidor com regras verificáveis, até G2 e branco nas três tentativas. Se não houver evidência suficiente, o painel pode não emitir sinal. O histórico completo é global e não pode ser editado retroativamente.'],
['02 • Catalogador','Histórico das rodadas por minuto, com até duas pedras por minuto e os resultados mais recentes primeiro.'],
['Filtros e interpretação','O período selecionado muda as estatísticas, não o histórico global dos sinais. Acertar em até G2 não equivale a lucro: apostas adicionais e cobertura têm custo. Em roleta independente, uma cor + branco em três tentativas tem probabilidade teórica de 89,84%, mesmo sem qualquer padrão.']];
guideSections.sort((a,b)=>a[0].localeCompare(b[0]));$('#guideContent').innerHTML=guideSections.map(([t,d])=>`<section><h3>${safe(t)}</h3><p>${safe(d)}</p></section>`).join('');
$('#howToOpen').addEventListener('click',()=>$('#howToDialog').showModal());
$$('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.closeDialog).close()));
let globalSignal=null,signalPage=0,signalHasMore=false;
function displaySignal(){const el=$('#signalLive');if(!globalSignal){el.innerHTML='<div class="signal-empty">Nenhuma sugestão qualificada no momento. Aguardando avaliação do motor estatístico.</div>';return}const t=parts(Date.parse(globalSignal.target_instant));const time=`${t.hour}:${t.minute}`;const c=globalSignal.color==='black'?'⚫':'🟡';el.innerHTML=`<div class="signal-box"><div class="signal-cell"><small>HORÁRIO • BRASÍLIA</small><strong>${time}</strong></div><div class="signal-cell"><small>ENTRADA • ATÉ G2</small><strong>${c} ⚪</strong></div><div class="signal-sub">${globalSignal.status==='pending'?'Programada com antecedência':globalSignal.status==='active'?'Em avaliação': 'Última sugestão encerrada'} • fonte oficial D1</div></div>`}
async function loadSignal(){try{const r=await get('/api/signal');globalSignal=r.signal||null;displaySignal()}catch(e){if(!globalSignal)$('#signalLive').innerHTML='<div class="signal-empty">Sinal indisponível. Tentando reconectar…</div>'}}
function signalResultLabel(x){
 if(x.status!=='done')return x.status==='active'?'⏳ EM AVALIAÇÃO':'⏳ AGUARDANDO';
 const raw=String(x.outcome||'');
 if(raw==='LOSS')return '❌ LOSS';
 if(raw==='SEM DADOS')return '⚠️ SEM DADOS';
 const match=/^(SG|G1|G2)(?::(\d{1,2}))?$/.exec(raw);
 if(!match)return safe(raw||'—');
 // Resultados antigos só têm SG/G1/G2: não inventar a pedra vencedora.
 if(match[2]===undefined)return '✅ '+match[1]+' (pedra não registrada)';
 const n=Number(match[2]);
 const stone=n===0?'⚪':n<=7?'🟡':n<=14?'⚫':'❔';
 return stone+'✅ '+match[1];
}
async function loadSignalStats(){
 const el=$('#signalHistoryStats');if(!el)return;
 try{const r=await get('/api/signal-stats');const x=r.stats||{};
  const tile=(title,wins,total,losses)=>{wins=Number(wins||0);total=Number(total||0);losses=Number(losses||0);const rate=total?(100*wins/total):0;
   return `<section class="signal-stat-tile"><small>${title}</small><strong>${total?pct(wins,total):'—'}</strong><span>${fmt(wins)} WINS / ${fmt(total)} sinais</span><span>${fmt(losses)} LOSS</span><div class="signal-stat-track"><div style="width:${rate}%"></div></div></section>`;
  };
  el.innerHTML=tile('ASSERTIVIDADE HISTÓRICA',x.wins,x.total,x.losses)+tile('ASSERTIVIDADE HOJE • BRASÍLIA',x.today_wins,x.today_total,x.today_losses);
 }catch(e){el.textContent='Não foi possível carregar as taxas de assertividade.'}
}
async function loadSignalHistory(){try{const r=await get('/api/signals?page='+signalPage);signalHasMore=!!r.has_more;$('#signalPage').textContent=String(signalPage+1);$('#signalPrev').disabled=signalPage===0;$('#signalNext').disabled=!signalHasMore;$('#signalHistorySummary').textContent='Resultados oficiais armazenados no banco D1 • SG, G1, G2 e LOSS • até 20 registros por página';$('#signalHistoryRows').innerHTML=(r.data||[]).length?`<table><thead><tr><th>HORÁRIO</th><th>ENTRADA</th><th>RESULTADO</th></tr></thead><tbody>${r.data.map(x=>`<tr><td>${stamp(Date.parse(x.target_instant))}</td><td>${x.color==='black'?'⚫':'🟡'} ⚪</td><td class="signal-result">${signalResultLabel(x)}</td></tr>`).join('')}</tbody></table>`:'<div class="signal-empty">Nenhum registro neste período.</div>'}catch(e){$('#signalHistoryRows').textContent='Não foi possível consultar o histórico global.'}}
$('#signalHistoryOpen').addEventListener('click',()=>{signalPage=0;$('#signalHistoryDialog').showModal();loadSignalStats();loadSignalHistory()});
$('#signalPrev').addEventListener('click',()=>{if(signalPage>0){signalPage--;loadSignalHistory()}});
$('#signalNext').addEventListener('click',()=>{if(signalHasMore){signalPage++;loadSignalHistory()}});
loadSignal();setInterval(loadSignal,30000);

// V3.0.13 — ranking temporal independente do filtro principal.
let temporalData=null;
function showTemporal(){
 const el=$('#temporalRanking'),summary=$('#temporalSummary'),tip=$('#temporalTip');
 if(!el||!temporalData)return;
 const key=$('#temporalPeriod').value,all=temporalData.periods?.[key]||[];
 const eligible=all.filter(x=>x.total>=8&&x.rate!==null);
 const ranked=eligible.slice(0,7);
 summary.textContent=`${key==='7d'?'7 dias':key==='24h'?'24 horas':key==='3h'?'3 horas':'2 horas'} • ${temporalData.sample_rounds||0} rodadas examinadas${temporalData.partial?' • histórico parcial':''} • janela +10 min (±1)`;
 el.innerHTML=ranked.length?ranked.map((x,i)=>`<div class="temporal-row"><b>${i+1}º</b><span class="temporal-stone">${x.number}</span><div class="temporal-info"><div>${x.hits}/${x.total} ocorrências • ${pct(x.hits,x.total)} <small>(${x.exact} no minuto exato)</small></div><div class="temporal-track"><span style="width:${100*x.rate}%"></span></div></div></div>`).join(''):'<div class="signal-empty">Amostra insuficiente: nenhuma pedra teve 8 ocorrências maduras neste período.</div>';
 if(ranked.length){
  const top=ranked[0];
  tip.textContent=`DICA DO RADAR • Pedra ${top.number}: ${top.hits} acertos em ${top.total} ocorrências (${pct(top.hits,top.total)}) no período. Observe se a frequência se mantém; não é previsão.`;
 }else tip.textContent='DICA DO RADAR • Aguarde mais ocorrências antes de interpretar o ranking.';
}
async function loadTemporal(){
 try{const data=await get('/api/temporal-stones');if(data.error)throw Error(data.error);temporalData=data;showTemporal()}
 catch(e){const el=$('#temporalSummary');if(el)el.textContent='Análise temporal indisponível. Confirme a publicação do Worker V3.0.13.';console.warn(e)}
}
$('#temporalPeriod').addEventListener('change',showTemporal);
loadTemporal();setInterval(loadTemporal,1800000);

// V3.0.24 — simulador local, sem API, sem execução de apostas.
(()=>{
'use strict';
const by=id=>document.getElementById(id);
const KEY='radar-blitz-bank-demo-v324';
const MAX=100000000; // centavos fictícios de banca inicial
const money=n=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
// BEGIN BANK MATH — valores inteiros em centavos. Na cor, blocos de 100 centavos
// preservam a divisão 87/13 exatamente e produzem 74 centavos líquidos por bloco.
function planFor(target,limit,mode,budget){
 const unit=mode==='white'?1:100, profit=mode==='white'?13:74;
 let spent=0;const stakes=[];
 for(let i=0;i<limit;i++){
  const amount=Math.max(1,Math.ceil((target+spent)/profit))*unit;
  if(!Number.isSafeInteger(amount)||amount>budget-spent)return null;
  stakes.push(amount);spent+=amount;
 }
 return {target,stakes,exposure:spent};
}
function bestPlan(budget,limit,mode){
 if(!Number.isSafeInteger(budget)||budget<=0||!Number.isInteger(limit)||limit<1||limit>100||!['white','color'].includes(mode))return null;
 let low=1,high=Math.min(Number.MAX_SAFE_INTEGER,mode==='white'?13*budget:Math.floor(budget/100)*74),best=null;
 while(low<=high){const mid=Math.floor((low+high)/2),p=planFor(mid,limit,mode,budget);if(p){best=p;low=mid+1}else high=mid-1;}
 return best;
}
function startDemo(initial,limit,mode){const p=bestPlan(initial,limit,mode);if(!p)return null;return {initial,balance:initial,limit,mode,cycle:1,step:0,lost:0,plan:p,history:[],done:false};}
function settleDemo(s,outcome){
 if(!s||s.done||!['loss','white','color'].includes(outcome)||(s.mode==='white'&&outcome==='color'))return null;
 const stake=s.plan.stakes[s.step];if(!Number.isSafeInteger(stake)||stake<=0||stake>s.balance)return null;
 const net=outcome==='loss'?-stake:s.mode==='white'?stake*13:outcome==='color'?stake/100*74:stake/100*82;
 const balance=s.balance+net;if(!Number.isSafeInteger(balance))return null;
 const next={...s,balance,history:[{cycle:s.cycle,step:s.step+1,outcome,stake,net,balance},...s.history].slice(0,200)};
 if(outcome==='loss'){
  next.lost+=stake;next.step++;
  if(next.step>=s.limit)next.done=true;
 }else{
  next.lastCycleProfit=net-s.lost;
  const plan=bestPlan(balance,s.limit,s.mode);
  if(plan&&balance<=MAX){next.cycle++;next.step=0;next.lost=0;next.plan=plan;}else{next.done=true;next.step=s.limit;}
 }
 return next;
}
// END BANK MATH
let state=null;
function msg(t){by('bankMessage').textContent=t;}
function save(){try{if(state)localStorage.setItem(KEY,JSON.stringify(state));else localStorage.removeItem(KEY);}catch{msg('Armazenamento local indisponível; a simulação não será preservada.');}}
function restore(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&Number.isSafeInteger(s.initial)&&s.initial>0&&s.initial<=MAX&&Number.isSafeInteger(s.balance)&&s.balance>=0&&Number.isInteger(s.limit)&&s.limit>=1&&s.limit<=100&&['white','color'].includes(s.mode)&&Number.isInteger(s.step)&&s.step>=0&&s.step<=s.limit&&Number.isSafeInteger(s.lost)&&s.lost>=0&&Number.isInteger(s.cycle)&&s.cycle>=1&&typeof s.done==='boolean'&&Array.isArray(s.history)&&s.history.length<=200&&s.history.every(h=>Number.isInteger(h.cycle)&&Number.isInteger(h.step)&&['loss','white','color'].includes(h.outcome)&&Number.isSafeInteger(h.stake)&&Number.isSafeInteger(h.net)&&Number.isSafeInteger(h.balance))&&s.plan&&Number.isSafeInteger(s.plan.target)&&s.plan.target>0&&Array.isArray(s.plan.stakes)&&s.plan.stakes.length===s.limit&&s.plan.stakes.every(x=>Number.isSafeInteger(x)&&x>0)&&(s.done||s.step<s.limit&&s.plan.stakes[s.step]<=s.balance))state=s;}catch{state=null;}}
function render(){
 const s=state;by('bankLive').classList.toggle('hidden',!s);for(const id of ['bankMode','bankInitial','bankLimit','bankStart'])by(id).disabled=!!s;if(!s)return;
 by('bankMode').value=s.mode;by('bankInitial').value=(s.initial/100).toFixed(2);by('bankLimit').value=s.limit;
 const stake=s.done?0:s.plan.stakes[s.step];const color=s.mode==='color';
 by('bankBalance').textContent=money(s.balance);by('bankNet').textContent=money(s.balance-s.initial);by('bankNet').className=s.balance>=s.initial?'bank-positive':'bank-negative';
 by('bankTarget').textContent=money(s.plan.target);by('bankStep').textContent=`${s.done?'—':s.step+1}/${s.limit} • C${s.cycle}`;by('bankStake').textContent=s.done?'—':money(stake);by('bankLost').textContent=money(s.lost);
 by('bankSplit').classList.toggle('hidden',!color);by('bankParts').textContent=s.done?'—':`${money(stake/100*87)} / ${money(stake/100*13)}`;
 by('bankWin').classList.toggle('hidden',color);by('bankWinColor').classList.toggle('hidden',!color);by('bankWinWhite').classList.toggle('hidden',!color);
 for(const id of ['bankWin','bankWinColor','bankWinWhite','bankLoss'])by(id).disabled=s.done;
 const labels={loss:'LOSS',white:'WIN BRANCO',color:'WIN COR'};
 by('bankHistory').innerHTML=`<p class="foot">Exposição máxima deste ciclo: ${money(s.plan.exposure)}. Alvo mínimo condicionado a um WIN; arredondamento pode aumentar o lucro em até 12 centavos no branco ou 73 centavos na cor. No modo cores, entradas simuladas em múltiplos de R$ 1,00 preservam a divisão exata. O histórico mantém os últimos 200 resultados.</p>`+(s.history.length?`<table><thead><tr><th>CICLO / ENTRADA</th><th>RESULTADO</th><th>VALOR</th><th>LÍQUIDO</th><th>SALDO</th></tr></thead><tbody>${s.history.map(h=>`<tr><td>${h.cycle} / ${h.step}</td><td class="${h.net>=0?'bank-positive':'bank-negative'}">${labels[h.outcome]}</td><td>${money(h.stake)}</td><td>${money(h.net)}</td><td>${money(h.balance)}</td></tr>`).join('')}</tbody></table>`:'<p class="foot">Nenhum resultado registrado.</p>');
}
function record(outcome){const next=settleDemo(state,outcome);if(!next){msg('Resultado inválido ou simulação encerrada.');return;}state=next;msg(state.done?'Ciclo encerrado. Nenhuma nova entrada será calculada.':outcome==='loss'?'Perda registrada. Próxima etapa simulada recalculada.':`Ciclo encerrado com resultado líquido de ${money(state.lastCycleProfit)}. Novo ciclo fictício calculado.`);save();render();}
by('toolBank').addEventListener('click',()=>{const open=by('bankOptions').classList.toggle('hidden')===false;by('toolBank').classList.toggle('selected',open);by('toolBank').setAttribute('aria-expanded',String(open));});
by('bankStart').addEventListener('click',()=>{const initialRaw=Number(by('bankInitial').value),initial=Math.round(initialRaw*100),limit=Number(by('bankLimit').value),mode=by('bankMode').value;if(!Number.isFinite(initialRaw)||initial<=0||initial>MAX||Math.abs(initialRaw*100-initial)>1e-5||!Number.isInteger(limit)||limit<1||limit>100){msg('Informe um saldo fictício de R$ 0,01 a R$ 1.000.000,00 e de 1 a 100 entradas.');return;}const next=startDemo(initial,limit,mode);if(!next){msg('Saldo fictício insuficiente para essa quantidade de entradas com lucro-alvo positivo em centavos. Reduza o limite de entradas.');return;}state=next;msg('Simulação iniciada. O lucro-alvo depende de um WIN no ciclo.');save();render();});
for(const [id,outcome] of [['bankWin','white'],['bankWinWhite','white'],['bankWinColor','color'],['bankLoss','loss']])by(id).addEventListener('click',()=>record(outcome));
by('bankReset').addEventListener('click',()=>{if(!state||!window.confirm('Apagar esta simulação e seu histórico local?'))return;state=null;msg('Simulação resetada.');save();render();});
restore();render();
})();
