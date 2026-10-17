// ==================================================
// BIBLIOTECA DE RIMKANDRIA — Navegação e Lógica
// ==================================================

// ============================================
// ESTADO DA NAVEGAÇÃO
// ============================================
let viewHistory = [];        // pilha de views visitadas
let currentSection = null;   // seção atual (historia, mundos, etc)
let currentArticle = null;   // artigo atual (001, 002, etc)

// ============================================
// CARREGAMENTO DE DADOS (JSON)
// ============================================
const JSON_CACHE = {};

async function loadSection(section) {
  if (JSON_CACHE[section]) return JSON_CACHE[section];

  try {
    const resp = await fetch(`data/${section}.json`);
    if (!resp.ok) throw new Error(`Erro ao carregar ${section}.json`);
    const data = await resp.json();
    JSON_CACHE[section] = data;
    return data;
  } catch (err) {
    console.error(`Erro carregando ${section}:`, err);
    return null;
  }
}

// ============================================
// TROCA DE VIEWS
// ============================================
function showView(viewId, options = {}) {
  const { pushHistory = true, section = null, article = null } = options;

  // Guarda a view atual na história
  if (pushHistory) {
    const current = document.querySelector('.view.active');
    if (current && current.id !== viewId) {
      viewHistory.push(current.id);
    }
  }

  // Esconde todas as views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Mostra a view desejada
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Atualiza estado
  if (section) currentSection = section;
  if (article) currentArticle = article;

  // Atualiza botão global de voltar
  updateGlobalBackBtn();
}

function goBack() {
  if (viewHistory.length === 0) {
    // Volta pra home
    window.location.href = '/';
    return;
  }

  const previousView = viewHistory.pop();

  // Esconde todas
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Mostra a anterior
  const target = document.getElementById(previousView);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateGlobalBackBtn();
}

function updateGlobalBackBtn() {
  const btn = document.getElementById('globalBackBtn');
  if (!btn) return;

  const current = document.querySelector('.view.active');
  if (!current) return;

  // Só mostra o botão global quando estamos na ESTANTE (hub principal)
  if (current.id === 'view-shelf') {
    btn.style.display = 'block';
    btn.href = '/';
    btn.textContent = '← VOLTAR AO PORTAL';
    btn.dataset.action = 'home';
  } else {
    // Nas outras views (artigo, mundos, zunk), esconde o botão global
    btn.style.display = 'none';
  }
}

// ============================================
// NAVEGAÇÃO — LIVROS
// ============================================
async function openBook(section) {
  currentSection = section;

  if (section === 'mundos') {
    renderSolarSystem();
    showView('view-worlds');
    return;
  }

  if (section === 'zunk') {
    soundVaultAlarm();
    showView('view-vault-warning');
    return;
  }

  // Seções com JSON (historia, ciencia, politica, jogos)
  await renderSectionList(section);
  showView('view-article');
}

// ============================================
// LISTA DE ARTIGOS DE UMA SEÇÃO
// ============================================
async function renderSectionList(section) {
  const container = document.getElementById('articleContent');
  const breadcrumb = document.getElementById('articleBreadcrumb');
  if (!container) return;

  container.innerHTML = '<header><h1>Carregando...</h1></header>';

  const data = await loadSection(section);
  if (!data) {
    container.innerHTML = '<header><h1>Erro ao carregar</h1></header><div class="article-body"><p>Não foi possível carregar esta seção.</p></div>';
    return;
  }

  if (breadcrumb) {
    breadcrumb.innerHTML = `📚 Biblioteca › ${data.icone} ${data.nome}`;
  }

  const cards = data.artigos.map(art => `
    <div class="article-card" onclick="openArticle('${section}', '${art.numero}')">
      <div class="article-card-number">ARQUIVO #${art.numero}</div>
      <h3>${art.icone} ${art.titulo}</h3>
      <div class="article-card-meta">por ${art.autor} · ${art.data}</div>
      <div class="article-card-cta">Ler artigo →</div>
    </div>
  `).join('');

  container.innerHTML = `
    <header>
      <span class="archive-number">${data.icone} SEÇÃO ${data.range}</span>
      <h1>${data.nome}</h1>
      <div class="meta">
        <span>${data.artigos.length} arquivos disponíveis</span>
      </div>
    </header>
    <div class="article-list">
      ${cards}
    </div>
    <footer class="article-footer">
      <button class="article-nav-btn" onclick="goBack()">← Voltar à Estante</button>
    </footer>
  `;

  if (typeof attachSoundsLore === 'function') {
    setTimeout(attachSoundsLore, 100);
  }
}

