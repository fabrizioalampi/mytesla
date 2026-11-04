/* ===== Modalità guidata: nessun DOM. Profili auto, analisi della batteria, sezioni, generatore per una o più auto.
   Usa da core.js: analyzeMono, ROWMAP, renderChannels, simulate, CL_LIMIT. ===== */

/* Quali canali usa ogni auto. Le luci che una singola auto non ha restano spente: il file è lo stesso per tutte. */
const CARS = {
  m3:  {name:'Model 3', years:'2017–2023', body:'sedan', style:'classic',
        rows:['outer','inner','sig','fturn','ffog','rep','rturn','brake','tail','rev','rfog','plate','mirror','winF','winR','charge']},
  m3h: {name:'Model 3 Highland', years:'2024 in poi', body:'sedan', style:'slim',
        rows:['outer','inner','sig','ch4','ch5','ch6','fturn','rep','rturn','brake','tail','rev','rfog','plate','mirror','winF','winR','lift','charge']},
  my:  {name:'Model Y', years:'2020–2024', body:'suv', style:'classic',
        rows:['outer','inner','sig','fturn','ffog','rep','rturn','brake','tail','rev','rfog','plate','mirror','winF','winR','lift','charge']},
  myj: {name:'Model Y Juniper', years:'2025 in poi', body:'suv', style:'bar',
        rows:['outer','inner','sig','ch4','ch5','ch6','fturn','rep','rturn','brake','tail','rev','rfog','plate','mirror','winF','winR','lift','charge']},
  ms:  {name:'Model S', years:'2021 in poi', body:'sedan', style:'slim',
        rows:['outer','inner','sig','ch4','ch5','ch6','fturn','ffog','aux','smark','rep','rturn','brake','tail','rev','rfog','plate','mirror','winF','winR','lift','charge','handF','handR']},
  mx:  {name:'Model X', years:'2021 in poi', body:'suv', style:'slim',
        rows:['outer','inner','sig','ch4','ch5','ch6','fturn','ffog','aux','smark','rep','rturn','brake','tail','rev','rfog','plate','mirror','winF','winR','lift','charge','falcon']},
  ct:  {name:'Cybertruck', years:'2024 in poi', body:'truck', style:'bar',
        rows:['outer','inner','sig','fturn','rep','rturn','brake','tail','rev','plate','mirror','winF','winR','charge','fbar','rbar','offroad']}
};
const CAR_ORDER = ['m3','m3h','my','myj','ms','mx','ct'];

/* Interruttori dell'utente -> righe */
const PARTS = [
  {id:'beams',  name:'Fari',                 rows:['outer','inner','sig','ch4','ch5','ch6','ffog','aux']},
  {id:'turns',  name:'Frecce e laterali',    rows:['fturn','rturn','rep','smark']},
  {id:'rear',   name:'Luci posteriori',      rows:['brake','tail','rev','rfog','plate']},
  {id:'bars',   name:'Light bar',            rows:['fbar','rbar','offroad'], only:['ct']},
  {id:'windows',name:'Finestrini',           rows:['winF','winR']},
  {id:'trunk',  name:'Portellone',           rows:['lift']},
  {id:'mirrors',name:'Specchietti',          rows:['mirror']},
  {id:'charge', name:'Sportello di ricarica',rows:['charge']},
  {id:'doors',  name:'Porte e maniglie',     rows:['falcon','handF','handR']}
];
function partsFor(carId){ const c=CARS[carId]; return PARTS.filter(p=>p.rows.some(r=>c.rows.includes(r)) && (!p.only||p.only.includes(carId))); }

