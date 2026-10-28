const $=s=>document.querySelector(s);
const TZ='America/Sao_Paulo';
const color=n=>Number(n)===0?'white':(Number(n)>=1&&Number(n)<=7?'yellow':'black');
const parts=t=>{let p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t));return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))};
const fmt=t=>{let p=parts(t);return `${p.hour}:${p.minute}:${p.second}`};
function normalize(raw){
 let a=Array.isArray(raw)?raw:(raw?.data||raw?.history||raw?.results||raw?.items||raw?.rounds||[]);
 return a.map(x=>({number:Number(x.number??x.result),ts:new Date(x.instant||x.created_at_utc||x.created_at_local||x.created_at||x.ts).getTime()}))
 .filter(x=>Number.isFinite(x.number)&&x.ts).sort((a,b)=>b.ts-a.ts).slice(0,200)
}
function mkStone(r){
 let c=color(r.number),el=document.createElement('div');el.className='stone '+c;
 if(c==='white') el.innerHTML='<span class="white-badge"><i class="blitz-bolt"></i></span>'; else el.textContent=r.number; return el
}

/* Cada linha = bloco cronológico de 10 minutos (ex. 10:00–10:09).
   10 colunas x 2 pedras = 20 posições.
   Sempre 10 linhas = 200 posições.
   Ao entrar em x0 (10,20,30...), nasce uma nova linha no topo.
   A 11ª linha desaparece. */
function blockKey(r){
 let p=parts(r.ts), m=Number(p.minute), start=Math.floor(m/10)*10;
 return `${p.year}-${p.month}-${p.day}T${p.hour}:${String(start).padStart(2,'0')}`;
}
let initialized=false,lastSeenTs=null,alertTimer=null;

