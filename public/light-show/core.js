/* ===== Core: no DOM. Channel map, frame rendering, .fseq I/O, vehicle simulation, beat analysis, auto choreography ===== */
const VAL = {on:255,on500:178,on1000:204,on2000:229,off500:25,off1000:51,off2000:76,open:63,dance:127,close:191,stop:255};
const RAMP_MS = {on500:500,on1000:1000,on2000:2000,off500:500,off1000:1000,off2000:2000};
const TYPES = {
  ramp:['on','on500','on1000','on2000','off500','off1000','off2000','strobe'],
  bool:['on','strobe'],
  closure:['open','dance','close','stop'],
  bar:['fill','sweepR','sweepL','center','sparkle'],
  rgb:['color','rainbow']
};
const TYPE_LABEL = {on:'Accendi',on500:'Accendi in 0,5 s',on1000:'Accendi in 1 s',on2000:'Accendi in 2 s',off500:'Spegni in 0,5 s',off1000:'Spegni in 1 s',off2000:'Spegni in 2 s',strobe:'Strobo',open:'Apri',dance:'Danza',close:'Chiudi',stop:'Stop',fill:'Pieno',sweepR:'Scorri a destra',sweepL:'Scorri a sinistra',center:'Dal centro',sparkle:'Scintille',color:'Colore',rainbow:'Arcobaleno'};
const TYPE_SHORT = {on:'On',on500:'0,5s',on1000:'1s',on2000:'2s',off500:'0,5s',off1000:'1s',off2000:'2s',strobe:'Strobo',open:'Apri',dance:'Danza',close:'Chiudi',stop:'Stop',fill:'Pieno',sweepR:'Scorri',sweepL:'Scorri',center:'Centro',sparkle:'Scintille',color:'Colore',rainbow:'Arcob.'};
const HOTKEY = {f:'on',e:'on500',d:'on1000',c:'on2000',w:'off500',s:'off1000',x:'off2000',b:'strobe',q:'open',a:'dance',z:'close'};

const rng = (a,n)=>Array.from({length:n},(_,i)=>a+i);
const R = (id,name,kind,ch,color,extra)=>Object.assign({id,name,kind,ch,color},extra||{});
const GROUPS = [
  {id:'g-front',name:'Luci anteriori',rows:[
    R('outer','Fascio esterno','ramp',[0,1],'front'),
    R('inner','Fascio interno','ramp',[2,3],'front'),
    R('sig','Luci firma','ramp',[4,5],'front'),
    R('ch4','Canale 4','ramp',[6,7],'front'),
    R('ch5','Canale 5','ramp',[8,9],'front'),
    R('ch6','Canale 6','ramp',[10,11],'front'),
    R('fturn','Indicatori ant.','ramp',[12,13],'turn'),
    R('ffog','Fendinebbia','bool',[14,15],'front'),
    R('aux','Aux park','bool',[16,17],'front'),
    R('smark','Marker laterali','bool',[18,19],'turn'),
    R('rep','Ripetitori laterali','bool',[20,21],'turn')]},
  {id:'g-rear',name:'Luci posteriori',rows:[
    R('rturn','Indicatori post.','bool',[22,23],'turn'),
    R('brake','Luci stop','bool',[24],'rear'),
    R('tail','Fanali','bool',[25,26],'rear'),
    R('rev','Retromarcia','bool',[27],'front'),
    R('rfog','Retronebbia','bool',[28],'rear'),
    R('plate','Luce targa','bool',[29],'front')]},
  {id:'g-clos',name:'Chiusure',rows:[
    R('mirror','Specchietti','closure',[34,35],'clos',{limit:20}),
    R('winF','Finestrini ant.','closure',[36,38],'clos',{limit:6,dance:true}),
    R('winR','Finestrini post.','closure',[37,39],'clos',{limit:6,dance:true}),
    R('lift','Portellone / frunk','closure',[40],'clos',{limit:6,dance:true}),
    R('charge','Sportello ricarica','closure',[45],'clos',{limit:3,dance:true}),
    R('handF','Maniglie ant. (S)','closure',[41,43],'clos',{limit:20}),
    R('handR','Maniglie post. (S)','closure',[42,44],'clos',{limit:20}),
    R('fdoor','Porte ant. (X)','closure',[32,33],'clos',{limit:6}),
    R('falcon','Porte Falcon (X)','closure',[30,31],'clos',{limit:6,dance:true})]},
  {id:'g-ct',name:'Cybertruck',rows:[
    R('fbar','Light bar ant.','bar',rng(46,60),'bar'),
    R('rbar','Light bar post.','bar',rng(110,52),'bar'),
    R('offroad','Barra offroad','bar',rng(166,6),'bar')]},
  {id:'g-int',name:'Interni RGB',rows:[
    R('disp','Display centrale','rgb',[175],'rgb'),
    R('amb','Luci ambiente','rgb',[178,181,184,187,190],'rgb')]}
];
const ROWMAP = {};
for (const g of GROUPS) for (const r of g.rows) {
  r.group = g.id; ROWMAP[r.id] = Object.assign({key:r.id}, r);
  if (r.ch.length === 2 && r.kind !== 'bar' && r.kind !== 'rgb') {
    ROWMAP[r.id+'.L'] = Object.assign({}, r, {key:r.id+'.L', ch:[r.ch[0]], sub:'L', parent:r.id});
    ROWMAP[r.id+'.R'] = Object.assign({}, r, {key:r.id+'.R', ch:[r.ch[1]], sub:'R', parent:r.id});
  }
}
const toolCat = kind => (kind==='ramp'||kind==='bool') ? 'light' : kind;
function compatType(kind, type){
  const list = TYPES[kind]; if (list.includes(type)) return type;
  if (kind==='bool') return type==='strobe' ? 'strobe' : 'on';
  return list[0];
}
/* closure meta, index k = channel - 30 */
const CL_META = [];
for (let c=30;c<46;c++){
  let m = {open:2000,close:2000,dance:false,window:false,startPos:0};
  if (c<=31) m = {open:20000,close:8000,dance:true};
  else if (c<=33) m = {open:22000,close:3000,dance:false};
  else if (c<=35) m = {open:2000,close:2000,dance:false,startPos:1};
  else if (c<=39) m = {open:4000,close:4000,dance:true,window:true};
  else if (c===40) m = {open:14000,close:4000,dance:true};
  else if (c<=44) m = {open:2000,close:2000,dance:false};
  else m = {open:2000,close:2000,dance:true,charge:true};
  m.startPos = m.startPos||0; CL_META.push(m);
}
const CL_LIMIT = [];
for (const r of GROUPS[2].rows) for (const c of r.ch) CL_LIMIT[c-30] = {limit:r.limit, name:r.name, row:r.id, side:r.ch.length>1?(c===r.ch[0]?'sx':'dx'):''};
const CH_KIND = []; for (const r of GROUPS[0].rows.concat(GROUPS[1].rows)) for (const c of r.ch) CH_KIND[c] = r.kind;

