// ==================================================
// LUDO ALIENÍGENA - CLIENT
// ==================================================

const socket = typeof io !== 'undefined' ? io() : null;
let myId = null;
let currentRoom = null;
let roomState = null;
let selectedMode = 'A';
let soundEnabled = localStorage.getItem('alpha_sound') !== 'false';

// ========== CONSTANTES DO TABULEIRO ==========
const PATH = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],
  [6,0]
];

const START_INDICES = [0, 13, 26, 39];
const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const FINISH_POS = 56;
const RACE_FILES = {
  'Rimk':   'rimk.png',
  'Sahrin': 'sahrin.png',
  'Ferrum': 'ferrum.png',
  'Nereid': 'nereid.png'
};

const PAWN_FILES = {
  'Rimk':   'rimk.png',
  'Sahrin': 'sahrin.png',
  'Nereid': 'nereid.png',
  'Ferrum': 'ferrum.png',
  'Thrakk': 'thrakk.png',
  'Vharn':  'vharn.png'
};

const HOME_COLUMNS = [
  [[7,1],[7,2],[7,3],[7,4],[7,5]],
  [[1,7],[2,7],[3,7],[4,7],[5,7]],
  [[7,13],[7,12],[7,11],[7,10],[7,9]],
  [[13,7],[12,7],[11,7],[10,7],[9,7]]
];

const BASE_POSITIONS = [
  [[2,2],[2,3],[3,2],[3,3]],
  [[2,11],[2,12],[3,11],[3,12]],
  [[11,11],[11,12],[12,11],[12,12]],
  [[11,2],[11,3],[12,2],[12,3]]
];

const CENTER = [7,7];

// ========== PERSISTÊNCIA ==========
const STORAGE = {
  clientId: 'alpha_clientId',
  name: 'alpha_name',
  avatar: 'alpha_avatar',
  sound: 'alpha_sound'
};

function getClientId() {
  let id = localStorage.getItem(STORAGE.clientId);
  if (!id) {
    id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(STORAGE.clientId, id);
  }
  return id;
}
const CLIENT_ID = getClientId();

function getStoredName() { return localStorage.getItem(STORAGE.name) || ''; }
function getStoredAvatar() {
  // O personagem do jogo é o avatar criado na conta (camadas do RimkAvatar).
  return (window.Conta && Conta.gameAvatar && Conta.gameAvatar()) || { b: 'rimk', bg: null, i: [] };
}
function saveProfile(name) {
  if (name) localStorage.setItem(STORAGE.name, name);
}

// ========== SOM ==========
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
}

function playBeep(freq, duration, type, vol) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playSequence(notes) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;
  let t = 0;
  notes.forEach(n => {
    setTimeout(() => playBeep(n[0], n[1], n[2] || 'square', n[3] || 0.06), t);
    t += n[1] * 1000 * 0.9;
  });
}

const SOUNDS = {
  dice: () => playSequence([[800, 0.06], [600, 0.06], [1000, 0.06], [500, 0.06]]),
  move: () => playBeep(700, 0.08, 'sine', 0.05),
  capture: () => playSequence([[300, 0.1, 'sawtooth'], [200, 0.15, 'sawtooth'], [100, 0.3, 'square']]),
  abduction: () => playSequence([
    [80,  0.30, 'sawtooth', 0.09],   // rumble grave
    [110, 0.22, 'sawtooth', 0.08],   // rumble
    [180, 0.18, 'square',   0.07],   // feixe começa
    [350, 0.14, 'square',   0.07],   // sweep
    [600, 0.12, 'square',   0.07],   // sweep
    [1000, 0.10, 'sine',    0.06],   // sweep
    [1500, 0.10, 'sine',    0.06],   // pico
    [2200, 0.12, 'sine',    0.05],   // pico
    [2800, 0.18, 'triangle',0.05],   // chegada
    [1800, 0.12, 'sine',    0.04],   // settle
    [900,  0.18, 'sine',    0.04]    // settle
  ]),
  turn: () => playSequence([[600, 0.08], [800, 0.12]]),
  win: () => playSequence([[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.5]]),
  lose: () => playSequence([[400, 0.2, 'sawtooth'], [300, 0.2, 'sawtooth'], [200, 0.4, 'sawtooth']]),
  chat: () => playBeep(1500, 0.03, 'sine', 0.03),
  eliminate: () => playSequence([[400, 0.2], [250, 0.3], [150, 0.4]])
};

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem(STORAGE.sound, soundEnabled);
  document.getElementById('soundToggle').innerText = soundEnabled ? '🔊' : '🔇';
}



