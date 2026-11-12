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
const SNAPSHOT_KEY='radar-blitz-v304-last-good';
let lastGoodAt=0, lastHistoryWindow='';
function saveSnapshot(){try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({at:Date.now(),catalogRows,analysisRows,previousRows,health,window:lastHistoryWindow}))}catch(e){console.warn('Cache local indisponível',e)}}
function restoreSnapshot(){try{const s=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'null');if(!s||!Array.isArray(s.catalogRows)||!s.catalogRows.length)return false;catalogRows=s.catalogRows;alertReady=true;lastAlertId=catalogRows[0]?.id||null;analysisRows=Array.isArray(s.analysisRows)?s.analysisRows:[];previousRows=Array.isArray(s.previousRows)?s.previousRows:[];health=s.health||null;lastGoodAt=s.at||0;lastHistoryWindow=s.window||'';render();$('#synced').textContent=health?.metadata?.last_sync?stamp(Date.parse(health.metadata.last_sync)):'—';$('#coverage').textContent='Exibindo último histórico salvo neste navegador';status('DADOS SALVOS • OFFLINE');setDataAge();return true}catch(e){console.warn('Snapshot inválido',e);return false}}
function setDataAge(){const el=$('#dataAge');if(!el)return;if(!lastGoodAt){el.textContent='';return}const min=Math.max(0,Math.floor((Date.now()-lastGoodAt)/60000));el.textContent=min<1?'Dados recebidos há menos de 1 min':`Últimos dados recebidos há ${min} min`}

const whiteMark='<span class="white-emblem"><svg viewBox="0 0 36 36" aria-hidden="true"><rect x="5" y="5" width="26" height="26" rx="6" fill="#f2c62f"/><path d="M20 7 11 20h7l-3 9 12-16h-8l4-6z" fill="#111"/></svg></span>';
const stone=(r,mark='')=>`<span class="stone ${color(r.n)} ${mark?'pattern-'+mark:''}" title="${stamp(r.ts)} • ${r.n}${mark?' • padrão '+(mark==='hit'?'confirmado':mark==='watch'?'em observação':'sem branco nas 5 rodadas'):''}">${r.n===0?whiteMark:r.n}</span>`;
async function get(path){const r=await fetch(API+path,{cache:'no-store'});if(!r.ok)throw Error(`API ${r.status}`);return r.json()}
function status(msg,ok=false){$('#status').textContent='● '+msg;$('#status').classList.toggle('ok',ok)}
function windowDates(){let now=new Date(),h=$('#period').value;if(h==='custom'){
 const a=new Date($('#start').value),b=new Date($('#end').value);if(!Number.isFinite(+a)||!Number.isFinite(+b)||b<=a)throw Error('Selecione um período válido');if(b-a>31*86400000)throw Error('Máximo de 31 dias por consulta');return [a,b]}
 // Janela estável de 5 minutos: consultas idênticas podem aproveitar o cache compartilhado.
 const anchor=new Date(Math.floor(now.getTime()/300000)*300000);return [new Date(anchor-Number(h)*3600000),anchor]}
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
 const selected=new Set(recognizedPatterns.map(p=>p.key));const marks=new Map();
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
 el.innerHTML=recognizedPatterns.slice(0,8).map(p=>`<div class="pattern-item"><div class="pattern-stones">${p.numbers.map(st).join('<span class="pattern-arrow">›</span>')}</div><div class="pattern-count"><strong>${p.recentHits}/${p.recentTotal} <small>3H</small></strong><span>${pct(p.hits,p.total)} global • ${p.hits}/${p.total}</span></div></div>`).join('');
 summary.textContent=`${recognizedPatterns.length} padrões qualificados • últimas 3 horas vs. ${patternCoverage?.scanned?.toLocaleString('pt-BR')||'—'} rodadas históricas${patternCoverage?.truncated?' (histórico parcial; limite de segurança)':''}`;
}
async function loadPatterns(){try{const r=await get('/api/patterns');recognizedPatterns=r.patterns||[];patternCoverage=r.coverage;showPatterns();catalog(catalogRows)}catch(e){if(!recognizedPatterns.length)$('#patternSummary').textContent='Padrões indisponíveis. Verifique se o Worker V3.0.7 foi publicado.'}}
function catalog(rows){const marks=patternMarks(rows);const groups=new Map();for(const r of rows){const k=blockKey(r.ts);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}let html='';for(const [key,list] of groups){const slots=Array.from({length:10},()=>[]);for(const r of list){const minute=Number(parts(r.ts).minute)%10;slots[minute].push(r)}slots.forEach(x=>x.sort((a,b)=>a.ts-b.ts));const label=key.slice(11);html+=`<div class="catalogrow"><div class="rowtime">${safe(label)}</div><div class="minutes">${slots.map((arr,i)=>`<div class="minute"><span class="minute-label">${String((+label.slice(3)+i)%60).padStart(2,'0')}</span><div class="pair">${[0,1].map(j=>arr[j]?stone(arr[j],marks.get(String(arr[j].id))||''):'<span class="stone empty">·</span>').join('')}</div></div>`).join('')}</div></div>`}$('#catalog').innerHTML=html||'<div class="emptymsg">Ainda não existem rodadas armazenadas.</div>';$('#catalogFoot').textContent=`${rows.length} rodadas disponíveis • ${groups.size} blocos de 10 minutos • até ${catalogLimit} solicitadas`}

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
// A coleta NÃO depende desta atualização do navegador: o Worker agendado a executa.
setupCollapse();restoreSnapshot();refresh(true);loadPatterns();setInterval(loadPatterns,300000);setInterval(()=>refresh(false),30000);setInterval(()=>refresh(true),300000);setInterval(setDataAge,60000);

