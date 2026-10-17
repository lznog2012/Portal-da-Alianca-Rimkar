// ==================================================
// PORTAL DA ALIANÇA RÍMKAR — Lógica
// ==================================================

// ============================================
// CONSTANTES
// ============================================
const STORAGE = {
  clientId: 'alpha_clientId',
  name: 'alpha_name',
  avatar: 'alpha_avatar',
  race: 'alpha_race'
};

const RACE_FILES = {
  'Rimk':   'rimk.png',
  'Sahrin': 'sahrin.png',
  'Ferrum': 'ferrum.png',
  'Nereid': 'nereid.png'
};

const DEFAULT_RACE = 'Rimk';

// ============================================
// COMUNICADOS OFICIAIS
// ============================================
const comunicados = [
  {
    tipo: 'DIVISÃO DE INTELIGÊNCIA',
    icone: '📡',
    texto: 'Rumores de novas infiltrações Zunkianas. Para mais informações, acompanhe a Rimk Radio.',
    autor: '— Comunicado #847-001'
  },
  {
    tipo: 'BIBLIOTECA DE RIMKANDRIA',
    icone: '📚',
    texto: 'Novos arquivos digitalizados e disponíveis ao público. Visite a seção de História.',
    autor: '— Comunicado #847-002'
  },
  {
    tipo: 'RIMK RADIO',
    icone: '🎧',
    texto: 'Hoje às 20h: "A Grande Fratura, 500 anos depois" — documentário especial.',
    autor: '— Comunicado #847-003'
  },
  {
    tipo: 'CONSELHO RÍMKAR',
    icone: '⚖️',
    texto: 'Sessão ordinária do Conselho ocorre nesta semana. Pauta: manutenção do Pacto dos Quatro.',
    autor: '— Comunicado #847-004'
  },
  {
    tipo: 'MINISTÉRIO DA BIOSFERA',
    icone: '🌱',
    texto: 'Nereida reporta índice de pureza da água em 97,2%. Nível historicamente estável.',
    autor: '— Comunicado #847-005'
  },
  {
    tipo: 'CLÃ KORG',
    icone: '⚒️',
    texto: 'Ferrum celebra a vitória do Clã Korg no Torneio Anual de Forja. Honra aos vencedores.',
    autor: '— Comunicado #847-006'
  },
  {
    tipo: 'ACADEMIA RÍMKAR',
    icone: '🎓',
    texto: 'Inscrições abertas para o Ciclo de Treinamento Anti-Infiltração. Vagas limitadas.',
    autor: '— Comunicado #847-007'
  },
  {
    tipo: 'OBSERVATÓRIO SAHRIN',
    icone: '🔭',
    texto: 'Cartógrafos Sahrin finalizam mapeamento de 3 novas rotas estelares.',
    autor: '— Comunicado #847-008'
  },
  {
    tipo: 'RIMK RADIO',
    icone: '🎧',
    texto: 'Entrevista exclusiva com o Arquivista Lumen sobre o Códice Rímkar. Disponível on demand.',
    autor: '— Comunicado #847-009'
  },
  {
    tipo: 'DIVISÃO DE INTELIGÊNCIA',
    icone: '📡',
    texto: 'Nenhuma atividade suspeita registrada nas últimas semanas. Mantenha a vigilância.',
    autor: '— Comunicado #847-010'
  }
];

// ============================================
// SISTEMA DE COMUNICADOS ROTATIVOS
// ============================================
let comunicadoAtual = 0;
let comunicadoTimer = null;

function initComunicados() {
  const iconeEl = document.getElementById('comunicadoIcon');
  const tipoEl = document.getElementById('comunicadoTipo');
  const textoEl = document.getElementById('comunicadoTexto');
  const autorEl = document.getElementById('comunicadoAutor');
  const dotsEl = document.getElementById('comunicadoDots');
  if (!iconeEl || !dotsEl) return;

  // Cria os dots
  dotsEl.innerHTML = '';
  comunicados.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'comunicado-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Comunicado ${i + 1}`);
    dot.onclick = () => mostrarComunicado(i);
    dotsEl.appendChild(dot);
  });

  // Mostra o primeiro
  mostrarComunicado(0, true);

  // Rotação automática a cada 8 segundos
  comunicadoTimer = setInterval(() => {
    comunicadoAtual = (comunicadoAtual + 1) % comunicados.length;
    mostrarComunicado(comunicadoAtual);
  }, 8000);
}