// ========== TOAST ==========
function showToast(title, message, type) {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.innerHTML = `<b>${title}</b>${message}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

// ========== UI HELPERS ==========
function toggleForm(type) {
  const bc = document.getElementById('btnMenuCreate');
  const bj = document.getElementById('btnMenuJoin');
  const fc = document.getElementById('formCreate');
  const fj = document.getElementById('formJoin');
  bc.classList.remove('active');
  bj.classList.remove('active');
  fc.style.display = 'none';
  fj.style.display = 'none';
  if (type === 'create') {
    bc.classList.add('active');
    fc.style.display = 'block';
  } else {
    bj.classList.add('active');
    fj.style.display = 'block';
    refreshLudoRoomsList();
  }
}

function selectMode(mode) {
  selectedMode = mode;
  document.getElementById('modeA').classList.toggle('selected', mode === 'A');
  document.getElementById('modeB').classList.toggle('selected', mode === 'B');
}

function generateAvatarHTML(c, opts) {
  if (!c) c = {};
  if (!opts) opts = {};
  const layered = window.RimkAvatar && window.RimkAvatar.html(c);
  if (layered) return `<div style="position:relative;width:100%;height:100%;border-radius:inherit;overflow:hidden;">${layered}</div>`;

  const raceFile = RACE_FILES[c.race] || RACE_FILES['Rimk'];

  const bg = (c.bg && c.bg !== 'none') ? `<img src="../../images/${c.bg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;" />` : '';
  const body = `<img src="../../images/${raceFile}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;" />`;
  const suit = (c.suit && c.suit !== 'none') ? `<img src="../../images/${c.suit}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:3;" />` : '';
  const eye = (c.eyewear && c.eyewear !== 'none') ? `<img src="../../images/${c.eyewear}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:4;" />` : '';

  return `<div style="position:relative;width:100%;height:100%;background:#000;">${bg}${body}${suit}${eye}</div>`;
}

function updatePreview() {
  const box = document.getElementById('avatarPreview');
  if (box) box.innerHTML = generateAvatarHTML(getStoredAvatar());
}

// ========== LÓGICA DO JOGO ==========
function canMovePawn(pawnPos, dice) {
  if (pawnPos === -1) return dice === 6;
  if (pawnPos >= FINISH_POS) return false;
  if (pawnPos + dice > FINISH_POS) return false;
  return true;
}

function getRingIndex(playerIndex, relativePos) {
  return (START_INDICES[playerIndex] + relativePos) % 52;
}

// ========== RENDERIZAÇÃO DO TABULEIRO ==========
function buildBoard() {
  const board = document.getElementById('ludoBoard');
  if (!board) return;

  // Remove células antigas, mas MANTÉM peões existentes
  board.querySelectorAll('.cell, .center-overlay').forEach(c => c.remove());

  // Define a imagem de fundo correta conforme o modo
  const mode = roomState?.mode || selectedMode;
  const boardImg = mode === 'B' ? 'art/board-B.png' : 'art/board-A.png';
  board.style.backgroundImage = `url('${boardImg}')`;
  board.style.backgroundSize = '100% 100%';
  board.style.backgroundRepeat = 'no-repeat';
  board.style.backgroundPosition = 'center';
}

function getColorsForMode() {
  const mode = roomState?.mode || selectedMode;
  if (mode === 'B') {
    return [
      { name: 'Rimk',   hex: '#aaff00', dark: '#557700', team: 'RIMK', planet: 'Rimkópolis' },
      { name: 'Thrakk', hex: '#f0f0ff', dark: '#8888aa', team: 'ZUNK', planet: "Zunk'nir"    },
      { name: 'Nereid', hex: '#00ffcc', dark: '#006655', team: 'RIMK', planet: 'Nereida'     },
      { name: 'Vharn',  hex: '#aa66ff', dark: '#553388', team: 'ZUNK', planet: "Zunk'nir"    }
    ];
  }
  return [
    { name: 'Rimk',   hex: '#aaff00', dark: '#557700', planet: 'Rimkópolis' },
    { name: 'Sahrin', hex: '#ffcc00', dark: '#886600', planet: 'Kaal-7'      },
    { name: 'Nereid', hex: '#00ffcc', dark: '#006655', planet: 'Nereida'     },
    { name: 'Ferrum', hex: '#ff3344', dark: '#881122', planet: 'Marte'       }
  ];
}

// ========== RENDER DOS PEÕES ==========
const pawnElements = {};

function getPawnCoords(pos, playerIndex, pawnIdx) {
  if (pos === -1) return BASE_POSITIONS[playerIndex][pawnIdx];
  if (pos >= 0 && pos <= 50) return PATH[getRingIndex(playerIndex, pos)];
  if (pos >= 51 && pos <= 55) return HOME_COLUMNS[playerIndex][pos - 51];
  if (pos === 56) return CENTER;
  return null;
}

function getCellCenter(row, col) {
  return {
    left: (col + 0.5) / 15 * 100,
    top: (row + 0.5) / 15 * 100
  };
}

function getCenterQuadrantPos(playerIndex, pawnIdx) {
  // Cada jogador ocupa UM triângulo do X central.
  // Layout: 3 peões na fileira da base + 1 peão mais perto do ápice (centro).
  const baseDist = 42;   // distância da borda até a fileira da base
  const apexDist = 46;   // distância da borda até o peão do ápice
  const center = 50;     // centro do eixo
  const spread = 5;      // espaçamento entre os 3 peões da base

  if (pawnIdx < 3) {
    // 3 peões na fileira da base (em linha)
    const offset = (pawnIdx - 1) * spread;  // -5, 0, +5
    switch (playerIndex) {
      case 0: return { left: baseDist,           top: center + offset };  // ESQUERDA
      case 1: return { left: center + offset,    top: baseDist };         // TOPO
      case 2: return { left: 100 - baseDist,     top: center + offset };  // DIREITA
      case 3: return { left: center + offset,    top: 100 - baseDist };   // BASE
    }
  } else {
    // 1 peão próximo ao ápice (centro)
    switch (playerIndex) {
      case 0: return { left: apexDist,           top: center };  // ESQUERDA
      case 1: return { left: center,             top: apexDist }; // TOPO
      case 2: return { left: 100 - apexDist,     top: center };  // DIREITA
      case 3: return { left: center,             top: 100 - apexDist }; // BASE
    }
  }
  return { left: 50, top: 50 };
}

function renderPawns() {
  if (!roomState || !roomState.players) return;
  const board = document.getElementById('ludoBoard');
  if (!board) return;
  const colors = getColorsForMode();

  const desired = {};
  roomState.players.forEach(p => {
    if (p.eliminated) return;
    if (!p.pawns) return;
    p.pawns.forEach((pos, idx) => {
      const key = `${p.id}#${idx}`;
      const colorData = colors[p.playerIndex] || colors[0];
      desired[key] = {
        playerId: p.id, pawnIdx: idx, pos,
        playerIndex: p.playerIndex,
        color: colorData.hex,
        colorName: colorData.name
      };
    });
  });

  // Remove peões obsoletos
  Object.keys(pawnElements).forEach(key => {
    if (!desired[key]) {
      pawnElements[key].el.remove();
      delete pawnElements[key];
    }
  });

  // Cria / atualiza
  Object.entries(desired).forEach(([key, data]) => {
    let entry = pawnElements[key];
    const pawnFile = PAWN_FILES[data.colorName] || 'rimk.png';
    const imgUrl = `url('art/pawns/${pawnFile}')`;

    if (!entry) {
      const el = document.createElement('div');
      el.className = 'pawn';
      el.dataset.playerId = data.playerId;
      el.dataset.pawnIdx = data.pawnIdx;
      el.style.backgroundImage = imgUrl;
      el.style.color = data.color;
      board.appendChild(el);
      entry = {
        el,
        pos: data.pos,
        playerIndex: data.playerIndex,
        pawnIdx: data.pawnIdx,
        animating: false
      };
      pawnElements[key] = entry;
    } else {
      entry.el.style.backgroundImage = imgUrl;
      entry.el.style.color = data.color;
      entry.playerIndex = data.playerIndex;
      entry.pawnIdx = data.pawnIdx;
    }

    // Movable?
    const isMyPawn = data.playerId === myId;
    const isMyTurn = roomState.currentTurnId === myId;
    const dice = roomState.dice;
    entry.el.classList.remove('movable');
    entry.el.onclick = null;
    if (isMyPawn && isMyTurn && dice !== null && canMovePawn(data.pos, dice)) {
      entry.el.classList.add('movable');
      entry.el.onclick = (e) => { e.stopPropagation(); movePawn(data.pawnIdx); };
    }

    if (entry.pos !== data.pos && !entry.animating) {
      const from = entry.pos;
      const to = data.pos;
      entry.pos = to;
      animatePawn(entry, from, to);
    } else if (entry.pos !== data.pos) {
      entry.pos = data.pos;
    }
  });

  layoutAllPawns();
}