function needsExt(effects){ return effects.some(e=>{const r=ROWMAP[e.row]; return r && (r.kind==='bar'||r.kind==='rgb');}); }
function hexRgb(h){ h=(h||'#ffffff').replace('#',''); if(h.length===3) h=h.split('').map(x=>x+x).join(''); const n=parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
function hsv(hh,s,v){ hh=((hh%360)+360)%360/60; const i=Math.floor(hh), f=hh-i, p=v*(1-s), q=v*(1-s*f), t=v*(1-s*(1-f)); return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6]; }
function hash01(n){ n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n>>>0)/4294967296; }
const clamp01 = x => x<0?0:x>1?1:x;

function renderChannels(effects, dur, step, force200){
  const nch = (force200 || needsExt(effects)) ? 200 : 48;
  const frames = Math.max(1, Math.ceil(dur*1000/step - 1e-9));
  const buf = new Uint8Array(frames*nch);
  const list = effects.map((e,i)=>[e,i]).sort((a,b)=>a[0].start-b[0].start || a[1]-b[1]);
  for (const [e] of list){
    const r = ROWMAP[e.row]; if (!r) continue;
    let f0 = Math.round(e.start*1000/step), f1 = Math.round(e.end*1000/step);
    if (f1<=f0) f1 = f0+1; f0 = Math.max(0,f0); f1 = Math.min(frames,f1);
    if (f0>=frames || f1<=f0) continue;
    const n = f1-f0, p = e.p||{};
    if (r.kind==='bar'){
      if (nch<200) continue;
      const chs=r.ch, N=chs.length, from=(p.from??100)/100, to=(p.to??100)/100, wid=Math.max(1,(p.width??25)/100*N);
      for (let f=f0; f<f1; f++){
        const u=(f-f0+0.5)/n, b=from+(to-from)*u, o=f*nch;
        for (let i=0;i<N;i++){
          let v=0;
          if (e.type==='fill') v=b;
          else if (e.type==='sweepR'||e.type==='sweepL'){ const ii=e.type==='sweepR'?i:N-1-i; const pos=-wid+u*(N+wid); const d=pos-ii; v=(d>=0&&d<wid)?b*(1-d/wid*0.85):0; }
          else if (e.type==='center'){ const half=u*(N/2+1); v=Math.abs(i-(N-1)/2)<=half?b:0; }
          else if (e.type==='sparkle'){ v=hash01((Math.floor(f/3)*7919+i*131+N)|0)<(p.width??25)/100?b:0; }
          buf[o+chs[i]] = Math.round(clamp01(v)*255);
        }
      }
    } else if (r.kind==='rgb'){
      if (nch<200) continue;
      const c1=hexRgb(p.c1||'#ff3d7f'), c2=hexRgb(p.c2||p.c1||'#3d7fff'), br=(p.bright??100)/100;
      for (let f=f0; f<f1; f++){
        const u=(f-f0+0.5)/n, o=f*nch; let col;
        if (e.type==='rainbow'){ col=hsv(u*360*(p.cycles||1),1,255); } else col=[0,1,2].map(k=>c1[k]+(c2[k]-c1[k])*u);
        for (const b of r.ch){ buf[o+b]=Math.round(col[0]*br); buf[o+b+1]=Math.round(col[1]*br); buf[o+b+2]=Math.round(col[2]*br); }
      }
    } else if (e.type==='strobe'){
      const P=Math.max(2,Math.round((p.period||200)/step)), on=Math.max(1,Math.round(P/2));
      for (let f=f0; f<f1; f++){ const v=((f-f0)%P)<on?255:0; for (const c of r.ch) buf[f*nch+c]=v; }
    } else {
      const v = VAL[e.type] ?? 255;
      for (let f=f0; f<f1; f++) for (const c of r.ch) buf[f*nch+c]=v;
    }
  }
  /* Channel 4 sets the ramp time for channels 4-6: when ch4 is off and ch5/ch6 ramp, give ch4 the matching off-ramp */
  const offOf = v => v===178||v===25?25 : v===204||v===51?51 : v===229||v===76?76 : 0;
  for (let s=0;s<2;s++){
    const c4=6+s, c5=8+s, c6=10+s;
    for (let f=0; f<frames; f++){
      const o=f*nch; if (buf[o+c4]!==0) continue;
      const m = offOf(buf[o+c5]) || offOf(buf[o+c6]); if (m) buf[o+c4]=m;
    }
  }
  return {buf,nch,frames,step};
}