function whiteAlertStone(){
 return '<div class="alert-stone stone white"><span class="white-badge"><i class="blitz-bolt"></i></span></div>';
}
function anyColorAlertStone(){
 return '<div class="alert-stone stone any-color" aria-label="amarelo ou preto"></div>';
}
function classifyWhiteSequence(rows,current){
 const idx=rows.findIndex(r=>r===current || (r.ts===current.ts && r.number===current.number));
 const h=idx>=0?rows.slice(idx):[current];
 const W=i=>h[i] && Number(h[i].number)===0;
 const C=i=>h[i] && Number(h[i].number)!==0;

 // Priority: consecutive sequences first.
 if(W(0)&&W(1)&&W(2)&&W(3)){
   let count=0;
   while(W(count)) count++;
   return {kind:'forrada',title:'FORRADA!',subtitle:'QUE SEQUÊNCIA DE BRANCOS!',pattern:Array(Math.min(count,5)).fill('W')};
 }
 if(W(0)&&W(1)&&W(2))
   return {kind:'triplo',title:'TOMA ESSE',subtitle:'TRIPLO BRANCO!',pattern:['W','W','W']};
 if(W(0)&&W(1))
   return {kind:'duplo',title:'TOMA ESSE',subtitle:'DUPLO BRANCO!',pattern:['W','W']};

 // Newest -> oldest representation of B > A/P > B and B > A/P > A/P > B.
 if(W(0)&&C(1)&&W(2))
   return {kind:'espelhado',title:'BRANCO',subtitle:'ESPELHADO!',pattern:['W','C','W']};
 if(W(0)&&C(1)&&C(2)&&W(3))
   return {kind:'dentado',title:'BRANCO',subtitle:'DENTADO!',pattern:['W','C','C','W']};

 return {kind:'normal',title:'BRANCO!',subtitle:'',pattern:['W']};
}
function showWhiteAlert(r,rows){
 const event=classifyWhiteSequence(rows,r);
 const overlay=$('#whiteAlert');
 const card=$('#whiteAlertCard');
 card.className='white-alert-card event-'+event.kind;
 $('#whiteAlertTitle').textContent=event.title;
 $('#whiteAlertSubtitle').textContent=event.subtitle;
 $('#whiteAlertSequence').innerHTML=event.pattern.map(x=>x==='W'?whiteAlertStone():anyColorAlertStone()).join('');
 $('#whiteAlertTime').textContent=fmt(r.ts);
 overlay.classList.remove('show');
 void overlay.offsetWidth;
 overlay.classList.add('show');
 overlay.setAttribute('aria-hidden','false');
 clearTimeout(alertTimer);
 alertTimer=setTimeout(()=>{overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true')},7000);
}
function detectNewWhite(rows){
 if(!rows.length)return;
 if(!initialized){lastSeenTs=rows[0].ts;initialized=true;return}
 const fresh=rows.filter(r=>r.ts>lastSeenTs).sort((a,b)=>a.ts-b.ts);
 lastSeenTs=Math.max(lastSeenTs,rows[0].ts);
 const whites=fresh.filter(r=>Number(r.number)===0);
 const w=whites.pop();
 if(w)showWhiteAlert(w,rows);
}


const WF_SEED=[["2026-10-23T15:00:00-03:00", 7], ["2026-10-23T16:00:00-03:00", 11], ["2026-10-23T17:00:00-03:00", 10], ["2026-10-23T18:00:00-03:00", 12], ["2026-10-23T19:00:00-03:00", 7], ["2026-10-23T20:00:00-03:00", 7], ["2026-10-23T21:00:00-03:00", 4], ["2026-10-23T22:00:00-03:00", 7], ["2026-10-23T23:00:00-03:00", 10], ["2026-10-24T00:00:00-03:00", 6], ["2026-10-24T01:00:00-03:00", 4], ["2026-10-24T02:00:00-03:00", 9], ["2026-10-24T03:00:00-03:00", 10], ["2026-10-24T04:00:00-03:00", 10], ["2026-10-24T05:00:00-03:00", 6], ["2026-10-24T06:00:00-03:00", 7], ["2026-10-24T07:00:00-03:00", 12], ["2026-10-24T08:00:00-03:00", 4], ["2026-10-24T09:00:00-03:00", 4], ["2026-10-24T10:00:00-03:00", 8], ["2026-10-24T11:00:00-03:00", 8], ["2026-10-24T12:00:00-03:00", 6], ["2026-10-24T13:00:00-03:00", 3], ["2026-10-24T14:00:00-03:00", 6], ["2026-10-24T15:00:00-03:00", 14], ["2026-10-24T16:00:00-03:00", 12], ["2026-10-24T17:00:00-03:00", 10], ["2026-10-24T18:00:00-03:00", 8], ["2026-10-24T19:00:00-03:00", 8], ["2026-10-24T20:00:00-03:00", 6], ["2026-10-24T21:00:00-03:00", 12], ["2026-10-24T22:00:00-03:00", 11], ["2026-10-24T23:00:00-03:00", 15], ["2026-10-25T00:00:00-03:00", 5], ["2026-10-25T01:00:00-03:00", 8], ["2026-10-25T02:00:00-03:00", 10], ["2026-10-25T03:00:00-03:00", 8], ["2026-10-25T04:00:00-03:00", 11], ["2026-10-25T05:00:00-03:00", 10], ["2026-10-25T06:00:00-03:00", 5], ["2026-10-25T07:00:00-03:00", 8], ["2026-10-25T08:00:00-03:00", 7], ["2026-10-25T09:00:00-03:00", 9], ["2026-10-25T10:00:00-03:00", 7], ["2026-10-25T11:00:00-03:00", 6], ["2026-10-25T12:00:00-03:00", 7], ["2026-10-25T13:00:00-03:00", 6], ["2026-10-25T14:00:00-03:00", 8], ["2026-10-25T15:00:00-03:00", 11], ["2026-10-25T16:00:00-03:00", 5], ["2026-10-25T17:00:00-03:00", 9], ["2026-10-25T18:00:00-03:00", 12], ["2026-10-25T19:00:00-03:00", 2], ["2026-10-25T20:00:00-03:00", 7], ["2026-10-25T21:00:00-03:00", 11], ["2026-10-25T22:00:00-03:00", 5], ["2026-10-25T23:00:00-03:00", 5], ["2026-10-26T00:00:00-03:00", 4], ["2026-10-26T01:00:00-03:00", 9], ["2026-10-26T02:00:00-03:00", 7], ["2026-10-26T03:00:00-03:00", 5], ["2026-10-26T04:00:00-03:00", 9], ["2026-10-26T05:00:00-03:00", 8], ["2026-10-26T06:00:00-03:00", 6], ["2026-10-26T07:00:00-03:00", 6], ["2026-10-26T08:00:00-03:00", 6], ["2026-10-26T09:00:00-03:00", 9], ["2026-10-26T10:00:00-03:00", 8], ["2026-10-26T11:00:00-03:00", 7], ["2026-10-26T12:00:00-03:00", 7], ["2026-10-26T13:00:00-03:00", 8], ["2026-10-26T14:00:00-03:00", 4], ["2026-10-26T15:00:00-03:00", 5], ["2026-10-26T16:00:00-03:00", 10], ["2026-10-26T17:00:00-03:00", 9], ["2026-10-26T18:00:00-03:00", 6], ["2026-10-26T19:00:00-03:00", 3], ["2026-10-26T20:00:00-03:00", 6], ["2026-10-26T21:00:00-03:00", 7], ["2026-10-26T22:00:00-03:00", 6], ["2026-10-26T23:00:00-03:00", 10], ["2026-10-27T00:00:00-03:00", 2], ["2026-10-27T01:00:00-03:00", 11], ["2026-10-27T02:00:00-03:00", 7], ["2026-10-27T03:00:00-03:00", 9], ["2026-10-27T04:00:00-03:00", 9], ["2026-10-27T05:00:00-03:00", 8], ["2026-10-27T06:00:00-03:00", 15], ["2026-10-27T07:00:00-03:00", 17], ["2026-10-27T08:00:00-03:00", 9], ["2026-10-27T09:00:00-03:00", 6], ["2026-10-27T10:00:00-03:00", 9], ["2026-10-27T11:00:00-03:00", 8], ["2026-10-27T12:00:00-03:00", 6], ["2026-10-27T13:00:00-03:00", 11], ["2026-10-27T14:00:00-03:00", 10], ["2026-10-27T15:00:00-03:00", 11], ["2026-10-27T16:00:00-03:00", 8], ["2026-10-27T17:00:00-03:00", 8], ["2026-10-27T18:00:00-03:00", 13], ["2026-10-27T19:00:00-03:00", 5], ["2026-10-27T20:00:00-03:00", 14], ["2026-10-27T21:00:00-03:00", 9], ["2026-10-27T22:00:00-03:00", 5], ["2026-10-27T23:00:00-03:00", 8], ["2026-10-28T00:00:00-03:00", 8], ["2026-10-28T01:00:00-03:00", 8], ["2026-10-28T02:00:00-03:00", 4], ["2026-10-28T03:00:00-03:00", 10], ["2026-10-28T04:00:00-03:00", 6], ["2026-10-28T05:00:00-03:00", 5], ["2026-10-28T06:00:00-03:00", 11], ["2026-10-28T07:00:00-03:00", 8], ["2026-10-28T08:00:00-03:00", 10], ["2026-10-28T09:00:00-03:00", 8], ["2026-10-28T10:00:00-03:00", 8], ["2026-10-28T11:00:00-03:00", 8], ["2026-10-28T12:00:00-03:00", 4], ["2026-10-28T13:00:00-03:00", 7], ["2026-10-28T14:00:00-03:00", 3]];
const WF_RAW_KEY='rb_white_flow_raw_v2', WF_SCALE_KEY='rb_wf_scale_v2';
let WFRAW=[], WFSCALE=+(localStorage.getItem(WF_SCALE_KEY)||15);
try{WFRAW=JSON.parse(localStorage.getItem(WF_RAW_KEY)||'[]')}catch(e){WFRAW=[]}

function wfStart(ts,min){let d=new Date(ts);if(isNaN(d))return null;d.setSeconds(0,0);if(min===60)d.setMinutes(0);else d.setMinutes(Math.floor(d.getMinutes()/min)*min);return d.getTime()}
function wfTime(t){return new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false})}
function wfDate(t){return new Date(t).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
function wfDay(t){return new Date(t).toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','').toUpperCase()}

const WFSEEDMAP=new Map(WF_SEED.map(([s,n])=>[wfStart(s,60),n]));

function wfUpdate(rows){
  let set=new Set(WFRAW);
  rows.forEach(r=>{if(+r.number===0){let t=new Date(r.ts).getTime();if(Number.isFinite(t))set.add(t)}});
  const cutoff=Date.now()-8*86400000;
  WFRAW=[...set].filter(t=>t>=cutoff).sort((a,b)=>a-b);
  try{localStorage.setItem(WF_RAW_KEY,JSON.stringify(WFRAW))}catch(e){}
  wfDraw();
}

function wfData(){
  const step=WFSCALE*60000, count=WFSCALE===60?120:24;
  const end=wfStart(Date.now(),WFSCALE), start=end-(count-1)*step;
  const arr=Array.from({length:count},(_,i)=>({t:start+i*step,count:0}));

  if(WFSCALE===60){
    // Seed fills the historical 5-day graph immediately.
    arr.forEach(v=>{ if(WFSEEDMAP.has(v.t)) v.count=WFSEEDMAP.get(v.t); });
    // For hours covered by live raw timestamps, source-of-truth becomes live data.
    const liveHours=new Map();
    WFRAW.forEach(t=>{
      if(t<start||t>=end+step)return;
      const b=wfStart(t,60); liveHours.set(b,(liveHours.get(b)||0)+1);
    });
    // Only overwrite seeded hours when raw coverage exists in that hour.
    liveHours.forEach((n,b)=>{let i=Math.round((b-start)/step);if(arr[i])arr[i].count=n});
  } else {
    WFRAW.forEach(t=>{
      if(t<start||t>=end+step)return;
      const b=wfStart(t,WFSCALE),i=Math.round((b-start)/step);
      if(arr[i])arr[i].count++;
    });
  }
  return arr;
}


function wfMarketStudy(d){
  const vals=d.map(v=>v.count), recent=vals.slice(-24), short=vals.slice(-6);
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  const mean=avg(recent), shortMean=avg(short);
  const sorted=[...recent].sort((a,b)=>a-b);
  const q=(p)=>sorted[Math.min(sorted.length-1,Math.max(0,Math.round((sorted.length-1)*p)))]||0;
  const support=q(.20), resistance=q(.80);
  const first=avg(short.slice(0,3)), last=avg(short.slice(-3));
  const delta=last-first;
  const trend=delta>1?'▲ ALTA':delta<-1?'▼ BAIXA':'◆ LATERAL';
  const momentum=shortMean>mean+.75?'POSITIVO':shortMean<mean-.75?'NEGATIVO':'NEUTRO';
  const variance=recent.length?recent.reduce((s,v)=>s+(v-mean)**2,0)/recent.length:0;
  const sd=Math.sqrt(variance);
  const vol=sd>=3?'ALTA':sd>=1.8?'MÉDIA':'BAIXA';

  // Conservative historical expectation: blend 24h baseline with 6h momentum.
  const center=.65*mean+.35*shortMean;
  const low=Math.max(0,Math.floor(center-Math.max(1,sd*.65)));
  const high=Math.max(low,Math.ceil(center+Math.max(1,sd*.65)));

  const set=(id,txt)=>{const el=document.getElementById(id);if(el)el.textContent=txt};
  set('wfTrend',trend); set('wfSupport',String(support)); set('wfResistance',String(resistance));
  set('wfMomentum',momentum); set('wfVolatility',vol); set('wfExpectation',low+'–'+high+' BRANCOS');

  return {support,resistance};
}

function wfDraw(){
  const canvas=document.getElementById('wfChart');if(!canvas)return;
  const d=wfData(),box=canvas.parentElement,D=devicePixelRatio||1,W=Math.max(280,box.clientWidth),H=(WFSCALE===60?285:122);
  const market=document.getElementById('wfMarket');if(market)market.classList.toggle('show',WFSCALE===60);
  const study=WFSCALE===60?wfMarketStudy(d):null;
  canvas.width=W*D;canvas.height=H*D;canvas.style.width=W+'px';canvas.style.height=H+'px';
  const g=canvas.getContext('2d');g.setTransform(D,0,0,D,0,0);g.clearRect(0,0,W,H);
  const p={l:34,r:12,t:(WFSCALE===60?18:9),b:(WFSCALE===60?34:24)},pw=W-p.l-p.r,ph=H-p.t-p.b;
  let M=Math.max(4,...d.map(v=>v.count));M=Math.ceil(M/2)*2;
  const X=i=>p.l+pw*i/(d.length-1),Y=v=>p.t+ph-v/M*ph;

  if(WFSCALE===60&&study){
    const drawLevel=(val,label,accent)=>{
      const yy=Y(val);
      g.save();
      g.setLineDash([7,5]);
      g.lineWidth=1;
      g.strokeStyle=accent?'rgba(243,199,47,.50)':'rgba(210,220,232,.32)';
      g.beginPath();g.moveTo(p.l,yy);g.lineTo(W-p.r,yy);g.stroke();
      g.setLineDash([]);
      const text=label+'  '+val;
      g.font='800 8px system-ui';
      const tw=g.measureText(text).width;
      const bx=W-p.r-tw-14, by=yy-10;
      g.fillStyle=accent?'rgba(243,199,47,.12)':'rgba(190,202,216,.09)';
      g.strokeStyle=accent?'rgba(243,199,47,.38)':'rgba(190,202,216,.22)';
      g.beginPath();g.roundRect(bx,by,tw+10,16,4);g.fill();g.stroke();
      g.fillStyle=accent?'#f3c72f':'#aeb9c6';
      g.textAlign='left';g.textBaseline='middle';
      g.fillText(text,bx+5,by+8);
      g.restore();
    };
    drawLevel(study.support,'SUPORTE',false);
    drawLevel(study.resistance,'RESISTÊNCIA',true);
  }


  g.font='8px system-ui';g.textAlign='right';g.textBaseline='middle';
  for(let i=0;i<3;i++){let y=p.t+ph*i/2,v=Math.round(M*(1-i/2));g.strokeStyle='rgba(148,163,184,.11)';g.beginPath();g.moveTo(p.l,y);g.lineTo(W-p.r,y);g.stroke();g.fillStyle='#788493';g.fillText(v,p.l-6,y)}

  const grad=g.createLinearGradient(0,p.t,0,p.t+ph);grad.addColorStop(0,'rgba(243,199,47,.35)');grad.addColorStop(1,'rgba(243,199,47,.015)');
  g.beginPath();d.forEach((v,i)=>i?g.lineTo(X(i),Y(v.count)):g.moveTo(X(i),Y(v.count)));g.lineTo(X(d.length-1),p.t+ph);g.lineTo(X(0),p.t+ph);g.closePath();g.fillStyle=grad;g.fill();
  g.beginPath();d.forEach((v,i)=>i?g.lineTo(X(i),Y(v.count)):g.moveTo(X(i),Y(v.count)));g.strokeStyle='#f3c72f';g.lineWidth=WFSCALE===60?1.65:2;g.lineJoin='round';g.lineCap='round';g.shadowColor='rgba(243,199,47,.4)';g.shadowBlur=6;g.stroke();g.shadowBlur=0;

  if(WFSCALE!==60) d.forEach((v,i)=>{g.beginPath();g.arc(X(i),Y(v.count),2,0,Math.PI*2);g.fillStyle='#ffd83d';g.fill()});
  g.textAlign='center';g.textBaseline='top';g.fillStyle='#788493';
  if(WFSCALE===60){
    d.forEach((v,i)=>{if(i%24===0||i===d.length-1)g.fillText(wfDate(v.t),X(i),H-p.b+8)});
  } else {
    d.forEach((v,i)=>{if(i%6===0||i===d.length-1)g.fillText(wfTime(v.t),X(i),H-p.b+8)});
  }

  canvas._wf={d,X};
  const range=document.getElementById('wfRange');
  if(range)range.textContent=WFSCALE===10?'ÚLTIMAS 4 HORAS • 24 PONTOS':WFSCALE===15?'ÚLTIMAS 6 HORAS • 24 PONTOS':'ÚLTIMOS 5 DIAS • 120 PONTOS';
  document.querySelectorAll('.wf-scale').forEach(b=>b.classList.toggle('active',+b.dataset.scale===WFSCALE));
}

function wfTip(e){
  const c=document.getElementById('wfChart'),t=document.getElementById('wfTip');if(!c?._wf||!t)return;
  const r=c.getBoundingClientRect(),mx=(e.touches?.[0]?.clientX??e.clientX)-r.left;
  let best=0,dist=Infinity;c._wf.d.forEach((v,i)=>{let q=Math.abs(c._wf.X(i)-mx);if(q<dist){dist=q;best=i}});
  const v=c._wf.d[best],end=v.t+(WFSCALE-1)*60000;
  t.innerHTML='<b>'+(WFSCALE===60?wfDate(v.t)+' • ':'')+wfTime(v.t)+'–'+wfTime(end)+'</b><span>'+v.count+' branco'+(v.count===1?'':'s')+'</span>';
  t.style.left=Math.max(60,Math.min(r.width-60,c._wf.X(best)))+'px';t.classList.add('on');
}
document.addEventListener('click',e=>{const b=e.target.closest('.wf-scale');if(!b)return;WFSCALE=+b.dataset.scale;localStorage.setItem(WF_SCALE_KEY,WFSCALE);wfDraw()});
window.addEventListener('resize',wfDraw);
document.addEventListener('mousemove',e=>{if(e.target?.id==='wfChart')wfTip(e)});
document.addEventListener('touchmove',e=>{if(e.target?.id==='wfChart')wfTip(e)},{passive:true});

/* V2.0 — Radar de cores: lista automática de 15 minutos */
const CSKEY='rb_color_signals_v2';
let CSSTATE=null;
try{CSSTATE=JSON.parse(localStorage.getItem(CSKEY)||'null')}catch(e){CSSTATE=null}

function csMinute(t){const d=new Date(t);d.setSeconds(0,0);return d.getTime()}
function csBlock(t=Date.now()){const d=new Date(t);d.setSeconds(0,0);d.setMinutes(Math.floor(d.getMinutes()/15)*15);return d.getTime()}
function csFmt(t){return new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false})}
function csColor(n){n=+n;return n===0?'W':n<=7?'Y':'B'}
function csIcon(k){return k==='B'?'⚫':k==='Y'?'🟡':'⚪'}

