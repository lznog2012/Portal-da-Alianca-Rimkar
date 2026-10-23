// ==================================================
// BLACKJACK 21 - CLIENT
// ==================================================

const socket = typeof io !== 'undefined' ? io() : null;
let myId = null;
let currentRoom = null;
let S = null;                 // último estado da mesa
let lobbyData = null;
let pendingBet = 0;
let lastBet = 0;
let seen = new Set();         // cartas já desenhadas (para animar só as novas)
let lastRound = -1;
let lastPhase = null;
let lastTurnKey = '';
let statsRound = -1;
let bannerTimer = null;

// localStorage pode lançar erro (modo privado, navegador embutido de app, cookies bloqueados)
const _memStore = {};
const safeLS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return Object.prototype.hasOwnProperty.call(_memStore, k) ? _memStore[k] : null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { _memStore[k] = String(v); } }
};
const STORAGE = { clientId: 'alpha_clientId', name: 'alpha_name', sound: 'alpha_sound', stats: 'alpha_bj_stats' };
let soundEnabled = safeLS.get(STORAGE.sound) !== 'false';

function getClientId() {
  let id = safeLS.get(STORAGE.clientId);
  if (!id) { id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36); safeLS.set(STORAGE.clientId, id); }
  return id;
}
const CLIENT_ID = getClientId();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function getStoredName() { return safeLS.get(STORAGE.name) || ''; }
function getStoredAvatar() { return (window.Conta && Conta.gameAvatar && Conta.gameAvatar()) || { b: 'rimk', bg: null, i: [] }; }
function saveProfile(name) { if (name) safeLS.set(STORAGE.name, name); }

// ========== SOM ==========
let audioCtx = null;
function initAudio() {
  if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {}); return; }
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
}
function beep(freq, dur, type, vol, delay) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + dur);
  } catch (e) {}
}
function seq(notes) { let t = 0; notes.forEach(n => { beep(n[0], n[1], n[2] || 'square', n[3] || 0.05, t); t += n[1] * 0.9; }); }
const SOUNDS = {
  card: () => { beep(1200, 0.04, 'triangle', 0.05); beep(700, 0.05, 'triangle', 0.04, 0.03); },
  flip: () => seq([[500, 0.05, 'triangle'], [900, 0.07, 'triangle']]),
  chip: () => { beep(2200, 0.03, 'square', 0.04); beep(3000, 0.04, 'square', 0.03, 0.03); },
  turn: () => seq([[700, 0.07], [1050, 0.1]]),
  win: () => seq([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.35]]),
  blackjack: () => seq([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.1], [1319, 0.1], [1568, 0.4, 'triangle']]),
  lose: () => seq([[400, 0.16, 'sawtooth'], [300, 0.16, 'sawtooth'], [200, 0.36, 'sawtooth']]),
  push: () => seq([[600, 0.1, 'triangle'], [600, 0.14, 'triangle']]),
  bust: () => seq([[300, 0.1, 'sawtooth'], [150, 0.3, 'sawtooth']]),
  chat: () => beep(1500, 0.03, 'sine', 0.03),
  siren: () => { [0, 0.28, 0.56, 0.84].forEach((t, i) => beep(i % 2 ? 640 : 880, 0.26, 'square', 0.04, t)); beep(180, 0.5, 'sawtooth', 0.04, 1.2); },
  kick: () => seq([[300, 0.18, 'sawtooth'], [220, 0.18, 'sawtooth'], [120, 0.5, 'square']])
};
function toggleSound() {
  soundEnabled = !soundEnabled;
  safeLS.set(STORAGE.sound, soundEnabled);
  $('soundToggle').innerText = soundEnabled ? '🔊' : '🔇';
  if (soundEnabled) SOUNDS.chip();
}

