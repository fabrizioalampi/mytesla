/* In viaggio: diario dei viaggi. Tutto resta nel browser (IndexedDB), con esporta e importa in JSON. */
'use strict';
(() => {
  const {$, el, svg, toast, hm, findCity, nearestCity, position} = IV;

  /* ---------- archivio ---------- */
  const db = (() => {
    let p = null; const mem = {viaggi:new Map(), soste:new Map()};
    const open = () => p || (p = new Promise(res => {
      try { const r = indexedDB.open('in-viaggio', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('viaggi', {keyPath:'id'}); d.createObjectStore('soste', {keyPath:'id'}).createIndex('viaggio', 'viaggio'); }; r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); }
      catch (e) { res(null); }
    }));
    const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return {
      async all(s){ const d = await open(); if (!d) return [...mem[s].values()]; return req(d.transaction(s).objectStore(s).getAll()); },
      async put(s, v){ const d = await open(); if (!d) { mem[s].set(v.id, v); return; } return req(d.transaction(s, 'readwrite').objectStore(s).put(v)); },
      async del(s, id){ const d = await open(); if (!d) { mem[s].delete(id); return; } return req(d.transaction(s, 'readwrite').objectStore(s).delete(id)); },
      async persistent(){ return !!(await open()); }
    };
  })();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const day = t => new Date(t).toLocaleDateString('it-IT', {day:'numeric', month:'long', year:'numeric'});
  const MOODS = {
    felice:{nome:'Felici', svg:'<circle cx="24" cy="24" r="20" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="3"/><circle cx="17" cy="20" r="2.5" fill="var(--ink)"/><circle cx="31" cy="20" r="2.5" fill="var(--ink)"/><path d="M14 28c4 6 16 6 20 0" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>'},
    stupiti:{nome:'Stupiti', svg:'<circle cx="24" cy="24" r="20" fill="var(--ic-4)" stroke="var(--ink)" stroke-width="3"/><circle cx="17" cy="19" r="3" fill="var(--ink)"/><circle cx="31" cy="19" r="3" fill="var(--ink)"/><ellipse cx="24" cy="31" rx="4" ry="5" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/>'},
    affamati:{nome:'Affamati', svg:'<circle cx="24" cy="24" r="20" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="3"/><path d="M14 19l5 2M34 19l-5 2" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><path d="M16 29h16" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><path d="M28 29c0 5 4 6 4 2" fill="var(--paper)" stroke="var(--ink)" stroke-width="2.5"/>'},
    stanchi:{nome:'Stanchi', svg:'<circle cx="24" cy="24" r="20" fill="var(--ic-6)" stroke="var(--ink)" stroke-width="3"/><path d="M13 21c2 2 5 2 7 0M28 21c2 2 5 2 7 0" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><path d="M19 31h10" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>'},
    divertiti:{nome:'Divertiti', svg:'<circle cx="24" cy="24" r="20" fill="var(--ic-5)" stroke="var(--ink)" stroke-width="3"/><path d="M13 20l4-3 4 3M27 20l4-3 4 3" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 27h20c0 7-5 10-10 10s-10-3-10-10z" fill="var(--paper)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>'}
  };

  let trips = [], stops = [], openTrip = null, confirmDel = null;
  const currentId = () => IV.store.get('diario-corrente', null);
  async function load(){ trips = (await db.all('viaggi')).sort((a, b) => b.inizio - a.inizio); stops = (await db.all('soste')).sort((a, b) => a.t - b.t); }
  const stopsOf = id => stops.filter(s => s.viaggio === id);

  /* ---------- viaggio in corso e "Sono qui" ---------- */
  function renderCurrent(){
    const box = $('#diaryCurrent'); box.textContent = '';
    const cur = trips.find(t => t.id === currentId());
    box.append(el('h2', {text:cur ? cur.nome : 'Diario dei viaggi'}));
    if (cur) box.append(el('p', {class:'hint', text:`${stopsOf(cur.id).length} soste dal ${day(cur.inizio)}`}));
    else box.append(el('p', {class:'hint', text:'Tocca "Sono qui" a ogni sosta: luogo, ora e una nota restano nel diario, e alla fine il viaggio si vede sulla mappa.'}));
    box.append(el('button', {class:'btn primary here-btn', type:'button', text:'Sono qui', onclick:openHere}));
    const row = el('div', {class:'row'});
    if (cur) row.append(el('button', {class:'btn', type:'button', text:'Vedi il viaggio', onclick:() => showTrip(cur.id)}), el('button', {class:'btn', type:'button', text:'Chiudi questo viaggio', onclick:() => { IV.store.del('diario-corrente'); cur.fine = cur.fine || Date.now(); db.put('viaggi', cur).then(render); toast('Viaggio chiuso. Il prossimo "Sono qui" ne apre uno nuovo.'); }}));
    else row.append(el('label', {class:'field'}, el('span', {text:'Nome del prossimo viaggio (facoltativo)'}), el('input', {type:'text', id:'newTripName', maxlength:'50', placeholder:`Viaggio del ${day(Date.now())}`})));
    box.append(row);
  }
  let herePos = null, mood = null;
  function openHere(){
    herePos = null; mood = null;
    $('#herePlace').value = ''; $('#hereNote').value = '';
    const moods = $('#moods'); moods.textContent = '';
    for (const [id, m] of Object.entries(MOODS)) moods.append(el('button', {type:'button', class:'mood', 'aria-pressed':'false', onclick:e => { mood = mood === id ? null : id; moods.querySelectorAll('.mood').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget && mood === id))); }}, svg(m.svg, '0 0 48 48'), el('span', {text:m.nome})));
    $('#herePos').textContent = 'Cerco la posizione…';
    $('#hereDlg').showModal();
    position(0).then(p => {
      herePos = p; const n = nearestCity(p);
      $('#herePos').textContent = `Posizione trovata (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}).` + (n && n.d < 40 ? ` Vicino a ${n.c.nome}.` : '');
      if (!$('#herePlace').value && n && n.d < 40) $('#herePlace').value = n.d < 6 ? n.c.nome : `Vicino a ${n.c.nome}`;
    }).catch(() => { $('#herePos').textContent = 'Il browser non dà la posizione: scrivi dove siete o scegli una città dall\'elenco.'; });
  }
  $('#hereClose').onclick = () => $('#hereDlg').close();
  $('#hereSave').onclick = async () => {
    const place = $('#herePlace').value.trim(), city = findCity(place.replace(/^vicino a /i, ''));
    const pos = herePos || (city ? {lat:city.lat, lon:city.lon} : null);
    if (!place && !pos) { $('#herePos').textContent = 'Scrivi almeno il nome del posto.'; return; }
    let cur = trips.find(t => t.id === currentId());
    if (!cur) { const nm = ($('#newTripName') && $('#newTripName').value.trim()) || `Viaggio del ${day(Date.now())}`; cur = {id:uid(), nome:nm, inizio:Date.now(), fine:null}; await db.put('viaggi', cur); IV.store.set('diario-corrente', cur.id); }
    const s = {id:uid(), viaggio:cur.id, t:Date.now(), luogo:place || 'Posto senza nome', lat:pos ? pos.lat : null, lon:pos ? pos.lon : null, fonte:herePos ? 'gps' : city ? 'citta' : 'testo', nota:$('#hereNote').value.trim().slice(0, 140), umore:mood};
    await db.put('soste', s);
    $('#hereDlg').close(); await render(); toast(`Sosta salvata: ${s.luogo}, alle ${hm(s.t)}.`);
  };

  /* ---------- elenco e dettaglio ---------- */
  function renderList(){
    const box = $('#diaryList'); box.textContent = '';
    box.append(el('h2', {text:'I viaggi'}));
    if (!trips.length) { box.append(el('p', {class:'hint', text:'Ancora nessun viaggio: comincia con "Sono qui".'})); return; }
    const list = el('div', {class:'trips'});
    for (const t of trips) {
      const n = stopsOf(t.id).length;
      list.append(el('button', {type:'button', class:'trip-card', onclick:() => showTrip(t.id)}, svg('<path d="M8 14l14-5 16 5 14-5v41l-14 5-16-5-14 5z" fill="var(--ic-5)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>'), el('span', {}, el('b', {text:t.nome}), el('small', {text:`${day(t.inizio)}${t.fine && day(t.fine) !== day(t.inizio) ? ' · fino al ' + day(t.fine) : ''} · ${n} ${n === 1 ? 'sosta' : 'soste'}${t.id === currentId() ? ' · in corso' : ''}`}))));
    }
    box.append(list);
  }
  function showTrip(id){
    openTrip = id; confirmDel = null;
    const t = trips.find(x => x.id === id), box = $('#diaryDetail'); if (!t) { box.hidden = true; return; }
    const ss = stopsOf(id);
    box.hidden = false; box.textContent = '';
    const nameIn = el('input', {type:'text', maxlength:'50', value:t.nome, 'aria-label':'Nome del viaggio'});
    nameIn.onchange = () => { t.nome = nameIn.value.trim() || t.nome; db.put('viaggi', t).then(() => { renderList(); renderCurrent(); }); };
    box.append(el('div', {class:'row'}, el('label', {class:'field'}, el('span', {text:'Viaggio'}), nameIn), el('button', {class:'btn', type:'button', text:'Chiudi', onclick:() => { box.hidden = true; openTrip = null; }})));
    box.append(map(ss));
    const out = ss.filter(s => s.lat != null && !inItaly(s));
    if (out.length) box.append(el('div', {class:'outside'}, el('b', {text:'Fuori dall\'Italia: '}), out.map(s => `${s.luogo} (${s.lat.toFixed(3)}, ${s.lon.toFixed(3)})`).join('; ')));
    const nopos = ss.filter(s => s.lat == null);
    if (nopos.length) box.append(el('p', {class:'hint', text:`${nopos.length} ${nopos.length === 1 ? 'sosta senza posizione non compare' : 'soste senza posizione non compaiono'} sulla mappa.`}));
    const ul = el('ol', {class:'stop-list'});
    ss.forEach((s, i) => ul.append(el('li', {}, el('span', {class:'n', text:String(i + 1)}), el('span', {}, el('b', {text:s.luogo}), ` · ${new Date(s.t).toLocaleDateString('it-IT', {day:'numeric', month:'short'})} alle ${hm(s.t)}`), el('small', {}, s.umore && MOODS[s.umore] ? `${MOODS[s.umore].nome}. ` : '', s.nota || ''))));
    box.append(ul);
    const tbox = el('div', {class:'transfer'});
    box.append(el('div', {class:'row'}, el('button', {class:'btn', type:'button', text:'Manda al telefono (QR)', onclick:() => IV.diarioTransfer.showQr(t, tbox)}), el('button', {class:'btn', type:'button', text:'Invia con un codice', onclick:() => IV.diarioTransfer.sendCode(t, tbox)})), tbox);
    const del = el('div', {class:'row'}, el('span', {class:'grow'}), el('button', {class:'btn', type:'button', text:'Elimina il viaggio', onclick:() => {
      del.replaceWith(el('div', {class:'confirm'}, el('span', {text:`Eliminare "${t.nome}" e le sue ${ss.length} soste? Non si può annullare.`}),
        el('button', {class:'btn primary', type:'button', text:'Sì, elimina', onclick:async () => { for (const s of ss) await db.del('soste', s.id); await db.del('viaggi', t.id); if (currentId() === t.id) IV.store.del('diario-corrente'); box.hidden = true; openTrip = null; await render(); toast('Viaggio eliminato.'); }}),
        el('button', {class:'btn', type:'button', text:'No', onclick:() => showTrip(id)})));
    }}));
    box.append(del);
    box.scrollIntoView({behavior:'smooth', block:'start'});
  }

  /* ---------- mappa dell'Italia (Natural Earth, pubblico dominio) ---------- */
  const [LON0, LAT0, LON1, LAT1] = ITALIA.bbox, KX = Math.cos(42 * Math.PI / 180), PAD = 0.4;
  const W = (LON1 - LON0 + 2 * PAD) * KX, H = LAT1 - LAT0 + 2 * PAD;
  const proj = (lon, lat) => [((lon - LON0 + PAD) * KX * 100).toFixed(1), ((LAT1 + PAD - lat) * 100).toFixed(1)];
  const inItaly = s => s.lon >= LON0 - 0.5 && s.lon <= LON1 + 0.5 && s.lat >= LAT0 - 0.5 && s.lat <= LAT1 + 0.5;
  const ITALY_PATH = ITALIA.poligoni.map(r => 'M' + r.map(([x, y]) => proj(x, y).join(' ')).join('L') + 'Z').join('');
  function map(ss){
    const pts = ss.filter(s => s.lat != null && inItaly(s));
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', `0 0 ${(W * 100).toFixed(0)} ${(H * 100).toFixed(0)}`); s.setAttribute('class', 'map'); s.setAttribute('role', 'img');
    s.setAttribute('aria-label', pts.length ? `Mappa del viaggio con ${pts.length} soste` : 'Mappa dell\'Italia');
    let inner = `<path d="${ITALY_PATH}" fill="var(--paper)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>`;
    if (pts.length > 1) inner += `<polyline points="${pts.map(p => proj(p.lon, p.lat).join(',')).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 14"/>`;
    ss.forEach((p, i) => { if (p.lat == null || !inItaly(p)) return; const [x, y] = proj(p.lon, p.lat); inner += `<g transform="translate(${x} ${y})"><circle r="22" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="4"/><text y="8" text-anchor="middle" font-size="24" font-weight="800" fill="var(--ink)">${i + 1}</text></g>`; });
    s.innerHTML = inner;
    return el('div', {class:'map-box'}, s);
  }

  /* ---------- esporta e importa ---------- */
  $('#exportBtn').onclick = async () => {
    await load();
    const data = {app:'in-viaggio', versione:1, esportato:new Date().toISOString(), viaggi:trips, soste:stops};
    const blob = new Blob([JSON.stringify(data, null, 1)], {type:'application/json'}), a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = `in-viaggio-diario-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 3000);
    $('#ioMsg').textContent = `Esportati ${trips.length} ${trips.length === 1 ? 'viaggio' : 'viaggi'} e ${stops.length} ${stops.length === 1 ? 'sosta' : 'soste'}.`;
  };
  /* importa dati di In viaggio (da file, QR o codice): aggiunge, non cancella nulla */
  async function importData(d){
    if (!d || d.app !== 'in-viaggio' || !Array.isArray(d.viaggi) || !Array.isArray(d.soste)) throw new Error('Non sono dati di In viaggio.');
    const okTrip = v => v && typeof v.id === 'string' && typeof v.nome === 'string' && Number.isFinite(v.inizio);
    const okStop = s => s && typeof s.id === 'string' && typeof s.viaggio === 'string' && Number.isFinite(s.t) && typeof s.luogo === 'string' && (s.lat == null || (Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180));
    const vs = d.viaggi.filter(okTrip), ss = d.soste.filter(okStop);
    for (const v of vs) await db.put('viaggi', {id:v.id, nome:v.nome.slice(0, 50), inizio:v.inizio, fine:Number.isFinite(v.fine) ? v.fine : null});
    for (const s of ss) await db.put('soste', {id:s.id, viaggio:s.viaggio, t:s.t, luogo:s.luogo.slice(0, 60), lat:s.lat ?? null, lon:s.lon ?? null, fonte:String(s.fonte || 'testo'), nota:String(s.nota || '').slice(0, 140), umore:MOODS[s.umore] ? s.umore : null});
    await render();
    return `Importati ${vs.length} ${vs.length === 1 ? 'viaggio' : 'viaggi'} e ${ss.length} ${ss.length === 1 ? 'sosta' : 'soste'}` + (vs.length < d.viaggi.length || ss.length < d.soste.length ? ' (alcuni elementi non validi sono stati saltati).' : '.');
  }
  $('#importIn').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { $('#ioMsg').textContent = await importData(JSON.parse(await f.text())); }
    catch (err) { $('#ioMsg').textContent = 'Non riesco a importare questo file: ' + (err.message || 'formato non valido'); }
  };

  /* ---------- dall'auto al telefono: QR e codice breve ---------- */
  const tripData = t => ({app:'in-viaggio', versione:1, viaggi:[t], soste:stopsOf(t.id)});
  const b64u = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  async function pack(obj){
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'undefined') return 'j' + b64u(raw);
    const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    return 'z' + b64u(z);
  }
  async function unpack(s){
    const bytes = unb64u(s.slice(1));
    const raw = s[0] === 'z' ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : bytes;
    return JSON.parse(new TextDecoder().decode(raw));
  }
  const QR_MAX = 2200;   // oltre, il QR diventa troppo fitto da inquadrare su uno schermo
  async function showQr(t, box){
    let d = tripData(t), url = `${location.origin}/in-viaggio/#/diario/ricevi/${await pack(d)}`, note = '';
    if (url.length > QR_MAX) { d = Object.assign({}, d, {soste:d.soste.map(s => Object.assign({}, s, {nota:''}))}); url = `${location.origin}/in-viaggio/#/diario/ricevi/${await pack(d)}`; note = ' Le note non ci stavano: sono rimaste solo qui.'; }
    box.textContent = '';
    if (url.length > QR_MAX) { box.append(el('p', {class:'hint warn', text:'Questo viaggio ha troppe soste per un QR: usa "Invia con un codice".'})); return; }
    const qr = qrcode(0, 'L'); qr.addData(url); qr.make();
    const holder = el('div', {class:'qr'}); holder.innerHTML = qr.createSvgTag({cellSize:6, margin:4, scalable:true});
    box.append(holder, el('p', {class:'hint', text:'Inquadra il codice con la fotocamera del telefono: si apre In viaggio e il viaggio si aggiunge al diario del telefono. Non passa da nessun server.' + note}));
  }
  async function sendCode(t, box){
    box.textContent = ''; box.append(el('p', {class:'hint', text:'Preparo il codice…'}));
    try {
      const r = await fetch('/api/viaggi/invia', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(tripData(t))});
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.codice) throw new Error(b.errore || 'servizio non disponibile');
      box.textContent = '';
      box.append(el('p', {class:'code', text:b.codice}), el('p', {class:'hint', text:`Sull'altro dispositivo apri In viaggio, Diario, "Ricevi con un codice" e scrivi questo codice. Vale fino alle ${hm(Date.parse(b.scade))} di domani e una sola volta; poi il viaggio viene cancellato dal server.`}));
    } catch (e) { box.textContent = ''; box.append(el('p', {class:'hint warn', text:'Non riesco a creare il codice: ' + (e.message || 'manca la connessione') + '. Serve la connessione a Internet.'})); }
  }
  IV.diarioTransfer = {showQr, sendCode};
  $('#codeBtn').onclick = async () => {
    const msg = $('#ioMsg'), c = $('#codeIn').value.trim();
    if (!c) { msg.textContent = 'Scrivi il codice di 8 caratteri.'; return; }
    msg.textContent = 'Cerco il viaggio…';
    try {
      const r = await fetch('/api/viaggi/ricevi?codice=' + encodeURIComponent(c));
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.errore || 'servizio non disponibile');
      msg.textContent = await importData(b); $('#codeIn').value = '';
    } catch (e) { msg.textContent = e.message || 'Non riesco a ricevere il viaggio.'; }
  };
  /* arrivo da un QR: #/diario/ricevi/<dati> */
  async function fromLink(){
    const m = location.hash.match(/^#\/diario\/ricevi\/([A-Za-z0-9_-]+)$/); if (!m) return;
    const box = $('#diaryDetail'); box.hidden = false; box.textContent = '';
    try {
      const d = await unpack(m[1]); const t = d.viaggi && d.viaggi[0];
      if (!t) throw new Error('vuoto');
      box.append(el('h2', {text:'Viaggio in arrivo'}), el('p', {text:`"${t.nome}", ${d.soste.length} ${d.soste.length === 1 ? 'sosta' : 'soste'}. Lo aggiungo al diario di questo dispositivo?`}),
        el('div', {class:'row'}, el('button', {class:'btn primary big', type:'button', text:'Aggiungi al diario', onclick:async () => { const msg = await importData(d); history.replaceState(null, '', '#/diario'); box.hidden = true; toast(msg, 4000); }}),
          el('button', {class:'btn', type:'button', text:'No', onclick:() => { history.replaceState(null, '', '#/diario'); box.hidden = true; }})));
    } catch (e) { box.append(el('p', {class:'hint warn', text:'Il codice QR non è completo o non è di In viaggio.'})); }
  }

  async function render(){ await load(); renderCurrent(); renderList(); if (openTrip) showTrip(openTrip); }
  IV.views.diario = async () => { await render(); await fromLink(); if (!(await db.persistent())) toast('Questo browser non permette di salvare il diario: le soste restano finché la pagina è aperta.', 5000); };
  IV.diario = {db, proj, inItaly};
})();