function buildFseq(render, producer, mediaName){
  const {buf,nch,frames,step} = render;
  const enc = s => Array.from(unescape(encodeURIComponent(s))).map(ch=>ch.charCodeAt(0));
  const vars = [];
  const addVar = (code, s) => { const d = enc(s).concat([0]); vars.push([code, d]); };
  if (mediaName) addVar('mf', mediaName);
  addVar('sp', producer||'Light Show Studio');
  let vlen = 0; for (const [,d] of vars) vlen += 4+d.length;
  const start = Math.ceil((32+vlen)/4)*4;
  const out = new Uint8Array(start + buf.length);
  const dv = new DataView(out.buffer);
  out.set([80,83,69,81],0); /* PSEQ */
  dv.setUint16(4,start,true); dv.setUint8(6,0); dv.setUint8(7,2);
  dv.setUint16(8,32,true); dv.setUint32(10,nch,true); dv.setUint32(14,frames,true);
  dv.setUint8(18,step); dv.setUint8(19,0); dv.setUint8(20,0); dv.setUint8(21,0); dv.setUint8(22,0); dv.setUint8(23,0);
  const id = BigInt(Date.now())*1000n; dv.setBigUint64(24,id,true);
  let o = 32;
  for (const [code,d] of vars){ dv.setUint16(o,4+d.length,true); out[o+2]=code.charCodeAt(0); out[o+3]=code.charCodeAt(1); out.set(d,o+4); o += 4+d.length; }
  out.set(buf, start);
  return out;
}

function parseFseq(ab){
  const dv = new DataView(ab);
  const magic = String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3));
  if (magic!=='PSEQ') throw new Error('Il file non è un .fseq versione 2.');
  const start=dv.getUint16(4,true), major=dv.getUint8(7), nch=dv.getUint32(10,true), frames=dv.getUint32(14,true), step=dv.getUint8(18), comp=dv.getUint8(20)&15;
  if (major!==2) throw new Error('Serve un .fseq versione 2 (V2 Uncompressed).');
  if (comp!==0) throw new Error('Il file è compresso: esportalo da xLights come "V2 Uncompressed".');
  if (start+nch*frames > ab.byteLength) throw new Error('Il file .fseq è incompleto.');
  return {nch,frames,step,data:new Uint8Array(ab,start,nch*frames)};
}