// ========== TOAST ==========
function showToast(title, message, type) {
  const c = $('toastContainer'); if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.innerHTML = `<b>${esc(title)}</b>${esc(message)}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

// ========== AVATAR ==========
const RACE_FILES = { Rimk: 'rimk.png', Sahrin: 'sahrin.png', Ferrum: 'ferrum.png', Nereid: 'nereid.png' };
function generateAvatarHTML(c) {
  if (!c) c = {};
  const layered = window.RimkAvatar && window.RimkAvatar.html(c);
  if (layered) return `<div style="position:relative;width:100%;height:100%;border-radius:inherit;overflow:hidden;">${layered}</div>`;
  const raceFile = RACE_FILES[c.race] || RACE_FILES.Rimk;
  return `<div style="position:relative;width:100%;height:100%;background:#000;"><img src="/images/${raceFile}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;" alt=""></div>`;
}
// Thrakk do Dealer e Thrakk da segurança (personagem "thraak" dos arquivos de avatar)
const DEALER_LOOK = { b: 'thraak', bg: null, i: ['olhos-scanner', 'roupa-bandana'] };
const SECURITY_LOOK = { b: 'thraak', bg: null, i: ['olhos-cool', 'fone-fone'] };
function paintThrakks() {
  const d = $('dealerAv'); if (d) d.innerHTML = generateAvatarHTML(DEALER_LOOK);
  const s = $('secAv'); if (s) s.innerHTML = generateAvatarHTML(SECURITY_LOOK);
}
function updatePreview() { const b = $('avatarPreview'); if (b) b.innerHTML = generateAvatarHTML(getStoredAvatar()); }

// ========== VIEWS ==========
function showView(v) {
  $('setupView').style.display = v === 'setup' ? 'block' : 'none';
  $('lobbyView').style.display = v === 'lobby' ? 'block' : 'none';
  $('gameView').style.display = v === 'game' ? 'block' : 'none';
  const back = $('backBtn');
  if (back) back.style.display = v === 'setup' ? '' : 'none';
}
function currentView() {
  if ($('gameView').style.display !== 'none') return 'game';
  if ($('lobbyView').style.display !== 'none') return 'lobby';
  return 'setup';
}
function toggleForm(type) {
  const bc = $('btnMenuCreate'), bj = $('btnMenuJoin'), fc = $('formCreate'), fj = $('formJoin');
  bc.classList.remove('active'); bj.classList.remove('active');
  fc.style.display = 'none'; fj.style.display = 'none';
  if (type === 'create') { bc.classList.add('active'); fc.style.display = 'block'; }
  else { bj.classList.add('active'); fj.style.display = 'block'; refreshRoomsList(); }
}

// ========== LOG / CHAT ==========
function addLine(cls, html) {
  ['lobbyChatBox', 'gameChatBox'].forEach(id => {
    const box = $(id); if (!box) return;
    const el = document.createElement('div');
    el.className = 'chat-msg ' + cls;
    el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 120) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  });
}
function sendChat(inputId) {
  const input = $(inputId); if (!input) return;
  const text = input.value.trim();
  if (!text || !currentRoom || !socket) return;
  socket.emit('bjChat', { code: currentRoom, text });
  input.value = '';
}

// ========== AÇÕES DE SALA ==========
function ensureConnected() {
  if (!socket) { showToast('⚠️ ERRO', 'Sem conexão com o servidor. Recarregue a página.', 'zunk'); return false; }
  if (!socket.connected) {
    showToast('📡 CONECTANDO', 'Ainda conectando ao servidor... tente de novo em instantes.', 'cyan');
    try { socket.connect(); } catch (e) {}
    return false;
  }
  return true;
}
let creating = false, creatingTimer = null;
function setCreating(on) {
  creating = on; clearTimeout(creatingTimer);
  const b = $('btnCreate'); if (b) { b.disabled = on; b.style.opacity = on ? '0.6' : ''; }
  if (on) creatingTimer = setTimeout(() => setCreating(false), 6000);
}
function createRoom() {
  if (creating) return;
  const name = $('username').value.trim();
  if (!name) return showToast('⚠️ ERRO', 'Digite seu nome!', 'zunk');
  if (!ensureConnected()) return;
  saveProfile(name);
  setCreating(true);
  socket.emit('bjCreate', { name, avatar: getStoredAvatar(), maxPlayers: parseInt($('maxPlayersInput').value, 10) || 4, clientId: CLIENT_ID });
}
function joinRoom() {
  const name = $('username').value.trim();
  if (!name) return showToast('⚠️ ERRO', 'Digite seu nome!', 'zunk');
  const code = $('roomCodeInput').value.trim().toUpperCase();
  if (!code) return showToast('⚠️ ERRO', 'Digite o código!', 'zunk');
  if (!ensureConnected()) return;
  saveProfile(name);
  socket.emit('bjJoin', { name, avatar: getStoredAvatar(), code, clientId: CLIENT_ID });
}
function joinByCode(code) { $('roomCodeInput').value = code; joinRoom(); }
function refreshRoomsList() { if (socket) socket.emit('bjListRooms'); }
function renderRoomsList(rooms) {
  const box = $('roomsListBox'); if (!box) return;
  if (!rooms || !rooms.length) { box.innerHTML = '<p class="rooms-empty">Nenhuma mesa com lugar livre no momento.<br>Crie uma e compartilhe o código!</p>'; return; }
  box.innerHTML = rooms.map(r => `
    <div class="room-card" onclick="joinByCode('${esc(r.code)}')">
      <div class="room-card-info">
        <div class="room-card-code">${esc(r.code)}</div>
        <div class="room-card-host">Host: ${esc(r.hostName)}</div>
        <div class="room-card-mode">${r.state === 'PLAYING' ? '🎰 Jogando (entre quando quiser)' : '⏳ No lobby'}${r.hasBots ? ' · 🤖 bots' : ''}</div>
      </div>
      <div class="room-card-players">${r.currentPlayers}/${r.maxPlayers} 👥</div>
      <div class="room-card-action">ENTRAR →</div>
    </div>`).join('');
}
function startGame() { if (currentRoom && socket) socket.emit('bjStart', { code: currentRoom }); }
function addBot() { if (currentRoom && socket) socket.emit('bjAddBot', { code: currentRoom }); }
function removeBot() { if (currentRoom && socket) socket.emit('bjRemoveBot', { code: currentRoom }); }
function leaveTable() {
  if (socket && currentRoom) socket.emit('bjLeave', { code: currentRoom });
  resetLocal();
  showView('setup');
}
function resetLocal() {
  currentRoom = null; S = null; lobbyData = null; pendingBet = 0; seen = new Set(); lastRound = -1; lastPhase = null; lastTurnKey = ''; statsRound = -1;
  ['lobbyChatBox', 'gameChatBox'].forEach(id => { const b = $(id); if (b) b.innerHTML = ''; });
  const rb = $('resultBanner'); if (rb) { rb.className = 'result-banner'; }
}

// ========== LOBBY ==========
function renderLobby(d) {
  lobbyData = d;
  const me = d.players.find(p => p.id === myId);
  $('displayRoomCode').innerText = d.code;
  $('queueCount').innerText = d.players.length + ' / ' + d.maxPlayers;
  let html = d.players.map(p => `
    <div class="lobby-player${p.id === myId ? ' me' : ''}">
      <div class="avatar-mini">${p.isBot ? '🤖' : generateAvatarHTML(p.avatar)}</div>
      <div><b>${esc(p.name)}</b>${p.id === myId ? ' <small>(Você)</small>' : ''}</div>
      <small style="color:var(--cyan-glow);">${p.isHost ? '👑 HOST' : (p.isBot ? 'BOT' : 'JOGADOR')}</small>
      ${p.disconnected ? '<div style="color:var(--alert-red);font-size:0.7em;">⚠ Desconectado</div>' : ''}
    </div>`).join('');
  for (let i = d.players.length; i < d.maxPlayers; i++) html += '<div class="lobby-player empty">lugar livre</div>';
  $('lobbyGrid').innerHTML = html;

  const isHost = !!(me && me.isHost);
  const hasBots = d.players.some(p => p.isBot);
  $('btnStart').style.display = isHost ? 'block' : 'none';
  $('btnAddBot').style.display = (isHost && d.players.length < d.maxPlayers) ? 'block' : 'none';
  $('btnRemoveBot').style.display = (isHost && hasBots) ? 'block' : 'none';
  $('lobbyHint').innerText = isHost
    ? (d.players.length === 1 ? 'Você pode abrir a mesa sozinho agora, ou adicionar bots / esperar amigos. Quem tem lugar livre ainda entra depois.' : '✅ Pronto! Abra a mesa quando quiser.')
    : 'Aguardando o host abrir a mesa...';
}

// ========== REGRAS (cliente, só para habilitar botões; o servidor valida tudo) ==========
const rankVal = (r) => r === 'A' ? 11 : (['K', 'Q', 'J', '10'].includes(r) ? 10 : parseInt(r, 10));

// ========== RENDER DA MESA ==========
const PHASE_TXT = {
  BETTING: '💰 Façam suas apostas', DEALING: '🃏 Distribuindo cartas', INSURANCE: '🛡 Seguro?', PEEK: '🔍 Dealer confere...',
  PLAYER: '🎯 Vez dos jogadores', DEALER: '🛸 Vez do Dealer', RESULT: '📊 Resultado', IDLE: '⏳ Aguardando'
};

function cardHTML(c, key, delay) {
  const isNew = key && !seen.has(key);
  if (key) seen.add(key);
  if (c.hidden) return `<div class="card back${isNew ? ' deal' : ''}" style="--d:${delay || 0}s"></div>`;
  const red = c.s === '♥' || c.s === '♦';
  return `<div class="card${red ? ' red' : ''}${isNew ? ' deal' : ''}" style="--d:${delay || 0}s"><span class="cr">${esc(c.r)}</span><span class="cs">${esc(c.s)}</span><span class="cc">${esc(c.s)}</span></div>`;
}
function totalLabel(h) {
  if (!h.cards.length) return '';
  if (h.bust) return `<span class="total bust">${h.total}</span>`;
  if (h.bj) return '<span class="total twentyone">21</span>';
  const t = (h.soft && h.total < 21 && h.cards.length > 1) ? `${h.total - 10}/${h.total}` : h.total;
  return `<span class="total${h.total === 21 ? ' twentyone' : ''}">${t}</span>`;
}
function resultBadge(h) {
  const map = { win: 'VENCEU', blackjack: 'BLACKJACK', lose: 'PERDEU', push: 'EMPATE', bust: 'ESTOUROU', surrender: 'DESISTIU' };
  if (!h.result) return h.bj ? '<span class="badge blackjack">BLACKJACK</span>' : (h.doubled ? '<span class="badge neutral">×2</span>' : '');
  const net = h.net > 0 ? ` +${h.net}` : (h.net < 0 ? ` ${h.net}` : '');
  return `<span class="badge ${h.result}">${map[h.result] || ''}${net}</span>`;
}

function renderTable(st) {
  S = st;
  const me = st.players.find(p => p.id === myId);

  // nova rodada: zera o controle de animação
  if (st.round !== lastRound) { seen = new Set(); lastRound = st.round; pendingBet = 0; }
  const seenBefore = seen.size;

  $('gvCode').innerText = st.code;
  $('gvRound').innerText = st.round;
  const pct = Math.max(0, Math.min(100, Math.round(st.shoeLeft / st.shoeTotal * 100)));
  $('shoeFill').style.width = pct + '%';
  $('shoeTxt').innerText = st.shoeLeft;

  let phaseText = PHASE_TXT[st.phase] || '—';
  if (st.phase === 'PLAYER' && st.turn) {
    const tp = st.players.find(p => p.id === st.turn.id);
    if (tp) phaseText = tp.id === myId ? '🎯 SUA VEZ!' : `🎯 Vez de ${tp.name}`;
  }
  $('phaseLabel').innerText = phaseText;

  const isHost = !!(me && me.isHost);
  $('btnAddBotG').style.display = (isHost && st.players.filter(p => !p.gone).length < st.maxPlayers) ? '' : 'none';
  $('btnRemoveBotG').style.display = (isHost && st.players.some(p => p.isBot && !p.gone)) ? '' : 'none';

  // ----- Dealer -----
  const d = st.dealer;
  let dh = '';
  d.cards.forEach((c, i) => {
    const key = `d:${st.round}:${i}:${c.hidden ? 'h' : 'v'}`;
    const isFlip = !c.hidden && i === 1 && !seen.has(key);
    let html = cardHTML(c, key, i * 0.35);
    if (isFlip && seen.has(`d:${st.round}:${i}:h`)) html = html.replace('class="card', 'class="card flip').replace(' deal', '');
    dh += html;
  });
  $('dealerCards').innerHTML = dh;
  let di = '';
  if (d.cards.length) {
    di = d.bust ? `<span class="total bust">${d.total}</span><span class="badge bust">ESTOUROU</span>`
      : d.bj ? '<span class="total twentyone">21</span><span class="badge blackjack">BLACKJACK</span>'
      : `<span class="total${d.total === 21 ? ' twentyone' : ''}">${d.soft && d.total < 21 && d.cards.length > 1 && d.reveal ? (d.total - 10) + '/' + d.total : d.total}</span>`;
  }
  $('dealerInfo').innerHTML = di;
  const dav = $('dealerAv');
  if (dav) { dav.classList.toggle('active', st.phase === 'DEALER' || st.phase === 'PEEK'); dav.classList.toggle('bust', !!d.bust); }

  // ----- Assentos -----
  $('seats').innerHTML = st.players.filter(p => !p.gone || p.hands.length).map(p => seatHTML(p, st)).join('');

  // ----- Timer -----
  setTimerText(st.timeLeft);

  renderControls(st, me);

  // ----- Sons por diferença de estado -----
  if (seen.size > seenBefore) SOUNDS.card();
  if (st.phase === 'PLAYER' && st.turn && st.turn.id === myId) {
    const k = st.round + ':' + st.turn.hand + ':' + (me ? me.hands.map(h => h.cards.length).join(',') : '');
    if (k !== lastTurnKey) { lastTurnKey = k; SOUNDS.turn(); }
  }
  if (st.phase === 'RESULT' && lastPhase !== 'RESULT') onRoundResult(st, me);
  if (st.phase === 'DEALER' && lastPhase !== 'DEALER') SOUNDS.flip();
  lastPhase = st.phase;
}

function seatHTML(p, st) {
  const isTurn = st.phase === 'PLAYER' && st.turn && st.turn.id === p.id;
  const cls = ['seat', p.id === myId ? 'me' : '', isTurn ? 'turn' : '', (p.status !== 'active' && !p.hands.length) || p.gone ? 'out' : ''].join(' ');
  const multi = p.hands.length > 1;
  let body = '';
  if (p.hands.length) {
    body = `<div class="hands${multi ? ' multi' : ''}">` + p.hands.map((h, hi) => {
      const active = isTurn && st.turn.hand === hi && !h.done;
      const cards = h.cards.map((c, i) => cardHTML(c, `${p.id}:${st.round}:${hi}:${i}`, (i * 0.35) + (hi * 0.1))).join('');
      return `<div class="hand${active ? ' active' : ''}"><div class="cards">${cards}</div>
        <div class="hand-info">${totalLabel(h)}${resultBadge(h)}</div>
        ${multi || h.doubled ? `<div class="hand-bet">🪙 ${h.bet}</div>` : ''}</div>`;
    }).join('') + '</div>';
  }
  let status = '';
  if (p.gone) status = 'saiu da mesa';
  else if (p.disconnected) status = '⚠ desconectado';
  else if (st.phase === 'BETTING') status = p.status !== 'active' ? 'entra na próxima' : (p.betLocked ? '✔ apostou' : 'apostando...');
  else if (!p.hands.length) status = p.status === 'waiting' ? 'entra na próxima rodada' : 'fora desta rodada';
  else if (st.phase === 'INSURANCE' && p.insurance) status = '🛡 com seguro';
  else if (st.phase === 'RESULT') status = p.roundNet > 0 ? `<b style="color:#00ff99">+${p.roundNet} 🪙</b>` : (p.roundNet < 0 ? `<b style="color:var(--alert-red)">${p.roundNet} 🪙</b>` : 'empate');
  const betTxt = p.bet ? `<span class="stack">🪙 ${p.bet}</span>${p.insurance ? ` <span class="stack" title="Seguro">🛡 ${p.insurance}</span>` : ''}` : '';
  return `<div class="${cls}">
    <div class="seat-head">
      <div class="seat-av">${p.isBot ? '🤖' : generateAvatarHTML(p.avatar)}</div>
      <div><div class="seat-name">${esc(p.name)}${p.isHost ? ' 👑' : ''}</div><div class="seat-chips${p.chips < 0 ? ' neg' : ''}">🪙 ${p.chips}${p.chips < 0 ? ' (fiado)' : ''}${p.id === myId ? ' · <span style="color:var(--cyan-glow)">você</span>' : ''}${p.streak >= 3 ? `<span class="streak-tag">🔥 ${p.streak}</span>` : ''}</div></div>
    </div>
    <div class="seat-bet">${betTxt}</div>
    ${body}
    <div class="seat-status">${status}</div>
  </div>`;
}

function setTimerText(t) {
  const el = $('gvTimer'); if (!el) return;
  const show = S && ['BETTING', 'INSURANCE', 'PLAYER', 'RESULT'].includes(S.phase);
  el.innerText = show && t != null ? Math.max(0, t) : '--';
  el.classList.toggle('low', !!show && t != null && t <= 5 && S.phase !== 'RESULT');
}

// ========== CONTROLES ==========
function renderControls(st, me) {
  const box = $('controls');
  const set = (html) => { box.innerHTML = html; };
  if (!me) return set('<div class="ctrl-sub">Você está assistindo a mesa.</div>');
  const lim = st.limits;

  if (st.phase === 'BETTING') {
    if (me.status !== 'active') return set('<div class="ctrl-title">AGUARDE</div><div class="ctrl-sub">Você entra na próxima rodada.</div>');
    if (me.betLocked) return set(`<div class="ctrl-title">APOSTA CONFIRMADA</div><div class="bet-display">🪙 ${me.bet}</div><div class="ctrl-sub">Aguardando os outros jogadores...</div>`);
    const maxBet = lim.max;       // pode apostar no fiado (saldo negativo)
    if (pendingBet > maxBet) pendingBet = maxBet;
    const chips = [10, 20, 50, 100, 500].map(v => `<button class="chip c${v}" onclick="addChip(${v})" ${pendingBet + v > maxBet ? 'disabled' : ''}>${v}</button>`).join('');
    return set(`
      <div class="ctrl-title">SUA APOSTA (${lim.min} – ${lim.max})</div>
      <div class="chips-row">${chips}</div>
      <div class="bet-display">🪙 ${pendingBet}</div>
      <div class="btn-row">
        <button onclick="clearBet()" ${pendingBet ? '' : 'disabled'}>🧹 LIMPAR</button>
        <button onclick="repeatBet()" ${lastBet ? '' : 'disabled'}>🔁 REPETIR ${lastBet || ''}</button>
        <button onclick="allInBet()">⬆ MÁXIMO</button>
        <button class="act-hit" onclick="confirmBet()" ${pendingBet >= lim.min ? '' : 'disabled'}>✔ APOSTAR</button>
      </div>
      ${balanceLine(me, st)}`);
  }

  if (st.phase === 'INSURANCE') {
    if (me.betLocked && !me.insuranceAnswered) {
      const cost = me.bet / 2;
      const ok = !(me.hands[0] && me.hands[0].bj);
      return set(`
        <div class="ctrl-title">🛡 O DEALER MOSTRA UM ÁS</div>
        <div class="ctrl-sub">Quer pagar o seguro de 🪙 ${cost}? Se o Dealer tiver blackjack, ele paga 2:1.</div>
        <div class="btn-row">
          <button class="act-stand" onclick="answerInsurance(false)">NÃO, OBRIGADO</button>
          <button class="act-hit" onclick="answerInsurance(true)" ${ok ? '' : 'disabled'}>SIM, SEGURO</button>
        </div>`);
    }
    return set('<div class="ctrl-title">🛡 SEGURO</div><div class="ctrl-sub">Aguardando as decisões...</div>');
  }

  if (st.phase === 'PLAYER' && st.turn && st.turn.id === myId) {
    const h = me.hands[st.turn.hand];
    if (h && !h.done) {
      const two = h.cards.length === 2;
      const canDouble = two && !h.splitAces;
      const canSplit = two && !h.splitAces && me.hands.length < 4 && rankVal(h.cards[0].r) === rankVal(h.cards[1].r);
      const canSurr = me.hands.length === 1 && two && !h.surrendered && st.dealer.cards.length === 2 && !h.acted;
      const label = me.hands.length > 1 ? `Mão ${st.turn.hand + 1} de ${me.hands.length}` : 'Sua jogada';
      return set(`
        <div class="ctrl-title">🎯 ${label.toUpperCase()}</div>
        <div class="btn-row">
          <button class="act-btn act-hit" onclick="act('hit')">PEDIR<small>[H]</small></button>
          <button class="act-btn act-stand" onclick="act('stand')">PARAR<small>[S]</small></button>
          <button class="act-btn act-double" onclick="act('double')" ${canDouble ? '' : 'disabled'}>DOBRAR<small>[D]</small></button>
          <button class="act-btn act-split" onclick="act('split')" ${canSplit ? '' : 'disabled'}>DIVIDIR<small>[P]</small></button>
          <button class="act-btn act-surr" onclick="act('surrender')" ${canSurr ? '' : 'disabled'}>DESISTIR<small>[R]</small></button>
        </div>
        <div class="ctrl-sub">Aposta nesta mão: 🪙 ${h.bet} · Saldo: <span class="${me.chips < 0 ? 'neg-text' : ''}">🪙 ${me.chips}</span></div>`);
    }
  }

  if (st.phase === 'RESULT') {
    const nxt = '<div class="ctrl-sub">Próxima rodada já já...</div>';
    if (me.betLocked || me.hands.length) {
      const n = me.roundNet;
      return set(`<div class="ctrl-title">${n > 0 ? '🏆 VOCÊ GANHOU ' + n : n < 0 ? '💀 VOCÊ PERDEU ' + Math.abs(n) : '🤝 EMPATE'}</div><div class="bet-display ${me.chips < 0 ? 'neg-text' : ''}">🪙 ${me.chips}</div>${me.chips < st.limits.debt ? '<div class="debt-warn">💸 Você passou do limite de ' + st.limits.debt + ' e será expulso da mesa.</div>' : ''}${nxt}`);
    }
    return set(`<div class="ctrl-title">RODADA ENCERRADA</div>${nxt}`);
  }

  const who = st.phase === 'PLAYER' && st.turn ? (st.players.find(p => p.id === st.turn.id) || {}).name : '';
  const msg = st.phase === 'PLAYER' ? `Aguardando ${esc(who || 'jogador')}...` : (PHASE_TXT[st.phase] || '...');
  set(`<div class="ctrl-title">${msg}</div>${balanceLine(me, st)}`);
}
function balanceLine(me, st) {
  const neg = me.chips < 0;
  return `<div class="ctrl-sub">Seu saldo: <b class="${neg ? 'neg-text' : ''}">🪙 ${me.chips}</b></div>` +
    (neg ? `<div class="debt-warn">⚠️ Você está no negativo (fiado). Se passar de ${st.limits.debt} fichas, é expulso da mesa!</div>` : '');
}

function addChip(v) {
  if (!S) return;
  const me = S.players.find(p => p.id === myId); if (!me) return;
  const maxBet = S.limits.max;
  if (pendingBet + v > maxBet) return;
  pendingBet += v; SOUNDS.chip(); renderControls(S, me);
}
function clearBet() { pendingBet = 0; const me = S && S.players.find(p => p.id === myId); if (me) renderControls(S, me); }
function repeatBet() { if (!S) return; const me = S.players.find(p => p.id === myId); if (!me) return; pendingBet = Math.min(lastBet, S.limits.max); SOUNDS.chip(); renderControls(S, me); }
function allInBet() { if (!S) return; const me = S.players.find(p => p.id === myId); if (!me) return; pendingBet = S.limits.max; SOUNDS.chip(); renderControls(S, me); }
function confirmBet() {
  if (!S || !currentRoom || pendingBet < S.limits.min) return;
  lastBet = pendingBet;
  socket.emit('bjBet', { code: currentRoom, amount: pendingBet });
  pendingBet = 0; SOUNDS.chip();
}
function answerInsurance(take) { if (currentRoom) socket.emit('bjInsurance', { code: currentRoom, take }); }
function act(action) { if (currentRoom && socket) socket.emit('bjAction', { code: currentRoom, action }); }

document.addEventListener('keydown', (e) => {
  if (!S || S.phase !== 'PLAYER' || !S.turn || S.turn.id !== myId) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
  const map = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' };
  const a = map[e.key.toLowerCase()];
  if (!a) return;
  const btn = document.querySelector(`#controls .act-btn[onclick="act('${a}')"]`);
  if (btn && !btn.disabled) act(a);
});

