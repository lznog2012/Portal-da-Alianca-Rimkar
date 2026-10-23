// ==================================================
// ESTAÇÃO ALPHA - HOME
// ==================================================

const socket = typeof io !== 'undefined' ? io() : null;

const STORAGE = {
  clientId: 'alpha_clientId',
  name: 'alpha_name',
  avatar: 'alpha_avatar',
  race: 'alpha_race'
};

// ========== MAPA DE RAÇAS ==========
const RACE_FILES = {
  'Rimk':   'rimk.png',
  'Sahrin': 'sahrin.png',
  'Ferrum': 'ferrum.png',
  'Nereid': 'nereid.png'
};

const DEFAULT_RACE = 'Rimk';

// ========== CLIENT ID ==========
function getClientId() {
  let id = localStorage.getItem(STORAGE.clientId);
  if (!id) {
    id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(STORAGE.clientId, id);
  }
  return id;
}
const CLIENT_ID = getClientId();

// ========== PERFIL ==========
function getProfile() {
  return {
    name: localStorage.getItem(STORAGE.name) || '',
    race: localStorage.getItem(STORAGE.race) || DEFAULT_RACE,
    avatar: (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE.avatar) || '{}'); }
      catch (e) { return {}; }
    })()
  };
}

function renderProfileCorner() {
  const p = getProfile();
  const nameEl = document.getElementById('profileName');
  const avatarEl = document.getElementById('profileAvatar');
  if (!nameEl || !avatarEl) return;

  if (p.name) {
    nameEl.innerText = p.name;
    nameEl.classList.remove('empty');
  } else {
    nameEl.innerText = 'Definir perfil';
    nameEl.classList.add('empty');
  }

  // avatar da CONTA (só aqui, antes dos jogos); sem conta/avatar, segue o personagem do universo
  avatarEl.innerHTML = (window.Conta && Conta.avatarHTML && Conta.avatarHTML()) || generateMiniAvatar(p.avatar, p.race);
}

// ========== GERADOR DE AVATAR ==========
// Camadas: fundo → cabeça (raça) → traje → acessório
function generateMiniAvatar(c, race) {
  if (!c) c = {};
  if (!race) race = DEFAULT_RACE;

  const raceFile = RACE_FILES[race] || RACE_FILES[DEFAULT_RACE];

  const bg = (c.bg && c.bg !== 'none')
    ? `<img src="/images/${c.bg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;" />`
    : '';

  const head = `<img src="/images/${raceFile}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;" />`;

  const suit = (c.suit && c.suit !== 'none')
    ? `<img src="/images/${c.suit}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:3;" />`
    : '';

  const eyewear = (c.eyewear && c.eyewear !== 'none')
    ? `<img src="/images/${c.eyewear}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:4;" />`
    : '';

  return `<div style="position:relative;width:100%;height:100%;background:#000;">${bg}${head}${suit}${eyewear}</div>`;
}

// ========== MODAL DE PERFIL ==========
function getModalCustomization() {
  const v = id => {
    const el = document.getElementById(id);
    return el ? (el.value || 'none') : 'none';
  };
  const raceEl = document.querySelector('.race-option.selected');
  const race = raceEl ? raceEl.dataset.race : DEFAULT_RACE;

  return {
    race,
    eyewear: v('modalOptEyewear'),
    suit: v('modalOptSuit'),
    bg: v('modalOptBg')
  };
}

function setModalCustomization(c) {
  if (!c) c = {};
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || 'none';
  };
  set('modalOptEyewear', c.eyewear);
  set('modalOptSuit', c.suit);
  set('modalOptBg', c.bg);

  // Marca a raça selecionada
  const race = c.race || DEFAULT_RACE;
  document.querySelectorAll('.race-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.race === race);
  });
}

function selectRace(race) {
  document.querySelectorAll('.race-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.race === race);
  });
  updateModalPreview();
}

function updateModalPreview() {
  const box = document.getElementById('modalAvatarPreview');
  if (!box) return;
  const c = getModalCustomization();
  box.innerHTML = generateMiniAvatar(c, c.race);
}

function openProfileModal() {
  const p = getProfile();
  const input = document.getElementById('modalUsername');
  if (input) input.value = p.name || '';

  // Combina a raça salva com o avatar salvo
  setModalCustomization({ ...p.avatar, race: p.race });
  updateModalPreview();

  // Mostra histórico se tiver
  const statsBox = document.getElementById('profileHistoryStats');
  const statsBoxContainer = document.getElementById('profileHistoryBox');
  if (statsBox && statsBoxContainer) {
    let h = [];
    try { h = JSON.parse(localStorage.getItem('alpha_history') || '[]'); } catch (e) {}
    let hasBj = false;
    try { hasBj = (JSON.parse(localStorage.getItem('alpha_bj_stats') || '{}').rounds || 0) > 0; } catch (e) {}
    if (h.length || hasBj) {
      statsBoxContainer.style.display = 'block';
      renderProfileHistory(statsBox, h);
    } else {
      statsBoxContainer.style.display = 'none';
    }
  }

  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.add('open');
}