// ============================================
// RENDERIZAR ARTIGO INDIVIDUAL
// ============================================
async function openArticle(section, numero) {
  const container = document.getElementById('articleContent');
  const breadcrumb = document.getElementById('articleBreadcrumb');
  if (!container) return;

  container.innerHTML = '<header><h1>Carregando...</h1></header>';

  const data = await loadSection(section);
  if (!data) return;

  const index = data.artigos.findIndex(a => a.numero === numero);
  const artigo = data.artigos[index];
  if (!artigo) return;

  const anterior = data.artigos[index - 1];
  const proximo = data.artigos[index + 1];

  if (breadcrumb) {
    breadcrumb.innerHTML = `📚 Biblioteca › ${data.icone} ${data.nome} › #${numero}`;
  }

  container.innerHTML = `
    <header>
      <span class="archive-number">ARQUIVO #${artigo.numero}</span>
      <h1>${artigo.titulo}</h1>
      <div class="meta">
        <span>por ${artigo.autor}</span>
        <span>${artigo.data}</span>
      </div>
    </header>
     <div class="article-body">
      ${artigo.conteudo}
      ${artigo.eixos ? renderEixos(artigo.eixos) : ''}
      ${artigo.transversais ? renderTransversais(artigo.transversais) : ''}
      ${artigo.representantes ? renderCouncilCards(artigo.representantes) : ''}
      ${artigo.extra ? `<div class="article-extra">${artigo.extra}</div>` : ''}
    </div>
    <footer class="article-footer">
      ${anterior
        ? `<button class="article-nav-btn" onclick="openArticle('${section}', '${anterior.numero}')">← ${anterior.titulo}</button>`
        : `<button class="article-nav-btn" disabled>← Início da Linha</button>`
      }
      <button class="article-nav-btn" onclick="renderSectionList('${section}')">📖 Lista Completa</button>
      ${proximo
        ? `<button class="article-nav-btn" onclick="openArticle('${section}', '${proximo.numero}')">${proximo.titulo} →</button>`
        : `<button class="article-nav-btn" disabled>Fim da Linha →</button>`
      }
    </footer>
  `;

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (typeof attachSoundsLore === 'function') {
    setTimeout(attachSoundsLore, 100);
  }
}

function renderCouncilCards(representantes) {
  const cards = representantes.map(r => `
    <div class="council-card" style="--council-color: ${r.cor};">
      <div class="council-avatar"></div>
      <div class="council-type">${r.tipo}</div>
      <div class="council-role">${r.cargo}</div>
      <div class="council-world">${r.mundo}</div>
      <div class="council-name">A DEFINIR</div>
      <div class="council-resp">${r.responsabilidades}</div>
    </div>
  `).join('');

  return `
    <div class="council-highlight">
      <div class="council-notice">
        ⚜️ <b>ASSENTOS EM PROCESSO DE DESIGNAÇÃO</b><br>
        Os nomes dos representantes serão anunciados em breve pelo Conselho.
      </div>
      <div class="council-grid">
        ${cards}
      </div>
    </div>
  `;
}

