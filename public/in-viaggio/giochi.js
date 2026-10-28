/* In viaggio: giochi a turno sullo stesso schermo (bingo, quiz, memory, tris). */
'use strict';
(() => {
  const {$, $$, el, svg, toast, shuffle} = IV;
  const area = $('#gameArea');
  const icon = id => svg(ICONE[id] ? ICONE[id].svg : '<circle cx="32" cy="32" r="20" fill="var(--ic-6)"/>');
  const dot = i => { const d = el('i'); d.style.background = IV.playerColor(i); return d; };

  /* ---------- giocatori ---------- */
  function renderPlayers(){
    const box = $('#playerList'); box.textContent = '';
    IV.players().forEach((p, i) => {
      const inp = el('input', {type:'text', maxlength:'14', value:p.nome, 'aria-label':`Nome del giocatore ${i + 1}`});
      inp.oninput = () => { const ps = IV.players(); ps[i].nome = inp.value || `Giocatore ${i + 1}`; IV.setPlayers(ps); };
      box.append(el('label', {class:'player'}, dot(i), inp));
    });
    $('#addPlayer').disabled = IV.players().length >= 4; $('#removePlayer').disabled = IV.players().length <= 1;
  }
  $('#addPlayer').onclick = () => { const ps = IV.players(); if (ps.length < 4) { ps.push({nome:`Giocatore ${ps.length + 1}`}); IV.setPlayers(ps); renderPlayers(); } };
  $('#removePlayer').onclick = () => { const ps = IV.players(); if (ps.length > 1) { ps.pop(); IV.setPlayers(ps); renderPlayers(); } };
  const names = () => IV.players().map((p, i) => p.nome || `Giocatore ${i + 1}`);

  let current = null;
  function open(game){
    current = game;
    $$('.game-tile').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.game === game)));
    area.hidden = false; area.textContent = '';
    ({bingo:bingoSetup, quiz:quizSetup, memory:memorySetup, tris:trisSetup})[game]();
    area.scrollIntoView({behavior:'smooth', block:'start'});
  }
  $$('.game-tile').forEach(b => b.onclick = () => open(b.dataset.game));
  const head = (title, rule) => [el('h2', {text:title}), el('p', {class:'rule', text:rule})];
  const choice = (label, opts, value, onPick) => {
    const g = el('div', {class:'seg', role:'group', 'aria-label':label});
    for (const [v, t] of opts) g.append(el('button', {type:'button', class:'seg-btn', 'aria-pressed':String(v === value), text:t, onclick:e => { g.querySelectorAll('.seg-btn').forEach(x => x.setAttribute('aria-pressed', String(x === e.currentTarget))); onPick(v); }}));
    return el('div', {}, el('p', {class:'kicker', text:label}), g);
  };
  function scores(pts, now){
    return el('div', {class:'scores'}, names().map((n, i) => { const s = el('span', {class:'score' + (i === now ? ' now' : '')}, dot(i), `${n}: ${pts[i]}`); return s; }));
  }

  /* ================= BINGO ================= */
  const BINGO = {
    /* una cartella: n x n voci diverse, scelte a caso dal gruppo (o da tutti) */
    card(group, n){
      const pool = group === 'tutti' ? Object.values(BINGO_GRUPPI).flat() : BINGO_GRUPPI[group].slice();
      let ids = shuffle([...new Set(pool)]);
      if (ids.length < n * n) ids = ids.concat(shuffle(Object.values(BINGO_GRUPPI).flat().filter(x => !ids.includes(x))));
      return ids.slice(0, n * n);
    },
    /* righe e colonne complete; full = cartella piena */
    lines(marks, n){
      const rows = [], cols = [];
      for (let r = 0; r < n; r++) if ([...Array(n).keys()].every(c => marks[r * n + c])) rows.push(r);
      for (let c = 0; c < n; c++) if ([...Array(n).keys()].every(r => marks[r * n + c])) cols.push(c);
      return {rows, cols, full:marks.slice(0, n * n).every(Boolean)};
    }
  };
  function bingoSetup(){
    let group = 'autostrada', n = 4;
    area.append(...head('Bingo da viaggio', 'Ognuno ha la sua cartella: tocca una casella quando vedi quella cosa dal finestrino. Riga o colonna completa: bingo!'),
      choice('Dove siamo?', [['autostrada', 'Autostrada'], ['citta', 'Città'], ['campagna', 'Campagna e montagna'], ['tutti', 'Un po\' di tutto']], group, v => { group = v; }),
      choice('Cartella', [[4, '4 x 4'], [5, '5 x 5']], n, v => { n = v; }),
      el('div', {class:'row'}, el('button', {class:'btn primary big', type:'button', text:'Crea le cartelle', onclick:() => bingoPlay(group, n)})));
  }
  function bingoPlay(group, n){
    const P = names(), cards = P.map(() => BINGO.card(group, n)), marks = P.map(() => Array(n * n).fill(false)), seen = P.map(() => ({lines:0, full:false}));
    let who = 0;
    const draw = () => {
      area.textContent = '';
      area.append(...head('Bingo da viaggio', 'Tocca quello che vedi. Si può anche togliere un segno toccando di nuovo.'));
      if (P.length > 1) area.append(el('div', {class:'tabs'}, P.map((p, i) => el('button', {type:'button', class:'seg-btn', 'aria-pressed':String(i === who), onclick:() => { who = i; draw(); }}, dot(i), ` ${p}`))));
      const L = BINGO.lines(marks[who], n), inLine = k => L.rows.includes(Math.floor(k / n)) || L.cols.includes(k % n);
      const grid = el('div', {class:'bingo'}); grid.style.gridTemplateColumns = `repeat(${n}, minmax(0,1fr))`;
      cards[who].forEach((id, k) => {
        const c = el('button', {type:'button', class:'cell' + (inLine(k) ? ' line' : ''), 'aria-pressed':String(marks[who][k]), 'aria-label':ICONE[id].nome});
        c.append(icon(id), el('span', {text:ICONE[id].nome}), el('span', {class:'mark'}));
        c.onclick = () => { marks[who][k] = !marks[who][k]; check(who); draw(); };
        grid.append(c);
      });
      area.append(grid, el('div', {class:'row'}, el('button', {class:'btn', type:'button', text:'Nuove cartelle', onclick:bingoSetup})));
    };
    const check = i => {
      const L = BINGO.lines(marks[i], n), count = L.rows.length + L.cols.length;
      if (L.full && !seen[i].full) toast(`Cartella piena per ${P[i]}! Bravissimi.`, 5000);
      else if (count > seen[i].lines) toast(`Bingo per ${P[i]}! ${L.rows.length ? 'Riga completa.' : 'Colonna completa.'}`, 4000);
      seen[i] = {lines:count, full:L.full};
    };
    draw();
  }

  /* ================= QUIZ ================= */
  const CATEGORIE = [['geografia', 'Geografia d\'Italia'], ['animali', 'Animali'], ['spazio', 'Spazio'], ['sport', 'Sport'], ['cibo', 'Cibo'], ['storia', 'Storia'], ['scienza', 'Scienza']];
  function quizSetup(){
    let liv = 'bambini', cats = new Set(CATEGORIE.map(c => c[0])), per = 5;
    const catBox = el('div', {class:'seg', role:'group', 'aria-label':'Categorie'});
    for (const [id, nome] of CATEGORIE) catBox.append(el('button', {type:'button', class:'seg-btn', 'aria-pressed':'true', text:nome, onclick:e => { if (cats.has(id) && cats.size > 1) cats.delete(id); else cats.add(id); e.currentTarget.setAttribute('aria-pressed', String(cats.has(id))); }}));
    area.append(...head('Quiz', 'A turno, ognuno risponde alla sua domanda. Un punto per ogni risposta giusta.'),
      choice('Livello', [['bambini', 'Bambini (6-9 anni)'], ['ragazzi', 'Ragazzi'], ['adulti', 'Adulti']], liv, v => { liv = v; }),
      el('div', {}, el('p', {class:'kicker', text:'Categorie'}), catBox),
      choice('Domande a testa', [[3, '3'], [5, '5'], [8, '8']], per, v => { per = v; }),
      el('div', {class:'row'}, el('button', {class:'btn primary big', type:'button', text:'Comincia', onclick:() => quizPlay(liv, [...cats], per)})));
  }
  function quizPlay(liv, cats, per){
    const P = names(), pool = shuffle(QUIZ_DOMANDE.filter(q => q.liv === liv && cats.includes(q.cat)));
    const total = Math.min(pool.length, per * P.length), pts = P.map(() => 0);
    let k = 0;
    const ask = () => {
      area.textContent = '';
      if (k >= total) return quizEnd(P, pts);
      const q = pool[k], who = k % P.length;
      /* le risposte si mescolano: si tiene traccia di quella giusta */
      const order = shuffle(q.r.map((t, i) => ({t, ok:i === q.ok})));
      area.append(scores(pts, who), el('p', {class:'turn'}, dot(who), `Tocca a ${P[who]} · domanda ${Math.floor(k / P.length) + 1} di ${per}`),
        el('p', {class:'kicker', text:CATEGORIE.find(c => c[0] === q.cat)[1]}), el('p', {class:'quiz-q', text:q.d}));
      const box = el('div', {class:'answers'}); let done = false;
      order.forEach(o => box.append(el('button', {type:'button', class:'answer', text:o.t, onclick:e => {
        if (done) return; done = true;
        if (o.ok) pts[who]++;
        box.querySelectorAll('.answer').forEach((b, i) => { if (order[i].ok) b.classList.add('giusta'); else if (b === e.currentTarget) b.classList.add('sbagliata'); b.disabled = true; });
        area.append(el('p', {class:'explain'}, el('b', {text:o.ok ? 'Giusto! ' : `Era: ${order.find(x => x.ok).t}. `}), q.spiega),
          el('div', {class:'row'}, el('button', {class:'btn primary big', type:'button', text:k + 1 >= total ? 'Vedi i punteggi' : 'Avanti', onclick:() => { k++; ask(); }})));
      }})));
      area.append(box);
    };
    ask();
  }
  function quizEnd(P, pts){
    const best = Math.max(...pts), win = P.filter((_, i) => pts[i] === best);
    area.append(el('h2', {text:P.length === 1 ? `Hai fatto ${pts[0]} punti!` : win.length > 1 ? `Pari tra ${win.join(' e ')}!` : `Vince ${win[0]}!`}), scores(pts, -1),
      el('div', {class:'row'}, el('button', {class:'btn primary big', type:'button', text:'Un\'altra partita', onclick:quizSetup})));
  }

  /* ================= MEMORY ================= */
  const MEMORY = {
    deck(theme, pairs){ const pool = theme === 'strada' ? Object.values(BINGO_GRUPPI).flat() : MEMORY_TEMI[theme]; const ids = shuffle([...new Set(pool)]).slice(0, pairs); return shuffle(ids.concat(ids)); },
    isPair: (deck, a, b) => a !== b && deck[a] === deck[b]
  };
  function memorySetup(){
    let theme = 'animali', diff = 'medio';
    area.append(...head('Memory', 'A turno si girano due carte. Se sono uguali, sono tue e giochi ancora.'),
      choice('Carte', [['animali', 'Animali'], ['spazio', 'Spazio'], ['veicoli', 'Veicoli'], ['strada', 'Cose della strada']], theme, v => { theme = v; }),
      choice('Difficoltà', [['facile', 'Facile (6 coppie)'], ['medio', 'Media (8 coppie)'], ['difficile', 'Difficile (12 coppie)']], diff, v => { diff = v; }),
      el('div', {class:'row'}, el('button', {class:'btn primary big', type:'button', text:'Gira le carte', onclick:() => memoryPlay(theme, diff)})));
  }
  function memoryPlay(theme, diff){
    const pairs = {facile:6, medio:8, difficile:12}[diff], cols = {facile:4, medio:4, difficile:6}[diff];
    const P = names(), deck = MEMORY.deck(theme, pairs), state = deck.map(() => 'down'), pts = P.map(() => 0);
    let who = 0, open = [], busy = false;
    const back = '<circle cx="32" cy="32" r="18" fill="none" stroke="var(--paper)" stroke-width="4"/><path d="M14 40c8-4 12-12 18-12s10-8 18-10" fill="none" stroke="var(--paper)" stroke-width="4" stroke-linecap="round"/>';
    const draw = () => {
      area.textContent = '';
      area.append(scores(pts, who), el('p', {class:'turn'}, dot(who), P.length > 1 ? `Tocca a ${P[who]}` : 'Trova tutte le coppie'));
      const grid = el('div', {class:'memory'}); grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0,1fr))`;
      deck.forEach((id, k) => {
        const c = el('button', {type:'button', class:'card' + (state[k] === 'up' ? ' up' : state[k] === 'done' ? ' done' : ''), 'aria-label':state[k] === 'down' ? 'Carta coperta' : ICONE[id].nome});
        c.append(el('span', {class:'back'}, svg(back)), el('span', {class:'face'}, icon(id)));
        c.onclick = () => flip(k); grid.append(c);
      });
      area.append(grid);
    };
    const flip = k => {
      if (busy || state[k] !== 'down') return;
      state[k] = 'up'; open.push(k); draw();
      if (open.length < 2) return;
      const [a, b] = open; open = [];
      if (MEMORY.isPair(deck, a, b)) {
        state[a] = state[b] = 'done'; pts[who]++; draw();
        if (state.every(s => s === 'done')) setTimeout(() => { const best = Math.max(...pts), win = P.filter((_, i) => pts[i] === best); area.append(el('h2', {text:P.length === 1 ? 'Tutte trovate!' : win.length > 1 ? `Pari tra ${win.join(' e ')}!` : `Vince ${win[0]}!`}), el('div', {class:'row'}, el('button', {class:'btn primary big', type:'button', text:'Un\'altra partita', onclick:memorySetup}))); }, 700);
      } else {
        busy = true;
        setTimeout(() => { state[a] = state[b] = 'down'; who = (who + 1) % P.length; busy = false; draw(); }, 1600);
      }
    };
    draw();
  }

  /* ================= TRIS ================= */
  const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const TRIS = {
    winner(b){ for (const w of WINS) if (b[w[0]] && b[w[0]] === b[w[1]] && b[w[1]] === b[w[2]]) return {who:b[w[0]], line:w}; return b.every(Boolean) ? {who:'pari'} : null; },
    /* minimax completo: con 9 caselle si esplora tutto in un attimo */
    minimax(b, me, turn){
      const w = TRIS.winner(b);
      if (w) return w.who === 'pari' ? 0 : w.who === me ? 10 : -10;
      const scores = [];
      for (let i = 0; i < 9; i++) if (!b[i]) { b[i] = turn; scores.push(TRIS.minimax(b, me, turn === 'X' ? 'O' : 'X') * 0.9); b[i] = null; }
      return turn === me ? Math.max(...scores) : Math.min(...scores);
    },
    /* tutte le mosse migliori (a parità di valore il computer ne sceglie una a caso, per variare) */
    bestMoves(b, me){
      let best = -Infinity, moves = [];
      for (let i = 0; i < 9; i++) if (!b[i]) { b[i] = me; const s = TRIS.minimax(b, me, me === 'X' ? 'O' : 'X'); b[i] = null; if (s > best + 1e-9) { best = s; moves = [i]; } else if (Math.abs(s - best) < 1e-9) moves.push(i); }
      return moves;
    },
    best(b, me){ const moves = TRIS.bestMoves(b, me); return moves[Math.floor(Math.random() * moves.length)]; },
    move(b, me, level){
      const free = b.map((v, i) => v ? null : i).filter(v => v !== null);
      if (level === 'facile') return free[Math.floor(Math.random() * free.length)];
      if (level === 'medio') {
        const other = me === 'X' ? 'O' : 'X';
        for (const p of [me, other]) for (const i of free) { b[i] = p; const w = TRIS.winner(b); b[i] = null; if (w && w.who === p) return i; }   // vinci, altrimenti blocca
        return Math.random() < 0.5 ? TRIS.best(b, me) : free[Math.floor(Math.random() * free.length)];
      }
      return TRIS.best(b, me);
    }
  };
  const X = '<path d="M10 10l44 44M54 10L10 54" stroke="var(--ic-3)" stroke-width="9" stroke-linecap="round"/>';
  const O = '<circle cx="32" cy="32" r="21" fill="none" stroke="var(--ic-2)" stroke-width="9"/>';
  function trisSetup(){
    let mode = 'cpu', level = 'medio';
    area.append(...head('Tris', 'Metti tre segni in fila (in orizzontale, in verticale o in diagonale) prima dell\'altro.'),
      choice('Contro chi?', [['cpu', 'Contro il computer'], ['due', 'Due giocatori']], mode, v => { mode = v; }),
      choice('Computer', [['facile', 'Facile'], ['medio', 'Medio'], ['imbattibile', 'Imbattibile']], level, v => { level = v; }),
      el('div', {class:'row'}, el('button', {class:'btn primary big', type:'button', text:'Gioca', onclick:() => trisPlay(mode, level, 0)})));
  }
  function trisPlay(mode, level, round){
    const P = names(), b = Array(9).fill(null);
    const pX = mode === 'cpu' ? P[0] : P[0], pO = mode === 'cpu' ? 'Computer' : (P[1] || 'Giocatore 2');
    const cpuFirst = mode === 'cpu' && round % 2 === 1;   // si alterna chi comincia
    let turn = 'X', over = null;
    const isCpu = t => mode === 'cpu' && ((t === 'O') !== cpuFirst);
    const nameOf = t => mode === 'cpu' ? (isCpu(t) ? 'Computer' : pX) : (t === 'X' ? pX : pO);
    const draw = () => {
      area.textContent = '';
      area.append(el('p', {class:'turn', text:over ? (over.who === 'pari' ? 'Pareggio!' : `Vince ${nameOf(over.who)}!`) : `Tocca a ${nameOf(turn)} (${turn === 'X' ? 'croce' : 'cerchio'})`}));
      const g = el('div', {class:'tris'});
      b.forEach((v, i) => { const c = el('button', {type:'button', class:'tcell' + (over && over.line && over.line.includes(i) ? ' win' : ''), 'aria-label':v ? (v === 'X' ? 'Croce' : 'Cerchio') : `Casella ${i + 1} vuota`}); if (v) c.append(svg(v === 'X' ? X : O)); c.onclick = () => play(i, false); g.append(c); });
      area.append(g);
      if (over) area.append(el('div', {class:'row'}, el('button', {class:'btn primary big', type:'button', text:'Rivincita', onclick:() => trisPlay(mode, level, round + 1)}), el('button', {class:'btn', type:'button', text:'Cambia avversario', onclick:trisSetup})));
    };
    const play = (i, byCpu) => {
      if (over || b[i] || (isCpu(turn) && !byCpu)) return;
      b[i] = turn; over = TRIS.winner(b); turn = turn === 'X' ? 'O' : 'X'; draw();
      if (!over && isCpu(turn)) setTimeout(() => play(TRIS.move(b, turn, level), true), 700);
    };
    draw();
    if (isCpu(turn)) setTimeout(() => play(TRIS.move(b, turn, level), true), 700);
  }

  IV.views.giochi = () => { renderPlayers(); };
  IV.giochi = {BINGO, MEMORY, TRIS};   // usati anche dai test
})();