function classifyLight(v){ if (v>=240) return 'on'; if (v<38) return 'off500'; if (v<64) return 'off1000'; if (v<102) return 'off2000'; if (v<191) return 'on500'; if (v<216) return 'on1000'; return 'on2000'; }
function classifyClosure(v){ return v<96?'open':v<160?'dance':v<224?'close':'stop'; }

function fseqToEffects(p, uid){
  const {nch,frames,step,data} = p; const out=[], expanded={}; let extUsed=false;
  const seq = c => { const a=new Uint8Array(frames); for (let f=0;f<frames;f++) a[f]=data[f*nch+c]; return a; };
  const emit = (key, a, kind) => {
    let f=0;
    while (f<frames){
      const v=a[f]; if (!v){ f++; continue; }
      let g=f; while (g<frames && a[g]===v) g++;
      let type = kind==='closure' ? classifyClosure(v) : classifyLight(v);
      if (kind==='bool'){ if (v<=127){ f=g; continue; } type='on'; }
      out.push({id:uid(),row:key,start:+(f*step/1000).toFixed(3),end:+(g*step/1000).toFixed(3),type,p:{}});
      f=g;
    }
  };
  for (const g of GROUPS.slice(0,3)) for (const r of g.rows){
    if (r.ch.length===2){
      const a=seq(r.ch[0]), b=seq(r.ch[1]); let same=true;
      for (let f=0;f<frames;f++) if (a[f]!==b[f]){ same=false; break; }
      if (same) emit(r.id,a,r.kind); else { emit(r.id+'.L',a,r.kind); emit(r.id+'.R',b,r.kind); expanded[r.id]=true; }
    } else emit(r.id,seq(r.ch[0]),r.kind);
  }
  if (nch>48){ outer: for (let f=0;f<frames;f++) for (let c=46;c<nch;c++) if (data[f*nch+c]){ extUsed=true; break outer; } }
  return {effects:out, expanded, dur:frames*step/1000, step, extUsed};
}

/* Approximate what the car does with the commands: ramps, booleans, closure travel */
function simulate(render){
  const {buf,nch,frames,step} = render;
  const NL=30, NC=16;
  const I = new Float32Array(frames*NL), pos = new Float32Array(frames*NC), dancing = new Uint8Array(frames*NC);
  for (let c=0;c<NL;c++){
    const kind = CH_KIND[c]; let x=0;
    for (let f=0;f<frames;f++){
      const v = buf[f*nch+c];
      if (kind==='bool') x = v>127?1:0;
      else if (v===0) x=0; else if (v>=240) x=1;
      else { const t=classifyLight(v); const ms=RAMP_MS[t]; x += (t.startsWith('on')?1:-1)*step/ms; x = clamp01(x); }
      I[f*NL+c]=x;
    }
  }
  const cmds = new Array(NC).fill(0), danceFrames = new Array(NC).fill(0), danceNoOpen = [], chargeLong = [];
  for (let k=0;k<NC;k++){
    const c=30+k, m=CL_META[k]; let p=m.startPos, mode='idle', prev=0, ph=0, openSince=-1;
    for (let f=0;f<frames;f++){
      const v=buf[f*nch+c];
      const cmd = v===0 ? 'idle' : classifyClosure(v);
      if (v!==prev && (cmd==='open'||cmd==='close'||cmd==='dance')) cmds[k]++;
      if (v!==prev){
        if (cmd==='open') mode='opening'; else if (cmd==='close') mode='closing'; else if (cmd==='stop') mode='stopped';
        else if (cmd==='idle'){ if (mode==='dancing'||mode==='stopped') mode='idle'; }
      }
      if (cmd==='dance' && mode!=='dancing'){
        if (m.dance && (m.window || p>0.95)) { mode='dancing'; ph=0; }
        else if (v!==prev) danceNoOpen.push({k,t:f*step/1000,unsupported:!m.dance});
      }
      if (mode==='opening'){ p+=step/m.open; if (p>=1){ p=1; mode='idle'; } }
      else if (mode==='closing'){ p-=step/m.close; if (p<=0){ p=0; mode='idle'; } }
      else if (mode==='dancing'){
        danceFrames[k]++; ph += step/1000;
        const target = m.window ? 0.35+0.3*Math.sin(ph*Math.PI*2*0.6) : 0.72+0.28*Math.cos(ph*Math.PI*2*0.7);
        p += (target-p)*0.25;
      }
      if (m.charge){
        if (p>0.5){ if (openSince<0) openSince=f; else if ((f-openSince)*step>120000 && mode!=='closing'){ mode='closing'; chargeLong.push(f*step/1000); } }
        else openSince=-1;
      }
      pos[f*NC+k]=p; dancing[f*NC+k]=mode==='dancing'?1:0; prev=v;
    }
  }
  return {I,pos,dancing,NL,NC,cmds,danceFrames,danceNoOpen,chargeLong,frames,step};
}