function renderProfileHistory(el, h) {
  // Separa por jogo (registros antigos sem `game` contam como dedução)
  const deducao = h.filter(x => !x.game || x.game === 'deducao');
  const ludo = h.filter(x => x.game === 'ludo');

  const buildStats = (arr) => ({
    total: arr.length,
    wins: arr.filter(x => x.won).length
  });

  const g = buildStats(h);
  let bj = {};
  try { bj = JSON.parse(localStorage.getItem('alpha_bj_stats') || '{}'); } catch (e) {}
  const bjRounds = bj.rounds || 0, bjWins = bj.wins || 0;
  const d = buildStats(deducao);
  const l = buildStats(ludo);

  // Dedução: vitórias como Rimk vs Zunk
  const dedRimk = deducao.filter(x => x.myFaction === 'RIMK');
  const dedZunk = deducao.filter(x => x.myFaction === 'ZUNK');
  const dedWRimk = dedRimk.filter(x => x.won).length;
  const dedWZunk = dedZunk.filter(x => x.won).length;

  // Ludo: vitórias modo A vs modo B
  const ludoA = ludo.filter(x => x.mode === 'A');
  const ludoB = ludo.filter(x => x.mode === 'B');
  const ludoWA = ludoA.filter(x => x.won).length;
  const ludoWB = ludoB.filter(x => x.won).length;

  el.innerHTML = `
    <div class="history-section">
      <div class="history-group-title">🌌 GERAL</div>
      <div class="history-stats">
        <div class="history-stat"><b>${g.wins + bjWins}/${g.total + bjRounds}</b><small>VITÓRIAS</small></div>
      </div>
    </div>

    <div class="history-section">
      <div class="history-group-title">🛸 RIMKS VS ZUNKS</div>
      <div class="history-stats">
        <div class="history-stat"><b>${d.wins}/${d.total}</b><small>TOTAL</small></div>
        <div class="history-stat"><b>${dedWRimk}/${dedRimk.length}</b><small>COMO RIMK</small></div>
        <div class="history-stat"><b>${dedWZunk}/${dedZunk.length}</b><small>COMO ZUNK</small></div>
      </div>
    </div>

    <div class="history-section">
      <div class="history-group-title">🎲 LUDO DA ALIANÇA</div>
      <div class="history-stats">
        <div class="history-stat"><b>${l.wins}/${l.total}</b><small>TOTAL</small></div>
        <div class="history-stat"><b>${ludoWA}/${ludoA.length}</b><small>MODO A</small></div>
        <div class="history-stat"><b>${ludoWB}/${ludoB.length}</b><small>MODO B</small></div>
      </div>
    </div>

    ${bjRounds ? `
    <div class="history-section">
      <div class="history-group-title">🃏 BLACKJACK 21</div>
      <div class="history-stats">
        <div class="history-stat"><b>${bjWins}/${bjRounds}</b><small>RODADAS</small></div>
        <div class="history-stat"><b>${bj.blackjacks || 0}</b><small>BLACKJACKS</small></div>
        <div class="history-stat"><b>${bj.peak || 0}</b><small>PICO DE FICHAS</small></div>
      </div>
    </div>` : ''}
  `;
}

function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.remove('open');
}

function saveProfileFromModal() {
  const input = document.getElementById('modalUsername');
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    alert('Por favor, digite um nome!');
    return;
  }
  const custom = getModalCustomization();
  localStorage.setItem(STORAGE.name, name);
  localStorage.setItem(STORAGE.race, custom.race);
  localStorage.setItem(STORAGE.avatar, JSON.stringify({
    eyewear: custom.eyewear,
    suit: custom.suit,
    bg: custom.bg
  }));
  renderProfileCorner();
  closeProfileModal();
}

// ========== SOCKET: STATUS BAR ==========
if (socket) {
  socket.on('connect', () => {
    socket.emit('identify', { clientId: CLIENT_ID });
    socket.emit('requestStats');
  });

  socket.on('statsUpdate', (data) => {
    const onlineEl = document.getElementById('onlineCount');
    const roomsEl = document.getElementById('activeRooms');
    if (onlineEl) onlineEl.innerText = data.onlinePlayers ?? 0;
    if (roomsEl) roomsEl.innerText = data.activeRooms ?? 0;
  });
}

// ========== INIT ==========
window.addEventListener('DOMContentLoaded', () => {
  renderProfileCorner();

  // Enter no modal salva
  const input = document.getElementById('modalUsername');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveProfileFromModal();
    });
  }

  // Clica fora do modal fecha
  const modal = document.getElementById('profileModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeProfileModal();
    });
  }

  // Atualiza preview do avatar sempre que mudar os selects
  ['modalOptEyewear', 'modalOptSuit', 'modalOptBg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateModalPreview);
  });

  // Preview inicial (mesmo fechado, pra estar pronto ao abrir)
  updateModalPreview();
});

