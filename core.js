// ════════════════════════════════════════════════════════════
// CORE — Setup, autenticação, sessão, roteamento, helpers gerais
// ════════════════════════════════════════════════════════════


  const SUPABASE_URL  = 'https://cofqapsaxrqlmxzpzbkr.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvZnFhcHNheHJxbG14enB6YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0OTMyMjcsImV4cCI6MjA5NTA2OTIyN30.p331KADbBKl6oPSQvxXpDAga3Hx_YwVDZTruKa6Rp8o';
  const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  const IS_ADM = window.location.pathname.startsWith('/adm');

  // ── Logo da rede social (armazenada no Supabase) ──────────
  let _logoUrl = null;
  async function getNetworkLogo() {
    if (_logoUrl) return _logoUrl;
    try {
      const { data } = await db.from('settings').select('value').eq('key', 'network_logo').maybeSingle();
      if (data && data.value) { _logoUrl = data.value; return _logoUrl; }
    } catch(e) { console.warn('Logo não carregada:', e); }
    return null;
  }
  async function applySplashGif() {
    try {
      const { data } = await db.from('settings').select('value').eq('key', 'splash_gif').maybeSingle();
      const gifEl   = document.getElementById('splash-custom-gif');
      const pokeEl  = document.getElementById('splash-pokeball');
      if (data && data.value && gifEl) {
        gifEl.src           = data.value;
        gifEl.style.display = 'block';
      }
    } catch(e) { /* silencioso — pokeball padrão permanece */ }
  }
  async function applyLogos() {
    const url = await getNetworkLogo();
    if (url) {
      document.querySelectorAll('.brand-logo-img').forEach(img => { img.src = url; img.style.display = 'inline-block'; });
      document.querySelectorAll('.brand-logo-placeholder').forEach(el => el.style.display = 'none');
    } else {
      document.querySelectorAll('.brand-logo-placeholder').forEach(el => el.style.display = '');
      document.querySelectorAll('.brand-logo-img').forEach(img => img.style.display = 'none');
    }
  }
  window.applyLogos = applyLogos;
  window.getNetworkLogo = getNetworkLogo;
  // Aguarda DOM pronto antes de tentar acessar elementos do splash
  async function applyFavicon() {
    try {
      const { data } = await supabase.from('settings').select('value').eq('key','favicon_url').maybeSingle();
      if (data?.value) {
        // remove qualquer favicon existente e recria para forçar reload
        document.querySelectorAll("link[rel*='icon']").forEach(l => l.remove());
        const link = document.createElement('link');
        link.rel  = 'icon';
        link.type = data.value.match(/\.png/i) ? 'image/png'
                  : data.value.match(/\.svg/i) ? 'image/svg+xml'
                  : data.value.match(/\.ico/i) ? 'image/x-icon'
                  : data.value.startsWith('data:') ? data.value.split(';')[0].replace('data:','')
                  : 'image/png';
        link.href = data.value + (data.value.includes('?') ? '&' : '?') + '_t=' + Date.now();
        document.head.appendChild(link);
      }
    } catch(e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { applySplashGif(); applyLogos(); applyFavicon(); loadPokeetLogo(); loadWhatsappShareIcon(); });
  } else {
    applyFavicon();
    applySplashGif();
    applyLogos();
    loadPokeetLogo();
    loadWhatsappShareIcon();
  }

  // Estado de autenticação — declarado aqui para evitar "before initialization"
  var isRegisterMode = false;
  var currentUser    = null;


// ════════════════════════════════════════════════════════════
// POKÉGRAM AUTH
// ════════════════════════════════════════════════════════════

function saveSession(u) { localStorage.setItem('pg_user', JSON.stringify(u)); }
function loadSession()  {
  try {
    const val = JSON.parse(localStorage.getItem('pg_user'));
    if (!val) return null;
    // corrige sessão antiga que foi salva como array
    if (Array.isArray(val)) return val[0] || null;
    return val;
  } catch (e) { return null; }
}
function clearSession() { localStorage.removeItem('pg_user'); }

