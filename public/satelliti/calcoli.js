/* Satelliti sopra di te: Web Worker dei calcoli.
   Dati da /api/satelliti/* (il Worker di Cloudflare chiama N2YO, il browser mai).
   - "sopra" (above di N2YO): elenco e posizione di tutto ciò che è sopra l'orizzonte,
     aggiornato ogni 2 minuti; tra un aggiornamento e l'altro il moto è stimato dalle
     ultime due posizioni.
   - "tle": per stazioni, satellite selezionato e passaggi, posizioni calcolate dal vivo
     con satellite.js, senza consumare richieste. */
'use strict';
importScripts('satellite.min.js');
const S = self.satellite;
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const STATIONS = [25544, 48274];
const ABOVE_MS = 120000;

let obs = null, obsKey = '';                 // posizione precisa: resta qui, nel browser
let snap = null, prevSnap = null;            // {t, sats:[{id,name,intl,launch,lat,lng,alt}]}
const tle = new Map();                       // id -> {rec, name}
const tleAsked = new Set();
let selected = null, visible = true, timer = 0, lastAbove = 0;

/* ---------- categorie dal nome (N2YO con la categoria 0 non le restituisce) ---------- */
function categoria(s){
  const n = s.name.toUpperCase();
  if (STATIONS.includes(s.id)) return 'stazioni';
  if (/\bDEB\b|DEBRIS|COOLANT|\bFRAG/.test(n)) return 'detriti';
  if (/R\/B|ROCKET|\bAKM\b|\bPKM\b|BREEZE|FREGAT|CENTAUR|DELTA 2 R|CZ-|FALCON 9 /.test(n)) return 'razzi';
  if (/STARLINK/.test(n)) return 'starlink';
  if (/NAVSTAR|\bGPS\b|GALILEO|GSAT0\d|GLONASS|BEIDOU|\bIRNSS|QZS|NAVIC/.test(n)) return 'navigazione';
  if (/NOAA|METOP|METEOSAT|\bMSG\b|GOES|FENGYUN|\bFY-?\d|HIMAWARI|METEOR|ELEKTRO|DMSP|SUOMI|JPSS|INSAT-3D|GK-?2/.test(n)) return 'meteo';
  if (/LANDSAT|SENTINEL|\bTERRA\b|\bAQUA\b|\bSPOT\b|PLEIADES|WORLDVIEW|FLOCK|SKYSAT|RESURS|KOMPSAT|CARTOSAT|RADARSAT|ICEYE|SAOCOM|COSMO-SKYMED|\bCSG\b|GAOFEN|PRISMA|PROBA|CBERS|SWOT|ENVISAT/.test(n)) return 'osservazione';
  if (/^HST$|HUBBLE|SWIFT|FERMI|CHANDRA|XMM|INTEGRAL|NUSTAR|\bTESS\b|CALIPSO|CLOUDSAT|\bAGILE\b|\bIXPE\b/.test(n)) return 'scienza';
  return 'altri';
}

/* ---------- geometria ---------- */
const obsGd = () => ({latitude:obs.lat * RAD, longitude:obs.lon * RAD, height:0.1});
function ecfFromGeo(lat, lng, altKm){ return S.geodeticToEcf({latitude:lat * RAD, longitude:lng * RAD, height:altKm}); }
function lookEcf(ecf){ const la = S.ecfToLookAngles(obsGd(), ecf); return [la.azimuth * DEG, la.elevation * DEG, la.rangeSat]; }
function tleState(id, ms){
  const t = tle.get(id); if (!t) return null;
  const d = new Date(ms), pv = S.propagate(t.rec, d);
  if (!pv || !pv.position) return null;
  const gmst = S.gstime(d), ecf = S.eciToEcf(pv.position, gmst), geo = S.eciToGeodetic(pv.position, gmst);
  const [az, el, range] = lookEcf(ecf);
  return {az, el, range, alt:geo.height, speed:pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0, lat:S.degreesLat(geo.latitude), lng:S.degreesLong(geo.longitude)};
}