// ========== RESULTADO DA RODADA ==========
function onRoundResult(st, me) {
  if (!me || !me.hands.length) return;
  const n = me.roundNet;
  const anyBJ = me.hands.some(h => h.result === 'blackjack');
  const allBust = me.hands.every(h => h.result === 'bust');
  let cls, title;
  if (anyBJ) { cls = 'blackjack'; title = '🂡 BLACKJACK!'; SOUNDS.blackjack(); }
  else if (n > 0) { cls = 'win'; title = '🏆 VOCÊ VENCEU!'; SOUNDS.win(); }
  else if (n < 0) { cls = 'lose'; title = allBust ? '💥 ESTOUROU!' : '💀 PERDEU'; allBust ? SOUNDS.bust() : SOUNDS.lose(); }
  else { cls = 'push'; title = '🤝 EMPATE'; SOUNDS.push(); }
  const b = $('resultBanner');
  b.className = 'result-banner';
  void b.offsetWidth;
  b.innerHTML = `${title}<small>${n > 0 ? '+' + n : n} fichas</small>`;
  b.className = 'result-banner show ' + cls;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.className = 'result-banner'; }, 3500);
  recordStats(st, me);
}

// ========== ESTATÍSTICAS (salvas no navegador, aparecem no perfil do Rimkerama) ==========
function loadStats() {
  let s = {};
  try { s = JSON.parse(safeLS.get(STORAGE.stats) || '{}'); } catch (e) {}
  return Object.assign({ rounds: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, busts: 0, bestWin: 0, net: 0, peak: 0, bestStreak: 0, low: 0 }, s);
}
function recordStats(st, me) {
  if (statsRound === st.round + ':' + st.code) return;
  statsRound = st.round + ':' + st.code;
  const s = loadStats();
  s.rounds++;
  if (me.roundNet > 0) s.wins++; else if (me.roundNet < 0) s.losses++; else s.pushes++;
  s.blackjacks += me.hands.filter(h => h.result === 'blackjack').length;
  s.busts += me.hands.filter(h => h.result === 'bust').length;
  s.bestWin = Math.max(s.bestWin, me.roundNet);
  s.net += me.roundNet;
  s.peak = Math.max(s.peak, me.chips);
  s.low = Math.min(s.low, me.chips);
  s.bestStreak = Math.max(s.bestStreak, me.streak || 0);
  safeLS.set(STORAGE.stats, JSON.stringify(s));
  renderStats();
}
function renderStats() {
  const s = loadStats(); const box = $('statsBox'); if (!box) return;
  const pct = s.rounds ? Math.round(s.wins / s.rounds * 100) : 0;
  box.innerHTML = [
    [s.rounds, 'Rodadas'], [pct + '%', 'Vitórias'], [s.blackjacks, 'Blackjacks'], [s.busts, 'Estouros'],
    [s.bestWin, 'Maior ganho'], [s.peak, 'Pico de fichas'], [s.bestStreak, 'Maior sequência'], [s.low, 'Pior saldo']
  ].map(x => `<div class="stat"><b>${x[0]}</b><small>${x[1]}</small></div>`).join('');
}