function renderEixos(eixos) {
  const cards = eixos.lista.map(e => `
    <div class="eixo-card">
      <div class="eixo-icon">${e.icone}</div>
      <div class="eixo-nome">${e.nome}</div>
      <div class="eixo-desc">${e.descricao}</div>
    </div>
  `).join('');

  return `
    <h3 class="section-divider">${eixos.titulo}</h3>
    <p class="section-intro">${eixos.subtitulo}</p>
    <div class="eixos-grid">
      ${cards}
    </div>
  `;
}

function renderTransversais(t) {
  const cards = t.lista.map(e => `
    <div class="transversal-card">
      <div class="transversal-icon">${e.icone}</div>
      <div class="transversal-info">
        <div class="transversal-nome">${e.nome}</div>
        <div class="transversal-desc">${e.descricao}</div>
      </div>
    </div>
  `).join('');

  return `
    <h3 class="section-divider">${t.titulo}</h3>
    <p class="section-intro">${t.subtitulo}</p>
    <div class="transversais-grid">
      ${cards}
    </div>
  `;
}

// ============================================
// SISTEMA SOLAR (placeholder até Etapa 3)
// ============================================
function renderSolarSystem() {
  const solar = document.getElementById('solarSystem');
  if (!solar) return;

  solar.innerHTML = '';

  // Sol
  const sun = document.createElement('div');
  sun.className = 'sun';
  solar.appendChild(sun);

  // Planetas — cada um com um offset inicial pra não alinhar
  const planets = [
    { nome: 'FERRUM',     imagem: 'ferrum.png',     cor: '#ff3344', tamanho: 20, velocidade: 30, offset: 0 },
    { nome: 'KAAL-7',     imagem: 'kaal7.png',      cor: '#ffcc00', tamanho: 40, velocidade: 45, offset: 90 },
    { nome: 'RIMKÓPOLIS', imagem: 'rimkopolis.png', cor: '#aaff00', tamanho: 60, velocidade: 60, offset: 200 },
    { nome: 'NEREIDA',    imagem: 'nereida.png',    cor: '#33ff00', tamanho: 80, velocidade: 75, offset: 305 }
  ];

  planets.forEach(p => {
    // Órbita
    const orbit = document.createElement('div');
    orbit.className = 'orbit';
    orbit.style.width = p.tamanho + '%';
    orbit.style.height = p.tamanho + '%';
    orbit.style.animationDuration = p.velocidade + 's';
    // ⚡ Delay negativo faz começar em posição diferente
    orbit.style.animationDelay = `-${(p.offset / 360) * p.velocidade}s`;
    solar.appendChild(orbit);

    // Planeta
    const wrapper = document.createElement('div');
    wrapper.className = 'planet-wrapper';

    const btn = document.createElement('button');
    btn.className = 'planet-btn';
    btn.style.setProperty('--planet-color', p.cor);
    btn.style.backgroundImage = `url('/images/planetas/${p.imagem}')`;
    btn.style.animationDuration = p.velocidade + 's';
    btn.style.animationDelay = `-${(p.offset / 360) * p.velocidade}s`;
    btn.title = `Explorar ${p.nome}`;
    btn.onclick = () => openPlanet(p.nome);

    const label = document.createElement('span');
    label.className = 'planet-label';
    label.style.setProperty('--planet-color', p.cor);
    label.textContent = p.nome;

    btn.appendChild(label);
    wrapper.appendChild(btn);
    orbit.appendChild(wrapper);
  });
}

