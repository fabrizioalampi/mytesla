/* In viaggio: soundboard. Tutti i suoni sono generati qui con Web Audio (niente registrazioni),
   e le melodie sono scritte per questa app. Partono solo al tocco.
   Catena: suono -> compressore -> taglio a ±1 -> volume. Così l'uscita non supera mai il volume scelto. */
'use strict';
(() => {
  const {$, el, svg, store} = IV;

  /* ---------- mattoni ---------- */
  function noiseBuf(ctx, sec){ const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function env(g, t, a, peak, hold, rel){ g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel); }
  function tone(ctx, out, t, f, dur, o){
    o = o || {}; const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    let node = osc;
    if (o.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.lp, t); if (o.lpTo) fl.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur); fl.Q.value = o.q || 0.7; osc.connect(fl); node = fl; }
    node.connect(g); g.connect(out); env(g, t, o.a || 0.01, o.v || 0.3, Math.max(0, dur - (o.a || 0.01) - (o.r || 0.2)), o.r || 0.2);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(ctx, out, t, dur, o){
    o = o || {}; const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx, dur + 0.05);
    const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.value = o.f || 1500; f.Q.value = o.q || 1;
    const g = ctx.createGain(); s.connect(f); f.connect(g); g.connect(out); env(g, t, o.a || 0.003, o.v || 0.3, o.hold || 0, o.r || dur);
    s.start(t); s.stop(t + dur + 0.05);
  }
  const N = n => 440 * Math.pow(2, (n - 69) / 12);   // nota MIDI -> Hz

  /* ---------- i suoni (durata in secondi, per i test e per l'evidenziazione del pulsante) ---------- */
  const SOUNDS = {
    applausi:{nome:'Applausi', dur:2.8, play(c, o, t){ for (let k = 0; k < 120; k++) { const tt = t + Math.random() * 2.3; noise(c, o, tt, 0.06, {f:900 + Math.random() * 2200, q:1.4, v:0.1 + Math.random() * 0.12, r:0.06}); } noise(c, o, t, 2.6, {f:1800, q:0.5, v:0.06, a:0.3, hold:1.6, r:0.7}); }},
    tamburi:{nome:'Rullo di tamburi', dur:3, play(c, o, t){ for (let k = 0; k < 44; k++) { const tt = t + k * 0.05; noise(c, o, tt, 0.05, {f:2200, q:0.8, v:0.04 + k * 0.004, r:0.05}); } tone(c, o, t + 2.25, 110, 0.5, {to:50, v:0.5, r:0.45}); noise(c, o, t + 2.25, 0.7, {type:'highpass', f:5000, v:0.18, r:0.7}); }},
    fanfara:{nome:'Fanfara', dur:2.6, play(c, o, t){ const m = [[67, 0, .18], [67, .2, .18], [72, .4, .5], [69, .95, .18], [72, 1.15, .18], [76, 1.35, 1.1]]; for (const [n, d, l] of m) for (const det of [-6, 6]) tone(c, o, t + d, N(n), l, {type:'sawtooth', detune:det, lp:2200, lpTo:900, v:0.07, a:0.02, r:0.15}); tone(c, o, t + 1.35, N(60), 1.1, {type:'sawtooth', lp:900, v:0.06, a:0.05, r:0.4}); }},
    tadan:{nome:'Ta-dan!', dur:1.8, play(c, o, t){ for (const n of [60, 64, 67]) tone(c, o, t, N(n), 0.16, {type:'triangle', v:0.09, r:0.1}); for (const n of [62, 67, 71, 74]) tone(c, o, t + 0.24, N(n), 1.4, {type:'triangle', v:0.08, a:0.01, r:0.9}); }},
    trombetta:{nome:'Trombetta da stadio', dur:1.5, play(c, o, t){ for (const f of [349, 352, 440, 443]) tone(c, o, t, f, 1.3, {type:'sawtooth', lp:2400, v:0.05, a:0.04, r:0.3}); }},
    risata:{nome:'Risata', dur:2, play(c, o, t){ for (let k = 0; k < 7; k++) { const tt = t + k * 0.22, f = 300 - k * 14; for (const fm of [800, 1150]) tone(c, o, tt, f, 0.16, {type:'sawtooth', to:f * 0.85, lp:fm, q:6, v:0.08, a:0.015, r:0.1}); } }},
    arrivati:{nome:'Siamo arrivati!', dur:2.4, speech:'Siamo arrivati!', play(c, o, t){ const m = [[72, 0], [76, .14], [79, .28], [84, .42]]; for (const [n, d] of m) tone(c, o, t + d, N(n), 0.3, {type:'triangle', v:0.12, r:0.2}); for (const n of [72, 76, 79, 84]) tone(c, o, t + 0.6, N(n), 1.6, {type:'triangle', v:0.06, a:0.02, r:1.2}); }},
    campanello:{nome:'Campanello', dur:1.6, play(c, o, t){ for (const d of [0, 0.22]) for (const [f, v] of [[2300, .14], [3450, .08], [5100, .05]]) tone(c, o, t + d, f, 1.2, {v, a:0.002, r:1.1}); }},
    boing:{nome:'Boing', dur:1.2, play(c, o, t){ const osc = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(); osc.frequency.setValueAtTime(330, t); osc.frequency.exponentialRampToValueAtTime(110, t + 1); lfo.frequency.value = 14; lg.gain.value = 40; lfo.connect(lg); lg.connect(osc.frequency); osc.connect(g); g.connect(o); env(g, t, 0.01, 0.35, 0.1, 0.9); osc.start(t); lfo.start(t); osc.stop(t + 1.1); lfo.stop(t + 1.1); }},
    fischio:{nome:'Fischio a coulisse', dur:1.4, play(c, o, t){ tone(c, o, t, 600, 0.6, {to:1800, v:0.22, a:0.05, r:0.1}); tone(c, o, t + 0.65, 1800, 0.6, {to:500, v:0.22, a:0.02, r:0.2}); }},
    pop:{nome:'Tappo', dur:0.6, play(c, o, t){ tone(c, o, t, 900, 0.12, {to:300, v:0.4, a:0.002, r:0.1}); noise(c, o, t, 0.08, {f:3000, v:0.2, r:0.08}); }},
    magia:{nome:'Magia', dur:2, play(c, o, t){ [84, 88, 91, 96, 100, 103, 108].forEach((n, k) => tone(c, o, t + k * 0.09, N(n), 0.9, {v:0.06, a:0.005, r:0.8})); }},
    evviva:{nome:'Evviva!', dur:1.6, play(c, o, t){ [72, 74, 76, 79, 84].forEach((n, k) => tone(c, o, t + k * 0.11, N(n), 0.5, {type:'triangle', v:0.13, a:0.003, r:0.45})); tone(c, o, t + 0.6, N(88), 0.9, {type:'triangle', v:0.1, r:0.8}); }},
    gong:{nome:'Gong', dur:3.5, play(c, o, t){ for (const [f, v] of [[98, .22], [147, .12], [233, .07], [311, .05]]) tone(c, o, t, f, 3.3, {v, a:0.01, r:3.2}); noise(c, o, t, 0.4, {type:'lowpass', f:600, v:0.08, r:0.4}); }},
    cucu:{nome:'Cucù', dur:1.9, play(c, o, t){ for (const d of [0, 0.85]) { tone(c, o, t + d, N(76), 0.3, {v:0.25, a:0.01, r:0.2}); tone(c, o, t + d + 0.32, N(72), 0.4, {v:0.25, a:0.01, r:0.3}); } }},
    palloncino:{nome:'Palloncino', dur:1.6, play(c, o, t){ const osc = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(520, t); osc.frequency.exponentialRampToValueAtTime(160, t + 1.4); lfo.frequency.value = 24; lg.gain.value = 60; lfo.connect(lg); lg.connect(osc.frequency); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; osc.connect(f); f.connect(g); g.connect(o); env(g, t, 0.02, 0.12, 1.1, 0.3); osc.start(t); lfo.start(t); osc.stop(t + 1.5); lfo.stop(t + 1.5); }},
    arpa:{nome:'Arpa', dur:2.4, play(c, o, t){ [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84].forEach((n, k) => tone(c, o, t + k * 0.06, N(n), 1.4, {type:'triangle', v:0.06, a:0.003, r:1.3})); }},
    rana:{nome:'Rana', dur:1.2, play(c, o, t){ for (const d of [0, 0.45]) for (let k = 0; k < 6; k++) tone(c, o, t + d + k * 0.035, 140, 0.04, {type:'square', lp:700, v:0.1, a:0.003, r:0.03}); }},
    ohno:{nome:'Oh no...', dur:2.4, play(c, o, t){ [[67, 0], [66, .45], [65, .9]].forEach(([n, d]) => tone(c, o, t + d, N(n - 12), 0.42, {type:'sawtooth', lp:1200, lpTo:500, v:0.12, a:0.03, r:0.15})); tone(c, o, t + 1.35, N(52), 1, {type:'sawtooth', to:N(50), lp:900, lpTo:300, v:0.12, a:0.03, r:0.6}); }}
  };
  const ICONS = {
    applausi:'<path d="M20 50l-6-20c-1-3 3-5 5-2l6 10M26 40l-4-16c-1-3 4-4 5-1l5 15M33 38l-2-18c0-3 5-3 5 0l2 16M40 37l1-13c0-3 5-3 5 0l-1 18c0 8-6 14-14 14-5 0-9-3-11-6" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M44 12l3-6M52 18l6-3M50 10l4-4" stroke="var(--ic-3)" stroke-width="3" stroke-linecap="round"/>',
    tamburi:'<ellipse cx="32" cy="26" rx="20" ry="8" fill="var(--ic-6)" stroke="var(--ink)" stroke-width="3"/><path d="M12 26v16c0 4 9 8 20 8s20-4 20-8V26" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="3"/><path d="M18 6l12 18M48 6L36 22" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>',
    fanfara:'<path d="M8 28h18l18-12v32L26 36H8z" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><path d="M44 16c8 4 12 10 12 16s-4 12-12 16" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="3"/><path d="M18 36v10" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>',
    tadan:'<path d="M32 8l6 14 15 1-12 9 4 15-13-8-13 8 4-15-12-9 15-1z" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><path d="M12 52h40" stroke="var(--ic-3)" stroke-width="4" stroke-linecap="round"/>',
    trombetta:'<path d="M6 30h10l30-14v32L16 34H6z" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><circle cx="12" cy="44" r="6" fill="var(--ic-6)" stroke="var(--ink)" stroke-width="3"/><path d="M52 22l6-4M54 32h6M52 42l6 4" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>',
    risata:'<circle cx="32" cy="32" r="22" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="3"/><path d="M22 26l5 2M42 26l-5 2" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><path d="M20 36h24c0 8-6 12-12 12s-12-4-12-12z" fill="var(--paper)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>',
    arrivati:'<path d="M16 56V8" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/><path d="M16 10h32l-8 10 8 10H16z" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><path d="M24 14h6v6h-6zM36 20h6v6h-6zM30 20h6M30 14h6" fill="var(--paper)"/>',
    campanello:'<circle cx="32" cy="34" r="18" fill="var(--ic-6)" stroke="var(--ink)" stroke-width="3"/><circle cx="32" cy="34" r="7" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="3"/><path d="M32 16V8M24 8h16" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>',
    boing:'<path d="M20 52c0-4 24-4 24-8s-24-4-24-8 24-4 24-8-24-4-24-8 24-4 24-8" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="10" r="6" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="3"/>',
    fischio:'<rect x="8" y="26" width="34" height="12" rx="6" fill="var(--ic-4)" stroke="var(--ink)" stroke-width="3"/><path d="M42 32h14" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><path d="M14 18c6-6 14-6 20 0M10 46c8 6 20 6 28 0" fill="none" stroke="var(--ic-2)" stroke-width="3" stroke-linecap="round"/>',
    pop:'<path d="M22 56l4-30h12l4 30z" fill="var(--ic-5)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><rect x="26" y="14" width="12" height="10" rx="2" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="3"/><path d="M20 10l-4-4M44 10l4-4M32 8V3" stroke="var(--ic-3)" stroke-width="3" stroke-linecap="round"/>',
    magia:'<path d="M12 54l28-28" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/><path d="M40 26l4-4" stroke="var(--ic-1)" stroke-width="5" stroke-linecap="round"/><path d="M48 8l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM24 10l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM54 34l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>',
    evviva:'<path d="M10 54l14-36 22 22z" fill="var(--ic-2)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><circle cx="44" cy="12" r="3" fill="var(--ic-3)"/><circle cx="54" cy="24" r="3" fill="var(--ic-1)"/><circle cx="36" cy="8" r="2.5" fill="var(--ic-5)"/><path d="M46 20c4-2 6-6 6-10M50 34c4 0 8-2 10-6" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>',
    gong:'<path d="M8 8h48M14 8v48M50 8v48" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="14" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="3"/><circle cx="32" cy="32" r="5" fill="var(--ic-3)"/><path d="M28 8v4M36 8v4" stroke="var(--ink)" stroke-width="2"/>',
    cucu:'<path d="M12 28L32 10l20 18v26H12z" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="34" r="8" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><path d="M38 34l8-2-8-2" fill="var(--ic-1)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>',
    palloncino:'<ellipse cx="32" cy="24" rx="15" ry="18" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="3"/><path d="M29 42l3 3 3-3z" fill="var(--ic-3)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/><path d="M32 45c-4 6 4 8 0 14" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/><path d="M25 16c2-3 5-4 8-4" stroke="var(--paper)" stroke-width="3" stroke-linecap="round"/>',
    arpa:'<path d="M14 56V8c18 0 30 14 36 40z" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/><path d="M22 52V12M30 50V16M38 49V24M44 48V34" stroke="var(--ic-2)" stroke-width="2.5"/><path d="M10 56h44" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>',
    rana:'<ellipse cx="32" cy="40" rx="22" ry="14" fill="var(--ic-5)" stroke="var(--ink)" stroke-width="3"/><circle cx="22" cy="24" r="7" fill="var(--ic-5)" stroke="var(--ink)" stroke-width="3"/><circle cx="42" cy="24" r="7" fill="var(--ic-5)" stroke="var(--ink)" stroke-width="3"/><circle cx="22" cy="24" r="2.5" fill="var(--ink)"/><circle cx="42" cy="24" r="2.5" fill="var(--ink)"/><path d="M22 42c6 4 14 4 20 0" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>',
    ohno:'<circle cx="32" cy="32" r="22" fill="var(--ic-4)" stroke="var(--ink)" stroke-width="3"/><circle cx="24" cy="28" r="2.5" fill="var(--ink)"/><circle cx="40" cy="28" r="2.5" fill="var(--ink)"/><ellipse cx="32" cy="42" rx="5" ry="6" fill="var(--paper)" stroke="var(--ink)" stroke-width="3"/><path d="M18 20l8 3M46 20l-8 3" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>'
  };

  /* catena di uscita: compressore, taglio a ±1, volume */
  function chain(ctx, vol){
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.2;
    const clip = ctx.createWaveShaper(), curve = new Float32Array(1025); for (let i = 0; i < 1025; i++) { const x = i / 512 - 1; curve[i] = Math.max(-1, Math.min(1, x)); } clip.curve = curve;
    const gain = ctx.createGain(); gain.gain.value = vol;
    comp.connect(clip); clip.connect(gain); gain.connect(ctx.destination);
    return {input:comp, gain};
  }

  let ctx = null, out = null;
  let vol = store.get('volume', 60);
  function ensure(){
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); out = chain(ctx, vol / 100); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function speak(text){
    try {
      if (!('speechSynthesis' in window)) return false;
      const voices = speechSynthesis.getVoices() || [], it = voices.find(v => /^it/i.test(v.lang));
      if (!it) return false;           // senza una voce italiana basta la melodia
      const u = new SpeechSynthesisUtterance(text); u.lang = 'it-IT'; u.voice = it; u.volume = Math.min(1, vol / 100); u.rate = 0.95;
      speechSynthesis.cancel(); speechSynthesis.speak(u); return true;
    } catch (e) { return false; }
  }
  function play(id, btn){
    const c = ensure(); const s = SOUNDS[id]; if (!c || !s) return;
    s.play(c, out.input, c.currentTime + 0.03);
    if (s.speech) setTimeout(() => speak(s.speech), s.dur * 500);
    if (btn) { btn.classList.add('playing'); clearTimeout(btn.t); btn.t = setTimeout(() => btn.classList.remove('playing'), s.dur * 1000); }
  }

  function build(){
    const grid = $('#soundGrid'); if (grid.children.length) return;
    for (const [id, s] of Object.entries(SOUNDS)) grid.append(el('button', {type:'button', class:'snd', 'data-sound':id, onclick:e => play(id, e.currentTarget)}, svg(ICONS[id]), el('span', {text:s.nome})));
    const vi = $('#volIn'), vo = $('#volOut'); vi.value = vol; vo.textContent = vol + '%';
    vi.oninput = () => { vol = +vi.value; vo.textContent = vol + '%'; store.set('volume', vol); if (out) out.gain.gain.setTargetAtTime(vol / 100, ctx.currentTime, 0.05); };
  }
  IV.views.suoni = build;
  /* per i test: suona in un OfflineAudioContext con la stessa catena */
  IV.suoni = {SOUNDS, chain, ids:Object.keys(SOUNDS), context:() => ctx};
})();