// ========== THRAKK DA SEGURANÇA ==========
let secTimer = null;
function showSecurity(d) {
  const el = $('security'), bub = $('secBubble'), flash = $('alarmFlash');
  if (!el || !bub) return;
  paintThrakks();
  bub.innerHTML = `${esc(d.phrase)}<small>${esc(d.name)} venceu ${d.streak} seguidas</small>`;
  el.classList.remove('show'); flash.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('show'); flash.classList.add('on');
  SOUNDS.siren();
  clearTimeout(secTimer);
  secTimer = setTimeout(() => { el.classList.remove('show'); flash.classList.remove('on'); }, 5300);
}

// ========== SOCKET ==========
if (socket) {
  socket.on('connect', () => {
    myId = socket.id;
    socket.emit('identify', { clientId: CLIENT_ID });
    socket.emit('bjIdentify', { clientId: CLIENT_ID });
  });

  socket.on('bjReconnected', (d) => {
    currentRoom = d.code; setCreating(false);
    showView(d.state === 'PLAYING' ? 'game' : 'lobby');
    showToast('📡 RECONECTADO', 'Você voltou para a mesa ' + d.code + '.', 'cyan');
  });
  socket.on('bjNoSession', () => {
    if (!currentRoom) return;
    resetLocal(); showView('setup');
    showToast('⚠️ MESA ENCERRADA', 'Você ficou tempo demais offline e saiu da mesa.', 'zunk');
  });
  socket.on('errorMsg', (msg) => { setCreating(false); showToast('⚠️ ERRO', msg, 'zunk'); });
  socket.on('bjActionDenied', () => showToast('⚠️', 'Essa jogada não é permitida agora.', 'zunk'));
  socket.on('bjRoomsList', (d) => renderRoomsList(d.rooms));

  socket.on('bjJoined', (d) => {
    setCreating(false);
    currentRoom = d.code;
    $('displayRoomCode').innerText = d.code;
    if (currentView() === 'setup') showView('lobby');
  });
  socket.on('bjLobby', (d) => {
    if (currentRoom !== d.code) return;
    renderLobby(d);
    if (d.state === 'PLAYING' && currentView() === 'lobby') showView('game');
  });
  socket.on('bjStarted', () => { showView('game'); renderStats(); });
  socket.on('bjState', (st) => {
    if (currentRoom !== st.code) return;
    if (currentView() !== 'game') { showView('game'); renderStats(); }
    renderTable(st);
  });
  socket.on('bjTimer', (t) => { if (S) { S.timeLeft = t; setTimerText(t); } });

  socket.on('bjSecurity', (d) => showSecurity(d));
  socket.on('bjKicked', (d) => {
    SOUNDS.kick();
    resetLocal(); showView('setup');
    showToast('🚪 EXPULSO DA MESA', `Seu saldo chegou a ${d.chips} (limite ${d.limit}). A segurança te acompanhou até a saída.`, 'zunk');
  });
  socket.on('bjLog', (m) => addLine(m.tipo || 'info', esc(m.text)));
  socket.on('bjChat', (m) => {
    const col = '#99ff00';
    addLine('chat', `<b style="color:${col}">${esc(m.sender)}:</b> ${esc(m.text)}`);
    SOUNDS.chat();
  });

  socket.on('disconnect', () => {
    showToast('⚠️ CONEXÃO PERDIDA', 'Tentando reconectar... (se não voltar, recarregue a página)', 'zunk');
    setCreating(false);
  });
}

// ========== INIT ==========
window.addEventListener('DOMContentLoaded', () => {
  const name = getStoredName();
  if (name) { const input = $('username'); if (input) input.value = name; }
  updatePreview();
  paintThrakks();
  // a conta carrega depois da página: repinta o personagem assim que o avatar chegar
  if (window.Conta && Conta.ready && Conta.ready.then) Conta.ready.then(() => { updatePreview(); paintThrakks(); if (S) renderTable(S); }).catch(() => {});
  $('soundToggle').innerText = soundEnabled ? '🔊' : '🔇';
  document.addEventListener('click', () => initAudio(), { once: true });
  ['lobbyChatInput', 'gameChatInput'].forEach(id => {
    const i = $(id); if (i) i.addEventListener('keypress', e => { if (e.key === 'Enter') sendChat(id); });
  });
  const code = $('roomCodeInput'); if (code) code.addEventListener('keypress', e => { if (e.key === 'Enter') joinRoom(); });
  renderStats();
});