function layoutAllPawns() {
  const cellPct = 100 / 15;
  const groups = {};

  Object.entries(pawnElements).forEach(([key, entry]) => {
    if (entry.animating) return;

    const pos = entry.pos;

    // Peão que chegou ao centro
    if (pos === 56) {
      const c = getCenterQuadrantPos(entry.playerIndex, entry.pawnIdx);
      entry.el.style.left = c.left + '%';
      entry.el.style.top = c.top + '%';
      entry.el.style.width = '3%';
      entry.el.style.height = '3%';
      entry.el.style.zIndex = 6 + entry.pawnIdx;
      return;
    }

    const coords = getPawnCoords(pos, entry.playerIndex, entry.pawnIdx);
    if (!coords) return;
    const gk = coords[0] + '-' + coords[1];
    if (!groups[gk]) groups[gk] = [];
    groups[gk].push({ entry, coords });
  });

  Object.values(groups).forEach(group => {
    const n = group.length;
    let size, offsets;

    if (n === 1) {
      size = cellPct * 0.72;
      offsets = [[0, 0]];
    } else if (n === 2) {
      size = cellPct * 0.52;
      offsets = [[0, -cellPct * 0.2], [0, cellPct * 0.2]];
    } else if (n === 3) {
      size = cellPct * 0.46;
      offsets = [
        [0, -cellPct * 0.22],
        [-cellPct * 0.22, cellPct * 0.16],
        [cellPct * 0.22, cellPct * 0.16]
      ];
    } else {
      size = cellPct * 0.42;
      offsets = [
        [-cellPct * 0.22, -cellPct * 0.22],
        [cellPct * 0.22, -cellPct * 0.22],
        [-cellPct * 0.22, cellPct * 0.22],
        [cellPct * 0.22, cellPct * 0.22]
      ];
    }

    group.forEach((item, i) => {
      const base = getCellCenter(item.coords[0], item.coords[1]);
      const off = offsets[i % offsets.length];
      item.entry.el.style.left = (base.left + off[0]) + '%';
      item.entry.el.style.top = (base.top + off[1]) + '%';
      item.entry.el.style.width = size + '%';
      item.entry.el.style.height = size + '%';
      item.entry.el.style.zIndex = 5 + i;
    });
  });
}

function animatePawn(entry, from, to) {
  const el = entry.el;
  const playerIndex = entry.playerIndex;
  const pawnIdx = entry.pawnIdx;
  const cellPct = 100 / 15;

  entry.animating = true;

  // Teleporte (base → anel, captura, etc)
  if (from === -1 || to === -1 || to < from) {
    entry.animating = false;
    setTimeout(() => layoutAllPawns(), 30);
    return;
  }

  const steps = [];
  for (let p = from + 1; p <= to; p++) steps.push(p);

  el.style.zIndex = 100;
  el.style.width = (cellPct * 0.72) + '%';
  el.style.height = (cellPct * 0.72) + '%';

  let i = 0;
  function step() {
    if (i >= steps.length) {
      entry.animating = false;
      el.style.zIndex = '';
      layoutAllPawns();
      return;
    }
    const pos = steps[i];
    if (pos === 56) {
      const c = getCenterQuadrantPos(playerIndex, pawnIdx);
      el.style.left = c.left + '%';
      el.style.top = c.top + '%';
    } else {
      const coords = getPawnCoords(pos, playerIndex, pawnIdx);
      if (coords) {
        const c = getCellCenter(coords[0], coords[1]);
        el.style.left = c.left + '%';
        el.style.top = c.top + '%';
      }
    }
    i++;
    setTimeout(step, 230);
  }
  step();
}