async function dbLogin(username, password) {
  // ── NPC fast-path: NPCs não têm conta no Supabase Auth ──
  try {
    const { data: npcUser } = await db.from('users')
      .select('*').eq('username', username).eq('is_npc', true).maybeSingle();
    if (npcUser) {
      // Tenta password_plain primeiro (texto limpo)
      if (npcUser.password_plain && npcUser.password_plain === password) return npcUser;
      // Tenta verificar o password_hash via RPC (hash bcrypt do set_npc_password)
      if (npcUser.password_hash) {
        const { data: ok } = await db.rpc('check_npc_password', { p_id: npcUser.id, p_password: password });
        if (ok) return npcUser;
      }
      // NPC existe mas nenhuma senha bate (ou não tem senha configurada)
      return null;
    }
  } catch(e) { /* ignora e segue para o Auth normal */ }

  const fakeEmail = username + '@pokegram.app';
  let authResult;
  try {
    authResult = await db.auth.signInWithPassword({ email: fakeEmail, password });
  } catch (netErr) {
    throw new Error('network');
  }
  const { data: authData, error: authError } = authResult;
  if (authError) {
    const msg = authError.message || '';
    const status = authError.status || 0;
    // Erro de schema interno do Supabase: trata como falha genérica recuperável
    if (msg.toLowerCase().includes('schema') || msg.toLowerCase().includes('database error')) {
      throw new Error('Erro interno do banco. Tente novamente em instantes.');
    }
    // Qualquer erro de credenciais (400, 401, ou mensagem de senha/invalid)
    // tenta o fallback por password_plain antes de desistir
    const isCredentialError = status === 400 || status === 401
      || msg.toLowerCase().includes('invalid')
      || msg.toLowerCase().includes('credentials')
      || msg.toLowerCase().includes('password')
      || msg.toLowerCase().includes('email')
      || msg.toLowerCase().includes('user');
    if (isCredentialError) {
      // FALLBACK: tenta senha em password_plain (usuários migrados)
      const { data: legacyUser } = await db.from('users')
        .select('*').ilike('username', username).eq('password_plain', password).maybeSingle();
      if (legacyUser) {
        // Cria no Supabase Auth para que nas próximas vezes já funcione normalmente
        try {
          await db.auth.signUp({ email: fakeEmail, password });
        } catch(e) { /* ignora */ }
        return legacyUser;
      }
      return null;
    }
    throw authError;
  }
  // busca dados completos do usuário na tabela users
  const { data: user } = await db.from('users').select('*').ilike('username', username).maybeSingle();
  // Usuário existe no Auth mas não na tabela users (cadastro incompleto anterior)
  if (!user && authData?.user?.id) {
    // Faz logout para não deixar sessão Auth sem perfil correspondente
    await db.auth.signOut().catch(() => {});
    throw new Error('Cadastro incompleto detectado. Por favor, refaça o cadastro com o mesmo usuário e senha.');
  }
  return user || null;
}
async function dbRegister(username, password, rpg, emoji, pronoun) {
  const fakeEmail = username + '@pokegram.app';
  let authUid = null;

  // 1. Tenta criar no Supabase Auth
  const { data: authData, error: authError } = await db.auth.signUp({ email: fakeEmail, password });

  if (authError) {
    const msg = authError.message || '';
    // "User already registered" = usuário fantasma (existe no Auth, não existe na tabela users)
    // Tenta fazer login com a mesma senha para recuperar o authUid
    if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered')) {
      const { data: loginData, error: loginError } = await db.auth.signInWithPassword({ email: fakeEmail, password });
      if (loginError) {
        // Senha diferente — usuário realmente já existe com outra senha
        throw new Error('Este usuário já está cadastrado. Tente fazer login.');
      }
      authUid = loginData?.user?.id;
      if (!authUid) throw new Error('Erro ao recuperar autenticação.');
      // Verifica se de fato não existe na tabela users (cadastro incompleto)
      const { data: existing } = await db.from('users').select('id').eq('id', authUid).maybeSingle();
      if (existing) {
        // Existe nos dois lugares — usuário realmente já cadastrado, só senha errada antes
        await db.auth.signOut().catch(() => {});
        throw new Error('Este usuário já está cadastrado. Tente fazer login.');
      }
      // Não existe na tabela users — pode completar o cadastro com esse authUid
    } else {
      throw authError;
    }
  } else {
    authUid = authData?.user?.id;
    if (!authUid) throw new Error('Erro ao criar autenticação.');
  }

  // 2. Cria na tabela users com o id do auth
  const { data: newUser, error: userError } = await db.from('users').insert({
    id: authUid,
    username,
    password_plain: '', // senha gerenciada pelo Supabase Auth
    rpg,
    pronoun: pronoun || null
  }).select('*').single();

  if (userError) {
    // Falhou o insert — faz logout para evitar sessão Auth sem perfil
    await db.auth.signOut().catch(() => {});
    throw userError;
  }

  return newUser || null;
}
async function dbCheckUserExists(username) {
  const { data } = await db.from('users').select('id').ilike('username', username).maybeSingle();
  return !!data;
}

let authCheckTimeout = null;
function sanitizeUsername(val) {
  // Remove acentos via NFD + strip combining marks, depois remove tudo que não seja a-z 0-9 _ .
  return val
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // á→a, ç→c, etc.
    .replace(/\s/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, ''); // bloqueia qualquer outro char especial
}
async function onAuthInput() {
  const raw      = document.getElementById('login-username').value;
  const username = sanitizeUsername(raw);
  // reflecte o valor normalizado no campo
  if (raw !== username) document.getElementById('login-username').value = username;
  clearTimeout(authCheckTimeout);
  if (username.length < 2) { setAuthMode('login'); document.getElementById('auth-hint').textContent = ''; return; }
  authCheckTimeout = setTimeout(async () => {
    const exists = await dbCheckUserExists(username);
    setAuthMode(exists ? 'login' : 'register');
    document.getElementById('auth-hint').textContent = exists ? 'Bem-vindo de volta!' : 'Usuário não encontrado — complete o cadastro abaixo.';
  }, 500);
}