/* stima del moto tra due istantanee di "above": velocità costante in coordinate terrestri */
let model = [];   // [{id, name, cat, intl, launch, e0:[x,y,z], v:[vx,vy,vz]|null, t0}]
function buildModel(){
  const prev = new Map();
  if (prevSnap && snap.t - prevSnap.t < 4 * ABOVE_MS) for (const s of prevSnap.sats) prev.set(s.id, s);
  model = snap.sats.filter(s => isFinite(s.lat) && isFinite(s.lng) && isFinite(s.alt)).map(s => {
    const e0 = ecfFromGeo(s.lat, s.lng, s.alt), p = prev.get(s.id);
    let v = null;
    if (p) { const e1 = ecfFromGeo(p.lat, p.lng, p.alt), dt = (snap.t - prevSnap.t) / 1000; if (dt > 5) v = [(e0.x - e1.x) / dt, (e0.y - e1.y) / dt, (e0.z - e1.z) / dt]; }
    return {id:s.id, name:s.name, cat:categoria(s), intl:s.intl, launch:s.launch, alt:s.alt, e0, v, t0:snap.t};
  });
  self.postMessage({type:'catalog', ids:model.map(m => m.id), names:model.map(m => m.name), cats:model.map(m => m.cat), alts:model.map(m => m.alt), t:snap.t});
  for (const id of STATIONS) if (model.some(m => m.id === id)) needTle(id);
  findTrain();
}
function positions(ms){
  const out = new Float32Array(model.length * 3);
  for (let i = 0; i < model.length; i++) {
    const m = model[i];
    let az, el;
    const live = tle.has(m.id) ? tleState(m.id, ms) : null;
    if (live) { az = live.az; el = live.el; }
    else {
      /* oltre 3 minuti la stima lineare non è più affidabile: si resta all'ultima posizione stimata */
      const dt = Math.min(180, Math.max(0, (ms - m.t0) / 1000)), e = m.e0, v = m.v;
      if (!e) { az = 0; el = -90; } else [az, el] = lookEcf(v ? {x:e.x + v[0] * dt, y:e.y + v[1] * dt, z:e.z + v[2] * dt} : e);
    }
    out[i * 3] = i; out[i * 3 + 1] = az; out[i * 3 + 2] = el;
  }
  return out;
}

/* ---------- treni Starlink: lancio recente, tanti satelliti vicini in fila ---------- */
function findTrain(){
  const now = Date.now(), groups = new Map();
  model.forEach((m, i) => {
    if (m.cat !== 'starlink' || !/^\d{4}-\d{3}/.test(m.intl)) return;
    const age = (now - Date.parse(m.launch)) / 86400000;
    if (!(age >= 0 && age < 60)) return;
    const k = m.intl.slice(0, 8); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i);
  });
  let best = null;
  for (const [k, idx] of groups) {
    if (idx.length < 5) continue;
    const pos = positions(now), pts = idx.map(i => [pos[i * 3 + 1], pos[i * 3 + 2]]).filter(p => p[1] > 0);
    if (pts.length < 5) continue;
    if (!best || pts.length > best.count) best = {launch:k, date:model[idx[0]].launch, count:pts.length, idx};
  }
  self.postMessage({type:'train', train:best});
}

/* ---------- dati dal Worker di Cloudflare ---------- */
async function getJson(url){
  const r = await fetch(url);
  const body = await r.json().catch(() => null);
  return {ok:r.ok, status:r.status, body, cache:r.headers.get('X-Satelliti-Cache'), at:r.headers.get('X-Satelliti-Aggiornato')};
}
async function loadAbove(){
  if (!obs) return;
  lastAbove = Date.now();
  try {
    const r = await getJson(`/api/satelliti/sopra?lat=${obs.rlat}&lon=${obs.rlon}`);
    self.postMessage({type:'meta', what:'sopra', ok:r.ok, cache:r.cache, at:r.at, errore:r.body && r.body.errore});
    if (!r.ok || !r.body || !Array.isArray(r.body.sats)) return;
    if (snap && snap.t === r.body.t) return;
    prevSnap = snap && snap.key === obsKey ? snap : null; snap = Object.assign(r.body, {key:obsKey}); buildModel();
  } catch (e) { self.postMessage({type:'meta', what:'sopra', ok:false, errore:'Connessione assente: mostro gli ultimi dati.'}); }
}
async function needTle(id){
  if (tle.has(id) || tleAsked.has(id)) return;
  tleAsked.add(id);
  try {
    const r = await getJson(`/api/satelliti/tle?id=${id}`);
    if (r.ok && r.body && r.body.line1) { tle.set(id, {rec:S.twoline2satrec(r.body.line1, r.body.line2), name:r.body.name}); self.postMessage({type:'tle', id, at:r.at}); }
    else tleAsked.delete(id);
  } catch (e) { tleAsked.delete(id); }
}
/* Sole (posizione a bassa precisione) e ombra cilindrica della Terra */
function sunDir(ms){
  const n = ms / 86400000 + 2440587.5 - 2451545, L = (280.46 + 0.9856474 * n) * RAD, g = (357.528 + 0.9856003 * n) * RAD;
  const l = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.0000004 * n) * RAD;
  return [Math.cos(l), Math.cos(e) * Math.sin(l), Math.sin(e) * Math.sin(l)];
}
function inLight(id, ms){
  const pv = S.propagate(tle.get(id).rec, new Date(ms)); if (!pv || !pv.position) return false;
  const p = pv.position, s = sunDir(ms), d = p.x * s[0] + p.y * s[1] + p.z * s[2];
  return d > 0 || Math.hypot(p.x - d * s[0], p.y - d * s[1], p.z - d * s[2]) > 6378.137;
}
/* Passaggio: N2YO dice se è visibile e quanto è luminoso, ma inizio e fine sono sorgere e
   tramonto sull'orizzonte. Dal TLE ricaviamo il tratto davvero visibile: in luce e sopra 10 gradi
   (come Heavens-Above), con il punto più alto e la traiettoria. */