// ========== RENDER DA LISTA DE JOGADORES ==========
function renderPlayersList() {
  const el = document.getElementById('playersList');
  if (!el || !roomState) return;
  const colors = getColorsForMode();

  // Descobre meu time
  const me = roomState.players.find(p => p.id === myId);
  const myTeam = me?.team || null;

  el.innerHTML = roomState.players.map(p => {
    const color = colors[p.playerIndex] || colors[0];
    const finished = p.pawns.filter(x => x === FINISH_POS).length;
    const isCurrent = p.id === roomState.currentTurnId;
    const isMe = p.id === myId;
    // ⚡ Marca como aliado se for do mesmo time (e não for eu)
    const isAlly = !isMe && myTeam && p.team === myTeam;

    let cls = 'player-row';
    if (isCurrent) cls += ' current';
    if (p.finished) cls += ' finished';
    if (p.eliminated) cls += ' eliminated';
    if (isAlly) cls += ' ally';

    const teamTag = p.team ? `<span class="end-team team-${p.team.toLowerCase()}">${p.team}</span>` : '';
    const allyTag = isAlly ? '<span class="ally-tag">🟢 ALIADO</span>' : '';

    const pawnFile = PAWN_FILES[color.name] || 'rimk.png';
    const pawnUrl = `art/pawns/${pawnFile}`;

    return `
      <div class="${cls}">
        <span class="player-avatar" style="--ring-color:${color.hex}; background-image:url('${pawnUrl}');"></span>
        <span class="player-name">
          ${isMe ? '👤 ' : ''}${p.name}
          ${p.disconnected ? ' ⚠' : ''}
          ${teamTag}
          ${allyTag}
        </span>
        <span class="pawn-count">${finished}/4 🏁</span>
      </div>
    `;
  }).join('');
}

// ========== RENDER DO TOPO (TURNO) ==========
function renderTurnInfo() {
  if (!roomState) return;
  const colors = getColorsForMode();
  const currentPlayer = roomState.players.find(p => p.id === roomState.currentTurnId);
  const nameEl = document.getElementById('turnPlayerName');
  const dotEl = document.getElementById('turnDot');

  if (!currentPlayer) {
    if (nameEl) nameEl.innerText = '----';
    if (dotEl) dotEl.style.background = 'transparent';
    return;
  }

  const color = colors[currentPlayer.playerIndex] || colors[0];
  if (nameEl) nameEl.innerText = currentPlayer.name + (currentPlayer.id === myId ? ' (Você)' : '');
  if (dotEl) {
    dotEl.style.background = color.hex;
    dotEl.style.color = color.hex;
  }

  const btn = document.getElementById('btnRoll');
  const hint = document.getElementById('rollHint');
  const myTurn = currentPlayer.id === myId;
  const diceRolled = roomState.dice !== null;

  if (btn) {
    btn.disabled = !myTurn || diceRolled || roomState.state !== 'PLAYING' || roomState.isPaused;
  }

  if (hint) {
    if (!myTurn) {
      hint.innerText = `Aguardando ${currentPlayer.name}...`;
    } else if (diceRolled) {
      const pawnsMovable = currentPlayer.pawns.filter(p => canMovePawn(p, roomState.dice));
      if (pawnsMovable.length === 0) {
        hint.innerText = 'Sem jogadas válidas...';
      } else if (pawnsMovable.length === 1) {
        hint.innerText = 'Clique no peão para mover';
      } else {
        hint.innerText = 'Escolha qual peão mover';
      }
    } else {
      hint.innerText = 'Sua vez! Role o dado.';
    }
  }

  const diceEl = document.getElementById('diceDisplay');
  if (diceEl) {
    diceEl.innerText = roomState.dice ? diceToEmoji(roomState.dice) : '🎲';
  }
}

function diceToEmoji(n) {
  return ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][n - 1] || '🎲';
}

// ========== RENDER DE CHAT ==========
function addChatMessage(boxId, sender, text, type) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'chat-msg' + (type ? ' ' + type : '');
  if (type === 'system') el.innerHTML = `🤖 <b>[SISTEMA]:</b> ${text}`;
  else if (type === 'alert') el.innerHTML = `⚠️ <b>[ALERTA]:</b> ${text}`;
  else el.innerHTML = `<b>${sender}:</b> ${text}`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

// ========== AÇÕES DO USUÁRIO ==========
function createRoom() {
  const name = document.getElementById('username').value.trim();
  if (!name) return showToast('⚠️ ERRO', 'Digite seu nome!', 'zunk');
  saveProfile(name);
  const maxPlayers = parseInt(document.getElementById('maxPlayersInput').value) || 4;
  if (socket) {
    socket.emit('ludoCreate', {
      name,
      avatar: getStoredAvatar(),
      mode: selectedMode,
      maxPlayers
    });
  }
}

function joinRoom() {
  const name = document.getElementById('username').value.trim();
  if (!name) return showToast('⚠️ ERRO', 'Digite seu nome!', 'zunk');
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!code) return showToast('⚠️ ERRO', 'Digite o código!', 'zunk');
  saveProfile(name);
  if (socket) {
    socket.emit('ludoJoin', { name, avatar: getStoredAvatar(), code });
  }
}

function refreshLudoRoomsList() {
  if (socket) socket.emit('ludoListRooms');
}

function renderLudoRoomsList(rooms) {
  const box = document.getElementById('roomsListBox');
  if (!box) return;

  if (!rooms || !rooms.length) {
    box.innerHTML = '<p class="rooms-empty">Nenhuma sala aberta no momento.<br>Crie uma e compartilhe o código!</p>';
    return;
  }

  box.innerHTML = rooms.map(r => `
    <div class="room-card" onclick="joinLudoRoomByCode('${r.code}')">
      <div class="room-card-info">
        <div class="room-card-code">${r.code}</div>
        <div class="room-card-host">Host: ${r.hostName}</div>
        <div class="room-card-mode">Modo ${r.mode === 'B' ? '2 vs 2' : 'Free-for-All'}</div>
      </div>
      <div class="room-card-players">${r.currentPlayers}/${r.maxPlayers} 👥</div>
      <div class="room-card-action">ENTRAR →</div>
    </div>
  `).join('');
}