/* ---------- filtri semplici a un polo ---------- */
function lowpass(x, sr, fc){ const a=Math.exp(-2*Math.PI*fc/sr), y=new Float32Array(x.length); let s=0; for (let i=0;i<x.length;i++){ s=(1-a)*x[i]+a*s; y[i]=s; } return y; }
function bandEnv(x, hop){ const nf=Math.floor(x.length/hop), e=new Float32Array(nf); for (let i=0;i<nf;i++){ let s=0; const o=i*hop; for (let j=0;j<hop;j++){ const v=x[o+j]; s+=v*v; } e[i]=Math.log(1e-6+s/hop); } return e; }
function pickPeaks(env, hopSec, minGap, k){
  const n=env.length, fl=new Float32Array(n);
  for (let i=2;i<n;i++) fl[i]=Math.max(0, env[i]-Math.max(env[i-1],env[i-2]));
  const W=Math.round(0.6/hopSec), pre=new Float64Array(n+1), pre2=new Float64Array(n+1);
  for (let i=0;i<n;i++){ pre[i+1]=pre[i]+fl[i]; pre2[i+1]=pre2[i]+fl[i]*fl[i]; }
  const sorted=Array.from(fl).filter(v=>v>0).sort((a,b)=>a-b); const p95=sorted[Math.floor(sorted.length*0.95)]||1;
  const out=[]; const gap=Math.round(minGap/hopSec); let last=-1e9;
  for (let i=3;i<n-3;i++){
    const v=fl[i]; if (v<=0) continue;
    if (v<fl[i-1]||v<fl[i-2]||v<fl[i+1]||v<fl[i+2]) continue;
    const lo=Math.max(0,i-W), hi=Math.min(n,i+W+1), m=(pre[hi]-pre[lo])/(hi-lo), sd=Math.sqrt(Math.max(0,(pre2[hi]-pre2[lo])/(hi-lo)-m*m));
    if (v < m+k*sd || v < p95*0.18) continue;
    if (i-last < gap){ if (out.length && v>out[out.length-1].v){ out[out.length-1]={i,v}; last=i; } continue; }
    out.push({i,v}); last=i;
  }
  return out.map(o=>({t:o.i*hopSec, s:Math.min(1,o.v/p95)}));
}

/* ---------- analisi completa del brano ---------- */
function analyzeSong(mono, sr){
  const base = analyzeMono(mono, sr);
  const hop = Math.max(1, Math.round(sr*0.01)), hopSec=hop/sr;
  const low = lowpass(lowpass(mono,sr,110),sr,110);
  const lpHi = lowpass(mono,sr,2600), lpLo = lowpass(mono,sr,220);
  const mid = new Float32Array(mono.length); for (let i=0;i<mono.length;i++) mid[i]=lpHi[i]-lpLo[i];
  const l7 = lowpass(mono,sr,6500); const hp1=new Float32Array(mono.length); for (let i=0;i<mono.length;i++) hp1[i]=mono[i]-l7[i];
  const l7b = lowpass(hp1,sr,6500); const hi=new Float32Array(mono.length); for (let i=0;i<mono.length;i++) hi[i]=hp1[i]-l7b[i];
  const kick = pickPeaks(bandEnv(low,hop), hopSec, 0.13, 1.1);
  let snare = pickPeaks(bandEnv(mid,hop), hopSec, 0.13, 1.4);
  let hat = pickPeaks(bandEnv(hi,hop), hopSec, 0.07, 0.9);
  /* il rullante suona anche sulla cassa: tienilo solo se nella banda media è chiaramente più forte */
  const near = (list, t, d) => list.find(h=>Math.abs(h.t-t)<d);
  snare = snare.filter(s=>{ const k=near(kick,s.t,0.035); return !k || s.s>k.s*1.25; });
  hat = hat.filter(h=>!near(snare,h.t,0.03));
  return finishAnalysis(base, {kick,snare,hat}, mono.length/sr);
}