function csRowsByMinute(rows){
  const m=new Map();
  rows.forEach(r=>{
    const t=csMinute(new Date(r.ts).getTime());
    if(!Number.isFinite(t))return;
    if(!m.has(t))m.set(t,[]);
    m.get(t).push(csColor(r.number));
  });
  return m;
}

function csPositionStats(rows){
  // Score each minute-last-digit separately using visible history.
  const buckets=Array.from({length:10},()=>({B:0,Y:0,W:0,n:0,recent:[]}));
  [...rows].sort((a,b)=>new Date(a.ts)-new Date(b.ts)).forEach(r=>{
    const d=new Date(r.ts), k=d.getMinutes()%10, col=csColor(r.number), b=buckets[k];
    b[col]++;b.n++;b.recent.push(col);if(b.recent.length>12)b.recent.shift();
  });
  return buckets;
}
function csPickColor(b){
  const total=Math.max(1,b.B+b.Y), pb=b.B/total, py=b.Y/total;
  const recent=b.recent.filter(x=>x!=='W').slice(-6);
  const rb=recent.filter(x=>x==='B').length/Math.max(1,recent.length);
  const ry=recent.filter(x=>x==='Y').length/Math.max(1,recent.length);
  const sb=.72*pb+.28*rb, sy=.72*py+.28*ry;
  const color=sb>=sy?'B':'Y', edge=Math.abs(sb-sy);
  // White frequency slightly boosts coverage quality but not color direction.
  const coverage=b.W/Math.max(1,b.n);
  return {color,score:edge+coverage*.22,edge,coverage};
}
function csGenerate(rows, block){
  const stats=csPositionStats(rows), start=block+15*60000;
  const candidates=[];
  for(let i=0;i<15;i++){
    const t=start+i*60000, d=new Date(t), p=csPickColor(stats[d.getMinutes()%10]);
    candidates.push({t,color:p.color,score:p.score,status:'PENDING'});
  }
  candidates.sort((a,b)=>b.score-a.score);
  // Dynamic 4–7 points: strongest 4, then add up to 3 only if reasonably close to #4.
  const floor=candidates[Math.min(3,candidates.length-1)]?.score||0;
  let chosen=candidates.filter((x,i)=>i<4 || (i<7 && x.score>=Math.max(.07,floor*.82))).slice(0,7);
  chosen.sort((a,b)=>a.t-b.t);
  return {block,start,signals:chosen,created:Date.now()};
}
function csEvaluate(state, rows){
  const by=csRowsByMinute(rows);
  state.signals.forEach(s=>{
    const sg=by.get(s.t)||[], g1=by.get(s.t+60000)||[];
    const hit=a=>a.includes(s.color), white=a=>a.includes('W');
    if(hit(sg)){s.status='SG'}
    else if(white(sg)){s.status='WSG'}
    else if(hit(g1)){s.status='G1'}
    else if(white(g1)){s.status='WG1'}
    else if(Date.now()>=s.t+2*60000 && (sg.length||g1.length)){s.status='LOSS'}
    else s.status='PENDING';
  });
  return state;
}
function csStatus(s){
  if(s.status==='SG')return '✅ SG';
  if(s.status==='G1')return '✅ G1';
  if(s.status==='WSG')return '⚪ ✅ SG';
  if(s.status==='WG1')return '⚪ ✅ G1';
  if(s.status==='LOSS')return '❌';
  return '⚪';
}
function csRender(rows){
  const now=Date.now(), block=csBlock(now);
  // Generate current/next list if absent. Once the final signal + G1 is over, roll immediately.
  if(!CSSTATE || !Array.isArray(CSSTATE.signals)) CSSTATE=csGenerate(rows,block-15*60000);
  CSSTATE=csEvaluate(CSSTATE,rows);
  const last=CSSTATE.signals.at(-1);
  if(last && now>=last.t+2*60000){
    CSSTATE=csGenerate(rows,block);
  } else if(CSSTATE.start < block && (!last || last.t < now-60000)){
    CSSTATE=csGenerate(rows,block);
  }
  try{localStorage.setItem(CSKEY,JSON.stringify(CSSTATE))}catch(e){}

  const box=document.getElementById('csList');if(!box)return;
  box.innerHTML=CSSTATE.signals.map(s=>`
    <div class="cs-signal ${s.status==='LOSS'?'loss':s.status!=='PENDING'?'done':''}">
      <b>${csFmt(s.t)}</b>
      <span class="cs-pick">${csIcon(s.color)}<i>⚪</i></span>
      <strong>${csStatus(s)}</strong>
    </div>`).join('');
  const first=CSSTATE.signals[0], final=CSSTATE.signals.at(-1);
  const w=document.getElementById('csWindow');
  if(w&&first&&final)w.textContent=csFmt(first.t)+'–'+csFmt(final.t)+' • '+CSSTATE.signals.length+' MELHORES PONTOS';
  const nx=document.getElementById('csNext');
  if(nx&&final){const mins=Math.max(0,Math.ceil((final.t+2*60000-now)/60000));nx.textContent=mins?'NOVA LISTA EM ~'+mins+' MIN':'ATUALIZANDO…'}
}
async function csCopy(){
  if(!CSSTATE)return;
  const text=CSSTATE.signals.map(s=>`${csFmt(s.t)} ${csIcon(s.color)}⚪`).join('\n');
  try{await navigator.clipboard.writeText(text)}catch(e){
    const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
  }
  const b=document.getElementById('csCopy');if(b){const old=b.textContent;b.textContent='COPIADO ✓';setTimeout(()=>b.textContent=old,1200)}
}
document.addEventListener('click',e=>{if(e.target?.id==='csCopy')csCopy()});
function render(rows){
  csRender(rows);
 wfUpdate(rows);
 if(!rows.length)return;
 detectNewWhite(rows);
 const last=rows[0],c=color(last.number),ls=$('#lastStone');
 ls.className='stone hero '+c;if(c==='white')ls.innerHTML='<span class="white-badge"><i class="blitz-bolt"></i></span>';else ls.textContent=last.number;$('#lastTime').textContent=fmt(last.ts);

 const wi=rows.findIndex(r=>r.number===0);
 $('#recovery').textContent=wi<0?'200+':wi;
 $('#lastWhite').textContent=wi>=0?fmt(rows[wi].ts).slice(0,5):'--:--';

 let ct={black:0,yellow:0,white:0};rows.forEach(r=>ct[color(r.number)]++);
 Object.keys(ct).forEach(k=>$('#'+k+'Pct').textContent=(ct[k]*100/rows.length).toFixed(1)+'%');

 const whites=rows.map((r,i)=>r.number===0?i:null).filter(x=>x!==null).slice(0,4),g=[];
 for(let i=0;i<whites.length-1;i++)g.push(whites[i+1]-whites[i]);
 $('#avgWhite').textContent=g.length?(g.reduce((a,b)=>a+b,0)/g.length).toFixed(1):'--';

 // Estatística por POSIÇÃO FINAL do minuto:
 // coluna 0 = 00,10,20,30,40,50; coluna 1 = 01,11,21...; etc.
 // É UMA estatística por coluna e aparece somente no cabeçalho do catálogo.
 const posStats=Array.from({length:10},(_,pos)=>{
   const a=rows.filter(r=>Number(parts(r.ts).minute)%10===pos);
   return {total:a.length,white:a.filter(r=>r.number===0).length}
 });

 // Agrupa em blocos cronológicos reais de 10 minutos.
 const map=new Map();
 rows.forEach(r=>{let k=blockKey(r);if(!map.has(k))map.set(k,[]);map.get(k).push(r)});
 let blocks=[...map.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,10);

 if(blocks.length){
   let [datepart,timepart]=blocks[blocks.length-1][0].split('T');
   let base=new Date(`${datepart}T${timepart}:00-03:00`);
   while(blocks.length<10){
     base=new Date(base.getTime()-10*60000);
     let p=parts(base.getTime()), start=Math.floor(Number(p.minute)/10)*10;
     let k=`${p.year}-${p.month}-${p.day}T${p.hour}:${String(start).padStart(2,'0')}`;
     blocks.push([k,[]]);
   }
 }

 const grid=$('#grid');grid.innerHTML='';

 // Único cabeçalho estatístico: *0s, *1s, ... *9s.
 let statRow=document.createElement('div');statRow.className='column-stats';
 statRow.innerHTML='<div class="column-stats-label"><b>% BRANCO</b><span>POR COLUNA</span></div>';
 let statCols=document.createElement('div');statCols.className='column-stats-cols';
 for(let pos=0;pos<10;pos++){
   let st=posStats[pos],pct=st.total?st.white*100/st.total:0;
   let c=document.createElement('div');c.className='column-stat'+(pct?' hot':'');
   c.innerHTML=`<b>*${pos}s</b><strong>${pct.toFixed(1)}%</strong>`;
   statCols.appendChild(c)
 }
 statRow.appendChild(statCols);grid.appendChild(statRow);

 blocks.forEach(([key,brows])=>{
   let start=Number(key.slice(-2)), hour=key.slice(11,13), end=start+9;
   let row=document.createElement('div');row.className='catalog-row';
   let lab=document.createElement('div');lab.className='row-label';
   lab.innerHTML=`<b>${hour}:${String(start).padStart(2,'0')}</b><span>— ${hour}:${String(end).padStart(2,'0')}</span>`;
   row.appendChild(lab);

   let dec=document.createElement('div');dec.className='decade';
   for(let m=start;m<=end;m++){
     let cell=document.createElement('div');cell.className='minute';
     cell.innerHTML=`<div class="minute-head"><b>${String(m).padStart(2,'0')}</b></div><div class="minute-stones"></div>`;
     let box=cell.querySelector('.minute-stones');
     let rr=brows.filter(r=>Number(parts(r.ts).minute)===m).sort((a,b)=>a.ts-b.ts).slice(0,2);
     rr.forEach(r=>box.appendChild(mkStone(r)));
     for(let x=rr.length;x<2;x++){let e=document.createElement('div');e.className='empty';box.appendChild(e)}
     dec.appendChild(cell)
   }
   row.appendChild(dec);grid.appendChild(row)
 });
 $('#updated').textContent=fmt(Date.now());
}
async function load(){try{let r=await fetch('/api/rounds',{cache:'no-store'});if(!r.ok)throw Error();render(normalize(await r.json()))}catch(e){console.warn('Feed indisponível',e)}}
setInterval(()=>$('#clock').textContent=fmt(Date.now()),1000);load();setInterval(load,15000);