function setAuthMode(mode) {
  isRegisterMode = mode === 'register';
  const rf  = document.getElementById('register-fields');
  const btn = document.getElementById('auth-btn');
  rf.style.display  = isRegisterMode ? 'flex' : 'none';
  btn.textContent   = isRegisterMode ? 'Cadastrar' : 'Entrar';
  hideAuthError();
}

function showAuthError(msg) { const e = document.getElementById('auth-error'); e.textContent = msg; e.style.display = 'block'; }
function hideAuthError()    { document.getElementById('auth-error').style.display = 'none'; }

async function doAuth() {
  hideAuthError();
  const username = sanitizeUsername(document.getElementById('login-username').value);
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('auth-btn');
  if (!username || !password) { showAuthError('Preencha usuário e senha.'); return; }
  btn.disabled = true; btn.textContent = 'Aguarde...';

  // Reconfirma o modo real antes de agir (evita falso "register" por timeout ou digitação rápida)
  try {
    const exists = await dbCheckUserExists(username);
    if (exists && isRegisterMode) setAuthMode('login');
    if (!exists && !isRegisterMode) {
      setAuthMode('register');
      showAuthError('Usuário não encontrado. Complete o cadastro abaixo.');
      btn.disabled = false; btn.textContent = 'Cadastrar';
      return;
    }
  } catch(e) { /* ignora erro de rede na revalidação e continua */ }

  try {
    if (isRegisterMode) {
      const confirm = document.getElementById('login-confirm').value;
      const rpg     = document.getElementById('login-rpg').value;
      const pronoun = document.getElementById('login-pronoun').value;
      if (password !== confirm) { showAuthError('As senhas não coincidem.'); return; }
      if (!rpg)                 { showAuthError('Selecione seu RPG.'); return; }
      if (!pronoun)             { showAuthError('Selecione seus pronomes.'); return; }
      if (password.length < 6)  { showAuthError('Senha deve ter ao menos 6 caracteres.'); return; }
      const user = await dbRegister(username, password, rpg, null, pronoun);
      if (!user) { showAuthError('Erro ao cadastrar. Tente novamente.'); return; }
      currentUser = user; saveSession(user); enterApp(user);
    } else {
      const user = await dbLogin(username, password);
      if (!user) { showAuthError('Usuário ou senha incorretos.'); return; }
      // re-fetch para garantir avatar_url e todos os campos atualizados
      const { data: fresh } = await db.from('users').select('*').eq('id', user.id).maybeSingle();
      const finalUser = fresh || user;
      currentUser = finalUser; saveSession(finalUser); enterApp(finalUser);
    }
  } catch(err) {
    console.error(err);
    if (err && err.message === 'network') {
      showAuthError('Erro de conexão. Verifique sua internet e tente novamente.');
    } else if (err && err.message) {
      showAuthError('Erro: ' + err.message);
    } else {
      showAuthError('Erro inesperado. Tente novamente.');
    }
  }
  finally { btn.disabled = false; btn.textContent = isRegisterMode ? 'Cadastrar' : 'Entrar'; }
}

function hideSplash() {
  const s = document.getElementById('pg-splash');
  if (!s || s.style.display === 'none') return;
  s.style.transition = 'opacity .35s';
  s.style.opacity = '0';
  setTimeout(() => { s.style.display = 'none'; }, 380);
}

function enterApp(user) {
  if (!user.avatar_color) user.avatar_color = user.color;
  if (!user.display_name) user.display_name = user.name || user.username;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');

  // Splash some apenas quando o initApp terminar
  if (typeof initApp === 'function') {
    initApp(user).catch(() => {}).finally(hideSplash);
  } else {
    hideSplash();
  }
  initPushNotifications(user);
}

async function doLogout() {
  if (!confirm('Tem certeza que deseja sair?')) return;
  await db.auth.signOut();
  clearSession();
  // Limpa cache Pokeet para não vazar entre contas
  try {
    localStorage.removeItem('pg_pk_active_profile');
    localStorage.removeItem('pg_pk_profiles_cache');
    localStorage.removeItem('pg_pokeet_profiles_cache');
  } catch(e) {}
  currentUser = null;
  location.reload();
}

// ── Manutenção ────────────────────────────────────────────
async function checkManutencao() {
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'manutencao').maybeSingle();
    if (data && data.value === 'true') {
      const { data: msgData } = await db.from('settings').select('value').eq('key', 'manutencao_msg').maybeSingle();
      const msg = (msgData && msgData.value) ? msgData.value : 'Estamos em Atualização.';
      const overlay = document.getElementById('manutencao-overlay');
      const msgEl   = document.getElementById('manutencao-overlay-msg');
      if (msgEl)   msgEl.textContent = msg;
      if (overlay) { overlay.style.display = 'flex'; }
      return true; // está em manutenção
    }
  } catch(e) {}
  return false;
}