/* ===== Beat analysis ===== */
function analyzeMono(x, sr){
  const hop = Math.max(1, Math.round(sr*0.01)), nf = Math.floor(x.length/hop);
  const a = Math.exp(-2*Math.PI*150/sr); let lp=0;
  const eb=new Float32Array(nf), ef=new Float32Array(nf), pmin=new Float32Array(nf), pmax=new Float32Array(nf), rms=new Float32Array(nf);
  for (let i=0;i<nf;i++){
    let sb=0, sf=0, mn=0, mx=0;
    for (let j=0;j<hop;j++){ const s=x[i*hop+j]; lp=(1-a)*s+a*lp; const h=s-lp; sb+=lp*lp; sf+=h*h; if (s<mn) mn=s; if (s>mx) mx=s; }
    eb[i]=Math.log(1e-4+sb/hop); ef[i]=Math.log(1e-4+sf/hop); pmin[i]=mn; pmax[i]=mx; rms[i]=Math.sqrt((sb+sf)/hop);
  }
  const raw = new Float32Array(nf), ob = new Float32Array(nf);
  for (let i=1;i<nf;i++){ const b=Math.max(0,eb[i]-eb[i-1]); ob[i]=b; raw[i]=b+0.5*Math.max(0,ef[i]-ef[i-1]); }
  const o = new Float32Array(nf); const W=25; let acc=0;
  const pre = new Float64Array(nf+1); for (let i=0;i<nf;i++) pre[i+1]=pre[i]+raw[i];
  for (let i=0;i<nf;i++){ const lo=Math.max(0,i-W), hi=Math.min(nf,i+W+1); acc=(pre[hi]-pre[lo])/(hi-lo); o[i]=Math.max(0,raw[i]-acc); }
  const res = {hopSec:hop/sr, pmin, pmax, bpm:0, beats:[], downPhase:0, energy:[]};
  if (nf < 400) return res;
  const ac = new Float64Array(220);
  for (let L=25; L<=210; L++){ let s=0; for (let i=0;i+L<nf;i++) s+=o[i]*o[i+L]; ac[L]=s; }
  let best=50, bs=-1;
  for (let L=30; L<=100; L++){ const w=Math.exp(-0.5*Math.pow(Math.log2(L/50)/0.75,2)); const s=(ac[L]+0.5*(ac[2*L]||0))*w; if (s>bs){ bs=s; best=L; } }
  let P = best; const y0=ac[best-1], y1=ac[best], y2=ac[best+1], den=y0-2*y1+y2; if (den<0) P = best + 0.5*(y0-y2)/den;
  let bo=0, bsum=-1;
  for (let off=0; off<P; off++){ let s=0; for (let t=off; t<nf; t+=P) s+=o[Math.round(t)]||0; if (s>bsum){ bsum=s; bo=off; } }
  const bf = [];
  let t = bo;
  while (t < nf-1){
    const r=Math.round(t); let bi=r, bv=o[r]||0;
    for (let d=-4; d<=4; d++){ const v=o[r+d]||0; if (v>bv*1.15){ bv=v; bi=r+d; } }
    bf.push(bi); t = (0.7*t+0.3*bi) + P;
  }
  let dp=0, dpv=-1;
  for (let p=0;p<4;p++){ let s=0; for (let i=p;i<bf.length;i+=4){ const r=bf[i]; s+=(ob[r]||0)+(ob[r+1]||0)+(ob[r-1]||0); } if (s>dpv){ dpv=s; dp=p; } }
  const en = bf.map((r,i)=>{ const e=bf[i+1]??Math.min(nf,r+Math.round(P)); let s=0; for (let k=r;k<e;k++) s+=rms[k]; return s/Math.max(1,e-r); });
  const sorted = en.slice().sort((a,b)=>a-b); const lo=sorted[Math.floor(sorted.length*0.1)]||0, hi=sorted[Math.floor(sorted.length*0.95)]||1;
  res.energy = en.map(v=>clamp01((v-lo)/Math.max(1e-6,hi-lo)));
  res.beats = bf.map(r=>r*hop/sr); res.downPhase=dp; res.bpm = 60*sr/(P*hop);
  return res;
}