function mostrarComunicado(index, force) {
  const contentEl = document.getElementById('comunicadoContent');
  const iconeEl = document.getElementById('comunicadoIcon');
  const tipoEl = document.getElementById('comunicadoTipo');
  const textoEl = document.getElementById('comunicadoTexto');
  const autorEl = document.getElementById('comunicadoAutor');
  if (!contentEl || !iconeEl) return;

  const c = comunicados[index];

  if (force) {
    iconeEl.innerText = c.icone;
    tipoEl.innerText = c.tipo;
    textoEl.innerText = c.texto;
    autorEl.innerText = c.autor;
    atualizarDots(index);
    return;
  }

  // Fade out
  contentEl.style.opacity = '0';
  iconeEl.style.opacity = '0';

  setTimeout(() => {
    iconeEl.innerText = c.icone;
    tipoEl.innerText = c.tipo;
    textoEl.innerText = c.texto;
    autorEl.innerText = c.autor;

    contentEl.style.opacity = '1';
    iconeEl.style.opacity = '1';

    atualizarDots(index);
  }, 300);
}

function atualizarDots(index) {
  document.querySelectorAll('.comunicado-dot').forEach((d, i) => {
    d.classList.toggle('active', i === index);
  });
}

// ============================================
// CLIENT ID (compartilhado com o resto do site)
// ============================================
function getClientId() {
  let id = localStorage.getItem(STORAGE.clientId);
  if (!id) {
    id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(STORAGE.clientId, id);
  }
  return id;
}
const CLIENT_ID = getClientId();

// ============================================
// PERFIL
// ============================================
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

function renderProfileMini() {
  const p = getProfile();
  const nameEl = document.getElementById('profileMiniName');
  const avatarEl = document.getElementById('profileMiniAvatar');
  if (!nameEl || !avatarEl) return;

  nameEl.innerText = 'Perfil do Cidadão';
  nameEl.classList.remove('empty');

  // avatar da CONTA (só aqui, antes dos jogos); sem conta/avatar, segue o personagem do universo
  avatarEl.innerHTML = (window.Conta && Conta.avatarHTML && Conta.avatarHTML()) || generateMiniAvatar(p.avatar, p.race);
}

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

// ============================================
// MODAL DE PERFIL
// ============================================
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

  setModalCustomization({ ...p.avatar, race: p.race });
  updateModalPreview();

  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.add('open');
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
  renderProfileMini();
  closeProfileModal();
}

// ============================================
// SISTEMA DE ÁUDIO
// ============================================
let audioCtxPortal = null;
let audioUnlockedPortal = false;      // ← "contexto pronto?"
let soundEnabledPortal = localStorage.getItem('portal_sound') !== 'false';   // ← "usuário quer som?"

function initAudioPortal() {
  if (audioCtxPortal) return;
  try {
    audioCtxPortal = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {}
}

function unlockAudioPortal() {
  if (audioUnlockedPortal) return;
  initAudioPortal();
  if (!audioCtxPortal) return;

  // Tenta resumir sem esperar (não bloqueia)
  if (audioCtxPortal.state === 'suspended') {
    audioCtxPortal.resume().catch(() => {});
  }
  // Marca como pronto IMEDIATAMENTE (não espera o .then)
  audioUnlockedPortal = true;
}

// Aplica em TODOS os eventos de interação
['click', 'touchstart', 'keydown', 'mousedown', 'pointerdown'].forEach(evt => {
  document.addEventListener(evt, unlockAudioPortal, { passive: true });
});

function playSoundPortal(freq, duration, type, vol) {
  if (!soundEnabledPortal) return;       // ← checa preferência
  if (!audioCtxPortal || !audioUnlockedPortal) return;
  try {
    const osc = audioCtxPortal.createOscillator();
    const gain = audioCtxPortal.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.04, audioCtxPortal.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtxPortal.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtxPortal.destination);
    osc.start();
    osc.stop(audioCtxPortal.currentTime + duration);
  } catch (e) {}
}