function manutencaoPreviewImg(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const prev  = document.getElementById('manutencao-img-preview');
    const empty = document.getElementById('manutencao-img-empty');
    const saveBtn = document.getElementById('manutencao-img-save-btn');
    prev.src = e.target.result;
    prev.style.display   = 'block';
    empty.style.display  = 'none';
    saveBtn.style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
}

async function manutencaoSaveImg() {
  const file = document.getElementById('manutencao-img-file').files[0];
  const fb   = document.getElementById('manutencao-img-fb');
  if (!file) return;
  fb.style.display = 'none';
  // Converte para base64
  const base64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const { error } = await db.from('settings').upsert({ key: 'manutencao_img', value: base64 }, { onConflict: 'key' });
  if (error) {
    fb.textContent = '❌ Erro ao salvar.'; fb.style.color = '#f44336'; fb.style.display = 'block';
    return;
  }
  document.getElementById('manutencao-img-remove-btn').style.display = 'inline-flex';
  document.getElementById('manutencao-img-save-btn').style.display   = 'none';
  fb.textContent = '✅ Imagem salva!'; fb.style.color = '#4caf50'; fb.style.display = 'block';
  setTimeout(() => { fb.style.display = 'none'; }, 2500);
}

async function manutencaoRemoveImg() {
  const fb = document.getElementById('manutencao-img-fb');
  await db.from('settings').delete().eq('key', 'manutencao_img');
  const prev  = document.getElementById('manutencao-img-preview');
  const empty = document.getElementById('manutencao-img-empty');
  prev.src = ''; prev.style.display = 'none';
  empty.style.display = 'block';
  document.getElementById('manutencao-img-remove-btn').style.display = 'none';
  document.getElementById('manutencao-img-file').value = '';
  fb.textContent = '✅ Imagem removida.'; fb.style.color = '#4caf50'; fb.style.display = 'block';
  setTimeout(() => { fb.style.display = 'none'; }, 2500);
}

async function setManutencao(ativo) {
  const fb  = document.getElementById('manutencao-fb');
  const msg = document.getElementById('manutencao-msg-input')?.value.trim() || 'Estamos em Atualização.';
  fb.style.display = 'none';
  try {
    await db.from('settings').upsert({ key: 'manutencao', value: ativo ? 'true' : 'false' }, { onConflict: 'key' });
    if (ativo) {
      await db.from('settings').upsert({ key: 'manutencao_msg', value: msg }, { onConflict: 'key' });
    }
    // atualiza UI
    document.getElementById('manutencao-indicator').style.background   = ativo ? '#f44336' : '#4caf50';
    document.getElementById('manutencao-indicator').style.boxShadow    = ativo ? '0 0 0 3px rgba(244,67,54,.2)' : '0 0 0 3px rgba(76,175,80,.2)';
    document.getElementById('manutencao-label').textContent            = ativo ? 'Site em Manutenção' : 'Site Online';
    document.getElementById('manutencao-sublabel').textContent         = ativo ? 'Visitantes veem a tela de atualização.' : 'Visitantes estão acessando normalmente.';
    document.getElementById('btn-ativar-manutencao').style.display     = ativo ? 'none'  : 'flex';
    document.getElementById('btn-desativar-manutencao').style.display  = ativo ? 'flex'  : 'none';
    document.getElementById('adm-btn-manutencao').style.background     = ativo ? 'rgba(244,67,54,.12)' : '';
    document.getElementById('adm-btn-manutencao').style.color          = ativo ? '#f44336' : '';
    fb.textContent     = ativo ? '✅ Manutenção ativada.' : '✅ Site reativado.';
    fb.style.color     = ativo ? '#f44336' : '#4caf50';
    fb.style.display   = 'block';
    setTimeout(() => { fb.style.display = 'none'; }, 3000);
  } catch(e) {
    fb.textContent   = '❌ Erro ao salvar. Tente novamente.';
    fb.style.color   = '#f44336';
    fb.style.display = 'block';
  }
}

async function loadManutencaoStatus() {
  try {
    const { data }    = await db.from('settings').select('value').eq('key', 'manutencao').maybeSingle();
    const { data: md } = await db.from('settings').select('value').eq('key', 'manutencao_msg').maybeSingle();
    const ativo = data && data.value === 'true';
    document.getElementById('manutencao-indicator').style.background  = ativo ? '#f44336' : '#4caf50';
    document.getElementById('manutencao-indicator').style.boxShadow   = ativo ? '0 0 0 3px rgba(244,67,54,.2)' : '0 0 0 3px rgba(76,175,80,.2)';
    document.getElementById('manutencao-label').textContent           = ativo ? 'Site em Manutenção' : 'Site Online';
    document.getElementById('manutencao-sublabel').textContent        = ativo ? 'Visitantes veem a tela de atualização.' : 'Visitantes estão acessando normalmente.';
    document.getElementById('btn-ativar-manutencao').style.display    = ativo ? 'none'  : 'flex';
    document.getElementById('btn-desativar-manutencao').style.display = ativo ? 'flex'  : 'none';
    document.getElementById('adm-btn-manutencao').style.background    = ativo ? 'rgba(244,67,54,.12)' : '';
    document.getElementById('adm-btn-manutencao').style.color         = ativo ? '#f44336' : '';
    if (md && md.value) document.getElementById('manutencao-msg-input').value = md.value;
  } catch(e) {}
}