function joinLudoRoomByCode(code) {
  const nameInput = document.getElementById('username');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) return showToast('⚠️ ERRO', 'Preencha seu nome antes de entrar!', 'zunk');
  const codeInput = document.getElementById('roomCodeInput');
  if (codeInput) codeInput.value = code;
  saveProfile(name);
  if (socket) socket.emit('ludoJoin', { name, avatar: getStoredAvatar(), code });
}

function toggleReady() {
  if (!currentRoom || !socket) return;
  socket.emit('ludoReady', { code: currentRoom });
}

function startLudo() {
  if (!currentRoom || !socket) return;
  socket.emit('ludoStart', { code: currentRoom });
}

function pickLudoColor(colorIdx) {
  if (!currentRoom || !socket) return;
  socket.emit('ludoPickColor', { code: currentRoom, colorIdx });
}

function addLudoBot() {
  if (!currentRoom || !socket) return;
  socket.emit('ludoAddBot', { code: currentRoom });
}

function removeLudoBot() {
  if (!currentRoom || !socket) return;
  socket.emit('ludoRemoveBot', { code: currentRoom });
}

function rollDice() {
  if (!currentRoom || !socket) return;
  const diceEl = document.getElementById('diceDisplay');
  if (diceEl) {
    diceEl.classList.add('rolling');
    setTimeout(() => diceEl.classList.remove('rolling'), 600);
  }
  SOUNDS.dice();
  socket.emit('ludoRoll', { code: currentRoom });
}

function proposePause() {
  if (!currentRoom || !socket) return;
  socket.emit('ludoProposePause', { code: currentRoom });
}

function votePause(vote) {
  if (!currentRoom || !socket) return;
  socket.emit('ludoVotePause', { code: currentRoom, vote });
  const actions = document.getElementById('pauseVoteActions');
  if (actions) actions.style.display = 'none';
}

function showPauseVoteModal(data) {
  const modal = document.getElementById('pauseVoteModal');
  const title = document.getElementById('pauseVoteTitle');
  const desc = document.getElementById('pauseVoteDesc');
  const actions = document.getElementById('pauseVoteActions');
  if (!modal) return;

  const isPausing = data.target;
  title.innerText = isPausing ? '⏸ VOTAÇÃO DE PAUSA' : '▶ VOTAÇÃO DE RETOMADA';

  if (data.proposedById === myId) {
    desc.innerHTML = `Você propôs <b>${isPausing ? 'pausar' : 'retomar'}</b> o jogo. Aguardando os votos dos outros jogadores...`;
    actions.style.display = 'none';
  } else {
    desc.innerHTML = `<b>${data.proposedBy}</b> propôs <b>${isPausing ? 'pausar' : 'retomar'}</b> o jogo. Você aceita?`;
    actions.style.display = 'flex';
  }

  updatePauseVoteProgress(data.votes, data.total);
  modal.classList.add('open');
}

function updatePauseVoteProgress(votes, total) {
  const count = Object.keys(votes || {}).length;
  const fill = document.getElementById('pauseVoteBarFill');
  const counter = document.getElementById('pauseVoteCount');
  if (fill) fill.style.width = (count / total * 100) + '%';
  if (counter) counter.innerText = `${count} / ${total} votaram`;
}

function hidePauseVoteModal() {
  const modal = document.getElementById('pauseVoteModal');
  if (modal) modal.classList.remove('open');
  const actions = document.getElementById('pauseVoteActions');
  if (actions) actions.style.display = 'flex';
}

function showPausedOverlay() {
  const ov = document.getElementById('pausedOverlay');
  if (ov) ov.classList.add('open');
}

function hidePausedOverlay() {
  const ov = document.getElementById('pausedOverlay');
  if (ov) ov.classList.remove('open');
}

function movePawn(pawnIndex) {
  if (!currentRoom || !socket) return;
  SOUNDS.move();
  socket.emit('ludoMove', { code: currentRoom, pawnIndex });
}

function sendLobbyChat() {
  const input = document.getElementById('lobbyChatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text || !currentRoom || !socket) return;
  socket.emit('ludoChat', { code: currentRoom, text });
  input.value = '';
}

function sendGameChat() {
  const input = document.getElementById('gameChatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text || !currentRoom || !socket) return;
  socket.emit('ludoChat', { code: currentRoom, text });
  input.value = '';
}

function backToLobby() {
  location.reload();
}

function spawnConfetti() {
  const colors = ['#ffcc00', '#00ff66', '#00ffff', '#ff3366', '#aa66ff'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.top = '-20px';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = (Math.random() * 1.5) + 's';
    c.style.animationDuration = (2 + Math.random() * 2) + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5000);
  }
}

// ========== CAPTURA ==========
let captureAlertTimer = null;

function showCaptureAlert(attackerName, captured) {
  const el = document.getElementById('captureAlert');
  if (!el) return;

  const names = captured.map(c => c.playerName).join(', ');
  const count = captured.length;

  el.innerHTML = `
    <span class="alert-icon">⚠️ CAPTURA!</span>
    <span class="alert-attacker">${attackerName}</span> abduziu <span class="alert-victim">${names}</span>
    ${count > 1 ? `<br><small style="opacity:0.75;font-size:0.8em;letter-spacing:1px;">${count} peões abduzidos</small>` : ''}
  `;

  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');

  if (captureAlertTimer) clearTimeout(captureAlertTimer);
  captureAlertTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 5000);
}