async function openPlanet(nome) {
  const container = document.getElementById('articleContent');
  const breadcrumb = document.getElementById('articleBreadcrumb');
  if (!container) return;

  container.innerHTML = '<header><h1>Carregando...</h1></header>';

  // Carrega dados dos mundos
  const data = await loadSection('mundos');
  if (!data) {
    container.innerHTML = '<header><h1>Erro ao carregar</h1></header>';
    return;
  }

  // Acha o planeta (aceita nome OU id, case-insensitive)
  const planet = data.planetas.find(p =>
    p.nome.toLowerCase() === nome.toLowerCase() ||
    p.id.toLowerCase() === nome.toLowerCase()
  );
  if (!planet) {
    container.innerHTML = `<header><h1>Planeta não encontrado: ${nome}</h1></header>`;
    return;
  }

  if (breadcrumb) {
    breadcrumb.innerHTML = `📚 Biblioteca › 🪐 Mundos › ${planet.nome}`;
  }

  // Renderiza cada seção como um bloco
  const secoesHTML = planet.secoes.map(s => `
    <section class="planet-section" id="section-${s.id}">
      <h3 class="planet-section-title">
        <span class="planet-section-icon">${s.icone}</span>
        ${s.titulo}
      </h3>
      <div class="planet-section-content">
        ${s.conteudo}
      </div>
    </section>
  `).join('');

  // Menu de navegação lateral (âncoras)
  const navHTML = planet.secoes.map(s =>
    `<a href="#section-${s.id}" class="planet-nav-item">${s.icone} ${s.titulo}</a>`
  ).join('');

  container.innerHTML = `
    <header>
      <span class="archive-number" style="color:${planet.cor}; border-color:${planet.cor}; background:${planet.cor}15;">
        🪐 ${planet.range}
      </span>
      <h1 style="color:${planet.cor}; text-shadow: 0 0 15px ${planet.cor};">${planet.nome}</h1>
      <p class="planet-epithet" style="color:${planet.cor};">${planet.epiteto}</p>
    </header>

    <div class="planet-layout">
      <aside class="planet-nav">
        <div class="planet-nav-title">NAVEGAR</div>
        ${navHTML}
      </aside>

      <div class="planet-body">
        ${secoesHTML}
      </div>
    </div>

    <footer class="article-footer">
      <button class="article-nav-btn" onclick="backToSolarSystem()">← Voltar ao Sistema Solar</button>
    </footer>
  `;

  showView('view-article');

  if (typeof attachSoundsLore === 'function') {
    setTimeout(attachSoundsLore, 100);
  }
}

// Volta pro sistema solar sem quebrar o histórico
function backToSolarSystem() {
  viewHistory = [];
  showView('view-worlds', { pushHistory: false });
}

// ============================================
// COFRE ZUNK
// ============================================
function acceptVault() {
  soundVaultAccept();
  renderVaultPlaceholder();
  showView('view-vault-content');
}

function cancelVault() {
  // Som curto de "fechando" — descendente
  playSeqLore([[880, 0.06], [660, 0.06], [440, 0.1]]);
  showView('view-shelf', { pushHistory: false });
  viewHistory = [];
}