async function initPokegram() {
  // Verifica manutenção antes de qualquer coisa (exceto ADM)
  if (!IS_ADM) {
    const emManutencao = await checkManutencao();
    if (emManutencao) return; // para tudo — overlay já está visível
  }
  // tenta restaurar sessão pelo Supabase Auth primeiro
  let session = null;
  try {
    const { data, error } = await db.auth.getSession();
    if (error) {
      const msg = error.message || '';
      // Erro de schema interno do Supabase — limpa sessão e pede novo login
      if (msg.toLowerCase().includes('schema') || msg.toLowerCase().includes('database error')) {
        await db.auth.signOut().catch(() => {});
        clearSession();
        hideSplash();
        document.getElementById('auth-screen').style.display = 'flex';
        return;
      }
      throw error;
    }
    session = data?.session || null;
  } catch (e) {
    clearSession();
    hideSplash();
    document.getElementById('auth-screen').style.display = 'flex';
    return;
  }
  if (session) {
    const saved = loadSession();
    if (saved) {
      currentUser = saved;
      enterApp(currentUser);
    }
    // Re-fetch em background para atualizar dados frescos
    db.from('users').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data: fresh }) => {
        if (fresh) { currentUser = fresh; saveSession(fresh); if (saved) renderSidebarAvatar(); else enterApp(fresh); }
        else {
          // Auth existe mas não tem perfil na tabela users — limpa e pede login
          db.auth.signOut().catch(() => {});
          clearSession();
          if (!saved) { hideSplash(); document.getElementById('auth-screen').style.display = 'flex'; }
        }
      }).catch(() => { if (!saved) { hideSplash(); document.getElementById('auth-screen').style.display = 'flex'; } });
  } else {
    clearSession();
    hideSplash();
    document.getElementById('auth-screen').style.display = 'flex';
  }
}

let _editPostPendingImageFile = null;

function openEditPost(postId, caption, location, imageUrl) {
  document.getElementById('edit-post-id').value       = postId;
  document.getElementById('edit-post-caption').value  = caption.replace(/\n/g, '\n');
  document.getElementById('edit-post-location').value = location;
  _editPostPendingImageFile = null;
  const preview = document.getElementById('edit-post-preview-img');
  if (preview) preview.src = imageUrl || '';
  const fileInput = document.getElementById('edit-post-image-input');
  if (fileInput) fileInput.value = '';
  closePostMenu(postId);
  openModal('modal-edit-post');
}

function previewEditPostImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) { toast('Imagem muito grande. Máximo 15MB.'); return; }
  openCropper(file, 'square', croppedFile => {
    _editPostPendingImageFile = croppedFile;
    const reader = new FileReader();
    reader.onload = e => {
      const preview = document.getElementById('edit-post-preview-img');
      if (preview) preview.src = e.target.result;
    };
    reader.readAsDataURL(croppedFile);
  });
  input.value = '';
}

async function saveEditPost() {
  const postId   = document.getElementById('edit-post-id').value;
  const caption  = document.getElementById('edit-post-caption').value.trim();
  const location = document.getElementById('edit-post-location').value.trim();
  if (!caption) { toast('A legenda não pode estar vazia.'); return; }

  const updatePayload = { caption, location };
  let newImageUrl = null;

  if (_editPostPendingImageFile) {
    const path = `${currentUser.id}_${Date.now()}.png`;
    const { error: upErr } = await db.storage.from('posts').upload(path, _editPostPendingImageFile, { upsert: false, contentType: 'image/png' });
    if (upErr) { toast('Erro ao enviar foto: ' + upErr.message); return; }
    const { data: urlData } = db.storage.from('posts').getPublicUrl(path);
    newImageUrl = urlData.publicUrl;
    updatePayload.image_url = newImageUrl;
  }

  const { error } = await db.from('posts').update(updatePayload).eq('id', postId);
  if (error) { toast('Erro ao salvar. Tente novamente.'); return; }
  _editPostPendingImageFile = null;
  closeModal('modal-edit-post');
  toast('Publicação atualizada!');
  // atualiza no DOM sem recarregar tudo
  const capEl = document.querySelector(`#post-${postId} .post-caption-text`);
  if (capEl) {
    const userSpan = capEl.querySelector('.cap-user');
    capEl.innerHTML = '';
    if (userSpan) capEl.appendChild(userSpan);
    capEl.innerHTML += formatCaption(caption);
  }
  const locEl = document.querySelector(`#post-${postId} .post-location-tag`);
  if (locEl) locEl.textContent = location;
  if (newImageUrl) {
    const imgEl = document.querySelector(`#post-${postId} .post-image img`);
    if (imgEl) imgEl.src = newImageUrl;
  }
  // atualiza cache local
  const cached = (appPosts || []).find(p => p.id === postId);
  if (cached) { cached.caption = caption; cached.location = location; if (newImageUrl) cached.image_url = newImageUrl; }
}