function startAbductionAnimation(entry) {
  const el = entry.el;
  const board = document.getElementById('ludoBoard');
  if (!board || !el) return;

  const left = el.style.left;
  const top = el.style.top;

  // Criar nave alienígena
  const ship = document.createElement('div');
  ship.className = 'abduction-ship';
  ship.textContent = '🛸';
  ship.style.left = left;
  ship.style.top = top;
  board.appendChild(ship);

  // Criar feixe de luz
  const beam = document.createElement('div');
  beam.className = 'abduction-beam';
  beam.style.left = left;
  beam.style.top = top;
  board.appendChild(beam);

  // Timeline:
  // 0ms    → nave descendo
  // 600ms  → feixe ativa + peão começa a subir
  // 1800ms → nave sobe, peão teleporta pra base
  // 1900ms → peão materializa na base
  // 2800ms → limpeza

  setTimeout(() => {
    beam.classList.add('active');
    el.classList.add('abducting');
  }, 600);

  setTimeout(() => {
    ship.classList.add('ascending');
    beam.classList.remove('active');
    beam.classList.add('fading');

    el.classList.add('teleporting');
    el.classList.remove('abducting');

    setTimeout(() => {
      entry.pos = -1;
      entry.animating = false;
      layoutAllPawns();

      setTimeout(() => {
        el.classList.remove('teleporting');
        el.classList.add('materializing');
        setTimeout(() => el.classList.remove('materializing'), 900);
      }, 50);
    }, 100);
  }, 1800);

  setTimeout(() => {
    ship.remove();
    beam.remove();
  }, 2800);
}