function playSeqPortal(notes) {
  if (!soundEnabledPortal) return;       // ← checa preferência
  if (!audioCtxPortal || !audioUnlockedPortal) return;
  let t = 0;
  notes.forEach(n => {
    setTimeout(() => playSoundPortal(n[0], n[1], n[2] || 'square', n[3] || 0.04), t);
    t += n[1] * 1000 * 0.85;
  });
}

function toggleSoundPortal() {
  soundEnabledPortal = !soundEnabledPortal;
  localStorage.setItem('portal_sound', soundEnabledPortal);
  const btn = document.getElementById('soundToggle');
  if (btn) {
    btn.innerText = soundEnabledPortal ? '🔊' : '🔇';
    btn.classList.toggle('muted', !soundEnabledPortal);
  }
  // Se está ligando, toca um bip pra dar feedback
  if (soundEnabledPortal) {
    initAudioPortal();
    if (audioCtxPortal && audioCtxPortal.state === 'suspended') {
      audioCtxPortal.resume().catch(() => {});
    }
    audioUnlockedPortal = true;
    setTimeout(() => playSeqPortal([[880, 0.05], [1320, 0.08]]), 50);
  }
}

// Aplica estado inicial do botão
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('soundToggle');
  if (btn) {
    btn.innerText = soundEnabledPortal ? '🔊' : '🔇';
    btn.classList.toggle('muted', !soundEnabledPortal);
  }
});

// ============================================
// INICIALIZAÇÃO
// ============================================
window.addEventListener('DOMContentLoaded', () => {
  // Comunicados
  initComunicados();

  // Perfil
  renderProfileMini();

  // Input de nome salva no Enter
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

  // Atualiza preview quando muda selects
  ['modalOptEyewear', 'modalOptSuit', 'modalOptBg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateModalPreview);
  });

  // Preview inicial
  updateModalPreview();

  // Aplica sons
  attachSoundsPortal();
  setTimeout(attachSoundsPortal, 1000);
});

// ============================================
// SONS EM TODOS OS ELEMENTOS INTERATIVOS
// ============================================
function attachSoundsPortal() {
  const selectors = [
    'button',
    'a',
    '.topbar-btn',
    '.topbar-brand',
    '.profile-mini',
    '.servico-card',
    '.comunicado-dot',
    '.race-option',
    '.modal-actions button'
  ];

  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (el.dataset.soundAttached) return;
      el.dataset.soundAttached = 'true';

      el.addEventListener('mouseenter', () => playSoundPortal(1400, 0.04, 'square', 0.02));
      el.addEventListener('click', () => {
        if (el.classList.contains('servico-card')) {
          playSeqPortal([[880, 0.05], [1320, 0.08], [1760, 0.1]]);
        } else {
          playSeqPortal([[1600, 0.04, 'square', 0.04], [2000, 0.06, 'square', 0.035]]);
        }
      });
    });
  });
}

/* ===== Contador "Última infiltração detectada" =====
   Em 17/10/2026 eram 137 dias; soma +1 a cada dia (pela data local de quem acessa).
   Para mudar o valor: ajuste ANCORA e DIAS_NA_ANCORA. */
(function () {
  var el = document.getElementById('diasInfiltracao');
  if (!el) return;
  var ANCORA = [2026, 10, 17];   // ano, mês, dia
  var DIAS_NA_ANCORA = 137;
  var hoje = new Date();
  // UTC só pra contar dias de calendário sem erro de horário de verão
  var d0 = Date.UTC(ANCORA[0], ANCORA[1] - 1, ANCORA[2]);
  var d1 = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  var dias = DIAS_NA_ANCORA + Math.max(0, Math.round((d1 - d0) / 86400000));
  el.textContent = 'Há ' + dias + (dias === 1 ? ' dia' : ' dias');
})();