// ============================================
// INTRO CINEMATOGRÁFICA (só na 1ª visita)
// ============================================
const INTRO_KEY = 'alpha_intro_seen';

function skipIntro() {
  const intro = document.getElementById('loreIntro');
  if (!intro) return;
  intro.classList.add('hidden');
  localStorage.setItem(INTRO_KEY, 'true');
  setTimeout(() => intro.remove(), 900);
}

window.addEventListener('DOMContentLoaded', () => {
  const intro = document.getElementById('loreIntro');
  if (!intro) return;

  const jaViu = localStorage.getItem(INTRO_KEY) === 'true';

  if (jaViu) {
    intro.remove();
  }
  // Se for 1ª visita: a intro fica até o usuário clicar em "Iniciar Treinamento"
});

// ============================================
// SISTEMA DE ÁUDIO UNIVERSAL (funciona em mobile)
// ============================================

let audioCtxHome = null;
let audioUnlocked = false;
let ambientHome = null;

function initAudioHome() {
  if (audioCtxHome) return;
  try {
    audioCtxHome = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {}
}

// Desbloqueia o áudio na primeira interação (obrigatório no mobile)
function unlockAudio() {
  if (audioUnlocked) return;
  initAudioHome();
  if (!audioCtxHome) return;

  if (audioCtxHome.state === 'suspended') {
    audioCtxHome.resume().then(() => {
      audioUnlocked = true;
      // Toca a intro do fliperama assim que desbloquear
      playArcadeIntro();
    });
  } else {
    audioUnlocked = true;
    playArcadeIntro();
  }
}

// Registra os eventos de desbloqueio
['click', 'touchstart', 'keydown'].forEach(evt => {
  document.addEventListener(evt, unlockAudio, { once: true, passive: true });
});

// ============================================
// BIBLIOTECA DE SONS
// ============================================
function playSound(freq, duration, type, vol) {
  if (!audioCtxHome || !audioUnlocked) return;
  try {
    const osc = audioCtxHome.createOscillator();
    const gain = audioCtxHome.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.04, audioCtxHome.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtxHome.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtxHome.destination);
    osc.start();
    osc.stop(audioCtxHome.currentTime + duration);
  } catch (e) {}
}

function playSeq(notes) {
  if (!audioCtxHome || !audioUnlocked) return;
  let t = 0;
  notes.forEach(n => {
    setTimeout(() => playSound(n[0], n[1], n[2] || 'square', n[3] || 0.04), t);
    t += n[1] * 1000 * 0.85;
  });
}

// ============================================
// SONS ESPECÍFICOS
// ============================================

// Som de hover (blip curtinho)
function soundHover() {
  playSound(1400, 0.04, 'square', 0.025);
}

// Som de click (coin insert!)
function soundClick() {
  playSeq([[1600, 0.04, 'square', 0.05], [2000, 0.06, 'square', 0.04]]);
}

// Intro do fliperama — sequência clássica de arcade
function playArcadeIntro() {
  // "Coin drop" + "ready" + jingle curto
  playSeq([
    [2000, 0.05, 'square', 0.06],   // tink
    [1200, 0.06, 'square', 0.05],   // coin clink
    [1600, 0.04, 'square', 0.04],   // blip
    [2200, 0.15, 'triangle', 0.05], // ready
    [1760, 0.08, 'square', 0.05],   // jingle start
    [2200, 0.08, 'square', 0.05],
    [2640, 0.12, 'square', 0.06],
    [2200, 0.25, 'triangle', 0.05]
  ]);
}

// Som de abertura de card/modal
function soundOpen() {
  playSeq([[880, 0.05], [1320, 0.08], [1760, 0.1]]);
}

// Som de fechar
function soundClose() {
  playSeq([[1760, 0.05], [1320, 0.06], [880, 0.08]]);
}

// ============================================
// APLICA SONS EM TODOS OS ELEMENTOS INTERATIVOS
// ============================================
function attachSounds() {
  // Elementos que recebem som de hover + click
  const selectors = [
    'button',
    'a',
    '.game-card',
    '.partner-card',
    '.profile-corner',
    '.radio-corner',
    '.lore-banner',
    '.rimkerama-games .game-card',
    '.intro-start',
    '.intro-skip',
    '.modal-actions button',
    '.race-option',
    '.mode-option',
    '.library-banner',
    '.library-quickbtn',
  ];

  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (el.dataset.soundAttached) return;
      el.dataset.soundAttached = 'true';

      // Hover — só no desktop (no mobile não tem hover)
      el.addEventListener('mouseenter', soundHover);

      // Click
      el.addEventListener('click', soundClick);
    });
  });
}

// Aplica quando carregar
window.addEventListener('DOMContentLoaded', attachSounds);

// Reaplica depois de um tempo, caso o DOM mude
setTimeout(attachSounds, 1000);
setTimeout(attachSounds, 3000);