// ========== SOCKET LISTENERS ==========
if (socket) {

  socket.on('connect', () => {
    myId = socket.id;
    socket.emit('identify', { clientId: CLIENT_ID });
  });

socket.on('reconnected', d => {
    document.getElementById('setupView').style.display = 'block';
    document.getElementById('lobbyView').style.display = 'none';
    document.getElementById('gameView').style.display = 'none';
    document.getElementById('endView').style.display = 'none';
});
  
  socket.on('errorMsg', (msg) => showToast('⚠️ ERRO', msg, 'zunk'));
  socket.on('ludoRoomsList', (data) => {
    renderLudoRoomsList(data.rooms);
  });
  
  socket.on('ludoJoined', (data) => {
    currentRoom = data.code;
    document.getElementById('setupView').style.display = 'none';
    document.getElementById('lobbyView').style.display = 'block';
    document.getElementById('gameView').style.display = 'none';
    document.getElementById('endView').style.display = 'none';
    document.getElementById('displayRoomCode').innerText = data.code;
  });

  socket.on('ludoPauseVoteStarted', (data) => {
    showPauseVoteModal(data);
    showToast('⏸ VOTAÇÃO', `${data.proposedBy} propôs ${data.target ? 'pausar' : 'retomar'} o jogo.`, 'cyan');
  });

  socket.on('ludoPauseVoteUpdate', (data) => {
    updatePauseVoteProgress(data.votes, data.total);
  });

  socket.on('ludoPauseVoteResult', (data) => {
    hidePauseVoteModal();
    if (data.approved) {
      if (data.isPaused) {
        showPausedOverlay();
        showToast('⏸ PAUSADO', 'O jogo foi pausado por votação.', 'gold');
      } else {
        hidePausedOverlay();
        showToast('▶ RETOMADO', 'O jogo foi retomado por votação.', 'cyan');
      }
    } else {
      showToast('❌ RECUSADO', `Votação não aprovada (${data.yes} sim / ${data.no} não).`, 'zunk');
    }
  });
  
  socket.on('ludoLobby', (data) => {
    const colors = data.mode === 'B'
      ? [
          {hex:'#aaff00', name:'Rimk',   team:'RIMK'},
          {hex:'#f0f0ff', name:'Thrakk', team:'ZUNK'},
          {hex:'#00ffcc', name:'Nereid', team:'RIMK'},
          {hex:'#aa66ff', name:'Vharn',  team:'ZUNK'}
        ]
      : [
          {hex:'#aaff00', name:'Rimk'},
          {hex:'#ffcc00', name:'Sahrin'},
          {hex:'#00ffcc', name:'Nereid'},
          {hex:'#ff3344', name:'Ferrum'}
        ];

    const me = data.players.find(p => p.id === myId);
    const myColorIdx = me?.playerIndex;

    document.getElementById('queueCount').innerText = data.players.length + ' / ' + data.maxPlayers;
    document.getElementById('displayMode').innerText = data.mode === 'B' ? '2 vs 2' : 'FREE-FOR-ALL';

    // ========== RENDER COLOR PICKER ==========
    const pickerBox = document.getElementById('colorPickerBox');
    const pickerGrid = document.getElementById('colorPickerGrid');
    if (pickerBox && pickerGrid) {
      pickerBox.style.display = 'block';

      const takenBy = {};
      data.players.forEach(p => {
        if (p.playerIndex !== null && p.playerIndex !== undefined) {
          takenBy[p.playerIndex] = p;
        }
      });

      pickerGrid.innerHTML = colors.map((c, idx) => {
        const occupant = takenBy[idx];
        const isMine = myColorIdx === idx;
        const isTakenByOther = occupant && !isMine;

        const pawnFile = PAWN_FILES[c.name] || 'rimk.png';
        const pawnUrl = `art/pawns/${pawnFile}`;

        let cls = 'color-choice';
        if (isMine) cls += ' mine';
        else if (isTakenByOther) cls += ' taken';

        const clickHandler = (!occupant) ? `onclick="pickLudoColor(${idx})"` : '';
        const teamLabel = c.team ? `<span class="color-team">${c.team}</span>` : '';
        const takenLabel = isTakenByOther ? `<span class="color-taken-label">${occupant.name}</span>` : '';

        return `
          <div class="${cls}" style="--color-hex:${c.hex};" ${clickHandler}>
            <img src="${pawnUrl}" alt="${c.name}" class="color-pawn">
            <span class="color-label">${c.name}</span>
            ${teamLabel}
            ${takenLabel}
          </div>
        `;
      }).join('');
    }

    // ========== RENDER LOBBY GRID ==========
    const grid = document.getElementById('lobbyGrid');
    grid.innerHTML = data.players.map(p => {
      const isMe = p.id === myId;
      const hasColor = p.playerIndex !== null && p.playerIndex !== undefined;
      const color = hasColor ? colors[p.playerIndex] : null;
      const teamTag = p.team ? `<span class="team-tag team-${p.team.toLowerCase()}">${p.team}</span>` : '';
      const readyCls = p.ready ? ' ready' : '';
      const meCls = isMe ? ' me' : '';
      const botCls = p.isBot ? ' bot' : '';

      let colorDotHtml = '<span class="color-dot" style="background:#333;color:#333;"></span>';
      if (hasColor) {
        colorDotHtml = `<span class="color-dot" style="background:${color.hex};color:${color.hex};"></span>`;
      }

      const statusHtml = hasColor
        ? `<small style="color:${p.ready ? 'var(--cyan-glow)' : '#888'};">${p.ready ? '✔ PRONTO' : '⏳ Aguardando'}</small>`
        : `<small style="color:var(--alert-red);">⚠ Escolha uma cor</small>`;

      return `
        <div class="lobby-player${readyCls}${meCls}${botCls}">
          <div class="avatar-mini" style="display:flex;align-items:center;justify-content:center;font-size:2em;">${p.isBot ? '🤖' : generateAvatarHTML(p.avatar)}</div>
          <div style="margin-bottom:4px;">
            ${colorDotHtml}
            <b>${p.name}</b>${isMe ? ' <small>(Você)</small>' : ''}
          </div>
          <small style="color:var(--cyan-glow);">${p.isHost ? '👑 HOST' : ''}</small>
          <div>${teamTag}</div>
          ${statusHtml}
          ${p.disconnected ? '<div style="color:var(--alert-red);font-size:0.7em;">⚠ Desconectado</div>' : ''}
        </div>
      `;
    }).join('');

    // ========== BOTÕES DE BOT ==========
    const hasBots = data.players.some(p => p.isBot);
    const btnAddBot = document.getElementById('btnAddLudoBot');
    const btnRemoveBot = document.getElementById('btnRemoveLudoBot');
    const isHostForBot = me?.isHost;
    if (btnAddBot) {
      btnAddBot.style.display = (isHostForBot && data.players.length < data.maxPlayers) ? 'block' : 'none';
    }
    if (btnRemoveBot) {
      btnRemoveBot.style.display = (isHostForBot && hasBots) ? 'block' : 'none';
    }

    // ========== BOTÕES DE READY/START ==========
    const isHost = me && me.isHost;
    const btnReady = document.getElementById('btnReady');
    const btnStart = document.getElementById('btnStartLudo');
    const hint = document.getElementById('readyHint');

    if (me) {
      btnReady.innerText = me.ready ? '✔ PRONTO (cancelar)' : '☐ MARCAR PRONTO';
      btnReady.classList.toggle('active', !!me.ready);
    }

    const numPlayers = data.players.length;
    const allReady = numPlayers >= 2 && data.players.every(p => p.ready);
    const allPickedColor = data.players.every(p => p.playerIndex !== null && p.playerIndex !== undefined);
    const isModeB = data.mode === 'B';
    const modeBValid = !isModeB || numPlayers === 2 || numPlayers === 4;

    // Verifica times no modo B
    let teamsOk = true;
    if (isModeB && allPickedColor) {
      const rimk = data.players.filter(p => p.team === 'RIMK').length;
      const zunk = data.players.filter(p => p.team === 'ZUNK').length;
      if (numPlayers === 2) teamsOk = (rimk === 1 && zunk === 1);
      if (numPlayers === 4) teamsOk = (rimk === 2 && zunk === 2);
    }

    if (isHost) {
      btnStart.style.display = 'block';
      btnStart.disabled = !allReady || !modeBValid || !allPickedColor || !teamsOk;
    } else {
      btnStart.style.display = 'none';
    }

    // ========== HINT ==========
    if (numPlayers < 2) {
      hint.innerText = 'Aguardando pelo menos 1 jogador entrar...';
      hint.style.color = '';
    } else if (isModeB && numPlayers === 3) {
      hint.innerText = '⚠ O modo 2v2 exige 2 ou 4 jogadores. Chame mais 1 ou remova 1.';
      hint.style.color = 'var(--alert-red)';
    } else if (!allPickedColor) {
      const waiting = data.players.filter(p => p.playerIndex === null || p.playerIndex === undefined);
      hint.innerText = `🎨 Aguardando ${waiting.length} jogador(es) escolherem uma cor...`;
      hint.style.color = 'var(--gold-yellow)';
    } else if (isModeB && !teamsOk) {
      hint.innerText = numPlayers === 2
        ? '⚠ No 2v2, um precisa ser Rimk e o outro Zunk.'
        : '⚠ No 2v2, precisa ser 2 Rimks e 2 Zunks.';
      hint.style.color = 'var(--alert-red)';
    } else if (!allReady) {
      const waiting = data.players.filter(p => !p.ready).length;
      hint.innerText = `Aguardando ${waiting} jogador(es) ficarem prontos...`;
      hint.style.color = '';
    } else {
      hint.innerText = isHost ? '✅ Todos prontos! Pode iniciar.' : '✅ Todos prontos! Aguardando o host iniciar...';
      hint.style.color = '';
    }
  });

  socket.on('ludoStarted', (state) => {
    roomState = state;
    document.getElementById('setupView').style.display = 'none';
    document.getElementById('lobbyView').style.display = 'none';
    document.getElementById('gameView').style.display = 'block';
    document.getElementById('endView').style.display = 'none';

    buildBoard();
    renderPawns();
    renderPlayersList();
    renderTurnInfo();
    addChatMessage('gameChatBox', 'SISTEMA', 'Partida iniciada!', 'system');
    SOUNDS.turn();
    playBeep(880, 0.2);
  });

  socket.on('ludoState', (state) => {
    const wasMyTurn = roomState?.currentTurnId === myId;
    roomState = state;

    buildBoard();
    renderPawns();
    renderPlayersList();
    renderTurnInfo();

    const isMyTurn = state.currentTurnId === myId;
    if (isMyTurn && !wasMyTurn && state.state === 'PLAYING') {
      const flash = document.createElement('div');
      flash.className = 'turn-flash';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 700);
      SOUNDS.turn();
    }

    // Sincroniza overlay de pausa
    if (state.state === 'PLAYING' && state.isPaused) {
      showPausedOverlay();
    } else {
      hidePausedOverlay();
    }
  });

  socket.on('ludoTimer', (seconds) => {
    const el = document.getElementById('turnTimer');
    if (!el) return;
    el.innerText = seconds;
    el.classList.toggle('urgent', seconds <= 10);
  });

  socket.on('ludoDiceRolled', (data) => {
    SOUNDS.dice();
    if (data.playerId === myId && data.anyMove) {
      showToast('🎲 DADO', `Você tirou ${data.dice}! Escolha um peão.`, 'cyan');
    }
  });

  socket.on('ludoRollAgain', (data) => {
    if (data.playerId === myId) {
      showToast('⚅ SEIS!', 'Você joga novamente!', 'gold');
    }
  });

  socket.on('ludoCapture', (data) => {
    if (!data.captured || !data.captured.length) return;

    SOUNDS.abduction();

    // Mostra banner vermelho
    showCaptureAlert(data.attackerName, data.captured);

    // Anima cada peão capturado
    data.captured.forEach(c => {
      const key = `${c.playerId}#${c.pawnIndex}`;
      const entry = pawnElements[key];
      if (!entry) return;

      // Trava a posição atual do peão (impede renderPawns de movê-lo)
      entry.animating = true;

      // Inicia animação de abdução
      startAbductionAnimation(entry);
    });
  });

  socket.on('ludoChat', (data) => {
    const box = document.getElementById('gameView').style.display === 'block' ? 'gameChatBox' : 'lobbyChatBox';
    addChatMessage(box, data.sender, data.text, data.type);
    if (data.type !== 'system' && data.type !== 'alert') SOUNDS.chat();
  });

  socket.on('ludoPlayerLeft', (data) => {
    showToast('👋 SAIU', `${data.playerName} saiu da partida.`, 'zunk');
  });

  socket.on('ludoEnd', (data) => {
    saveLudoHistory(data);
    document.getElementById('gameView').style.display = 'none';
    document.getElementById('endView').style.display = 'block';

    const winnerIds = data.winnerIds || [];
    const iWon = winnerIds.includes(myId);
    const title = document.getElementById('endTitle');

    if (roomState?.mode === 'B') {
      const winnerTeam = data.players.find(p => winnerIds.includes(p.id))?.team;
      title.innerText = iWon
        ? `🏆 TIME ${winnerTeam} VENCEU!`
        : `💀 TIME ${winnerTeam} VENCEU`;
    } else {
      const winner = data.players.find(p => p.id === winnerIds[0]);
      title.innerText = iWon ? '🏆 VOCÊ VENCEU!' : `🏆 ${winner?.name || 'ALGUÉM'} VENCEU`;
    }

    if (iWon) {
      spawnConfetti();
      SOUNDS.win();
    } else {
      SOUNDS.lose();
    }

    const medals = ['🥇', '🥈', '🥉', '4º'];
    const sorted = [...data.players].sort((a, b) => {
      const aFinished = a.pawns.filter(p => p === FINISH_POS).length;
      const bFinished = b.pawns.filter(p => p === FINISH_POS).length;
      return bFinished - aFinished;
    });

    document.getElementById('endRanking').innerHTML = sorted.map((p, i) => {
      const finished = p.pawns.filter(x => x === FINISH_POS).length;
      const teamTag = p.team ? `<span class="end-team team-${p.team.toLowerCase()}">${p.team}</span>` : '';
      return `
        <div class="end-card">
          <div class="medal">${medals[i] || ''}</div>
          <div class="end-name" style="color:${p.color};text-shadow:0 0 10px ${p.color};">
            ${p.id === myId ? '👤 ' : ''}${p.name}
          </div>
          <div>${teamTag}</div>
          <div class="end-progress">${finished} / 4 peões no centro</div>
        </div>
      `;
    }).join('');
  });

  socket.on('disconnect', () => {
    showToast('⚠️ DESCONECTADO', 'Você perdeu conexão. Recarregue a página.', 'zunk');
  });
}