// V3.0.5 — leitura apenas de sinais oficiais gerados no Worker e persistidos no D1.
const guideSections=[
['01 • Frequência das cores','Mostra a proporção de branco, amarelo e preto no período escolhido. Compare com as proporções teóricas (6,67%, 46,67% e 46,67%).'],
['02 • Fluxo de brancos','Quantidade de brancos em blocos de 10, 15 ou 60 minutos; lacunas de coleta não devem ser tratadas como zero.'],
['03 • Intervalos entre brancos','Distribuição das quantidades de rodadas entre resultados brancos. Não indica quando o próximo branco deverá ocorrer.'],
['04 • Sequências de cores','Comprimento das séries consecutivas de amarelo ou preto.'],
['05 • Transições entre cores','Frequência com que uma cor aparece depois de outra no histórico.'],
['06 • Brancos por hora','Contagem de brancos por hora do dia. Horas com quantidades diferentes de rodadas não são diretamente comparáveis.'],
['07 • Frequência das pedras','Quantidade de vezes que cada número de 0 a 14 apareceu.'],
['08 • Período atual × anterior','Compara a janela escolhida com outra janela de mesma duração imediatamente anterior.'],
['09 • Radar de recuperação','Compara o intervalo atual sem branco com percentis de intervalos passados; não prevê recuperação.'],
['10 • Análise por minuto','Distribui brancos pelos minutos 00–59; amostras pequenas podem criar concentrações ocasionais.'],
['11 • 1ª × 2ª rodada','Compara a primeira e a segunda rodada dos minutos que tiveram exatamente duas rodadas registradas.'],
['12 • Padrões de brancos','Duplo/triplo: brancos consecutivos. Espelhado: uma rodada entre brancos. Dentado: duas rodadas entre brancos.'],
['17 • Identificador de padrões','Compara sequências exatas de 2 ou 3 pedras no histórico armazenado com as últimas 3 horas. Conta um acerto se aparecer branco nas cinco rodadas seguintes; exige amostra mínima. Contornos no catalogador: verde = confirmado, amarelo = em observação, cinza = sem branco nas cinco rodadas. Padrões não garantem resultados futuros.'],
['18 • Linhas fortes','Classifica as seis linhas de dez minutos por brancos no período selecionado. Mostra também brancos/rodadas para comparar exposição desigual.'],
['13 • Desvios estatísticos','pp significa pontos percentuais. Exemplo: amarelo observado 48,2% menos teórico 46,67% = +1,53 pp. Valor positivo significa que apareceu mais que o esperado; negativo, menos. Não significa que a cor esteja atrasada ou vá compensar.'],
['14 • Pedras pagantes','As três pedras (inclusive 0) mais frequentes nas cinco rodadas anteriores a cada branco. Janelas podem se sobrepor.'],
['15 • Sugestão inteligente','Sugestões experimentais calculadas no servidor com regras verificáveis, até G2 e branco nas três tentativas. Se não houver evidência suficiente, o painel pode não emitir sinal. O histórico completo é global e não pode ser editado retroativamente.'],
['16 • Catalogador','Histórico das rodadas por minuto, com até duas pedras por minuto e os resultados mais recentes primeiro.'],
['Filtros e interpretação','O período selecionado muda as estatísticas, não o histórico global dos sinais. Acertar em até G2 não equivale a lucro: apostas adicionais e cobertura têm custo. Em roleta independente, uma cor + branco em três tentativas tem probabilidade teórica de 89,84%, mesmo sem qualquer padrão.']];
$('#guideContent').innerHTML=guideSections.map(([t,d])=>`<section><h3>${safe(t)}</h3><p>${safe(d)}</p></section>`).join('');
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