async function deleteComment(commentId, postId) {
  await db.from('comments').delete().eq('id', commentId);
  // remove notificação associada
  await db.from('notifications').delete()
    .eq('type', 'comment')
    .eq('post_id', postId)
    .eq('actor_id', currentUser.id);
  document.getElementById('comment-item-' + commentId)?.remove();
  toast('Comentário apagado.');
}

// ════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ════════════════════════════════════════════════════════
const VAPID_PUBLIC_KEY = "BBumLFMgPViV5wyqTwKpgzAyj3_hYnJ4WmKOc11n-4GU5xfOLNhP-wiDbaaOhdb8-Jn_4m5Z3QRrwNzOa_c2tGY";
const PUSH_ENDPOINT    = "https://cofqapsaxrqlmxzpzbkr.supabase.co/functions/v1/send-push";

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function initPushNotifications(user) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  // Brave bloqueia Notification.requestPermission em sites sem interação do usuário
  // e pode retornar 'denied' silenciosamente — verificamos antes de pedir
  if ('Notification' in window && Notification.permission === 'denied') return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // pede permissão com um pequeno delay para não assustar
    setTimeout(async () => {
      let perm;
      try { perm = await Notification.requestPermission(); } catch (e) { return; }
      if (perm !== 'granted') return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      // salva subscription no banco
      await db.from('push_subscriptions').upsert({
        user_id: user.id,
        subscription: JSON.stringify(sub)
      }, { onConflict: 'user_id' });
    }, 3000);
  } catch(e) { console.warn('Push init error:', e); }
}

async function sendPushToUser(userId, title, body, url) {
  try {
    await fetch(PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, title, body, url: url || '/' })
    });
  } catch(e) { console.warn('Push send error:', e); }
}

function applyUserColor(color) {
  const c = color || '#e53935';

  // Gera paleta derivada da cor escolhida
  const isDefault = !color || color === '#e53935';
  const root = document.documentElement;

  if (isDefault) {
    // Remove variáveis específicas do Pokeet → CSS usa os defaults (#e53935)
    root.style.removeProperty('--pk-accent');
    root.style.removeProperty('--pk-accent-dark');
    root.style.removeProperty('--pk-accent-light');
    root.style.removeProperty('--pk-accent-bg');
  } else {
    // Gera tons claro/escuro a partir da cor hex
    const darker  = pkColorDarken(c, 20);
    const lighter = pkColorLighten(c, 92);
    const bgAlpha = pkColorAlpha(c, 0.08);

    root.style.setProperty('--pk-accent',       c);
    root.style.setProperty('--pk-accent-dark',  darker);
    root.style.setProperty('--pk-accent-light', lighter);
    root.style.setProperty('--pk-accent-bg',    bgAlpha);
  }

  // --user-color (chat e outros)
  root.style.setProperty('--user-color', c);

  // btn-share-modal (Publicar / Compartilhar / Salvar)
  document.querySelectorAll('.btn-share-modal').forEach(btn => {
    btn.style.color = c;
  });
  // pm-switch Sair
  document.querySelectorAll('.pm-switch a').forEach(a => {
    a.style.color = c;
  });
}