// ========== INIT ==========
window.addEventListener('DOMContentLoaded', () => {
  const name = getStoredName();
  if (name) {
    const input = document.getElementById('username');
    if (input) input.value = name;
  }
  updatePreview();
  document.getElementById('soundToggle').innerText = soundEnabled ? '🔊' : '🔇';
  document.addEventListener('click', () => initAudio(), { once: true });

  const li = document.getElementById('lobbyChatInput');
  if (li) li.addEventListener('keypress', e => { if (e.key === 'Enter') sendLobbyChat(); });
  const gi = document.getElementById('gameChatInput');
  if (gi) gi.addEventListener('keypress', e => { if (e.key === 'Enter') sendGameChat(); });
});

// ========== HISTÓRICO ==========
function saveLudoHistory(data) {
  const myResult = data.players.find(p => p.id === myId);
  if (!myResult) return;

  const winnerIds = data.winnerIds || [];
  const iWon = winnerIds.includes(myId);

  const entry = {
    game: 'ludo',
    won: iWon,
    mode: roomState?.mode || 'A',
    myTeam: myResult.team || null,
    myColorName: null,
    date: Date.now()
  };

  try {
    const colors = getColorsForMode();
    const meState = roomState?.players?.find(p => p.id === myId);
    if (meState && colors[meState.playerIndex]) {
      entry.myColorName = colors[meState.playerIndex].name;
    }
  } catch (e) {}

  let h = [];
  try { h = JSON.parse(localStorage.getItem('alpha_history') || '[]'); } catch (e) {}
  h.push(entry);
  if (h.length > 100) h.shift();
  localStorage.setItem('alpha_history', JSON.stringify(h));
}
