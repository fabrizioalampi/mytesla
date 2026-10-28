/* In viaggio: struttura dell'app, home e "Quanto manca?".
   Gli altri moduli (giochi.js, suoni.js, diario.js) usano l'oggetto IV definito qui. */
'use strict';
const IV = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) e.append(c);
    return e;
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = (inner, vb) => { const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', vb || '0 0 64 64'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = inner; return s; };
  const store = {
    get(k, d){ try { const v = localStorage.getItem('in-viaggio:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v){ try { localStorage.setItem('in-viaggio:' + k, JSON.stringify(v)); } catch (e) {} },
    del(k){ try { localStorage.removeItem('in-viaggio:' + k); } catch (e) {} }
  };
  function toast(msg, ms){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms || 3200); }
  const hm = t => new Date(t).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const findCity = name => CITTA.find(c => norm(c.nome) === norm(name));
  function km(a, b){ const R = 6371, r = Math.PI / 180, dla = (b.lat - a.lat) * r, dlo = (b.lon - a.lon) * r; const x = Math.sin(dla / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
  function nearestCity(p){ let best = null; for (const c of CITTA) { const d = km(p, c); if (!best || d < best.d) best = {c, d}; } return best; }
  /* maxAge: quanto può essere vecchia la posizione (0 = sempre quella del momento) */
  function position(maxAge){
    return new Promise((res, rej) => {
      if (!('geolocation' in navigator)) return rej(new Error('assente'));
      navigator.geolocation.getCurrentPosition(p => res({lat:+p.coords.latitude.toFixed(4), lon:+p.coords.longitude.toFixed(4)}), e => rej(e), {enableHighAccuracy:false, timeout:12000, maximumAge:maxAge == null ? 120000 : maxAge});
    });
  }

  /* ---------- giocatori, condivisi da tutti i giochi ---------- */
  const COLORI = [['Rosso', 'var(--p1)'], ['Verde acqua', 'var(--p2)'], ['Arancio', 'var(--p3)'], ['Blu', 'var(--p4)']];
  let players = store.get('giocatori', null) || [{nome:'Giocatore 1'}, {nome:'Giocatore 2'}];
  const playerColor = i => COLORI[i % 4][1];

  /* ---------- navigazione ---------- */
  const views = {};
  function route(){
    const name = (location.hash.replace(/^#\/?/, '') || 'home').split('/')[0];
    const v = $$('.view').some(x => x.dataset.view === name) ? name : 'home';
    $$('.view').forEach(x => { x.hidden = x.dataset.view !== v; });
    $('#homeBtn').hidden = v === 'home';
    document.title = v === 'home' ? 'In viaggio' : `${{'quanto-manca':'Quanto manca?', giochi:'Giochi', suoni:'Suoni', diario:'Diario dei viaggi'}[v]} · In viaggio`;
    window.scrollTo(0, 0);
    if (views[v]) views[v]();
  }
  window.addEventListener('hashchange', route);
  $('#homeBtn').onclick = () => { location.hash = '#/'; };

  return {$, $$, el, svg, store, toast, hm, shuffle, norm, findCity, km, nearestCity, position, players:() => players,
    setPlayers(p){ players = p; store.set('giocatori', p); }, playerColor, COLORI, views, route};
})();

/* ================= QUANTO MANCA? ================= */
(() => {
  const {$, $$, el, svg, store, toast, hm, findCity, km, position} = IV;
  const MIN = 60000;
  let trip = store.get('viaggio', null);   // {start, arrival, pausedAt, from, to, stops:[{nome, t?}], shown:[]}
  const now = () => Date.now();

  /* tempo percorso: dalla partenza, escluse le pause (durante una pausa l'arrivo slitta) */
  function state(t){
    const T = t || now(), paused = trip.pausedAt != null;
    const arrival = paused ? trip.arrival + (T - trip.pausedAt) : trip.arrival;
    const total = arrival - trip.start - (trip.pausedTotal || 0) - (paused ? T - trip.pausedAt : 0);
    const done = T - trip.start - (trip.pausedTotal || 0) - (paused ? T - trip.pausedAt : 0);
    const frac = Math.max(0, Math.min(1, total > 0 ? done / (total) : 1));
    return {arrival, left:Math.max(0, arrival - T), frac, paused};
  }
  const fmtLeft = ms => { const m = Math.ceil(ms / MIN); if (m <= 0) return 'Arrivati!'; const h = Math.floor(m / 60), mm = m % 60; return h ? `${h} h ${String(mm).padStart(2, '0')} min` : `${mm} min`; };
  const MILESTONES = [
    {id:'quarto', test:s => s.frac >= 0.25, msg:'Un quarto di strada!'},
    {id:'meta', test:s => s.frac >= 0.5, msg:'Metà strada!'},
    {id:'tre-quarti', test:s => s.frac >= 0.75, msg:'Tre quarti di strada, bravi!'},
    {id:'dieci', test:s => s.left <= 10 * MIN, msg:'Ultimi 10 minuti'},
    {id:'quasi', test:s => s.left <= 3 * MIN, msg:'Ci siamo quasi!'},
    {id:'arrivati', test:s => s.left <= 0, msg:'Siamo arrivati!'}
  ];

  /* ---------- strada disegnata ---------- */
  const ROAD = 'M40 190 C 200 190, 220 80, 380 90 S 600 210, 720 170 S 880 70, 960 80';
  function drawRoad(box, s, t, mini){
    const stops = (t.stops || []).filter(x => x.nome);
    box.innerHTML = `
      <rect x="0" y="0" width="1000" height="260" fill="var(--sky)"/>
      <path d="M0 210 C 250 170, 500 250, 1000 190 L1000 260 L0 260 Z" fill="var(--grass)"/>
      <circle cx="900" cy="44" r="${mini ? 0 : 26}" fill="var(--ic-1)" opacity=".85"/>
      <path class="road-bg" d="${ROAD}" fill="none" stroke="var(--road)" stroke-width="${mini ? 34 : 40}" stroke-linecap="round"/>
      <path d="${ROAD}" fill="none" stroke="var(--paper)" stroke-width="3" stroke-dasharray="14 16" stroke-linecap="round"/>
      <path class="road-done" d="${ROAD}" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" opacity=".55"/>`;
    const path = box.querySelector('.road-bg'), L = path.getTotalLength();
    const done = box.querySelector('.road-done'); done.setAttribute('stroke-dasharray', `${L * s.frac} ${L}`);
    const pt = f => path.getPointAtLength(L * f);
    // partenza e arrivo
    const a = pt(0), b = pt(1);
    box.insertAdjacentHTML('beforeend', `<circle cx="${a.x}" cy="${a.y}" r="12" fill="var(--paper)" stroke="var(--ink)" stroke-width="4"/>
      <g transform="translate(${b.x} ${b.y - 56})"><path d="M0 56V0" stroke="var(--ink)" stroke-width="4"/><path d="M0 2h34l-8 10 8 10H0z" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/></g>`);
    if (!mini) {
      const label = (x, y, txt, anchor) => { const tEl = document.createElementNS('http://www.w3.org/2000/svg', 'text'); tEl.setAttribute('x', x); tEl.setAttribute('y', y); tEl.setAttribute('text-anchor', anchor); tEl.setAttribute('font-size', '22'); tEl.setAttribute('font-weight', '800'); tEl.setAttribute('fill', 'var(--ink)'); tEl.textContent = txt; box.appendChild(tEl); };
      if (t.from) label(a.x, a.y + 44, t.from, 'start');
      if (t.to) label(b.x, b.y + 40, t.to, 'end');
      // tappe: all'orario indicato, oppure distribuite lungo la strada
      stops.forEach((st, i) => {
        let f = (i + 1) / (stops.length + 1);
        if (st.t) { const tot = t.arrival - t.start; if (tot > 0) f = Math.max(0.05, Math.min(0.95, (st.t - t.start) / tot)); }
        const p = pt(f), passed = s.frac >= f;
        box.insertAdjacentHTML('beforeend', `<g transform="translate(${p.x} ${p.y})"><circle r="14" fill="${passed ? 'var(--ic-5)' : 'var(--ic-1)'}" stroke="var(--ink)" stroke-width="3"/>${passed ? '<path d="M-6 0l4 5 8-9" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>' : ''}</g>`);
        label(p.x, p.y - 26, st.nome + (st.t ? ` (${hm(st.t)})` : ''), 'middle');
      });
    }
    // l'auto: si sposta piano con una transizione lunga
    const c = pt(s.frac), c2 = pt(Math.min(1, s.frac + 0.01)), ang = Math.atan2(c2.y - c.y, c2.x - c.x) * 180 / Math.PI;
    const car = document.createElementNS('http://www.w3.org/2000/svg', 'g'); car.setAttribute('class', 'car');
    car.innerHTML = `<g transform="rotate(${ang.toFixed(1)})"><rect x="-30" y="-30" width="60" height="26" rx="10" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="3.5"/><path d="M-18 -30l6-12h22l8 12" fill="var(--ic-4)" stroke="var(--ink)" stroke-width="3.5" stroke-linejoin="round"/><circle cx="-16" cy="-4" r="8" fill="var(--ink)"/><circle cx="16" cy="-4" r="8" fill="var(--ink)"/><circle cx="-16" cy="-4" r="3" fill="var(--ic-6)"/><circle cx="16" cy="-4" r="3" fill="var(--ic-6)"/></g>`;
    car.style.transform = `translate(${c.x}px, ${c.y}px)`;
    box.appendChild(car);
  }

  /* ---------- impostazione ---------- */
  let mode = 'arrivo';
  $$('#tripSetup .seg-btn').forEach(b => b.onclick = () => { mode = b.dataset.mode; $$('#tripSetup .seg-btn').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#modeArrivo').hidden = mode !== 'arrivo'; $('#modeDurata').hidden = mode !== 'durata'; });
  function addStopRow(v){
    const row = el('div', {class:'stop-row'},
      el('label', {class:'field'}, el('span', {text:'Tappa'}), el('input', {type:'text', maxlength:'30', placeholder:'Per esempio: pranzo all\'autogrill', value:v ? v.nome : ''})),
      el('label', {class:'field big'}, el('span', {text:'Alle (facoltativo)'}), el('input', {type:'time'})),
      el('button', {class:'btn', type:'button', 'aria-label':'Togli la tappa', text:'✕', onclick:e => e.currentTarget.parentElement.remove()}));
    $('#stopsSetup').append(row);
  }
  $('#addStop').onclick = () => { if ($('#stopsSetup').children.length < 5) addStopRow(); else toast('Bastano 5 tappe.'); };
  function timeToday(v, after){
    const [h, m] = v.split(':').map(Number); const d = new Date(after); d.setHours(h, m, 0, 0);
    if (d.getTime() <= after) d.setDate(d.getDate() + 1);   // orario già passato: è domani
    return d.getTime();
  }
  $('#startTrip').onclick = () => {
    const t0 = now(), msg = $('#setupMsg'); let arrival;
    if (mode === 'arrivo') { if (!$('#arrIn').value) { msg.hidden = false; msg.textContent = 'Scrivi a che ora arriviamo, come lo vedi sul navigatore.'; return; } arrival = timeToday($('#arrIn').value, t0); }
    else { const h = Math.max(0, +$('#durH').value || 0), m = Math.max(0, +$('#durM').value || 0); if (h * 60 + m < 1) { msg.hidden = false; msg.textContent = 'Il viaggio deve durare almeno un minuto.'; return; } arrival = t0 + (h * 60 + m) * MIN; }
    if (arrival - t0 > 48 * 60 * MIN) { msg.hidden = false; msg.textContent = 'Il viaggio può durare al massimo 48 ore.'; return; }
    msg.hidden = true;
    const stops = $$('#stopsSetup .stop-row').map(r => { const [n, tm] = r.querySelectorAll('input'); const s = {nome:n.value.trim()}; if (tm.value) { const tt = timeToday(tm.value, t0); if (tt < arrival) s.t = tt; } return s; }).filter(s => s.nome);
    trip = {start:t0, arrival, pausedAt:null, pausedTotal:0, from:$('#fromIn').value.trim(), to:$('#toIn').value.trim(), stops, shown:[]};
    save(); show();
  };
  const save = () => store.set('viaggio', trip);

  /* ---------- viaggio in corso ---------- */
  let timer = 0, lastFrac = -1;
  function show(){
    clearInterval(timer);
    $('#tripSetup').hidden = !!trip; $('#tripView').hidden = !trip;
    if (!trip) { if (!$('#stopsSetup').children.length) addStopRow(); return; }
    $('#tripRoute').textContent = trip.from || trip.to ? `${trip.from || 'Partenza'} → ${trip.to || 'Arrivo'}` : 'Il nostro viaggio';
    $('#kmBtn').hidden = !(trip.to && findCity(trip.to));
    update(true); timer = setInterval(update, 10000);
  }
  function update(force){
    if (!trip || $('#tripView').hidden) return;
    const s = state();
    $('#tripLeft').textContent = s.paused ? 'In pausa' : fmtLeft(s.left);
    $('#tripEta').textContent = s.paused ? `Riprendiamo quando volete. Arrivo previsto alle ${hm(s.arrival)}` : s.left > 0 ? `Arrivo previsto alle ${hm(s.arrival)}` : `Arrivati alle ${hm(s.arrival)}`;
    $('#pauseBtn').textContent = s.paused ? 'Riprendi' : 'Pausa';
    if (force || Math.abs(s.frac - lastFrac) > 0.0005) { drawRoad($('#road'), s, trip, false); lastFrac = s.frac; }
    // traguardi: ognuno una volta sola, con una dissolvenza lenta
    const m = [...MILESTONES].reverse().find(x => x.test(s));
    if (m && !s.paused && !trip.shown.includes(m.id)) { trip.shown = MILESTONES.filter(x => x.test(s)).map(x => x.id); save(); celebrate(m.msg); }
  }
  function celebrate(msg){ const b = $('#milestone'); b.textContent = msg; b.classList.add('on'); clearTimeout(celebrate.t); celebrate.t = setTimeout(() => b.classList.remove('on'), 20000); }
  function adjust(min){
    trip.arrival += min * MIN;
    const s = state(); if (s.left <= 0 && min < 0) trip.arrival = now() + MIN;
    // se l'arrivo si allontana, i traguardi del tempo che manca possono tornare
    trip.shown = trip.shown.filter(id => MILESTONES.find(x => x.id === id).test(state()));
    save(); update(true); IV.toast(`Arrivo previsto alle ${hm(state().arrival)}`);
  }
  $('#plus5').onclick = () => adjust(5); $('#minus5').onclick = () => adjust(-5);
  $('#pauseBtn').onclick = () => {
    if (trip.pausedAt == null) { trip.pausedAt = now(); toast('Pausa: il conto alla rovescia si ferma. Buona sosta!'); }
    else { const d = now() - trip.pausedAt; trip.arrival += d; trip.pausedTotal = (trip.pausedTotal || 0) + d; trip.pausedAt = null; toast(`Si riparte! Arrivo previsto alle ${hm(trip.arrival)}`); }
    save(); update(true);
  };
  $('#endTrip').onclick = () => { $('#endConfirm').hidden = false; };
  $('#endNo').onclick = () => { $('#endConfirm').hidden = true; };
  $('#endYes').onclick = () => { trip = null; IV.store.del('viaggio'); $('#endConfirm').hidden = true; $('#milestone').classList.remove('on'); show(); toast('Viaggio chiuso. Alla prossima!'); };
  $('#kmBtn').onclick = async () => {
    const dest = findCity(trip.to), out = $('#tripKm'); out.hidden = false; out.textContent = 'Chiedo la posizione al browser…';
    try { const p = await position(); out.textContent = `Mancano circa ${Math.round(km(p, dest)).toLocaleString('it-IT')} km in linea d'aria fino a ${dest.nome} (su strada sono di più).`; }
    catch (e) { out.textContent = 'Il browser non dà la posizione: nessun problema, il conto alla rovescia funziona lo stesso.'; }
  };
  IV.views['quanto-manca'] = show;

  /* ---------- esempio nella home (non salvato) ---------- */
  function homeDemo(){
    const box = $('#homeDemo'); if (!box) return;
    if (trip) {
      const s = state(); box.textContent = '';
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); r.setAttribute('class', 'road-mini'); r.setAttribute('viewBox', '0 0 1000 260'); r.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      box.append(r, IV.el('span', {text:s.paused ? 'Viaggio in pausa' : `Mancano ${fmtLeft(s.left)}, arrivo alle ${hm(s.arrival)}`}));
      drawRoad(r, s, trip, true); return;
    }
    const t0 = new Date(); t0.setSeconds(0, 0);
    const demo = {start:t0.getTime() - 110 * MIN, arrival:t0.getTime() + 95 * MIN, pausedAt:null, pausedTotal:0, from:'Milano', to:'Roma', stops:[], shown:[]};
    const keep = trip; trip = demo; const s = state(); trip = keep;
    box.textContent = '';
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); r.setAttribute('class', 'road-mini'); r.setAttribute('viewBox', '0 0 1000 260'); r.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    box.append(r, IV.el('span', {}, IV.el('span', {class:'tag', text:'Esempio'}), `Milano → Roma: mancano ${fmtLeft(s.left)}`), IV.el('small', {text:'Tocca per impostare il vostro viaggio'}));
    drawRoad(r, s, demo, true);
  }
  IV.views.home = homeDemo;
  IV.tripState = () => trip ? state() : null;
})();

/* ================= AVVIO, OFFLINE, DIAGNOSTICA ================= */
(() => {
  const {$} = IV;
  const dl = $('#cityList'); for (const c of CITTA) { const o = document.createElement('option'); o.value = c.nome; dl.appendChild(o); }
  const net = () => { $('#offline').hidden = navigator.onLine; };
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
  /* service worker: tiene in cache i file dell'app per l'uso senza rete (solo /in-viaggio/) */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/in-viaggio/sw.js', {scope:'/in-viaggio/'}).catch(() => {});
  /* cosa supporta questo browser: utile da aprire una volta in auto */
  const safety = $('.safety');
  const btn = IV.el('button', {class:'btn ghost', type:'button', text:'Cosa supporta questo browser?'});
  const out = IV.el('p', {class:'hint', hidden:true});
  btn.onclick = async () => {
    const voices = 'speechSynthesis' in window ? (speechSynthesis.getVoices() || []) : [];
    const it = voices.filter(v => /^it/i.test(v.lang)).length;
    let sw = 'no'; if ('serviceWorker' in navigator) { const r = await navigator.serviceWorker.getRegistration('/in-viaggio/'); sw = r && r.active ? 'sì, attivo' : 'sì'; }
    out.hidden = false;
    out.textContent = `Uso senza rete (service worker): ${sw}. Voce del browser: ${'speechSynthesis' in window ? `${voices.length} voci, ${it} in italiano` : 'no'}. Posizione: ${'geolocation' in navigator ? 'sì, se la concedi' : 'no'}. Suoni (Web Audio): ${window.AudioContext || window.webkitAudioContext ? 'sì' : 'no'}. Archivio del diario (IndexedDB): ${'indexedDB' in window ? 'sì' : 'no'}. Schermo: ${innerWidth}x${innerHeight}, densità ${devicePixelRatio}.`;
  };
  safety.after(IV.el('p', {class:'safety'}, btn), out);
  /* la prima schermata si apre quando anche giochi, suoni e diario sono caricati */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', IV.route); else setTimeout(IV.route, 0);
})();
