/* ============================================================
   CONTA COMPARTILHADA (Supabase Auth) — a mesma conta do RimkRadio
   - Login/cadastro por nome de usuário (vira o mesmo e-mail interno do RimkRadio).
   - O NOME da conta vai para alpha_name (os jogos usam esse nome, travado).
   - O AVATAR da conta (camadas do RimkRadio) fica separado em alpha_conta_avatar e
     só aparece no hub (topo do Portal e Rimkerama). Os jogos continuam usando o
     personagem do universo (alpha_avatar / alpha_race), que NÃO é tocado aqui.
   - Precisa, antes deste arquivo: supabase-js (CDN). Nas páginas com avatar: /shared/avatar.js.
   ============================================================ */
(function () {
  'use strict';

  const NAME_RE = /^[\p{L}\p{N}_.\-]{3,20}$/u;
  const K = { name: 'alpha_name', guestName: 'alpha_name_convidado', cavatar: 'alpha_conta_avatar', flag: 'alpha_conta' };

  // Universo: ano atual do jogo e raça -> planeta natal (conforme o lore do Portal).
  const ANO_JOGO = 847;
  const IDADE_MAX = 120;                       // a lista de anos vai de 847 até 847 - IDADE_MAX
  const RACAS = {                              // chave = cor/raça escolhida no editor de avatar
    rimk:    { nome: 'Rimk',    planeta: 'Rimkópolis', img: 'rimkopolis.png' },
    sahrin:  { nome: 'Sahrin',  planeta: 'Kaal-7',     img: 'kaal7.png' },
    vharn:   { nome: 'Vharn',   planeta: 'Nyxaris',    img: 'nyxaris.png' },
    thraak:  { nome: 'Thraak',  planeta: 'Kaldr',      img: 'kaldr.png' },
    ferrum:  { nome: 'Ferrum',  planeta: 'Ferrum',     img: 'ferrum.png' },
    nereids: { nome: 'Nereids', planeta: 'Nereida',    img: 'nereida.png' }
  };
  const GENEROS = { feminino: 'Feminino', masculino: 'Masculino', nenhum: 'Nenhum' };

  const Conta = window.Conta = { user: null, avatar: null, info: { birthYear: null, gender: null }, sb: null, ready: null };
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const hasAvatarLib = () => !!window.RimkAvatar;

  // primeira pintura já com o último avatar conhecido (antes de falar com o servidor)
  if (ls.get(K.flag) && hasAvatarLib()) {
    try { Conta.avatar = window.RimkAvatar.clean(JSON.parse(ls.get(K.cavatar) || 'null')); } catch (e) { Conta.avatar = null; }
  }
  // Personagem usado nos jogos = avatar da conta (convidado ou sem avatar: Rimk básico).
  Conta.gameAvatar = function () {
    if (!hasAvatarLib()) return null;
    let av = Conta.avatar;
    if (!av) { try { av = window.RimkAvatar.clean(JSON.parse(ls.get(K.cavatar) || 'null')); } catch (e) { av = null; } }
    return av || { b: 'rimk', bg: null, i: [] };
  };
  Conta.avatarHTML = function () {
    return Conta.avatar && hasAvatarLib() ? window.RimkAvatar.html(Conta.avatar) : '';
  };

  // IGUAL ao RimkRadio (script.js, authEmail): se mudar aqui, ninguém consegue entrar.
  async function authEmail(name) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(name).trim().toLowerCase()));
    return 'u' + Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32) + '@syncwave.app';
  }

  function errText(err) {
    const code = String((err && err.code) || ''), msg = String((err && err.message) || '');
    if (code === 'user_already_exists' || /already (registered|been registered)/i.test(msg)) return 'Esse nome já está em uso. Escolha outro.';
    if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) return 'O Supabase está exigindo confirmação por e-mail (desligue "Confirm email" no painel).';
    if (code === 'weak_password') return 'Senha fraca demais. Use uma senha mais longa.';
    if (code === 'signup_disabled') return 'Criar contas está desativado no Supabase.';
    if (/rate.?limit/i.test(code) || (err && err.status === 429)) return 'Muitas tentativas. Espere um pouco e tente de novo.';
    if (/Database error/i.test(msg)) return 'Esse nome já está em uso ou não é válido. Tente outro.';
    return '';
  }

  /* ---------- conexão ---------- */
  async function connect() {
    for (let i = 0; i < 50 && !(window.supabase && window.supabase.createClient); i++) await sleep(100);
    if (!(window.supabase && window.supabase.createClient)) throw new Error('supabase-js não carregou');
    const r = await fetch('/supabase-config.json', { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('Supabase não configurado no servidor');
    const c = await r.json();
    if (!c || !c.url || !c.anonKey) throw new Error('Supabase não configurado no servidor');
    Conta.sb = window.supabase.createClient(c.url, c.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    return Conta.sb;
  }

  /* ---------- estado ---------- */
  const snapshot = () => JSON.stringify([Conta.user && Conta.user.username, Conta.avatar, Conta.info]);

  function repaint() {
    // redesenha o que cada página já sabe desenhar (as funções existem só em algumas)
    ['renderProfileMini', 'renderProfileCorner', 'loadProfile', 'updatePreview'].forEach((fn) => {
      try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.warn(e); }
    });
    lockNameInputs();
    paintPanel();
  }
  function lockNameInputs() {
    // campo de apelido dos jogos (#username) e do perfil do universo (#modalUsername)
    ['username', 'modalUsername'].forEach((id) => {
      const i = $(id); if (!i) return;
      if (Conta.user) { i.value = Conta.user.username; i.readOnly = true; i.title = 'Seu nome vem da sua conta'; }
      else if (i.readOnly && i.title === 'Seu nome vem da sua conta') { i.readOnly = false; i.title = ''; }
    });
  }

  async function refreshAvatar() {
    if (!hasAvatarLib()) return;          // páginas de jogo não usam o avatar da conta
    try {
      const { data, error } = await Conta.sb.rpc('avatars_for', { p_names: [Conta.user.username] });
      if (error) throw error;
      const row = (data || [])[0];
      Conta.avatar = row ? window.RimkAvatar.clean(row.avatar) : null;
      ls.set(K.cavatar, JSON.stringify(Conta.avatar));
    } catch (e) { console.warn('Não consegui carregar o avatar da conta:', e && e.message || e); }
  }

  function readInfo(meta) {
    const y = Number(meta && meta.birth_year), g = meta && meta.gender;
    return {
      birthYear: Number.isInteger(y) && y <= ANO_JOGO && y >= ANO_JOGO - IDADE_MAX ? y : null,
      gender: GENEROS[g] ? g : null
    };
  }

  async function applyUser(u, fallbackName) {
    let name = (u.user_metadata && u.user_metadata.username) || fallbackName;
    if (!name) {
      const r = await Conta.sb.from('profiles').select('username').eq('id', u.id).maybeSingle();
      name = r.data && r.data.username;
    }
    if (!name) return false;
    const before = snapshot();
    // guarda o apelido de convidado para devolver quando a pessoa sair da conta
    if (!ls.get(K.flag) && ls.get(K.name)) ls.set(K.guestName, ls.get(K.name));
    Conta.user = { id: u.id, username: name };
    Conta.info = readInfo(u.user_metadata);
    ls.set(K.name, name); ls.set(K.flag, '1');
    await refreshAvatar();
    if (snapshot() !== before) repaint(); else lockNameInputs();
    return true;
  }

  function clearUser() {
    const had = !!Conta.user;
    Conta.user = null; Conta.avatar = null; Conta.info = { birthYear: null, gender: null };
    if (ls.get(K.flag)) {
      [K.name, K.cavatar, K.flag].forEach(ls.del);
      const g = ls.get(K.guestName); if (g) { ls.set(K.name, g); ls.del(K.guestName); }
    }
    if (had) repaint();
  }

  /* ---------- ações ---------- */
  let fails = [], busy = false;

  Conta.login = async function (name, pass) {
    name = String(name || '').trim();
    if (!(window.crypto && crypto.subtle)) return 'Seu navegador não suporta criptografia aqui. Abra o site por HTTPS.';
    if (!NAME_RE.test(name)) return 'O nome precisa ter de 3 a 20 caracteres: letras, números, _ . ou -';
    if (String(pass || '').length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (!Conta.sb) return 'Não consegui falar com o servidor de contas. Recarregue a página.';
    fails = fails.filter((t) => Date.now() - t < 60000);
    if (fails.length >= 5) return 'Muitas tentativas erradas. Espere 1 minuto.';
    const { data, error } = await Conta.sb.auth.signInWithPassword({ email: await authEmail(name), password: pass });
    if (error) {
      const t = errText(error); if (t) return t;
      fails.push(Date.now()); return 'Nome ou senha incorretos.';
    }
    await applyUser(data.user, name);
    return '';
  };

  Conta.register = async function (name, pass, pass2) {
    name = String(name || '').trim();
    if (!(window.crypto && crypto.subtle)) return 'Seu navegador não suporta criptografia aqui. Abra o site por HTTPS.';
    if (!NAME_RE.test(name)) return 'O nome precisa ter de 3 a 20 caracteres: letras, números, _ . ou -';
    if (String(pass || '').length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (pass !== pass2) return 'As senhas não conferem.';
    if (!Conta.sb) return 'Não consegui falar com o servidor de contas. Recarregue a página.';
    const email = await authEmail(name);
    const free = await Conta.sb.rpc('username_available', { p_name: name });
    if (!free.error && free.data === false) return 'Esse nome já está em uso. Escolha outro.';
    const { data, error } = await Conta.sb.auth.signUp({ email, password: pass, options: { data: { username: name } } });
    if (error) return errText(error) || 'Não consegui criar a conta. Tente de novo.';
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return 'Esse nome já está em uso. Escolha outro.';
    let session = data.session;
    if (!session) {
      const r = await Conta.sb.auth.signInWithPassword({ email, password: pass });
      if (r.error) return errText(r.error) || 'Conta criada, mas não consegui entrar. Tente entrar manualmente.';
      session = r.data.session;
    }
    await applyUser(session.user, name);
    return '';
  };

  Conta.logout = async function () {
    const sb = Conta.sb;
    clearUser();
    if (sb) sb.auth.signOut().catch((e) => console.warn(e));
  };

  // Salva o avatar na conta (mesma função do banco que o RimkRadio usa).
  Conta.saveAvatar = async function (av) {
    if (!Conta.sb || !Conta.user) return false;
    const { error } = await Conta.sb.rpc('set_my_avatar', { p_avatar: av });
    if (error) { console.error(error); return false; }
    Conta.avatar = hasAvatarLib() ? window.RimkAvatar.clean(av) : av;
    ls.set(K.cavatar, JSON.stringify(Conta.avatar));
    repaint();
    return true;
  };

  // Ano de nascimento e gênero ficam na própria conta (user_metadata do Supabase Auth).
  Conta.saveInfo = async function (info) {
    if (!Conta.sb || !Conta.user) return false;
    const next = readInfo({ birth_year: info && info.birthYear, gender: info && info.gender });
    const { error } = await Conta.sb.auth.updateUser({
      data: { username: Conta.user.username, birth_year: next.birthYear, gender: next.gender }
    });
    if (error) { console.error(error); return false; }
    Conta.info = next;
    paintPanel();
    return true;
  };

  Conta.editAvatar = function () {
    if (!Conta.user || !hasAvatarLib()) return;
    close();
    window.RimkAvatar.open({ current: Conta.avatar, onSave: Conta.saveAvatar });
  };

  /* ---------- janelinha (login / conta) ---------- */
  let modal = null, mode = 'login';

  function injectStyle() {
    const st = document.createElement('style');
    st.textContent = `
    .ct-back{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:1rem;background:rgba(0,0,0,.75)}
    .ct-back.open{display:flex}
    .ct-card{width:min(22rem,100%);max-height:calc(100dvh - 2rem);overflow-y:auto;padding:1.3rem 1.2rem;border-radius:14px;background:var(--bg-card,#15150a);border:1px solid var(--matrix-dim,#558800);box-shadow:0 0 28px rgba(153,255,0,.15);color:var(--text-primary,#edf5e0);font-family:inherit}
    .ct-card h3{margin:0 0 .8rem;font-size:1.05rem;color:var(--matrix-green,#99ff00)}
    .ct-tabs{display:flex;gap:.4rem;margin-bottom:.9rem}
    .ct-tabs button{flex:1;padding:.45rem;border-radius:8px;border:1px solid var(--matrix-dark,#223300);background:transparent;color:var(--text-secondary,#99aa88);cursor:pointer;font:inherit}
    .ct-tabs button[aria-selected="true"]{color:#112200;background:var(--matrix-green,#99ff00);border-color:var(--matrix-green,#99ff00)}
    .ct-card input{display:block;width:100%;box-sizing:border-box;margin:0 0 .6rem;padding:.6rem .7rem;border-radius:8px;border:1px solid var(--matrix-dark,#223300);background:var(--bg-deep,#070a02);color:var(--text-primary,#edf5e0);font:inherit}
    .ct-btn{display:block;width:100%;padding:.6rem;border-radius:8px;border:1px solid var(--matrix-green,#99ff00);background:var(--matrix-green,#99ff00);color:#112200;font:inherit;font-weight:700;cursor:pointer;text-align:center;text-decoration:none;box-sizing:border-box}
    .ct-btn.alt{background:transparent;color:var(--matrix-green,#99ff00);margin-top:.5rem}
    .ct-btn:disabled{opacity:.5;cursor:wait}
    .ct-link{display:block;margin:.8rem auto 0;background:none;border:0;color:var(--text-secondary,#99aa88);text-decoration:underline;cursor:pointer;font:inherit;font-size:.85rem}
    .ct-err{min-height:1.1rem;margin:.1rem 0 .6rem;font-size:.82rem;color:var(--alert-red,#ff3366)}
    .ct-av{width:7rem;height:7rem;margin:0 auto .7rem;border-radius:14px;overflow:hidden;border:1px solid var(--matrix-dim,#558800);background:#000;display:flex;align-items:center;justify-content:center;font-size:2.4rem}
    .ct-name{text-align:center;font-weight:700;margin-bottom:.9rem}
    .ct-sec{margin:.2rem 0 .9rem;padding:.8rem .8rem .5rem;border-radius:10px;border:1px solid var(--matrix-dark,#223300);background:rgba(153,255,0,.04)}
    .ct-sec h4{margin:0 0 .65rem;font-size:.85rem;letter-spacing:.04em;text-transform:uppercase;color:var(--gold-imperial,#ffcc00)}
    .ct-row{display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin:0 0 .6rem;font-size:.85rem}
    .ct-row > span:first-child{color:var(--text-secondary,#99aa88);flex-shrink:0}
    .ct-val{display:flex;align-items:center;gap:.4rem;font-weight:700;text-align:right}
    .ct-val img{width:1.5rem;height:1.5rem;border-radius:50%;object-fit:cover}
    .ct-card select{width:8.5rem;flex-shrink:0;box-sizing:border-box;padding:.4rem .5rem;border-radius:8px;border:1px solid var(--matrix-dim,#558800);background:var(--bg-deep,#070a02);color:var(--text-primary,#edf5e0);font:inherit;font-size:.85rem}
    .ct-card select option{background:#070a02;color:#edf5e0}
    .ct-info-msg{min-height:1rem;margin:0 0 .3rem;font-size:.75rem;text-align:center;color:var(--text-secondary,#99aa88)}
    .ct-hint{font-size:.78rem;color:var(--text-secondary,#99aa88);text-align:center;margin:.6rem 0 0;line-height:1.35}`;
    document.head.appendChild(st);
  }

  function build() {
    injectStyle();
    modal = document.createElement('div');
    modal.className = 'ct-back'; modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
    <div class="ct-card" role="dialog" aria-modal="true">
      <div id="ct-guest">
        <h3 id="ct-title">Entrar na sua conta</h3>
        <div class="ct-tabs">
          <button type="button" id="ct-tab-login" aria-selected="true">Entrar</button>
          <button type="button" id="ct-tab-reg" aria-selected="false">Criar conta</button>
        </div>
        <input id="ct-name" type="text" placeholder="Nome de usuário" maxlength="20" autocomplete="username">
        <input id="ct-pass" type="password" placeholder="Senha" autocomplete="current-password">
        <input id="ct-pass2" type="password" placeholder="Repita a senha" autocomplete="new-password" style="display:none">
        <div class="ct-err" id="ct-err" role="alert"></div>
        <button type="button" class="ct-btn" id="ct-submit">Entrar</button>
        <p class="ct-hint">É a mesma conta do RimkRadio.</p>
        <button type="button" class="ct-link" id="ct-guestbtn">Continuar como convidado</button>
      </div>
      <div id="ct-acc" style="display:none">
        <h3>Perfil do Cidadão</h3>
        <div class="ct-av" id="ct-acc-av"></div>
        <div class="ct-name" id="ct-acc-name"></div>
        <div class="ct-sec">
          <h4>Informações do cidadão</h4>
          <div class="ct-row"><span>Raça</span><span class="ct-val" id="ct-race">—</span></div>
          <div class="ct-row"><span>Planeta natal</span><span class="ct-val" id="ct-planet">—</span></div>
          <div class="ct-row"><span>Ano de nascimento</span><select id="ct-year" aria-label="Ano de nascimento"></select></div>
          <div class="ct-row"><span>Idade</span><span class="ct-val" id="ct-age">—</span></div>
          <div class="ct-row"><span>Gênero</span>
            <select id="ct-gender" aria-label="Gênero">
              ${Object.keys(GENEROS).map((k) => `<option value="${k}">${GENEROS[k]}</option>`).join('')}
            </select>
          </div>
          <div class="ct-info-msg" id="ct-info-msg" role="status"></div>
        </div>
        <button type="button" class="ct-btn" id="ct-edit-av">🎨 Editar avatar da conta</button>
        <button type="button" class="ct-btn alt" id="ct-logout">Sair</button>
        <p class="ct-hint">Este é o seu personagem: o avatar da conta aparece no Portal e também dentro dos jogos.</p>
        <button type="button" class="ct-link" id="ct-close">Fechar</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });
    $('ct-tab-login').onclick = () => setMode('login');
    $('ct-tab-reg').onclick = () => setMode('register');
    $('ct-close').onclick = close;
    $('ct-logout').onclick = async () => { await Conta.logout(); close(); };
    const yearSel = $('ct-year');
    yearSel.innerHTML =
      Array.from({ length: IDADE_MAX + 1 }, (_, i) => ANO_JOGO - i).map((y) => `<option value="${y}">${y}</option>`).join('');
    ['ct-year', 'ct-gender'].forEach((id) => $(id).addEventListener('change', async () => {
      const msg = $('ct-info-msg'); msg.textContent = 'Salvando…';
      const ok = await Conta.saveInfo({ birthYear: Number($('ct-year').value) || null, gender: $('ct-gender').value || null });
      msg.textContent = ok ? 'Salvo ✓' : 'Não consegui salvar. Tente de novo.';
      if (!ok) paintPanel();
    }));
    $('ct-edit-av').onclick = Conta.editAvatar;
    $('ct-guestbtn').onclick = close;
    ['ct-name', 'ct-pass', 'ct-pass2'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
    $('ct-submit').onclick = submit;
  }

  function setMode(m) {
    mode = m === 'register' ? 'register' : 'login';
    const reg = mode === 'register';
    $('ct-tab-login').setAttribute('aria-selected', String(!reg));
    $('ct-tab-reg').setAttribute('aria-selected', String(reg));
    $('ct-pass2').style.display = reg ? 'block' : 'none';
    $('ct-pass').autocomplete = reg ? 'new-password' : 'current-password';
    $('ct-title').textContent = reg ? 'Criar sua conta' : 'Entrar na sua conta';
    $('ct-submit').textContent = reg ? 'Criar conta' : 'Entrar';
    $('ct-err').textContent = '';
  }

  async function submit() {
    if (busy) return;
    busy = true; $('ct-submit').disabled = true; $('ct-err').textContent = '';
    try {
      await Conta.ready;
      const msg = mode === 'register'
        ? await Conta.register($('ct-name').value, $('ct-pass').value, $('ct-pass2').value)
        : await Conta.login($('ct-name').value, $('ct-pass').value);
      if (msg) { $('ct-err').textContent = msg; return; }
      $('ct-pass').value = ''; $('ct-pass2').value = '';
      paintPanel();
    } catch (e) {
      console.error(e); $('ct-err').textContent = 'Algo deu errado. Tente de novo.';
    } finally { busy = false; $('ct-submit').disabled = false; }
  }

  function paintPanel() {
    if (!modal) return;
    const logged = !!Conta.user;
    $('ct-guest').style.display = logged ? 'none' : 'block';
    $('ct-acc').style.display = logged ? 'block' : 'none';
    if (logged) {
      $('ct-acc-name').textContent = Conta.user.username;
      $('ct-acc-av').innerHTML = Conta.avatarHTML() || '👽';
      $('ct-edit-av').style.display = hasAvatarLib() ? 'block' : 'none';
      // raça e planeta vêm da cor/raça escolhida no editor de avatar (não são editáveis)
      const r = Conta.avatar && RACAS[Conta.avatar.b];
      $('ct-race').textContent = r ? r.nome : 'Crie seu avatar';
      $('ct-planet').innerHTML = r ? `<img src="/images/planetas/${r.img}" alt=""><span>${r.planeta}</span>` : '—';
      const by = Conta.info.birthYear;
      // sem opção "Selecione": enquanto não escolhido, o campo fica em branco
      $('ct-year').value = by ? String(by) : '';
      if (!by) $('ct-year').selectedIndex = -1;
      $('ct-gender').value = Conta.info.gender || '';
      if (!Conta.info.gender) $('ct-gender').selectedIndex = -1;
      const idade = by ? ANO_JOGO - by : null;
      $('ct-age').textContent = idade === null ? '—' : idade + (idade === 1 ? ' ano' : ' anos');
    }
  }

  function open() {
    if (!modal) build();
    paintPanel();
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    if (!Conta.user) { setMode('login'); setTimeout(() => $('ct-name').focus(), 50); }
  }
  function close() { if (modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); } }
  Conta.open = open; Conta.close = close;

  // O clique no perfil do Portal abre esta janelinha. O editor antigo de personagem
  // (raça/traje/fundo do universo) foi aposentado: o personagem dos jogos é o avatar da conta.
  function hookProfileButton() {
    if (typeof window.openProfileModal !== 'function' || window.openProfileModal === open) return;
    window.openProfileModal = open;
  }

  /* ---------- início ---------- */
  Conta.ready = (async function init() {
    try {
      await connect();
      Conta.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && Conta.user) clearUser(); });
      const { data } = await Conta.sb.auth.getSession();
      const u = data && data.session && data.session.user;
      if (u) { if (!(await applyUser(u))) clearUser(); }
      else if (ls.get(K.flag)) clearUser();       // sessão acabou: tira o que a conta tinha gravado
    } catch (e) { console.warn('Contas indisponíveis (o site segue em modo convidado):', e && e.message || e); }
    return Conta;
  })();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { hookProfileButton(); lockNameInputs(); });
  else { hookProfileButton(); lockNameInputs(); }
})();