async function renderVaultPlaceholder(paginaIdx) {
  const container = document.getElementById('vaultContent');
  const breadcrumb = document.getElementById('articleBreadcrumb');
  if (!container) return;

  if (paginaIdx === undefined) paginaIdx = 0;

  container.innerHTML = '<header><h1>Carregando...</h1></header>';

  const data = await loadSection('zunk');
  if (!data || !data.paginas) {
    container.innerHTML = '<header><h1>Erro ao carregar arquivo</h1></header>';
    return;
  }

  const pagina = data.paginas[paginaIdx];
  if (!pagina) return;

  const anterior = data.paginas[paginaIdx - 1];
  const proximo = data.paginas[paginaIdx + 1];

  if (breadcrumb) {
    breadcrumb.innerHTML = `📚 Biblioteca › 🔴 Arquivo Zunk › Página ${paginaIdx + 1} de ${data.paginas.length}`;
  }

  // Foto principal (cabeça do alien)
  const fotoHTML = pagina.foto
    ? `<div class="vault-foto-box">
         <img src="${pagina.foto}" alt="${pagina.titulo}" class="vault-foto">
         <span class="vault-foto-legenda">AMOSTRA VISUAL — ${pagina.numero}</span>
       </div>`
    : '';

  // Card do planeta natal (só nas castas)
  const planetaHTML = pagina.planeta ? `
    <div class="vault-planeta-box">
      <div class="vault-planeta-label">PLANETA NATAL:</div>
      <div class="vault-planeta-row">
        <img src="${pagina.planeta_foto}" alt="${pagina.planeta}" class="vault-planeta-img">
        <div>
          <div class="vault-planeta-nome">${pagina.planeta}</div>
          <div class="vault-planeta-sub">Sistema Zunk'nir</div>
        </div>
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <!-- Selo confidencial -->
    <div class="vault-selo">⚠️ CONFIDENCIAL · NÃO REPRODUZIR ⚠️</div>

    <header class="vault-header">
      <div class="vault-header-top">
        <span class="vault-org">COMISSÃO DE DEFESA DO SISTEMA RÍMKAR</span>
        <span class="vault-ano">${data.ano}</span>
      </div>
      <div class="vault-header-line"></div>
      <span class="archive-number vault-archive-number">ARQUIVO #${pagina.numero} · ${pagina.icone} ${data.classificacao}</span>
      <h1>${pagina.titulo}</h1>
      <p class="vault-subtitulo">${pagina.subtitulo}</p>
      <div class="vault-header-line"></div>
    </header>

    <div class="vault-layout">
      <div class="vault-content-area">
        <div class="vault-body">
          ${pagina.conteudo}
        </div>
        ${planetaHTML}
      </div>
      <div class="vault-side">
        ${fotoHTML}
      </div>
    </div>

    <footer class="article-footer">
      ${anterior
        ? `<button class="article-nav-btn vault-nav" onclick="renderVaultPlaceholder(${paginaIdx - 1})">← ${anterior.titulo}</button>`
        : `<button class="article-nav-btn" disabled>← Início do Arquivo</button>`
      }
      <button class="article-nav-btn vault-nav" onclick="viewHistory = []; showView('view-shelf', { pushHistory: false });">📚 Sair do Cofre</button>
      ${proximo
        ? `<button class="article-nav-btn vault-nav" onclick="renderVaultPlaceholder(${paginaIdx + 1})">${proximo.titulo} →</button>`
        : `<button class="article-nav-btn" disabled>Fim do Arquivo →</button>`
      }
    </footer>

    <div class="vault-rodape">— FIM DA PÁGINA ${paginaIdx + 1} —</div>
  `;

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (typeof attachSoundsLore === 'function') {
    setTimeout(attachSoundsLore, 100);
  }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Aplica cliques nos cards-livro
  document.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', () => {
      const section = card.dataset.section;
      openBook(section);
    });
  });

  // Aplica clique no cofre
  const vaultCard = document.querySelector('.vault-card');
  if (vaultCard) {
    vaultCard.addEventListener('click', () => openBook('zunk'));
  }

    // Botão global voltar (topo esquerdo)
  const globalBtn = document.getElementById('globalBackBtn');
  if (globalBtn) {
    globalBtn.addEventListener('click', (e) => {
      // Se estamos na estante, deixa ir pra home (href="/")
      if (globalBtn.dataset.action === 'home') {
        return; // comportamento padrão do <a>
      }
      // Senão, força voltar pra estante
      e.preventDefault();
      viewHistory = [];
      showView('view-shelf', { pushHistory: false });
    });
  }

  // Botão "← Voltar à Estante" dentro da view de artigo
  const btnBackToShelf = document.getElementById('btnBackToShelf');
  if (btnBackToShelf) {
    btnBackToShelf.addEventListener('click', () => {
      viewHistory = [];
      showView('view-shelf', { pushHistory: false });
    });
  }

  // Botão "← Voltar à Estante" dentro da view de mundos
  const btnBackFromWorlds = document.getElementById('btnBackFromWorlds');
  if (btnBackFromWorlds) {
    btnBackFromWorlds.addEventListener('click', () => {
      viewHistory = [];
      showView('view-shelf', { pushHistory: false });
    });
  }

  // Botão "← Voltar à Estante" dentro do cofre
  const btnBackFromVault = document.getElementById('btnBackFromVault');
  if (btnBackFromVault) {
    btnBackFromVault.addEventListener('click', () => {
      viewHistory = [];
      showView('view-shelf', { pushHistory: false });
    });
  }

  // Botões do aviso do cofre
  const btnAccept = document.getElementById('btnAcceptVault');
  const btnCancel = document.getElementById('btnCancelVault');
  if (btnAccept) btnAccept.addEventListener('click', acceptVault);
  if (btnCancel) btnCancel.addEventListener('click', cancelVault);

  // Inicializa o botão global
  updateGlobalBackBtn();
});