/* ===== Automatic choreography ===== */
const DEFAULT_GEN = ['outer','inner','sig','ch4','ch5','ch6','fturn','ffog','aux','smark','rep','rturn','brake','tail','rev','rfog','plate','mirror','winF','winR','charge'];
const LIGHT_ROWS = ['outer','inner','sig','ch4','ch5','ch6','fturn','ffog','aux','smark','rep','rturn','brake','tail','rev','rfog','plate'];
function generateShow(an, dur, opts, uid){
  const out=[]; opts=opts||{};
  const allow = new Set(opts.rows || DEFAULT_GEN), has = id => allow.has(id);
  let beats = (an && an.beats ? an.beats : []).filter(t=>t<dur-0.05), energy = an && an.energy ? an.energy.slice() : [];
  let dp = an ? an.downPhase||0 : 0;
  if (beats.length<8){ beats=[]; energy=[]; dp=0; for (let t=0.5;t<dur;t+=0.5){ beats.push(t); energy.push(0.6); } }
  const diffs = beats.slice(1).map((t,i)=>t-beats[i]).sort((a,b)=>a-b); const bl = diffs[Math.floor(diffs.length/2)]||0.5;
  const bt = i => i<beats.length ? beats[i] : Math.min(dur, beats[beats.length-1]+(i-beats.length+1)*bl);
  const r3 = v => Math.round(v*1000)/1000;
  const add = (row,a,b,type,p) => {
    const base=row.split('.')[0]; if (!has(base)) return;
    const kind=ROWMAP[base].kind;
    if (kind==='bool' && type!=='on' && type!=='strobe'){ if (type.startsWith('on')) type='on'; else return; }
    a=Math.max(0,a); b=Math.min(dur,b); if (b-a>=0.03) out.push({id:uid(),row,start:r3(a),end:r3(b),type,p:p||{}});
  };
  const th = ({equilibrato:[.33,.66],energico:[.18,.45],elegante:[.55,.85]})[opts.style||'equilibrato'];
  const PL = 16, phrases=[];
  for (let s=dp; s<beats.length; s+=PL){ const e=Math.min(s+PL,beats.length); let m=0; for (let i=s;i<e;i++) m+=energy[i]??0.5; phrases.push({s,e,en:m/Math.max(1,e-s)}); }
  const firstLights = LIGHT_ROWS.filter(has);
  if (dp>0){ const r=firstLights.find(x=>['aux','tail','sig','plate'].includes(x))||firstLights[0]; if (r) for (let j=0;j<dp;j++) add(r,bt(j),bt(j)+(bt(j+1)-bt(j))/2,'on'); }
  if (bt(dp)>1.5){ const r=['sig','inner','outer','ch4'].find(has); if (r) add(r,0,bt(dp),'on2000'); }

  phrases.forEach((P,pi)=>{
    const s=P.s, t0=bt(s), t1=bt(P.e), n=P.e-s, alt=pi%2;
    const lvl = P.en<th[0]?0:P.en<th[1]?1:2;
    const used=new Set();
    const take=(list,k)=>{ const r=list.filter(id=>has(id)&&!used.has(id)).slice(0,k); r.forEach(x=>used.add(x)); return r; };
    const beat = j => [bt(s+j), bt(s+j+1)];
    if (lvl===0){
      const fades=take(['sig','inner','ch4','outer','fturn'],2);
      if (fades[0]){ add(fades[0],t0,bt(s+8),'on2000'); add(fades[0],bt(s+8),t1,'off2000'); }
      if (fades[1]){ add(fades[1],bt(s+4),bt(s+8),'on1000'); add(fades[1],bt(s+8),bt(s+12),'off1000'); }
      const steady=take(['tail','aux','plate'],2); steady.forEach(r=>add(r,t0,t1,'on'));
      if (!fades.length && !steady.length){ take(LIGHT_ROWS,2).forEach((r,i)=>{ for (let j=i*4;j<n;j+=8) add(r,bt(s+j),bt(s+j+4),'on'); }); }
      if (alt) take(['ffog','rfog'],1).forEach(r=>add(r,bt(s+12),t1,'on'));
    } else if (lvl===1){
      take(['sig','tail','aux','plate'],2).forEach(r=>add(r,t0,t1,'on'));
      const accent=take(['outer','inner','ffog'],1)[0];
      const brake=take(['brake'],1)[0];
      let lr = alt ? [] : take(['fturn','rturn','rep','smark'],2);
      let chase = lr.length ? [] : take(['ch4','ch5','ch6'],3);
      if (!lr.length && chase.length<2) chase = chase.concat(take(LIGHT_ROWS, 3-chase.length));
      for (let j=0;j<n;j++){
        const [a,b]=beat(j), h=(b-a)/2;
        if (lr.length){ const sd=j%2?'R':'L'; lr.forEach(r=>add(r+'.'+sd,a,a+h,'on')); }
        else if (chase.length) add(chase[j%chase.length],a,a+h,'on');
        if (accent && j%4===0) add(accent,a,a+h,'on');
        if (brake && j%8===4) add(brake,a,b,'on');
      }
    } else {
      take(['tail'],1).forEach(r=>add(r,t0,t1,'on'));
      let main=take(['outer','inner','sig','aux','ffog','fturn','rturn','rev','plate','rfog','rep','smark'],2);
      const off=take(['ffog','rfog','rev','aux','plate'],1)[0];
      const down=take(['fturn','rturn','smark'],2);
      const str=take(['rep','smark','aux'],1)[0];
      const brake=take(['brake'],1)[0];
      const extra=take(['ch5','ch4','ch6'],1)[0];
      for (let j=0;j<n;j++){
        const [a,b]=beat(j), h=(b-a)/2;
        if (main.length) add(main[j%main.length],a,a+h,'on');
        if (off) add(off,a+h,b,'on');
        if (j%4===0) down.forEach(r=>add(r,a,b,'on'));
        if (str && j%4===3) add(str,a,b,'strobe',{period:Math.max(160,Math.round((b-a)*1000/4))});
        if (brake && j%2===0) add(brake,a,a+h,'on');
        if (extra && j%4===2) add(extra,a,a+h,'on');
      }
    }
  });

  /* every ticked light must appear: give the unused ones syncopated off-beat accents */
  const lvlOf = P => P.en<th[0]?0:P.en<th[1]?1:2;
  const usedRows = new Set(out.map(e=>e.row.split('.')[0]));
  const lively = phrases.some(P=>lvlOf(P)>0);
  LIGHT_ROWS.filter(id=>has(id) && !usedRows.has(id)).forEach((r,k)=>{
    phrases.forEach(P=>{ if (lively && lvlOf(P)===0) return;
      for (let j=(k*2+1)%4; j<P.e-P.s; j+=4){ const a=bt(P.s+j), b=bt(P.s+j+1); add(r, a+(b-a)/2, b, 'on'); } });
  });

  /* closures */
  const strongest = (minT0, maxT0, excl) => phrases.map((P,i)=>({i,en:P.en,t0:bt(P.s),len:bt(P.e)-bt(P.s)}))
    .filter(x=>x.len>=6 && x.t0>=minT0 && x.t0<=maxT0 && !(excl||[]).includes(x.i)).sort((a,b)=>b.en-a.en);
  const doorBusy=[]; const busy=(a,b)=>doorBusy.some(([x,y])=>a<y && b>x);
  const usedPh=[];
  if (has('falcon') && dur>50){
    const pk=strongest(22, dur-22)[0];
    add('falcon',0,1,'open'); doorBusy.push([0,21]);
    if (pk){ const de=Math.min(bt(phrases[pk.i].e), pk.t0+10); add('falcon',pk.t0,de,'dance'); doorBusy.push([pk.t0,de+1]); usedPh.push(pk.i); }
    add('falcon',dur-9.5,dur-8.5,'close'); doorBusy.push([dur-9.5,dur]);
  }
  if (has('fdoor') && dur>40){ add('fdoor',0,1,'open'); doorBusy.push([0,23]); add('fdoor',dur-4,dur-3,'close'); doorBusy.push([dur-4,dur]); }
  if (has('winF') || has('winR')){
    const openT = busy(0,5) ? 23.5 : 0;
    const c = strongest(openT+5, dur-8, usedPh).filter(x=>!busy(x.t0-1, x.t0+13)).slice(0,2);
    if (c.length && openT < dur-10){
      add('winF',openT,openT+1,'open'); add('winR',openT,openT+1,'open');
      for (const x of c){ const P=phrases[x.i], t0=x.t0, dEnd=Math.min(bt(P.s+8), t0+10, bt(P.e)), off=bt(P.s+2)-t0;
        add('winF',t0,dEnd,'dance'); add('winR',t0+off,dEnd+off,'dance');
        add('winF',dEnd+0.3,dEnd+1.3,'open'); add('winR',dEnd+off+0.3,dEnd+off+1.3,'open'); }
    }
  }
  if (has('charge')){
    const pk=strongest(0, dur-8)[0];
    if (pk){ const P=phrases[pk.i], t1=bt(P.e); add('charge',pk.t0,pk.t0+1,'open'); add('charge',pk.t0+2.6,Math.min(t1-0.5,pk.t0+2.6+20),'dance'); add('charge',t1,t1+1,'close'); }
  }
  if (has('lift')){
    const pk=strongest(15, dur-16)[0];
    if (pk){ const P=phrases[pk.i], de=Math.min(bt(P.e), pk.t0+10); add('lift',pk.t0-15,pk.t0-14,'open'); add('lift',pk.t0,de,'dance'); add('lift',de+0.5,de+1.5,'close'); }
  }
  if (has('mirror')){
    let closed=false, cmds=0;
    phrases.forEach((P,pi)=>{ if (pi%2===1 && cmds<16){ add('mirror',bt(P.s),bt(P.s)+1,closed?'open':'close'); closed=!closed; cmds++; } });
    if (closed){ const lp=phrases[phrases.length-1]; add('mirror',Math.min(dur-1.2,bt(lp.e)-0.1),Math.min(dur-0.2,bt(lp.e)+0.9),'open'); }
  }
  if (has('handF') || has('handR')){
    let pairs=0;
    phrases.forEach((P,pi)=>{ const lvl = P.en<th[0]?0:P.en<th[1]?1:2; if (lvl<1 || pairs>=9 || bt(P.e)-bt(P.s)<6) return;
      const a=bt(P.s), m=bt(P.s+8), d=bl;
      add('handF',a,a+1,'open'); add('handR',a+d,a+d+1,'open'); add('handF',m,m+1,'close'); add('handR',m+d,m+d+1,'close'); pairs++; });
  }

  /* Cybertruck light bars and interior RGB */
  const pal = opts.palette || ['#ff2e63','#08d9d6','#ffb238','#7a5cff','#3dff8b','#ff7ad9'];
  phrases.forEach((P,pi)=>{
    const s=P.s, t0=bt(s), t1=bt(P.e), n=P.e-s; const lvl = P.en<th[0]?0:P.en<th[1]?1:2;
    if (lvl===0){ for (const bar of ['fbar','rbar']){ add(bar,t0,bt(s+8),'fill',{from:0,to:100}); add(bar,bt(s+8),t1,'fill',{from:100,to:0}); } }
    else if (lvl===1){ for (let j=0;j<n;j+=2){ const a=bt(s+j), b=bt(s+j+2); add('fbar',a,b,j%4?'sweepL':'sweepR',{from:100,to:100,width:30}); add('rbar',a,b,j%4?'sweepR':'sweepL',{from:100,to:100,width:30}); } }
    else { for (let j=0;j<n;j++){ const a=bt(s+j), b=bt(s+j+1); const ty=j%4===0?'center':'sparkle'; add('fbar',a,b,ty,{from:100,to:60,width:35}); add('rbar',a,b,ty,{from:100,to:60,width:35}); if (j%4===0) add('offroad',a,(a+b)/2,'fill',{from:100,to:100}); } }
    if (lvl===2){ add('amb',t0,t1,'rainbow',{cycles:2}); add('disp',t0,t1,'rainbow',{cycles:2}); }
    else { add('amb',t0,t1,'color',{c1:pal[pi%pal.length],c2:pal[(pi+1)%pal.length]}); add('disp',t0,t1,'color',{c1:pal[pi%pal.length],c2:pal[(pi+1)%pal.length],bright:60}); }
  });

  const lb = beats[beats.length-1];
  if (dur-lb > 0.8){
    let fin=['outer','inner','sig'].filter(has); if (!fin.length) fin=firstLights.slice(0,2);
    for (const r of fin){ add(r,lb,lb+bl,'on'); add(r,lb+bl,Math.min(dur,lb+bl+2.1),'off2000'); }
  }
  return out;
}

function encodeWav(chs, sr){
  const nc=chs.length, n=chs[0].length, ab=new ArrayBuffer(44+n*nc*2), dv=new DataView(ab);
  const ws=(o,s)=>{ for (let i=0;i<s.length;i++) dv.setUint8(o+i,s.charCodeAt(i)); };
  ws(0,'RIFF'); dv.setUint32(4,36+n*nc*2,true); ws(8,'WAVE'); ws(12,'fmt '); dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,nc,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*nc*2,true); dv.setUint16(32,nc*2,true); dv.setUint16(34,16,true); ws(36,'data'); dv.setUint32(40,n*nc*2,true);
  let o=44;
  for (let i=0;i<n;i++) for (let c=0;c<nc;c++){ const s=Math.max(-1,Math.min(1,chs[c][i])); dv.setInt16(o, s<0?s*0x8000:s*0x7fff, true); o+=2; }
  return new Uint8Array(ab);
}