/* griglia in sedicesimi, sezioni, build-up e drop */
function finishAnalysis(base, hits, dur){
  let beats = (base.beats||[]).filter(t=>t<dur-0.05), energy=(base.energy||[]).slice(0,beats.length), dp=base.downPhase||0;
  if (beats.length<8){ beats=[]; energy=[]; dp=0; for (let t=0.5;t<dur;t+=0.5){ beats.push(t); energy.push(0.6); } if (!hits.kick.length) hits.kick=beats.map(t=>({t,s:0.8})); }
  const diffs=beats.slice(1).map((t,i)=>t-beats[i]).sort((a,b)=>a-b); const bl=diffs[Math.floor(diffs.length/2)]||0.5;
  const bt = i => i<0 ? Math.max(0, beats[0]+i*bl) : i<beats.length ? beats[i] : beats[beats.length-1]+(i-beats.length+1)*bl;
  const six=[]; for (let i=0;i<beats.length;i++){ const a=bt(i), b=bt(i+1); for (let k=0;k<4;k++) six.push(a+(b-a)*k/4); }
  const snapHit = h => { let lo=0, hi=six.length-1; while (hi-lo>1){ const m=(lo+hi)>>1; if (six[m]<h.t) lo=m; else hi=m; }
    const j = Math.abs(six[lo]-h.t)<Math.abs(six[hi]-h.t)?lo:hi; const d=Math.abs(six[j]-h.t);
    return d<0.05 ? {t:six[j], s:h.s, slot:j} : {t:h.t, s:h.s, slot:-1}; };
  const dedupe = list => { const seen=new Set(); return list.map(snapHit).filter(h=>{ if (h.slot<0) return true; if (seen.has(h.slot)) return false; seen.add(h.slot); return true; }); };
  const H = {kick:dedupe(hits.kick), snare:dedupe(hits.snare), hat:dedupe(hits.hat)};
  /* battute da 4 */
  const bars=[]; if (dp>0) bars.push({b0:0, t0:0, t1:bt(dp), en:energy.slice(0,dp).reduce((a,b)=>a+b,0)/dp, pickup:true});
  for (let s=dp; s<beats.length; s+=4){ const e=Math.min(s+4,beats.length); let m=0; for (let i=s;i<e;i++) m+=energy[i]??0.5; bars.push({b0:s, t0:bt(s), t1:bt(s+4), en:m/Math.max(1,e-s)}); }
  if (bars.length) bars[0].t0=0;
  /* livello: mediana su 3 battute per non saltare di continuo */
  const en=bars.map(b=>b.en);
  bars.forEach((b,i)=>{ const w=[en[i-1],en[i],en[i+1]].filter(v=>v!=null).sort((a,b)=>a-b); const m=w[Math.floor(w.length/2)]; b.lvl = m<0.33?0:m<0.62?1:2; });
  /* drop: salto netto di energia verso un tratto forte, almeno 8 battute dal precedente */
  const drops=[]; let lastDrop=-99;
  for (let i=2;i<bars.length;i++){
    const prev=(en[i-1]+en[i-2])/2;
    if (bars[i].lvl===2 && en[i]-prev>0.25 && i-lastDrop>=8){ drops.push(i); lastDrop=i; }
  }
  /* il drop parte sulla cassa vera, anche se la griglia dei beat è un po' sfasata */
  for (const i of drops){ let best=null; for (const h of H.kick) if (Math.abs(h.t-bars[i].t0)<0.2 && H.kick.some(k=>Math.abs(k.t-h.t-bl)<0.06) && (!best || Math.abs(h.t-bars[i].t0)<Math.abs(best.t-bars[i].t0))) best=h;
    if (best){ bars[i].t0=best.t; if (bars[i-1]) bars[i-1].t1=best.t; } }
  /* build-up: fino a 4 battute prima di un drop, purché non si sovrappongano al drop precedente */
  let prevEnd=0; const builds=[];
  for (const d of drops){ const s=Math.max(prevEnd, d-4); if (d-s>=2){ builds.push({from:s, to:d}); for (let i=s;i<d;i++) bars[i].build=true; } bars[d].drop=true; prevEnd=d+1; }
  /* densità consigliata */
  const bpm=base.bpm||60/bl; const hatRate=H.hat.length/Math.max(1,dur);
  let sug = bpm>=150?2 : bpm>=124?3 : bpm>=92?4 : 3; if (hatRate>5.5) sug--; sug=Math.max(2,Math.min(5,sug));
  return Object.assign({}, base, {beats, energy, downPhase:dp, bl, bpm, six, hits:H, bars, drops, builds, suggested:sug, dur});
}