// ============================================
// SISTEMA DE ÁUDIO — versão completa e corrigida
// ============================================
let audioCtxLore = null;
let soundEnabledLore = localStorage.getItem('alpha_sound') !== 'false';

function getAudioCtxLore() {
  if (audioCtxLore) {
    if (audioCtxLore.state === 'suspended') audioCtxLore.resume().catch(() => {});
    return audioCtxLore;
  }
  try {
    audioCtxLore = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return null; }
  if (audioCtxLore.state === 'suspended') audioCtxLore.resume().catch(() => {});
  return audioCtxLore;
}

function playSoundLore(freq, duration, type, vol) {
  if (!soundEnabledLore) return;
  const ctx = getAudioCtxLore();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playSeqLore(notes) {
  if (!soundEnabledLore) return;
  let t = 0;
  notes.forEach(n => {
    setTimeout(() => playSoundLore(n[0], n[1], n[2] || 'square', n[3] || 0.04), t);
    t += n[1] * 1000 * 0.85;
  });
}

function soundHoverLore() {
  playSoundLore(1400, 0.04, 'square', 0.02);
}

function soundClickLore() {
  playSeqLore([[1600, 0.04, 'square', 0.04], [2000, 0.06, 'square', 0.035]]);
}

function soundOpenBook() {
  playSeqLore([[880, 0.05], [1320, 0.06], [1100, 0.08], [880, 0.06]]);
}

function soundVaultAlarm() {
  playSeqLore([
    [440, 0.15, 'sawtooth', 0.06],
    [330, 0.15, 'sawtooth', 0.06],
    [440, 0.15, 'sawtooth', 0.06],
    [330, 0.15, 'sawtooth', 0.06],
    [220, 0.4, 'sawtooth', 0.07],
    [150, 0.6, 'sawtooth', 0.07]
  ]);
}

function soundVaultAccept() {
  playSeqLore([
    [660, 0.08, 'square', 0.05],
    [880, 0.08, 'square', 0.05],
    [1320, 0.2, 'triangle', 0.06]
  ]);
}

function toggleSoundLore() {
  soundEnabledLore = !soundEnabledLore;
  localStorage.setItem('alpha_sound', soundEnabledLore);
  const btn = document.getElementById('soundToggle');
  if (btn) {
    btn.innerText = soundEnabledLore ? '🔊' : '🔇';
    btn.classList.toggle('muted', !soundEnabledLore);
  }
  if (soundEnabledLore) {
    getAudioCtxLore();
    setTimeout(() => playSeqLore([[880, 0.05], [1320, 0.08]]), 30);
  }
}

function attachSoundsLore() {
  const selectors = [
    '.book-card',
    '.vault-card',
    '.planet-btn',
    '.article-back',
    '.article-nav-btn',
    '.warning-cancel',
    '.warning-accept',
    '.back-btn',
    '.sound-toggle'
  ];

  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (el.dataset.soundAttached) return;
      el.dataset.soundAttached = 'true';
      el.addEventListener('mouseenter', soundHoverLore);
      el.addEventListener('click', () => {
        if (el.classList.contains('book-card')) {
          soundOpenBook();
        } else {
          soundClickLore();
        }
      });
    });
  });
}

// Inicializa botão de som + aplica sons
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('soundToggle');
  if (btn) {
    btn.innerText = soundEnabledLore ? '🔊' : '🔇';
    btn.classList.toggle('muted', !soundEnabledLore);
  }
  attachSoundsLore();
  setTimeout(attachSoundsLore, 1000);
});
