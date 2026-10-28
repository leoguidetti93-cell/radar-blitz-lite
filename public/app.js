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

const WFK='rb_white_flow_15m_v1';let WFB=[];
function wfs(t){let d=new Date(t);if(isNaN(d))return null;d.setSeconds(0,0);d.setMinutes(Math.floor(d.getMinutes()/15)*15);return d.getTime()}
function wft(t){return new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false})}
try{WFB=JSON.parse(localStorage.getItem(WFK)||'[]')}catch(e){WFB=[]}
function wfUpdate(rows){
 let m=new Map(WFB.map(x=>[x.t,x])),q=new Map;
 rows.forEach(r=>{let t=wfs(r.ts);if(t==null)return;if(!q.has(t))q.set(t,{t,count:0});if(+r.number===0)q.get(t).count++});
 q.forEach((v,k)=>m.set(k,v));let n=wfs(Date.now());if(n!=null&&!m.has(n))m.set(n,{t:n,count:0});
 let a=[...m.values()].sort((a,b)=>a.t-b.t),lo=Math.max(a[0]?.t||n,n-23*900000);
 for(let t=lo;t<=n;t+=900000)if(!m.has(t))m.set(t,{t,count:0});
 WFB=[...m.values()].sort((a,b)=>a.t-b.t).slice(-24);localStorage.setItem(WFK,JSON.stringify(WFB));wfDraw()
}
function wfDraw(){
 let c=document.getElementById('wfChart');if(!c||!WFB.length)return;let box=c.parentElement,D=devicePixelRatio||1,W=Math.max(720,box.clientWidth),H=165;
 c.width=W*D;c.height=H*D;c.style.width=W+'px';c.style.height=H+'px';let g=c.getContext('2d');g.setTransform(D,0,0,D,0,0);
 let d=WFB,p={l:38,r:16,t:18,b:38},pw=W-p.l-p.r,ph=H-p.t-p.b,M=Math.max(4,...d.map(v=>v.count));M=Math.ceil(M/2)*2;
 let X=i=>d.length<2?p.l+pw:p.l+pw*i/(d.length-1),Y=v=>p.t+ph-v/M*ph;
 g.font='10px system-ui';g.textAlign='right';g.textBaseline='middle';
 for(let i=0;i<5;i++){let y=p.t+ph*i/4,v=Math.round(M*(1-i/4));g.strokeStyle='rgba(148,163,184,.12)';g.beginPath();g.moveTo(p.l,y);g.lineTo(W-p.r,y);g.stroke();g.fillStyle='#788493';g.fillText(v,p.l-8,y)}
 let gr=g.createLinearGradient(0,p.t,0,p.t+ph);gr.addColorStop(0,'rgba(243,199,47,.38)');gr.addColorStop(1,'rgba(243,199,47,.02)');
 g.beginPath();d.forEach((v,i)=>i?g.lineTo(X(i),Y(v.count)):g.moveTo(X(i),Y(v.count)));g.lineTo(X(d.length-1),p.t+ph);g.lineTo(X(0),p.t+ph);g.closePath();g.fillStyle=gr;g.fill();
 g.beginPath();d.forEach((v,i)=>i?g.lineTo(X(i),Y(v.count)):g.moveTo(X(i),Y(v.count)));g.strokeStyle='#f3c72f';g.lineWidth=2.6;g.lineJoin='round';g.shadowColor='rgba(243,199,47,.5)';g.shadowBlur=10;g.stroke();g.shadowBlur=0;
 d.forEach((v,i)=>{g.beginPath();g.arc(X(i),Y(v.count),3,0,7);g.fillStyle='#ffd83d';g.fill()});
 g.textAlign='center';g.textBaseline='top';g.fillStyle='#788493';d.forEach((v,i)=>{if(i%4===0||i===d.length-1)g.fillText(wft(v.t),X(i),H-p.b+11)});
 c._wf={d,X};let r=document.getElementById('wfRange');if(r)r.textContent=wft(d[0].t)+' → '+wft(d.at(-1).t+14*60000)+' • '+d.length+'/24 PONTOS'
}
function wfTip(e){let c=document.getElementById('wfChart'),t=document.getElementById('wfTip');if(!c?._wf)return;let r=c.getBoundingClientRect(),mx=(e.touches?.[0]?.clientX??e.clientX)-r.left,b=0,z=1e9;c._wf.d.forEach((v,i)=>{let q=Math.abs(c._wf.X(i)-mx);if(q<z){z=q;b=i}});let v=c._wf.d[b];t.innerHTML='<b>'+wft(v.t)+'–'+wft(v.t+14*60000)+'</b><span>'+v.count+' branco'+(v.count===1?'':'s')+'</span>';t.style.left=Math.max(65,Math.min(r.width-65,c._wf.X(b)))+'px';t.classList.add('on')}
window.addEventListener('resize',wfDraw);document.addEventListener('mousemove',e=>{if(e.target?.id==='wfChart')wfTip(e)});
function render(rows){
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