// ── Helpers de manipulação de cor ────────────────────────
function pkHexToRgb(hex) {
  const h = hex.replace('#','');
  const n = parseInt(h.length===3 ? h.split('').map(x=>x+x).join('') : h, 16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
function pkRgbToHex(r,g,b) {
  return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function pkColorDarken(hex, pct) {
  const [r,g,b] = pkHexToRgb(hex);
  const f = 1 - pct/100;
  return pkRgbToHex(r*f, g*f, b*f);
}
function pkColorLighten(hex, pct) {
  const [r,g,b] = pkHexToRgb(hex);
  const f = pct/100;
  return pkRgbToHex(r + (255-r)*f, g + (255-g)*f, b + (255-b)*f);
}
function pkColorAlpha(hex, alpha) {
  const [r,g,b] = pkHexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('auth-screen').style.display !== 'none') doAuth();
  });


// ════════════════════════════════════════════════════════════

const POKEMON_LIST = [
  "Bulbasaur","Ivysaur","Venusaur","Charmander","Charmeleon","Charizard",
  "Squirtle","Wartortle","Blastoise","Caterpie","Metapod","Butterfree",
  "Pikachu","Raichu","Clefairy","Clefable","Jigglypuff","Meowth","Psyduck",
  "Gengar","Eevee","Vaporeon","Jolteon","Flareon","Snorlax","Mewtwo","Mew",
  "Chikorita","Cyndaquil","Totodile","Togepi","Espeon","Umbreon","Lucario",
  "Garchomp","Glaceon","Leafeon","Sylveon","Greninja","Mimikyu"
];

const EMOJI_BG_OPTIONS = [
  {emoji:"⚡",bg:"#fff9c4"},{emoji:"🔥",bg:"#ffccbc"},{emoji:"💧",bg:"#b3e5fc"},
  {emoji:"🌿",bg:"#c8e6c9"},{emoji:"👻",bg:"#e1bee7"},{emoji:"🌙",bg:"#263238"},
  {emoji:"❄️",bg:"#e3f2fd"},{emoji:"🌊",bg:"#01579b"},{emoji:"🌸",bg:"#fce4ec"},
  {emoji:"🏔️",bg:"#cfd8dc"},{emoji:"🌋",bg:"#bf360c"},{emoji:"🌈",bg:"#f3e5f5"},
  {emoji:"⭐",bg:"#f57f17"},{emoji:"🎮",bg:"#1a237e"},{emoji:"🏅",bg:"#ff6f00"},
  {emoji:"🦋",bg:"#f8bbd0"}
];

// ── Estado ────────────────────────────────────────────────
let appPosts    = [];
let appUsers    = {};   // cache username → user
let followState = {};
let currentCommentPostId = null;
let selectedPostEmoji    = null;
let currentViewHistory   = ['feed'];

// ── Init ──────────────────────────────────────────────────
async function initApp(user) {
  currentUser = user;

  // Limpa cache Pokeet da sessão anterior para não vazar entre contas
  _pkMyProfiles      = [];
  _pkProfilesMap     = {};
  _pkActiveProfileId = null;
  pkLoadActiveId();
  await pkFetchMyProfiles();

  document.documentElement.style.setProperty('--user-color', user.color || '#e53935');
  renderSidebarAvatar();

  // Pré-carrega todos os follows em background — não bloqueia o render do feed
  db.from('follows').select('following_id').eq('follower_id', user.id)
    .then(({ data }) => { if (data) data.forEach(r => { followState[r.following_id] = true; }); })
    .catch(() => {});

  await applyTopnavSprites().catch(() => {
    // fallback: se o banco falhar, revela mesmo assim
    const nav = document.getElementById('topnav');
    if (nav) nav.style.opacity = '1';
    const ring = document.getElementById('story-ring-add');
    if (ring) ring.style.opacity = '1';
  });
  applyUserColor(user.color);

  // Verifica post pendente (URL acessada antes do login)
  // Roteamento por URL — única fonte de verdade
  sessionStorage.removeItem('pg_pending_post'); // limpa pendências antigas
  const urlPath = window.location.pathname.slice(1).split('?')[0];
  const _pmParts = urlPath.split('/post/'); const postMatch = (_pmParts.length === 2 && _pmParts[0]) ? _pmParts : null;

  if (!urlPath || urlPath === 'feed') {
    showView('feed').catch(() => {});
  } else if (urlPath === 'explore') {
    showView('explore').catch(() => {});
  } else if (urlPath === 'pokeet' || urlPath === 'pokeet/') {
    showView('pokeets').catch(() => {});
  } else if (urlPath.startsWith('pokeet/') && urlPath.split('/').length === 2 && urlPath.split('/')[1]) {
    // /pokeet/<handle> — perfil secundário do Pokeet
    showUserProfile(urlPath.split('/')[1]).catch(() => {});
  } else if (postMatch) {
    // /username/post/id — abre o feed e depois o modal do post
    showView('feed').then(() => openComments(postMatch[1])).catch(() => {});
  } else if (urlPath === user.username) {
    showView('profile').catch(() => {});
  } else if (urlPath !== 'adm') {
    // /outrousuario — vai direto para o perfil sem carregar o feed
    showUserProfile(urlPath).catch(() => {});
  } else {
    showView('feed').catch(() => {});
  }
  loadNotifBadge();
  chatRefreshUnreadBadge();
  setInterval(() => { loadNotifBadge(); chatRefreshUnreadBadge(); }, 5000);
}

function renderSidebarAvatar() {
  const el = document.getElementById('sn-avatar');
  if (!currentUser) return;
  if (el) {
    el.style.overflow        = 'hidden';
    el.style.display         = 'flex';
    el.style.alignItems      = 'center';
    el.style.justifyContent  = 'center';
    el.style.borderRadius    = '50%';
    el.style.background      = currentUser.avatar_url ? 'transparent' : (currentUser.color || '#e53935');
    if (currentUser.avatar_url) {
      el.innerHTML = `<img src="${currentUser.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">`;
    } else {
      el.innerHTML = '';
      el.textContent = initials(currentUser.username);
    }
  }
  // Preenche o "Seu story" com o avatar/cor corretos antes do renderStories para evitar flash
  const myPic = document.getElementById('my-story-pic');
  if (myPic) {
    if (currentUser.avatar_url) {
      myPic.style.background = 'transparent';
      myPic.innerHTML = `<img src="${currentUser.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      myPic.style.background = currentUser.color || '#e53935';
      myPic.textContent = initials(currentUser.username);
    }
  }
  // Preenche a cor do botão + desde já
  const myPlus = document.querySelector('.story-plus');
  if (myPlus) myPlus.style.background = currentUser.color || '#e53935';
}

// ── View Routing ──────────────────────────────────────────
function bottomTab(name) {
  document.querySelectorAll('.btab').forEach(b => b.classList.remove('active'));
  const active = document.getElementById('btab-' + name) || document.getElementById('btab-feed');
  if (active) active.classList.add('active');
  showView(name);
}

async function showView(name) {
  // Fecha modal de comentários ao navegar
  const mc = document.getElementById('modal-comments');
  if (mc && !mc.classList.contains('hidden')) mc.classList.add('hidden');

  // Sync bottom tab bar
  document.querySelectorAll('.btab').forEach(b => b.classList.remove('active'));
  const bt = document.getElementById('btab-' + name) || (name === 'feed' ? document.getElementById('btab-feed') : null);
  if (bt) bt.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const v = document.getElementById('view-' + name);
  if (v) v.classList.remove('hidden');

  document.querySelectorAll('.sn-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bn-item').forEach(b => b.classList.remove('active'));
  const sb = document.getElementById('btn-' + name);
  if (sb) sb.classList.add('active');
  const bn = document.getElementById('bn-' + name);
  if (bn) bn.classList.add('active');

  if (name === 'feed')    { history.replaceState(null,'','/');
    await renderFeed(); }
  if (name === 'explore') { history.replaceState(null,'','/explore');
    await renderExplore(); }
  if (name === 'profile') await renderProfile(currentUser.username);
  if (name === 'pokeets') { history.replaceState(null,'','/pokeet');
    await renderPokeets(); }

  currentViewHistory.push(name);
  window.scrollTo(0, 0);
}

function goBack() {
  currentViewHistory.pop();
  const prev = currentViewHistory[currentViewHistory.length - 1] || 'feed';
  showView(prev);
}

// ── Feed ──────────────────────────────────────────────────

// ── Modal Helpers ─────────────────────────────────────────
function openModal(id)  {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === 'modal-story-new') { el.style.display = 'flex'; }
  else el.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === 'modal-story-new') { el.style.display = 'none'; }
  else el.classList.add('hidden');
  document.body.style.overflow = '';
  // Ao fechar o modal de comentários, restaura a URL anterior
  if (id === 'modal-comments') {
    const path = window.location.pathname;
    if (path.includes('/post/')) {
      history.pushState(null, '', path.replace(/[/]post[/][^/]+$/, '') || '/');
    }
  }
}

// ── Utils ─────────────────────────────────────────────────
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/[\s_]+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function fmtTimeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return 'agora';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}


// ── Browser back/forward ──────────────────────────────────
window.addEventListener('popstate', async () => {
  if (!currentUser) return;
  const urlPath  = window.location.pathname.slice(1).split('?')[0];
  const _pm2Parts = urlPath.split('/post/'); const postMatch  = (_pm2Parts.length === 2 && _pm2Parts[0]) ? _pm2Parts : null;
  const storyMatch = urlPath.endsWith('/stories') ? [urlPath, urlPath.replace('/stories','')] : null;
  if (!urlPath || urlPath === 'feed') {
    closeModal('modal-comments');
    closeStoryViewer();
    await showView('feed');
  } else if (urlPath === 'pokeet' || urlPath === 'pokeet/') {
    closeModal('modal-comments');
    closeStoryViewer();
    await showView('pokeets');
  } else if (urlPath.startsWith('pokeet/') && urlPath.split('/').length === 2 && urlPath.split('/')[1]) {
    // /pokeet/<handle> — perfil secundário do Pokeet
    closeModal('modal-comments');
    closeStoryViewer();
    await showUserProfile(urlPath.split('/')[1]);
  } else if (postMatch) {
    // /username/post/id — SEMPRE fecha modais, carrega o feed e abre o modal-comments.
    // Nunca abre página separada: o modal é a única forma de visualizar um post.
    closeModal('modal-comments');
    closeStoryViewer();
    await showView('feed');
    await openComments(postMatch[1]);
  } else if (storyMatch) {
    // abre o story viewer do usuário da URL
    closeModal('modal-comments');
    const { data: storyUser } = await db.from('users').select('id').eq('username', storyMatch[1]).maybeSingle();
    if (storyUser) await openStoryViewer(storyUser.id);
  } else if (urlPath === currentUser.username) {
    closeModal('modal-comments');
    closeStoryViewer();
    await showView('profile');
  } else if (urlPath !== 'adm') {
    closeModal('modal-comments');
    closeStoryViewer();
    await showUserProfile(urlPath);
  }
});

// ── Roteamento — executado após todas as funções estarem definidas ──
loadFilters();
if (IS_ADM) {
  document.getElementById('pokegram-root').style.display = 'none';
  document.getElementById('adm-root').style.display = 'block';
  document.body.classList.add('adm-body');
  document.title = 'Pokégram — ADM';
  applyLogos();
  initAdm();
} else {
  applyLogos();
  initPokegram();
}