function refine(p){
  if (!tle.has(p.id)) return null;
  const pts = [];
  let a = null, b = null, best = null;
  for (let t = p.startUTC * 1000 - 60000; t <= p.endUTC * 1000 + 60000; t += 2000) {
    const s = tleState(p.id, t); if (!s) continue;
    if (s.el >= 10 && inLight(p.id, t)) { if (!a) a = {t, az:s.az, el:s.el}; b = {t, az:s.az, el:s.el}; if (!best || s.el > best.el) best = {t, az:s.az, el:s.el}; if (pts.length === 0 || t - pts.lastT >= 8000) { pts.push([+s.az.toFixed(1), +s.el.toFixed(1)]); pts.lastT = t; } }
    else if (a) break;
  }
  /* il TLE deve confermare N2YO: stesso punto più alto entro qualche grado, se in luce */
  const n2yoMax = tleState(p.id, p.maxUTC * 1000);
  if (!a || !n2yoMax || Math.abs(n2yoMax.el - p.maxEl) > 8) return null;
  pts.push([+b.az.toFixed(1), +b.el.toFixed(1)]);
  const r = x => ({t:Math.round(x.t), az:+x.az.toFixed(1), el:+x.el.toFixed(1)});
  return {start:r(a), max:r(best), end:r(b), track:pts, startShadow:a.el > 10.6, endShadow:b.el > 10.6};
}
/* traiettoria senza TLE: curva per inizio, massimo e fine di N2YO */
function arc(p){
  const unwrap = (a, b) => { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return a + d; };
  const a0 = p.startAz, a1 = unwrap(a0, p.maxAz), a2 = unwrap(a1, p.endAz), out = [];
  const lag = (y0, y1, y2, u) => y0 * (2 * u - 1) * (u - 1) + y1 * 4 * u * (1 - u) + y2 * u * (2 * u - 1);
  for (let k = 0; k <= 24; k++) { const u = k / 24; out.push([((lag(a0, a1, a2, u) % 360) + 360) % 360, Math.max(0, lag(p.startEl, p.maxEl, p.endEl, u))]); }
  return out;
}

function tick(){
  clearTimeout(timer);
  if (!obs) return;
  const now = Date.now();
  if (visible && now - lastAbove >= ABOVE_MS) loadAbove();
  /* finché non arriva l'elenco di N2YO (o se non risponde) mostra almeno le stazioni dai TLE */
  if (!snap) { STATIONS.forEach(needTle); const st = STATIONS.filter(id => tle.has(id)); if (st.length && model.length !== st.length) { model = st.map(id => ({id, name:tle.get(id).name, cat:'stazioni', intl:'', launch:'', alt:tleState(id, now) ? tleState(id, now).alt : 400, e0:null, v:null, t0:now})); self.postMessage({type:'catalog', ids:model.map(m => m.id), names:model.map(m => m.name), cats:model.map(m => m.cat), alts:model.map(m => m.alt), t:now, soloStazioni:true}); } }
  if (model.length) {
    const pos = positions(now);
    self.postMessage({type:'pos', t:now, pos}, [pos.buffer]);
    if (selected != null) detail(selected);
  }
  /* con molti oggetti si aggiorna meno spesso, per non affaticare il browser dell'auto */
  timer = setTimeout(tick, model.length > 3000 ? 3000 : model.length > 800 ? 2000 : 1000);
}
function detail(i){
  const m = model[i]; if (!m) return;
  const now = Date.now(), live = tleState(m.id, now);
  let info;
  if (live) {
    const track = [];
    for (let t = now; t < now + 15 * 60000; t += 15000) { const s = tleState(m.id, t); if (!s || s.el < 0) break; track.push([+s.az.toFixed(1), +s.el.toFixed(1)]); }
    info = {az:live.az, el:live.el, alt:live.alt, speed:live.speed, range:live.range, track, live:true};
  } else {
    const pos = positions(now);
    info = {az:pos[i * 3 + 1], el:pos[i * 3 + 2], alt:m.alt, speed:Math.sqrt(398600.4418 / (6378.137 + m.alt)), range:null, track:[], live:false};
  }
  self.postMessage(Object.assign({type:'detail', idx:i, id:m.id, name:m.name, cat:m.cat}, info));
}

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'observer') {
    obs = {lat:m.lat, lon:m.lon, rlat:(Math.round(m.lat * 10) / 10).toFixed(1), rlon:(Math.round(m.lon * 10) / 10).toFixed(1)};
    obsKey = obs.rlat + '/' + obs.rlon; selected = null; lastAbove = 0; tick();
  } else if (m.type === 'visible') { visible = m.visible; if (visible) tick(); }
  else if (m.type === 'select') { selected = m.idx; const mm = model[m.idx]; if (mm) { needTle(mm.id).then(() => detail(m.idx)); detail(m.idx); } }
  else if (m.type === 'unselect') selected = null;
  else if (m.type === 'tracks') { Promise.all(m.passes.map(p => needTle(p.id))).then(() => self.postMessage({type:'tracks', tracks:m.passes.map(p => { const r = refine(p); return r ? Object.assign({key:p.key}, r) : {key:p.key, track:arc(p)}; })})); }
};