// V3.0.9 — painel e histórico global de sugestões de branco
let whitePage=0,whiteMore=false;
function renderWhiteSignal(x){const el=$('#whiteSignalLive');if(!el)return;if(!x){el.innerHTML='<div class="signal-empty">Nenhuma janela qualificada neste momento. Aguardando cruzamento dos indicadores.</div>';return}const t=parts(Date.parse(x.target_instant));el.innerHTML=`<div class="white-window"><small>JANELA SUGERIDA • BRASÍLIA</small><strong>⚪ ${t.hour}:${t.minute}</strong><div class="window-range">${stamp(Date.parse(x.window_start)).slice(-8,-3)} — ${stamp(Date.parse(x.window_end)).slice(-8,-3)}</div><div class="window-note">Margem ±1 minuto • ${x.status==='pending'?'programada antecipadamente':'em avaliação'} • D1 global</div></div>`}
async function loadWhiteSignal(){try{const r=await get('/api/white-signal');renderWhiteSignal(r.signal)}catch{const el=$('#whiteSignalLive');if(el)el.textContent='Análise de branco indisponível. Verifique a instalação do D1.'}}
async function loadWhiteStats(){const el=$('#whiteHistoryStats');if(!el)return;try{const r=await get('/api/white-signal-stats'),s=r.stats||{};const card=(title,wins,total,losses)=>`<div class="signal-stat-tile"><small>${title}</small><strong>${total?((wins||0)*100/total).toFixed(2).replace('.',',')+'%':'—'}</strong><span>${wins||0} WINS / ${total||0} sinais • ${losses||0} LOSS</span></div>`;el.innerHTML=card('ASSERTIVIDADE HISTÓRICA',s.wins,s.total,s.losses)+card('ASSERTIVIDADE HOJE',s.today_wins,s.today_total,s.today_losses)}catch{el.textContent='Estatísticas indisponíveis.'}}
async function loadWhiteHistory(){try{const r=await get('/api/white-signals?page='+whitePage);whiteMore=!!r.has_more;$('#whitePage').textContent=String(whitePage+1);$('#whitePrev').disabled=whitePage===0;$('#whiteNext').disabled=!whiteMore;$('#whiteHistoryRows').innerHTML=(r.data||[]).length?`<table><thead><tr><th>HORÁRIO</th><th>MARGEM</th><th>RESULTADO</th></tr></thead><tbody>${r.data.map(x=>`<tr><td>${stamp(Date.parse(x.target_instant))}</td><td>±1 min</td><td class="signal-result">${x.outcome==='WIN'?'⚪✅ WIN':x.outcome==='LOSS'?'❌ LOSS':x.outcome==='SEM DADOS'?'⚠ SEM DADOS':'⏳ AGUARDANDO'}</td></tr>`).join('')}</tbody></table>`:'<div class="signal-empty">Nenhuma sugestão registrada.</div>'}catch{$('#whiteHistoryRows').textContent='Não foi possível carregar o histórico de branco.'}}
$('#whiteHistoryOpen').addEventListener('click',()=>{whitePage=0;$('#whiteHistoryDialog').showModal();loadWhiteStats();loadWhiteHistory()});
$('#whitePrev').addEventListener('click',()=>{if(whitePage>0){whitePage--;loadWhiteHistory()}});
$('#whiteNext').addEventListener('click',()=>{if(whiteMore){whitePage++;loadWhiteHistory()}});
loadWhiteSignal();setInterval(loadWhiteSignal,60000);