/* ---------- generatore ---------- */
/* o: {car, parts:Set di id interruttori, density 1..5, carIdx, nCars, uid} */
function autoShow(A, dur, o){
  const car=CARS[o.car]||CARS.my, on=new Set();
  for (const p of PARTS) if (o.parts.has(p.id)) for (const r of p.rows) if (car.rows.includes(r)) on.add(r);
  const has = id => on.has(id);
  const N=Math.max(1,o.nCars||1), ci=o.carIdx||0, d=o.density||3, bl=A.bl;
  const out=[], r3=v=>Math.round(v*1000)/1000;
  const add=(row,a,b,type,p)=>{
    const base=row.split('.')[0]; if (!has(base)) return;
    const kind=ROWMAP[base].kind;
    if (kind==='bool' && type!=='on' && type!=='strobe'){ if (type.startsWith('on')) type='on'; else return; }
    a=Math.max(0,a); b=Math.min(dur,b); if (b-a>=0.04) out.push({id:o.uid(),row,start:r3(a),end:r3(b),type,p:p||{}});
  };
  const flashLen = gap => Math.max(0.06, Math.min(0.18, gap*0.6));
  const ramp = (len, up) => (len>=2.1?'2000':len>=1.1?'1000':'500').replace(/^/, up?'on':'off');
  const bars=A.bars; if (!bars.length) return out;
  const barOf = t => { let lo=0, hi=bars.length-1; while (lo<hi){ const m=(lo+hi+1)>>1; if (bars[m].t0<=t) lo=m; else hi=m-1; } return lo; };
  const mine = k => N===1 || (k%N)===ci;           /* per i rincorsi tra auto */
  const dropT = new Set(A.drops.map(i=>r3(bars[i].t0)));
  /* Prima del primo beat: dissolvenza delle luci firma */
  const firstT = bars[0].pickup ? bars[1]?.t0 : A.beats[0];
  if (firstT>1.2){ for (const r of ['sig','tail']) { add(r,0,firstT,'on2000'); } }

  /* Base per ogni battuta */
  bars.forEach((B,bi)=>{
    if (B.pickup) return;
    const t0=B.t0, t1=Math.min(dur,B.t1), len=t1-t0;
    if (B.build){
      /* rincorsa che accelera, buio sull'ultimo quarto prima del drop */
      const bb=A.builds.find(x=>bi>=x.from && bi<x.to), total=bars[bb.to].t0-bars[bb.from].t0, startB=bars[bb.from].t0, endB=bars[bb.to].t0;
      if (bi===bb.from){
        const blackout = endB - bl*0.5;
        let t=startB, k=0;
        while (t < blackout-0.05){
          const u=(t-startB)/total, step = u<0.5?bl : u<0.75?bl/2 : bl/4;
          const all = u>=0.75 || N===1;
          if (all || mine(k)){ const L=flashLen(step); for (const r of ['sig','tail']) add(r,t,t+L,'on'); if (u>=0.5) for (const r of ['fturn','rturn']) add(r,t,t+L,'on'); if (u>=0.75 && d>=4) add('brake',t,t+L,'on'); }
          if (u>=0.6) { const w=Math.round(100*(u-0.6)/0.4); add('fbar',t,t+step*0.9,'center',{from:30+w*0.7,to:30+w*0.7}); add('rbar',t,t+step*0.9,'center',{from:30+w*0.7,to:30+w*0.7}); }
          t+=step; k++;
        }
      }
      return;
    }
    if (B.lvl===0){
      /* respiro lento: firma e fanali in controfase, con l'onda che passa da un'auto all'altra */
      const half=len/2, sh = N>1 ? (ci/N)*half : 0;
      const a=t0+sh, m=a+half;
      add('sig',a,Math.min(t1,m),ramp(half,true)); if (m<t1) add('sig',m,t1,ramp(half,false));
      add('tail',t0,t0+half,ramp(half,false)); add('tail',t0+half,t1,ramp(half,true));
      if (d>=3 && bi%2===1) add('ffog',t0,t1,ramp(len,true));
    } else {
      add('sig',t0,t1,'on'); add('tail',t0,t1,'on');
      if (B.lvl===2 && d>=3) add('aux',t0,t1,'on');
    }
  });

  /* Colpi di batteria */
  const pass = (h, kind) => {
    const bi=barOf(h.t), B=bars[bi]; if (!B || B.build || B.pickup) return false;
    if (B.drop && h.t < B.t0+bl*0.98) return false;                 /* il primo beat del drop è un lampo unico */
    const pos = h.slot>=0 ? h.slot%4 : 0, beatInBar = h.slot>=0 ? Math.floor(h.slot/4 - B.b0) : 0;
    if (kind==='kick'){ if (B.lvl===0) return d>=4 && pos===0 && h.s>0.4; return d>=2 || (pos===0 && beatInBar%2===0); }
    if (kind==='snare'){ if (B.lvl===0) return false; return B.lvl===2 ? d>=2 : d>=3; }
    if (kind==='hat'){ if (B.lvl===0 || h.s<0.25) return false; const eighth = h.slot<0 || h.slot%2===0; return B.lvl===2 ? (d>=5 || (d>=3 && eighth)) : (d>=4 && eighth); }
    return false;
  };
  const gapNext = (list, i) => (list[i+1]?.t ?? dur) - list[i].t;
  const K=A.hits.kick, S=A.hits.snare, Hh=A.hits.hat;
  K.forEach((h,i)=>{ if (!pass(h,'kick')) return; const B=bars[barOf(h.t)], L=flashLen(gapNext(K,i));
    add('outer',h.t,h.t+L,'on'); if (B.lvl===2){ add('inner',h.t,h.t+L,'on'); if (d>=3) add('brake',h.t,h.t+L,'on'); add('fbar',h.t,h.t+L,'fill',{from:100,to:100}); add('rbar',h.t,h.t+L,'fill',{from:100,to:100}); }
    else if (B.lvl===0) add('inner',h.t,h.t+L,'on'); });
  S.forEach((h,i)=>{ if (!pass(h,'snare')) return; const B=bars[barOf(h.t)], L=flashLen(gapNext(S,i));
    add('fturn',h.t,h.t+L,'on'); add('rturn',h.t,h.t+L,'on'); if (B.lvl===2){ add('ffog',h.t,h.t+L,'on'); add('rfog',h.t,h.t+L,'on'); } });
  let hk=0; const chase=['ch4','ch5','ch6'].filter(has);
  Hh.forEach((h,i)=>{ if (!pass(h,'hat')) return; const L=flashLen(gapNext(Hh,i)), k=hk++;
    if (N>1){ if (!mine(k)) return; for (const r of ['rep','smark']) add(r,h.t,h.t+L,'on'); }
    else { const sd=k%2?'R':'L'; for (const r of ['rep','smark']) add(r+'.'+sd,h.t,h.t+L,'on'); }
    if (chase.length) add(chase[k%chase.length],h.t,h.t+L,'on');
    add(k%2?'fbar':'rbar',h.t,h.t+Math.max(L,0.2),k%4<2?'sweepR':'sweepL',{from:100,to:100,width:30});
  });
  /* Primo beat del drop: tutto acceso. Retromarcia e targa sul primo beat di ogni battuta forte */
  for (const di of A.drops){ const t=bars[di].t0, e=Math.min(dur,t+bl);
    for (const r of ['outer','inner','sig','ch4','ch5','ch6','fturn','ffog','aux','smark','rep','rturn','brake','tail','rev','rfog','plate']) add(r,t,e,'on');
    add('fbar',t,e,'fill',{from:100,to:100}); add('rbar',t,e,'fill',{from:100,to:100}); add('offroad',t,e,'fill',{from:100,to:100}); }
  if (d>=2) bars.forEach(B=>{ if (B.lvl===2 && !B.build && !B.drop && !B.pickup){ const e=Math.min(B.t1,B.t0+bl*0.5); add('rev',B.t0,e,'on'); add('plate',B.t0,e,'on'); } });
  /* Finale */
  const lastT = bars[bars.length-1].t1;
  { const t=Math.min(lastT, dur-0.5); for (const r of ['outer','inner','sig']) { add(r,Math.max(0,t-bl),t,'on'); add(r,t,Math.min(dur,t+2.1),'off2000'); } }

  /* ---------- Chiusure, entro i limiti di Tesla ---------- */
  const rank = A.drops.slice().sort((a,b)=>bars[b].en-bars[a].en);
  const strong = () => rank.length ? rank : bars.map((b,i)=>i).filter(i=>bars[i].lvl===2 && !bars[i].pickup).sort((a,b)=>bars[b].en-bars[a].en);
  const spanFrom = (bi, maxS) => { let e=bi; while (e+1<bars.length && bars[e+1].lvl>=1 && !bars[e+1].build && bars[e+1].t0-bars[bi].t0<maxS) e++; return Math.min(bars[e].t1, bars[bi].t0+maxS); };
  if (has('winF')||has('winR')){
    const picks=strong().slice(0,2).sort((a,b)=>a-b);
    for (const bi of picks){ const t=bars[bi].t0, e=spanFrom(bi,10); if (e-t<3) continue;
      add('winF',t,e,'dance'); add('winR',t+bl/2,e+bl/2,'dance'); add('winF',e+0.3,e+1.3,'close'); add('winR',e+bl/2+0.3,e+bl/2+1.3,'close'); }
  }
  if (has('lift')){
    const bi=strong().find(i=>bars[i].t0>=15.5 && bars[i].t0<dur-12);
    if (bi!=null){ const t=bars[bi].t0, e=spanFrom(bi,10); add('lift',t-15,t-14,'open'); add('lift',t,e,'dance'); add('lift',e+0.5,e+1.5,'close'); }
  }
  if (has('mirror')){
    let cmds=0, closed=false, lastM=-9;
    const tog=t=>{ if (cmds>=18 || t-lastM<2.6) return; add('mirror',t,t+1,closed?'open':'close'); closed=!closed; cmds++; lastM=t; };
    if (A.builds.length){ for (const b of A.builds){ tog(bars[b.from].t0 + (N>1? ci*0.15 : 0)); tog(bars[b.to].t0); } }
    else bars.forEach((B,i)=>{ if (i>0 && B.lvl!==bars[i-1].lvl) tog(B.t0); });
    if (closed){ const t=Math.min(dur-1.2, lastT); add('mirror',t,t+1,'open'); }
  }
  if (has('charge')){
    /* tratto calmo più lungo (almeno 8 s), altrimenti il drop più forte */
    let best=null; for (let i=0;i<bars.length;){ if (bars[i].lvl===0 && !bars[i].build){ let j=i; while (j+1<bars.length && bars[j+1].lvl===0 && !bars[j+1].build) j++; const a=bars[i].t0, b=bars[j].t1; if (b-a>=8 && (!best || b-a>best[1]-best[0])) best=[a,b]; i=j+1; } else i++; }
    if (!best){ const bi=strong()[0]; if (bi!=null) best=[bars[bi].t0, spanFrom(bi,20)]; }
    if (best){ const [a,b]=best, e=Math.min(b, a+100); if (e-a>4){ add('charge',a,a+1,'open'); add('charge',a+2.6,e-1,'dance'); add('charge',e-0.8,e+0.2,'close'); } }
  }
  if (has('falcon') && dur>50){
    const bi=strong().find(i=>bars[i].t0>=22 && bars[i].t0<dur-22);
    add('falcon',0,1,'open'); if (bi!=null) add('falcon',bars[bi].t0,spanFrom(bi,10),'dance'); add('falcon',dur-9.5,dur-8.5,'close');
  }
  if (has('handF')||has('handR')){
    let n=0; for (const bi of A.drops){ if (n>=9) break; const t=bars[bi].t0, e=Math.min(dur-1, t+bl*8); add('handF',t,t+1,'open'); add('handR',t+bl,t+bl+1,'open'); add('handF',e,e+1,'close'); add('handR',e+bl,e+bl+1,'close'); n++; }
  }
  return out;
}

/* Comandi alle chiusure oltre il limite di Tesla, per auto */
function closureIssues(sim){
  const list=[];
  for (let k=0;k<sim.NC;k++){ const L=CL_LIMIT[k]; if (L && sim.cmds[k]>L.limit) list.push(`${L.name}${L.side?' '+L.side:''}: ${sim.cmds[k]} comandi su ${L.limit}`); }
  return list;
}
