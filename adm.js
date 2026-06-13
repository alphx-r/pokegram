// ════════════════════════════════════════════════════════════
// ADM — Painel administrativo (NPCs, IA, automação, configs)
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// ADM
// ════════════════════════════════════════════════════════════
let admLogado  = null;
let allUsers   = [];
let allPosts   = [];

function admSaveSession(a) { sessionStorage.setItem('pg_adm', JSON.stringify(a)); }
function admLoadSession()  { try { return JSON.parse(sessionStorage.getItem('pg_adm')); } catch (e) { return null; } }
function admClearSession() { sessionStorage.removeItem('pg_adm'); }

async function initAdm() {
  const saved = admLoadSession();
  if (saved) { admLogado = saved; mostrarPainelAdm(); }
  else { document.getElementById('adm-login-page').style.display = 'flex'; }
  document.getElementById('adm-loading').style.display = 'none';
}

async function fazerLoginAdm() {
  const username = document.getElementById('adm-username').value.trim();
  const password = document.getElementById('adm-password').value;
  const errEl    = document.getElementById('adm-login-err');
  errEl.style.display = 'none';
  if (!username || !password) { errEl.textContent = 'Preencha todos os campos.'; errEl.style.display = 'block'; return; }
  try {
    const { data, error } = await db.rpc('login_admin', { p_username: username, p_password: password });
    if (error) throw error;
    const admData = Array.isArray(data) ? data[0] : data;
    if (!admData) { errEl.textContent = 'Usuário ou senha incorretos.'; errEl.style.display = 'block'; return; }
    admLogado = admData; admSaveSession(admData); mostrarPainelAdm();
  } catch(e) { console.error(e); errEl.textContent = 'Erro de conexão.'; errEl.style.display = 'block'; }
}


// ════════════════════════════════════════════════════════════
// ADM — NPCs
// ════════════════════════════════════════════════════════════
let _allNpcs = [];
let _npcPendingAvatarFile  = null;
let _npcPendingPostImgFile = null;
let _currentNpcUserId = null;  // NPC cujos posts estão sendo gerenciados

// ── Carregar lista de NPCs ────────────────────────────────
async function admNpcLoad() {
  document.getElementById('npc-list-loading').style.display = 'block';
  document.getElementById('npc-posts-panel').style.display = 'none';
  const { data, error } = await db.from('users').select('*').eq('is_npc', true).order('created_at', { ascending: false });
  document.getElementById('npc-list-loading').style.display = 'none';
  if (error) { document.getElementById('npc-list-loading').textContent = 'Erro ao carregar NPCs.'; document.getElementById('npc-list-loading').style.display = 'block'; return; }
  _allNpcs = data || [];
  document.getElementById('npc-count').textContent = `${_allNpcs.length} NPC(s) cadastrado(s)`;
  admNpcRenderList(_allNpcs);
}

function admNpcFiltrar(q) {
  const lq = q.toLowerCase();
  admNpcRenderList(_allNpcs.filter(u => u.username.toLowerCase().includes(lq) || (u.name||'').toLowerCase().includes(lq)));
}

function admNpcRenderList(list) {
  const wrap = document.getElementById('npc-list-wrap');
  if (!list.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);font-size:13px">Nenhum NPC encontrado. Crie o primeiro acima!</div>';
    return;
  }
  wrap.innerHTML = `<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th>Avatar</th><th>Usuário</th><th>Nome</th><th>RPG</th><th>Cadastro</th><th>Ações</th></tr></thead>
    <tbody>${list.map(u => {
      const bg = u.avatar_url ? 'transparent' : (u.color || '#e53935');
      const avContent = u.avatar_url
        ? `<img src="${esc(u.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : `<span style="font-size:11px;font-weight:800;color:#fff">${esc(u.username.slice(0,2).toUpperCase())}</span>`;
      return `<tr>
        <td><div style="width:36px;height:36px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">${avContent}</div></td>
        <td><strong>@${esc(u.username)}</strong></td>
        <td>${esc(u.name || '—')}</td>
        <td>${rpgBadge(u.rpg)}</td>
        <td style="color:var(--muted);white-space:nowrap">${fmtDate(u.created_at)}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="adm-btn adm-btn-warn adm-btn-sm" onclick="abrirModalEditarNpc('${u.id}')">✏️ Editar</button>
            <button class="adm-btn adm-btn-sm" style="background:#e8f0fb;color:#1a3a5c;border:1px solid #c0d0e8" onclick="abrirModalPerfilNpc('${u.id}')">👤 Perfil</button>
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

// ── Preview de avatar ─────────────────────────────────────
function admNpcPreviewAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 512*1024) { alert('Imagem muito grande. Máximo 500KB.'); return; }
  _npcPendingAvatarFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('npc-avatar-preview');
    prev.style.background = 'transparent';
    prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  reader.readAsDataURL(file);
}

// ── Salvar NPC (criar ou editar) ──────────────────────────
async function admNpcSalvar() {
  const editId   = document.getElementById('npc-edit-id').value.trim();
  const username = document.getElementById('npc-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  const name     = document.getElementById('npc-name').value.trim();
  const bio      = document.getElementById('npc-bio').value.trim();
  const pronoun  = document.getElementById('npc-pronoun').value;
  const rpg      = document.getElementById('npc-rpg').value;
  const color    = document.getElementById('npc-color').value;
  const password = document.getElementById('npc-password').value.trim() || null;
  const okEl  = document.getElementById('npc-fb-ok');
  const errEl = document.getElementById('npc-fb-err');
  okEl.style.display = errEl.style.display = 'none';

  if (!username) { errEl.textContent = 'Informe um usuário válido.'; errEl.style.display = 'block'; return; }

  // Upload de avatar se houver
  let avatar_url = editId ? (_allNpcs.find(u=>u.id===editId)?.avatar_url || null) : null;
  if (_npcPendingAvatarFile) {
    const path = `npc_${username}_${Date.now()}.png`;
    const { error: upErr } = await db.storage.from('avatars').upload(path, _npcPendingAvatarFile, { upsert: true, contentType: 'image/png' });
    if (upErr) { errEl.textContent = 'Erro no upload: ' + upErr.message; errEl.style.display = 'block'; return; }
    const { data: ud } = db.storage.from('avatars').getPublicUrl(path);
    avatar_url = ud.publicUrl;
    _npcPendingAvatarFile = null;
  }

  const payload = { username, name, bio, pronoun, rpg, color, avatar_url, is_npc: true, ...(password ? { password_plain: password } : {}) };

  let error;
  if (editId) {
    const { error: e } = await db.from('users').update({ username, name, bio, pronoun, rpg, color, avatar_url, ...(password !== null ? { password_plain: password } : {}) }).eq('id', editId);
    error = e;
  } else {
    // Verifica se username já existe
    const { data: exists } = await db.from('users').select('id').eq('username', username).maybeSingle();
    if (exists) { errEl.textContent = 'Usuário já existe.'; errEl.style.display = 'block'; return; }
    const { error: e } = await db.from('users').insert(payload);
    error = e;
  }

  if (error) { errEl.textContent = 'Erro: ' + error.message; errEl.style.display = 'block'; return; }

  // Se senha foi informada, salva o hash via RPC
  if (password) {
    // Precisamos do ID do NPC recém-criado ou editado
    const npcId = editId || (await db.from('users').select('id').eq('username', username).maybeSingle()).data?.id;
    if (npcId) {
      const { error: pwErr } = await db.rpc('set_npc_password', { p_id: npcId, p_password: password });
      if (pwErr) { errEl.textContent = 'NPC salvo, mas erro na senha: ' + pwErr.message; errEl.style.display = 'block'; return; }
    }
  }

  okEl.style.display = 'block';
  setTimeout(() => okEl.style.display = 'none', 2500);
  admNpcCancelarEdicao();
  admNpcLoad();
}

// ── Editar NPC (preenche o form) ──────────────────────────
function admNpcEditar(id) {
  const u = _allNpcs.find(x => x.id === id);
  if (!u) return;
  document.getElementById('npc-edit-id').value    = u.id;
  document.getElementById('npc-username').value   = u.username;
  document.getElementById('npc-name').value       = u.name || '';
  document.getElementById('npc-bio').value        = u.bio || '';
  document.getElementById('npc-pronoun').value    = u.pronoun || '';
  document.getElementById('npc-rpg').value        = u.rpg || '';
  document.getElementById('npc-color').value      = u.color || '#e53935';
  document.getElementById('npc-password').value   = '';
  document.getElementById('npc-form-title').textContent = `✏️ Editando @${u.username}`;
  document.getElementById('npc-cancel-btn').style.display = 'inline-flex';
  _npcPendingAvatarFile = null;
  // preview avatar atual
  const prev = document.getElementById('npc-avatar-preview');
  if (u.avatar_url) {
    prev.style.background = 'transparent';
    prev.innerHTML = `<img src="${esc(u.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    prev.style.background = u.color || '#e53935';
    prev.innerHTML = `<span style="font-size:18px;font-weight:800;color:#fff">${u.username.slice(0,2).toUpperCase()}</span>`;
  }
  document.getElementById('npc-form-box').scrollIntoView({ behavior:'smooth', block:'start' });
}

function admNpcCancelarEdicao() {
  document.getElementById('npc-edit-id').value    = '';
  document.getElementById('npc-username').value   = '';
  document.getElementById('npc-name').value       = '';
  document.getElementById('npc-bio').value        = '';
  document.getElementById('npc-pronoun').value    = '';
  document.getElementById('npc-rpg').value        = '';
  document.getElementById('npc-color').value      = '#e53935';
  document.getElementById('npc-avatar-file').value = '';
  document.getElementById('npc-form-title').textContent = '➕ Novo NPC';
  document.getElementById('npc-cancel-btn').style.display = 'none';
  const prev = document.getElementById('npc-avatar-preview');
  prev.style.background = '#e53935';
  prev.innerHTML = 'NPC';
  _npcPendingAvatarFile = null;
}

// ── Modal Editar NPC ──────────────────────────────────────
let _npcModalPendingAvatarFile = null;
let _npcModalCurrentId = null;

function abrirModalEditarNpc(id) {
  const u = _allNpcs.find(x => x.id === id);
  if (!u) return;
  _npcModalCurrentId = id;
  _npcModalPendingAvatarFile = null;

  document.getElementById('npc-modal-edit-id').value  = u.id;
  document.getElementById('npc-modal-username').value = u.username;
  document.getElementById('npc-modal-name').value     = u.name || '';
  document.getElementById('npc-modal-bio').value      = u.bio || '';
  document.getElementById('npc-modal-pronoun').value  = u.pronoun || '';
  document.getElementById('npc-modal-rpg').value      = u.rpg || '';
  document.getElementById('npc-modal-color').value    = u.color || '#e53935';
  document.getElementById('adm-npc-edit-title').textContent = `Editar @${u.username}`;
  document.getElementById('npc-modal-avatar-file').value = '';
  document.getElementById('npc-modal-fb-ok').style.display = 'none';
  document.getElementById('npc-modal-fb-err').style.display = 'none';

  const prev = document.getElementById('npc-modal-avatar-preview');
  prev.style.background = u.avatar_url ? 'transparent' : (u.color || '#e53935');
  prev.innerHTML = u.avatar_url
    ? `<img src="${esc(u.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : `<span style="font-size:18px;font-weight:800;color:#fff">${u.username.slice(0,2).toUpperCase()}</span>`;

  document.getElementById('adm-npc-edit-modal').classList.add('open');
}

function fecharModalNpcEdit() {
  document.getElementById('adm-npc-edit-modal').classList.remove('open');
  _npcModalCurrentId = null;
  _npcModalPendingAvatarFile = null;
}

function admNpcModalPreviewAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 512*1024) { alert('Máx 500KB'); return; }
  _npcModalPendingAvatarFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('npc-modal-avatar-preview');
    prev.style.background = 'transparent';
    prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  reader.readAsDataURL(file);
}

async function admNpcModalSalvar() {
  const id       = document.getElementById('npc-modal-edit-id').value;
  const username = document.getElementById('npc-modal-username').value.trim().toLowerCase().replace(/[^a-z0-9_.]/g,'');
  const name     = document.getElementById('npc-modal-name').value.trim();
  const bio      = document.getElementById('npc-modal-bio').value.trim();
  const pronoun  = document.getElementById('npc-modal-pronoun').value;
  const rpg      = document.getElementById('npc-modal-rpg').value;
  const color    = document.getElementById('npc-modal-color').value;
  const password = document.getElementById('npc-modal-password').value.trim() || null;
  const okEl     = document.getElementById('npc-modal-fb-ok');
  const errEl    = document.getElementById('npc-modal-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  if (!username) { errEl.textContent = 'Informe um usuário válido.'; errEl.style.display = 'block'; return; }

  let avatar_url = _allNpcs.find(u => u.id === id)?.avatar_url || null;
  if (_npcModalPendingAvatarFile) {
    const path = `npc_${username}_${Date.now()}.png`;
    const { error: upErr } = await db.storage.from('avatars').upload(path, _npcModalPendingAvatarFile, { upsert: true, contentType: 'image/png' });
    if (upErr) { errEl.textContent = 'Erro no upload: ' + upErr.message; errEl.style.display = 'block'; return; }
    const { data: ud } = db.storage.from('avatars').getPublicUrl(path);
    avatar_url = ud.publicUrl;
    _npcModalPendingAvatarFile = null;
  }

  const { error } = await db.from('users').update({ username, name, bio, pronoun, rpg, color, avatar_url, ...(password !== null ? { password_plain: password } : {}) }).eq('id', id);
  if (error) { errEl.textContent = 'Erro: ' + error.message; errEl.style.display = 'block'; return; }

  // Se senha foi informada, salva hash via RPC também
  if (password) {
    const { error: pwErr } = await db.rpc('set_npc_password', { p_id: id, p_password: password });
    if (pwErr) { errEl.textContent = 'Salvo, mas erro na senha: ' + pwErr.message; errEl.style.display = 'block'; return; }
  }

  okEl.style.display = 'block';
  setTimeout(() => okEl.style.display = 'none', 2000);
  admNpcLoad();
}

async function admNpcModalDeletar() {
  const id = document.getElementById('npc-modal-edit-id').value;
  const u  = _allNpcs.find(x => x.id === id);
  if (!u) return;
  fecharModalNpcEdit();
  confirmarDeletar('usuario', id, `NPC @${u.username}`);
}

// ── Modal Perfil NPC ──────────────────────────────────────
async function abrirModalPerfilNpc(userId) {
  const modal   = document.getElementById('adm-npc-profile-modal');
  const content = document.getElementById('adm-npc-profile-content');
  content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">Carregando...</div>';
  modal.classList.add('open');

  const { data: u } = await db.from('users').select('*').eq('id', userId).maybeSingle();
  if (!u) { content.innerHTML = '<div style="padding:30px;color:var(--muted)">Usuário não encontrado.</div>'; return; }

  const { data: posts }      = await db.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  const { count: followers } = await db.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
  const { count: following } = await db.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId);

  content.innerHTML = buildProfileHTML(u, posts || [], followers || 0, following || 0, false);
}

// ── Painel de posts do NPC ────────────────────────────────
async function admNpcAbrirPosts(userId, username) {
  _currentNpcUserId = userId;
  document.getElementById('npc-posts-title').textContent = `Publicações de @${username}`;
  document.getElementById('npc-post-uid').value = userId;
  document.getElementById('npc-posts-panel').style.display = 'block';
  document.getElementById('npc-posts-panel').scrollIntoView({ behavior:'smooth', block:'start' });
  admNpcCancelarPostEdit();
  await admNpcCarregarPosts(userId);
}

function admNpcFecharPostsPanel() {
  document.getElementById('npc-posts-panel').style.display = 'none';
  _currentNpcUserId = null;
}

async function admNpcCarregarPosts(userId) {
  const tbody  = document.getElementById('npc-posts-tbody');
  const loadEl = document.getElementById('npc-posts-loading');
  tbody.innerHTML = ''; loadEl.style.display = 'block';
  const { data: posts } = await db.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  loadEl.style.display = 'none';
  if (!posts || !posts.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Nenhuma publicação ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = posts.map(p => `
    <tr>
      <td>${p.image_url ? `<img src="${esc(p.image_url)}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;display:block">` : `<div style="width:56px;height:56px;border-radius:6px;background:${p.bg||'#eee'};display:flex;align-items:center;justify-content:center;font-size:24px">${p.emoji||'📸'}</div>`}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.caption||'—')}</td>
      <td style="color:var(--muted)">${esc(p.location||'—')}</td>
      <td style="color:var(--muted);white-space:nowrap">${fmtDate(p.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="adm-btn adm-btn-warn adm-btn-sm" onclick="admNpcEditarPost('${p.id}')">✏️</button>
          <button class="adm-btn adm-btn-danger adm-btn-sm" onclick="admNpcDeletarPost('${p.id}')">🗑</button>
        </div>
      </td>
    </tr>`).join('');
}

// ── Preview imagem do post ────────────────────────────────
function admNpcPreviewPostImg(input) {
  const file = input.files[0];
  if (!file) return;
  _npcPendingPostImgFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('npc-post-img-preview');
    prev.style.background = 'transparent';
    prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`;
  };
  reader.readAsDataURL(file);
}

// ── Publicar / editar post de NPC ─────────────────────────
async function admNpcSubmitPost() {
  const uid      = document.getElementById('npc-post-uid').value;
  const editId   = document.getElementById('npc-post-edit-id').value.trim();
  const caption  = document.getElementById('npc-post-caption').value.trim();
  const location = document.getElementById('npc-post-location').value.trim();
  const okEl  = document.getElementById('npc-post-fb-ok');
  const errEl = document.getElementById('npc-post-fb-err');
  const btn   = document.querySelector('#npc-posts-panel .adm-btn-primary');
  okEl.style.display = errEl.style.display = 'none';

  if (!caption) { errEl.textContent = 'Escreva uma legenda.'; errEl.style.display = 'block'; return; }
  if (!editId && !_npcPendingPostImgFile) { errEl.textContent = 'Selecione uma foto.'; errEl.style.display = 'block'; return; }

  if (btn) { btn.textContent = 'Publicando...'; btn.disabled = true; }

  let image_url = null;
  if (editId && !_npcPendingPostImgFile) {
    // mantém imagem atual
    const { data: existing } = await db.from('posts').select('image_url').eq('id', editId).maybeSingle();
    image_url = existing?.image_url || null;
  }
  if (_npcPendingPostImgFile) {
    const path = `npc_${uid}_${Date.now()}.png`;
    const { error: upErr } = await db.storage.from('posts').upload(path, _npcPendingPostImgFile, { upsert: false, contentType: 'image/png' });
    if (upErr) {
      errEl.textContent = 'Erro no upload: ' + upErr.message;
      errEl.style.display = 'block';
      if (btn) { btn.textContent = 'Publicar'; btn.disabled = false; }
      return;
    }
    const { data: ud } = db.storage.from('posts').getPublicUrl(path);
    image_url = ud.publicUrl;
    _npcPendingPostImgFile = null;
  }

  let error;
  if (editId) {
    const { error: e } = await db.from('posts').update({ caption, location, image_url }).eq('id', editId);
    error = e;
  } else {
    const { error: e } = await db.from('posts').insert({ user_id: uid, caption, location, image_url, emoji: null, bg: null });
    error = e;
  }

  if (btn) { btn.textContent = 'Publicar'; btn.disabled = false; }
  if (error) { errEl.textContent = 'Erro: ' + error.message; errEl.style.display = 'block'; return; }

  okEl.style.display = 'block';
  setTimeout(() => okEl.style.display = 'none', 2500);
  admNpcCancelarPostEdit();
  await admNpcCarregarPosts(uid);
}

// ── Editar post existente ─────────────────────────────────
async function admNpcEditarPost(postId) {
  const { data: p } = await db.from('posts').select('*').eq('id', postId).maybeSingle();
  if (!p) return;
  document.getElementById('npc-post-edit-id').value    = postId;
  document.getElementById('npc-post-caption').value   = p.caption || '';
  document.getElementById('npc-post-location').value  = p.location || '';
  document.getElementById('npc-post-cancel-btn').style.display = 'inline-flex';
  _npcPendingPostImgFile = null;
  const prev = document.getElementById('npc-post-img-preview');
  if (p.image_url) {
    prev.innerHTML = `<img src="${esc(p.image_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`;
    prev.style.background = 'transparent';
  } else {
    prev.innerHTML = `<div style="font-size:32px">${p.emoji||'📸'}</div><div style="font-size:11px;margin-top:4px">Clique para trocar</div>`;
    prev.style.background = p.bg || '#eee';
  }
  document.querySelector('#npc-posts-panel .adm-btn-primary').textContent = '💾 Salvar edição';
  document.getElementById('npc-posts-panel').scrollIntoView({ behavior:'smooth', block:'start' });
}

async function admNpcDeletarPost(postId) {
  if (!confirm('Remover esta publicação do NPC?')) return;
  const { error } = await db.from('posts').delete().eq('id', postId);
  if (error) { alert('Erro: ' + error.message); return; }
  await admNpcCarregarPosts(_currentNpcUserId);
}

function admNpcCancelarPostEdit() {
  document.getElementById('npc-post-edit-id').value   = '';
  document.getElementById('npc-post-caption').value  = '';
  document.getElementById('npc-post-location').value = '';
  document.getElementById('npc-post-img-file').value = '';
  document.getElementById('npc-post-cancel-btn').style.display = 'none';
  const prev = document.getElementById('npc-post-img-preview');
  prev.innerHTML = '📷<br>Clique para foto';
  prev.style.background = '#eee';
  const btn = document.querySelector('#npc-posts-panel .adm-btn-primary');
  if (btn) btn.textContent = '📤 Publicar';
  _npcPendingPostImgFile = null;
}

function admLogout() { admClearSession(); admLogado = null; location.reload(); }

function mostrarPainelAdm() {
  document.getElementById('adm-login-page').style.display = 'none';
  document.getElementById('adm-panel').style.display      = 'block';
  document.getElementById('adm-nav-user').textContent     = '👤 ' + admLogado.username;
  document.getElementById('adm-nav-user').style.display   = 'inline';
  document.getElementById('adm-btn-logout').style.display = 'inline-block';
  const admChatBtn = document.getElementById('adm-btn-chat');
  if (admChatBtn) admChatBtn.style.display = 'inline-flex';
  document.getElementById('adm-sidebar-user').textContent = admLogado.username;
  carregarUsuarios();
}

function admImgTab(btn, id) {
  document.querySelectorAll('.adm-img-tab').forEach(b => {
    b.style.background = '#fff';
    b.style.color      = 'var(--text)';
    b.classList.remove('active');
  });
  btn.style.background = 'var(--brand-mid)';
  btn.style.color      = '#fff';
  btn.classList.add('active');
  ['img-logo','img-gif','img-sprites','img-favicon','img-pokeet-logo','img-whatsapp'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = (s === id) ? 'block' : 'none';
  });
  if (id === 'img-logo')         carregarLogoAdm();
  if (id === 'img-gif')          carregarLoadingGifAdm();
  if (id === 'img-sprites')      carregarSpritesAdm();
  if (id === 'img-favicon')      carregarFaviconAdm();
  if (id === 'img-pokeet-logo')  carregarPokeetLogoAdm();
  if (id === 'img-whatsapp')     carregarWhatsappIconAdm();
}

function admTab(btn, id) {
  document.querySelectorAll('.adm-snav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.adm-section').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sec-' + id).classList.add('active');
  if (id === 'posts')   carregarPosts();
  if (id === 'stats')   carregarStats();
  if (id === 'imagens') { carregarLogoAdm(); carregarFaviconAdm(); carregarPokeetLogoAdm(); carregarWhatsappIconAdm(); }
  if (id === 'filtros') setTimeout(admLoadFiltros, 50);
  if (id === 'npcs')    admNpcLoad();
  if (id === 'gerador') geradorInit();
  if (id === 'automacao') automacaoInit();
}

// ══════════════════════════════════════════════════════════
//  GERADOR DE POSTAGENS IA
// ══════════════════════════════════════════════════════════
let _geradorNpcs = [];
let _geradorApiKey = '';

async function geradorInit() {
  const sel = document.getElementById('gerador-npc-select');
  if (!_geradorNpcs.length) {
    sel.innerHTML = '<option value="">— Carregando... —</option>';
    const [{ data: npcs }, { data: keyRow }] = await Promise.all([
      db.from('users').select('id,username,name,bio,rpg,color,avatar_url').eq('is_npc', true).order('username'),
      db.from('settings').select('value').eq('key', 'gemini_api_key').maybeSingle(),
    ]);
    _geradorNpcs = npcs || [];
    _geradorApiKey = keyRow?.value || '';
    sel.innerHTML = _geradorNpcs.length
      ? '<option value="">— Selecione um NPC —</option>' + _geradorNpcs.map(n => `<option value="${n.id}">${esc(n.username)}${n.name ? ' · ' + esc(n.name) : ''}</option>`).join('')
      : '<option value="">— Nenhum NPC cadastrado —</option>';
  }
  // Atualiza campo de chave na UI
  const kf = document.getElementById('gerador-api-key-input');
  if (kf && !kf.value) kf.value = _geradorApiKey;
  document.getElementById('gerador-key-status').textContent = _geradorApiKey ? '✅ Chave configurada' : '⚠️ Chave não configurada';
  document.getElementById('gerador-key-status').style.color = _geradorApiKey ? 'var(--green)' : 'var(--red)';
}

async function geradorSalvarChave() {
  const key = document.getElementById('gerador-api-key-input').value.trim();
  const btn = document.getElementById('gerador-key-save-btn');
  btn.disabled = true; btn.textContent = '⏳ Salvando...';
  const { error } = await db.from('settings').upsert({ key: 'gemini_api_key', value: key }, { onConflict: 'key' });
  if (error) { alert('Erro ao salvar: ' + error.message); }
  else {
    _geradorApiKey = key;
    document.getElementById('gerador-key-status').textContent = key ? '✅ Chave configurada' : '⚠️ Chave não configurada';
    document.getElementById('gerador-key-status').style.color = key ? 'var(--green)' : 'var(--red)';
  }
  btn.disabled = false; btn.textContent = '💾 Salvar chave';
}

function geradorTipoChange() {
  const tipo = document.getElementById('gerador-tipo').value;
  document.getElementById('gerador-local-wrap').style.display = tipo === 'pokegram' ? '' : 'none';
}

function geradorLimpar() {
  document.getElementById('gerador-results').style.display = 'none';
  document.getElementById('gerador-cards').innerHTML = '';
  document.getElementById('gerador-error').style.display = 'none';
}

// ── Parser robusto para respostas do Gemini ──────────────
// Lida com: markdown fences, arrays diretos, aspas tipográficas,
// vírgulas extras, quebras de linha dentro de strings, e texto
// fora do JSON.
function geminiParseJson(raw, tipo) {
  // 1. Remove markdown fences e espaços externos
  let s = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();

  // 2. Substitui aspas tipográficas por aspas normais
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
       .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");

  // 3. Tenta encontrar o bloco JSON — objeto ou array
  const oStart = s.indexOf('{');
  const aStart = s.indexOf('[');
  let jsonStr = s;

  if (oStart !== -1 && (aStart === -1 || oStart < aStart)) {
    // Formato esperado: {"sugestoes":[...]}
    const oEnd = s.lastIndexOf('}');
    if (oEnd !== -1) jsonStr = s.slice(oStart, oEnd + 1);
  } else if (aStart !== -1) {
    // Gemini retornou array direto: [{...}, {...}]
    const aEnd = s.lastIndexOf(']');
    if (aEnd !== -1) jsonStr = s.slice(aStart, aEnd + 1);
  }

  // 4. Sequência de tentativas de parse cada vez mais agressivas
  const tentativas = [
    // a) direto
    () => JSON.parse(jsonStr),
    // b) remove quebras de linha dentro de strings
    () => JSON.parse(jsonStr.replace(/("(?:[^"\\]|\\.)*")/g,
      m => m.replace(/\n/g, ' ').replace(/\r/g, ' '))),
    // c) remove vírgulas extras antes de } e ]
    () => JSON.parse(jsonStr.replace(/,\s*([}\]])/g, '$1')),
    // d) combina b + c
    () => {
      let t = jsonStr.replace(/("(?:[^"\\]|\\.)*")/g,
        m => m.replace(/\n/g, ' ').replace(/\r/g, ' '));
      t = t.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(t);
    },
    // e) escapa barras invertidas solitárias
    () => JSON.parse(jsonStr.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')),
  ];

  let parsed = null;
  for (const fn of tentativas) {
    try { parsed = fn(); break; } catch(_) {}
  }

  if (!parsed) {
    // Log para diagnóstico sem expor a chave
    console.error('[geminiParseJson] raw:', raw.slice(0, 500));
    throw new Error('A IA retornou um formato inesperado. Tente novamente.');
  }

  // 5. Normaliza para sempre retornar um array de sugestoes
  if (Array.isArray(parsed)) return parsed;
  if (parsed.sugestoes) return parsed.sugestoes;

  // Gemini às vezes retorna objeto único sem wrapper
  if (tipo === 'pokegram' && (parsed.legenda || parsed.caption)) {
    return [{ legenda: parsed.legenda || parsed.caption, local: parsed.local || '' }];
  }
  if (tipo === 'pokeet' && (parsed.texto || parsed.text)) {
    return [{ texto: parsed.texto || parsed.text }];
  }

  // Último recurso: procura qualquer array no objeto
  const arr = Object.values(parsed).find(v => Array.isArray(v));
  return arr || [];
}

async function geradorGerar() {
  const npcId = document.getElementById('gerador-npc-select').value;
  if (!npcId) { alert('Selecione um NPC primeiro.'); return; }
  const npc = _geradorNpcs.find(n => n.id === npcId);
  if (!npc) return;

  const tipo     = document.getElementById('gerador-tipo').value;
  const qtd      = parseInt(document.getElementById('gerador-qtd').value) || 3;
  const tom      = document.getElementById('gerador-tom').value;
  const contexto = document.getElementById('gerador-contexto').value.trim();
  const local    = document.getElementById('gerador-local').value.trim();

  // Chave da API
  _geradorApiKey = document.getElementById('gerador-api-key-input').value.trim();
  if (!_geradorApiKey) {
    alert('Configure a chave do Gemini antes de gerar.');
    document.getElementById('gerador-api-key-input').focus();
    return;
  }

  // UI: mostrar loading
  document.getElementById('gerador-loading').style.display = 'block';
  document.getElementById('gerador-results').style.display = 'none';
  document.getElementById('gerador-error').style.display = 'none';
  document.getElementById('gerador-btn').disabled = true;
  document.getElementById('gerador-btn').textContent = '⏳ Gerando...';

  const tomsMap = {
    natural:'natural, condizente com a personalidade e bio do personagem',
    animado:'animado, empolgado, cheio de energia',
    poetico:'poético, contemplativo, com metáforas',
    misterioso:'misterioso, sombrio, enigmático',
    formal:'formal, sério, distinto',
    comico:'cômico, descontraído, com humor',
  };
  const tomDesc = tomsMap[tom] || 'natural';

  let fullPrompt;

  if (tipo === 'pokegram') {
    fullPrompt = `Você é um assistente criativo para um RPG de Pokémon chamado Pokégram. Gere sugestões de legendas para postagens de fotos do personagem descrito. As legendas devem parecer postagens reais de uma rede social estilo Instagram no universo Pokémon. Use português brasileiro informal. Inclua hashtags relevantes ao universo Pokémon no final de cada legenda. Responda APENAS com um JSON válido, sem texto extra, sem marcação markdown.

Personagem: @${npc.username}${npc.name ? ' (' + npc.name + ')' : ''}
Bio: ${npc.bio || 'Sem bio definida'}
RPG: ${npc.rpg || 'Não definido'}

Contexto da postagem: ${contexto || 'Situação cotidiana do personagem no universo Pokémon'}
${local ? 'Local da postagem: ' + local : ''}
Tom desejado: ${tomDesc}

Gere ${qtd} sugestão(ões) de legenda para uma postagem do Pokégram. Para cada sugestão, forneça uma legenda (máximo 300 caracteres com hashtags) e uma sugestão de local no formato "Cidade/Local, Região" do universo Pokémon.

Responda exatamente neste formato JSON:
{"sugestoes":[{"legenda":"texto da legenda com #hashtags","local":"Nome do Local, Região"}]}`;

  } else {
    fullPrompt = `Você é um assistente criativo para um RPG de Pokémon chamado Pokégram. Gere sugestões de Pokeets (posts curtos estilo Twitter) do personagem descrito. Os textos devem parecer posts reais de uma rede social no universo Pokémon. Use português brasileiro informal. Máximo de 280 caracteres cada. Responda APENAS com um JSON válido, sem texto extra, sem marcação markdown.

Personagem: @${npc.username}${npc.name ? ' (' + npc.name + ')' : ''}
Bio: ${npc.bio || 'Sem bio definida'}
RPG: ${npc.rpg || 'Não definido'}

Contexto: ${contexto || 'Situação cotidiana do personagem no universo Pokémon'}
Tom desejado: ${tomDesc}

Gere ${qtd} sugestão(ões) de Pokeet (texto curto, máximo 280 caracteres). Podem incluir hashtags, menções com @ e emojis.

Responda exatamente neste formato JSON:
{"sugestoes":[{"texto":"texto do pokeet"}]}`;
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${_geradorApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 1024, responseMimeType: 'application/json' },
        })
      }
    );
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || 'Erro HTTP ' + resp.status);
    }
    const data = await resp.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const sugestoes = geminiParseJson(raw, tipo);
    geradorRenderCards(sugestoes, tipo, npc);
  } catch(err) {
    const errEl = document.getElementById('gerador-error');
    errEl.textContent = '❌ Erro ao gerar sugestões: ' + err.message;
    errEl.style.display = 'block';
  } finally {
    document.getElementById('gerador-loading').style.display = 'none';
    document.getElementById('gerador-btn').disabled = false;
    document.getElementById('gerador-btn').textContent = '✨ Gerar sugestões';
  }
}

function geradorRenderCards(sugestoes, tipo, npc) {
  if (!sugestoes.length) {
    document.getElementById('gerador-error').textContent = 'Nenhuma sugestão retornada. Tente novamente.';
    document.getElementById('gerador-error').style.display = 'block';
    return;
  }

  const titulo = tipo === 'pokegram'
    ? `📸 ${sugestoes.length} legenda(s) para @${npc.username}`
    : `💭 ${sugestoes.length} pokeet(s) para @${npc.username}`;
  document.getElementById('gerador-results-title').textContent = titulo;

  const container = document.getElementById('gerador-cards');
  container.innerHTML = sugestoes.map((s, i) => {
    const cardId = `gcard-${i}`;
    if (tipo === 'pokegram') {
      return `<div class="adm-box" id="${cardId}" style="border-left:3px solid var(--brand-mid)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:var(--brand-mid);text-transform:uppercase;letter-spacing:.4px">📸 Sugestão ${i+1}</div>
          <div id="${cardId}-status" style="font-size:12px;font-weight:700;color:var(--green);display:none">✓ Publicado!</div>
        </div>
        <div class="adm-field" style="margin-bottom:10px">
          <label>Legenda</label>
          <textarea id="${cardId}-cap" rows="3" style="padding:10px 12px;border-radius:8px;border:1.5px solid var(--border);font-family:'Nunito',sans-serif;font-size:13px;color:var(--text);resize:vertical;width:100%;box-sizing:border-box;background:var(--surface)">${esc(s.legenda||'')}</textarea>
        </div>
        <div class="adm-field" style="margin-bottom:12px">
          <label>Local</label>
          <input type="text" id="${cardId}-loc" value="${esc(s.local||'')}" style="padding:10px 12px;border-radius:8px;border:1.5px solid var(--border);font-family:'Nunito',sans-serif;font-size:13px;color:var(--text);width:100%;box-sizing:border-box;background:var(--surface)">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="adm-btn adm-btn-primary adm-btn-sm" id="${cardId}-btn" onclick="geradorPublicarPost('${cardId}','${npc.id}')">📤 Publicar no Pokégram</button>
          <button class="adm-btn adm-btn-sm" style="background:var(--surface2);border:1.5px solid var(--border);color:var(--text)" onclick="admNpcAbrirPosts('${npc.id}','${npc.username}');admTab(document.querySelector('[onclick*=\\'npcs\\']'),\\'npcs\\')">📋 Ver posts</button>
        </div>
      </div>`;
    } else {
      const chars = (s.texto||'').length;
      const over  = chars > 280;
      return `<div class="adm-box" id="${cardId}" style="border-left:3px solid #c62828">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:#c62828;text-transform:uppercase;letter-spacing:.4px">💭 Pokeet ${i+1}</div>
          <div id="${cardId}-status" style="font-size:12px;font-weight:700;color:var(--green);display:none">✓ Publicado!</div>
        </div>
        <div class="adm-field" style="margin-bottom:10px">
          <label>Texto <span id="${cardId}-chars" style="font-weight:400;text-transform:none;letter-spacing:0;color:${over?'var(--red)':'var(--muted)'}">(${chars}/280)</span></label>
          <textarea id="${cardId}-txt" rows="3" maxlength="300" oninput="geradorCountChars('${cardId}-txt','${cardId}-chars')" style="padding:10px 12px;border-radius:8px;border:1.5px solid ${over?'var(--red)':'var(--border)'};font-family:'Nunito',sans-serif;font-size:13px;color:var(--text);resize:vertical;width:100%;box-sizing:border-box;background:var(--surface)">${esc(s.texto||'')}</textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="adm-btn adm-btn-sm" id="${cardId}-btn" style="background:#c62828;color:#fff" onclick="geradorPublicarPokeet('${cardId}','${npc.id}')">💭 Publicar Pokeet</button>
        </div>
      </div>`;
    }
  }).join('');

  document.getElementById('gerador-results').style.display = 'block';
  document.getElementById('gerador-results').scrollIntoView({ behavior:'smooth', block:'start' });
}

function geradorCountChars(taId, spanId) {
  const ta = document.getElementById(taId);
  const sp = document.getElementById(spanId);
  if (!ta || !sp) return;
  const n = ta.value.length;
  sp.textContent = `(${n}/280)`;
  sp.style.color = n > 280 ? 'var(--red)' : 'var(--muted)';
  ta.style.borderColor = n > 280 ? 'var(--red)' : 'var(--border)';
}

async function geradorPublicarPost(cardId, npcId) {
  const caption  = document.getElementById(cardId + '-cap').value.trim();
  const location = document.getElementById(cardId + '-loc').value.trim();
  const btn      = document.getElementById(cardId + '-btn');
  const status   = document.getElementById(cardId + '-status');

  if (!caption) { alert('A legenda não pode estar vazia.'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ Publicando...';

  const { error } = await db.from('posts').insert({
    user_id: npcId,
    caption,
    location: location || null,
    image_url: null,
    emoji: '📸',
    bg: '#f5f5f5'
  });

  if (error) {
    btn.disabled = false;
    btn.textContent = '📤 Publicar no Pokégram';
    alert('Erro ao publicar: ' + error.message);
    return;
  }

  btn.style.display = 'none';
  status.style.display = '';
  document.getElementById(cardId).style.opacity = '0.65';
}

async function geradorPublicarPokeet(cardId, npcId) {
  const text   = document.getElementById(cardId + '-txt').value.trim();
  const btn    = document.getElementById(cardId + '-btn');
  const status = document.getElementById(cardId + '-status');

  if (!text) { alert('O texto não pode estar vazio.'); return; }
  if (text.length > 280) { alert('O pokeet tem mais de 280 caracteres!'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ Publicando...';

  // Busca dados do NPC para snapshot do autor
  const npc = (_geradorNpcs||[]).find(n => n.id === npcId) || (_autoNpcs||[]).find(n => n.id === npcId) || {};
  const authorSnap = {
    author_name:   npc.name     || npc.username || '',
    author_handle: npc.username || '',
    author_color:  npc.color    || '#e53935',
    author_avatar: npc.avatar_url || null,
  };


  const { error } = await db.from('pokeets').insert({ user_id: npcId, text, ...authorSnap });

  if (error) {
    btn.disabled = false;
    btn.textContent = '💭 Publicar Pokeet';
    alert('Erro ao publicar: ' + error.message);
    return;
  }

  btn.style.display = 'none';
  status.style.display = '';
  document.getElementById(cardId).style.opacity = '0.65';
}

// ══════════════════════════════════════════════════════════
//  AUTOMAÇÃO DE POSTAGENS
// ══════════════════════════════════════════════════════════
let _autoNpcs = [];
let _autoConfigs = {};

async function automacaoInit() {
  document.getElementById('automacao-loading').style.display = 'block';
  document.getElementById('automacao-lista').innerHTML = '';
  document.getElementById('automacao-vazio').style.display = 'none';

  const [{ data: npcs }, { data: configs }] = await Promise.all([
    db.from('users').select('id,username,name,avatar_url,bio,rpg').eq('is_npc', true).order('username'),
    db.from('npc_autoposts').select('*'),
  ]);

  _autoNpcs = npcs || [];
  _autoConfigs = {};
  (configs || []).forEach(c => { _autoConfigs[c.npc_id] = c; });

  document.getElementById('automacao-loading').style.display = 'none';

  if (!_autoNpcs.length) {
    document.getElementById('automacao-vazio').style.display = 'block';
    return;
  }

  const lista = document.getElementById('automacao-lista');
  lista.innerHTML = _autoNpcs.map(npc => {
    const cfg = _autoConfigs[npc.id] || {};
    const ativo = cfg.ativo || false;
    const tipo = cfg.tipo || 'pokegram';
    const ppd = cfg.posts_por_dia || 2;
    const tom = cfg.tom || 'natural';
    const contexto = cfg.contexto_fixo || '';
    const lowercase = cfg.lowercase || false;
    const horarios = (cfg.horarios || ['09:00','18:00']).join(', ');
    const ultimoPost = cfg.ultimo_post ? new Date(cfg.ultimo_post).toLocaleString('pt-BR') : '—';

    return `<div class="adm-box" id="auto-card-${npc.id}" style="border-left:3px solid ${ativo ? 'var(--green)' : 'var(--border)'}">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="font-size:22px">${npc.avatar_url ? `<img src="${npc.avatar_url}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : '🤖'}</div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:14px">@${esc(npc.username)}${npc.name ? ' · ' + esc(npc.name) : ''}</div>
          <div style="font-size:11px;color:var(--muted)">Último post automático: ${ultimoPost}</div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:700">
          <input type="checkbox" id="auto-ativo-${npc.id}" ${ativo ? 'checked' : ''} onchange="autoToggleAtivo('${npc.id}')" style="width:16px;height:16px;cursor:pointer">
          <span id="auto-ativo-label-${npc.id}" style="color:${ativo ? 'var(--green)' : 'var(--muted)'}">${ativo ? '✅ Ativo' : '⏸ Inativo'}</span>
        </label>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="adm-field" style="margin:0">
          <label>Tipo</label>
          <select id="auto-tipo-${npc.id}" style="padding:8px 10px;border-radius:8px;border:1.5px solid var(--border);font-family:'Nunito',sans-serif;font-size:13px;color:var(--text);width:100%;background:var(--surface)">
            <option value="pokegram" ${tipo==='pokegram'?'selected':''}>📸 Pokégram</option>
            <option value="pokeet" ${tipo==='pokeet'?'selected':''}>💭 Pokeet</option>
            <option value="ambos" ${tipo==='ambos'?'selected':''}>🔀 Ambos (aleatório)</option>
          </select>
        </div>
        <div class="adm-field" style="margin:0">
          <label>Tom</label>
          <select id="auto-tom-${npc.id}" style="padding:8px 10px;border-radius:8px;border:1.5px solid var(--border);font-family:'Nunito',sans-serif;font-size:13px;color:var(--text);width:100%;background:var(--surface)">
            <option value="natural" ${tom==='natural'?'selected':''}>Natural</option>
            <option value="animado" ${tom==='animado'?'selected':''}>Animado</option>
            <option value="poetico" ${tom==='poetico'?'selected':''}>Poético</option>
            <option value="misterioso" ${tom==='misterioso'?'selected':''}>Misterioso</option>
            <option value="formal" ${tom==='formal'?'selected':''}>Formal</option>
            <option value="comico" ${tom==='comico'?'selected':''}>Cômico</option>
          </select>
        </div>
        <div class="adm-field" style="margin:0">
          <label>Posts por dia</label>
          <select id="auto-ppd-${npc.id}" style="padding:8px 10px;border-radius:8px;border:1.5px solid var(--border);font-family:'Nunito',sans-serif;font-size:13px;color:var(--text);width:100%;background:var(--surface)">
            ${[1,2,3,4,5].map(n=>`<option value="${n}" ${ppd===n?'selected':''}>${n}x por dia</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="adm-field" style="margin-bottom:12px">
        <label>Horários de postagem <span style="font-weight:400;text-transform:none;letter-spacing:0">(HH:MM separados por vírgula — edite livremente)</span></label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="auto-horarios-${npc.id}" value="${esc(horarios)}" placeholder="09:00, 13:00, 18:00"
            style="padding:8px 10px;border-radius:8px;border:1.5px solid var(--border);font-family:'Nunito',sans-serif;font-size:13px;color:var(--text);flex:1;box-sizing:border-box;background:var(--surface)">
          <button type="button" onclick="autoRegenerarHorarios('${npc.id}')" title="Gerar horários aleatórios com base no Posts por dia"
            style="padding:8px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;cursor:pointer;white-space:nowrap;font-family:'Nunito',sans-serif">🎲 Gerar</button>
        </div>
      </div>

      <div class="adm-field" style="margin-bottom:12px">
        <label>Contexto fixo <span style="font-weight:400;text-transform:none;letter-spacing:0">(opcional — guia a IA sempre)</span></label>
        <textarea id="auto-contexto-${npc.id}" rows="2" placeholder="Ex: Está viajando pela região de Johto, focado em se tornar mestre Pokémon..."
          style="padding:8px 10px;border-radius:8px;border:1.5px solid var(--border);font-family:'Nunito',sans-serif;font-size:13px;color:var(--text);resize:vertical;width:100%;box-sizing:border-box;background:var(--surface)">${esc(contexto)}</textarea>
      </div>

      <div class="adm-field" style="margin-bottom:14px">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;text-transform:none;letter-spacing:0;font-weight:700;font-size:12px">
          <input type="checkbox" id="auto-lowercase-${npc.id}" ${lowercase ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;accent-color:var(--brand)">
          <span>Escrever em <strong>lowercase</strong> <span style="font-weight:400">(minúsculas, estilo internet)</span></span>
        </label>
      </div>

      <div style="display:flex;gap:8px;align-items:center">
        <button class="adm-btn adm-btn-primary adm-btn-sm" onclick="autoSalvar('${npc.id}')">💾 Salvar</button>
        <span id="auto-save-status-${npc.id}" style="font-size:12px;font-weight:700;color:var(--green);display:none">✓ Salvo!</span>
      </div>
    </div>`;
  }).join('');
}

async function autoToggleAtivo(npcId) {
  const cb = document.getElementById(`auto-ativo-${npcId}`);
  const label = document.getElementById(`auto-ativo-label-${npcId}`);
  const card = document.getElementById(`auto-card-${npcId}`);
  const ativo = cb.checked;
  label.textContent = ativo ? '✅ Ativo' : '⏸ Inativo';
  label.style.color = ativo ? 'var(--green)' : 'var(--muted)';
  card.style.borderLeftColor = ativo ? 'var(--green)' : 'var(--border)';
}

async function autoSalvar(npcId) {
  const ativo    = document.getElementById(`auto-ativo-${npcId}`).checked;
  const tipo     = document.getElementById(`auto-tipo-${npcId}`).value;
  const tom      = document.getElementById(`auto-tom-${npcId}`).value;
  const contexto = document.getElementById(`auto-contexto-${npcId}`).value.trim();
  const ppd      = parseInt(document.getElementById(`auto-ppd-${npcId}`).value) || 2;
  const lowercase = document.getElementById(`auto-lowercase-${npcId}`).checked;

  // Lê os horários do campo editável; se vazio ou inválido, gera aleatoriamente
  const horariosRaw = (document.getElementById(`auto-horarios-${npcId}`)?.value || '').trim();
  const horariosParsed = horariosRaw
    .split(',')
    .map(h => h.trim())
    .filter(h => /^\d{2}:\d{2}$/.test(h));
  const horarios = horariosParsed.length > 0 ? horariosParsed : autoGerarHorarios(ppd);

  const btn = document.querySelector(`#auto-card-${npcId} .adm-btn-primary`);
  btn.disabled = true; btn.textContent = '⏳';

  const { error } = await db.from('npc_autoposts').upsert({
    npc_id: npcId, ativo, tipo, tom,
    posts_por_dia: ppd,
    horarios,
    contexto_fixo: contexto || null,
    lowercase,
  }, { onConflict: 'npc_id' });

  btn.disabled = false; btn.textContent = '💾 Salvar';

  if (error) { alert('Erro ao salvar: ' + error.message); return; }

  const status = document.getElementById(`auto-save-status-${npcId}`);
  status.style.display = '';
  setTimeout(() => status.style.display = 'none', 2000);
}

function autoGerarHorarios(qtd) {
  // Distribui aleatoriamente entre 8h e 23h com intervalo mínimo de 2h
  const slots = [];
  const inicio = 8 * 60;  // 8:00
  const fim    = 23 * 60; // 23:00
  const minInterval = 120; // 2h mínimo entre posts
  let tentativas = 0;
  while (slots.length < qtd && tentativas < 200) {
    tentativas++;
    const min = Math.floor(Math.random() * (fim - inicio)) + inicio;
    const ok = slots.every(s => Math.abs(s - min) >= minInterval);
    if (ok) slots.push(min);
  }
  slots.sort((a, b) => a - b);
  return slots.map(m => {
    const h = Math.floor(m / 60).toString().padStart(2, '0');
    const mm = (m % 60).toString().padStart(2, '0');
    return `${h}:${mm}`;
  });
}

function autoRegenerarHorarios(npcId) {
  const ppd = parseInt(document.getElementById(`auto-ppd-${npcId}`)?.value) || 2;
  const novos = autoGerarHorarios(ppd);
  const input = document.getElementById(`auto-horarios-${npcId}`);
  if (input) {
    input.value = novos.join(', ');
    input.style.borderColor = 'var(--green)';
    setTimeout(() => input.style.borderColor = 'var(--border)', 1000);
  }
}

// ── Usuários ──────────────────────────────────────────────
async function carregarUsuarios() {
  const tbody = document.getElementById('tbody-usuarios');
  const load  = document.getElementById('users-loading');
  tbody.innerHTML = ''; load.style.display = 'block';
  const { data, error } = await db.from('users').select('*').or('is_npc.is.null,is_npc.eq.false').order('created_at', { ascending: false });
  load.style.display = 'none';
  if (error) { load.textContent = 'Erro ao carregar usuários.'; load.style.display = 'block'; return; }
  allUsers = data || [];
  document.getElementById('users-count').textContent = `${allUsers.length} usuário(s) cadastrado(s)`;
  renderUsuarios(allUsers);
}

function renderUsuarios(list) {
  const tbody = document.getElementById('tbody-usuarios');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">Nenhum usuário encontrado.</td></tr>'; return; }
  tbody.innerHTML = list.map(u => `
    <tr>
      <td><strong>${esc(u.username)}</strong></td>
      <td>${rpgBadge(u.rpg)}</td>
      <td style="color:var(--muted)">${fmtDate(u.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="adm-btn adm-btn-warn adm-btn-sm" onclick="abrirResetSenha('${esc(u.username)}')">🔑 Resetar Senha</button>
          <button class="adm-btn adm-btn-danger adm-btn-sm" onclick="confirmarDeletar('usuario','${u.id}','${esc(u.username)}')">🗑 Remover</button>
        </div>
      </td>
    </tr>`).join('');
}

function filtrarUsuarios(q) { renderUsuarios(allUsers.filter(u => u.username.toLowerCase().includes(q.toLowerCase()))); }

function abrirResetSenha(username) {
  document.getElementById('reset-username').value = username;
  document.getElementById('reset-password').value = '';
  document.getElementById('reset-username').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('reset-password').focus();
}

async function resetarSenha() {
  const username = document.getElementById('reset-username').value.trim();
  const password = document.getElementById('reset-password').value;
  const okEl  = document.getElementById('reset-fb-ok');
  const errEl = document.getElementById('reset-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  if (!username)                   { errEl.textContent = 'Informe o nome do usuário.'; errEl.style.display = 'block'; return; }
  if (!password || password.length < 6) { errEl.textContent = 'A nova senha deve ter ao menos 6 caracteres.'; errEl.style.display = 'block'; return; }
  const { data, error } = await db.rpc('admin_reset_password', { p_username: username, p_new_password: password });
  if (error || data === false) { errEl.textContent = error ? 'Erro: ' + error.message : 'Usuário não encontrado.'; errEl.style.display = 'block'; return; }
  okEl.style.display = 'block';
  document.getElementById('reset-username').value = '';
  document.getElementById('reset-password').value = '';
  setTimeout(() => okEl.style.display = 'none', 3000);
}

// ── Posts ─────────────────────────────────────────────────
async function carregarPosts() {
  const tbody = document.getElementById('tbody-posts');
  const load  = document.getElementById('posts-loading');
  tbody.innerHTML = ''; load.style.display = 'block';
  const { data, error } = await db.from('posts').select('*, users(username)').order('created_at', { ascending: false });
  load.style.display = 'none';
  if (error) { load.textContent = 'Erro ao carregar posts.'; load.style.display = 'block'; return; }
  allPosts = data || [];
  tbody.innerHTML = allPosts.length ? allPosts.map(p => `
    <tr id="adm-post-row-${p.id}">
      <td><strong>${esc(p.users?.username||'—')}</strong></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.caption||'—')}</td>
      <td style="color:${p.location?'var(--text)':'var(--red)'};white-space:nowrap" id="adm-post-loc-${p.id}">${esc(p.location||'sem local')}</td>
      <td style="color:var(--muted);white-space:nowrap">${fmtDate(p.created_at)}</td>
      <td>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:nowrap">
          <button class="adm-btn adm-btn-sm" style="background:var(--surface2)" onclick="abrirAdmLocModal('${p.id}','${esc(p.users?.username||'')}','${esc((p.caption||'').slice(0,80))}','${esc(p.location||'')}')">📍 Local</button>
          <button class="adm-btn adm-btn-sm" style="background:var(--surface2)" onclick="abrirAdmDateModal('${p.id}','${esc(p.users?.username||'')}','${p.created_at}')">📅 Data</button>
          <button class="adm-btn adm-btn-danger adm-btn-sm" onclick="confirmarDeletar('post','${p.id}','post de ${esc(p.users?.username||'?')}')">🗑</button>
        </div>
      </td>
    </tr>`).join('')
  : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Nenhuma publicação.</td></tr>';
}

// ── Stats ─────────────────────────────────────────────────
async function carregarStats() {
  const { data: users } = await db.from('users').select('id,username,rpg,created_at').order('created_at', { ascending: false });
  const { data: posts } = await db.from('posts').select('id', { count: 'exact' });
  const u = users || [];
  document.getElementById('stat-users').textContent = u.length;
  document.getElementById('stat-posts').textContent = (posts||[]).length;
  document.getElementById('stat-kp').textContent    = u.filter(x => x.rpg === 'kingdom_platinum').length;
  document.getElementById('stat-pc').textContent    = u.filter(x => x.rpg === 'pchapters').length;
  document.getElementById('recent-users-list').innerHTML = u.slice(0,8).map(u => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-weight:700;font-size:13px">${esc(u.username)}</div>
        <div style="font-size:11px;color:var(--muted)">${fmtDate(u.created_at)}</div>
      </div>
      ${rpgBadge(u.rpg)}
    </div>`).join('') || '<div style="color:var(--muted);font-size:13px">Nenhum usuário ainda.</div>';
}

// ── Minha senha ───────────────────────────────────────────
async function alterarSenhaAdm() {
  const atual = document.getElementById('adm-senha-atual').value;
  const nova  = document.getElementById('adm-senha-nova').value;
  const conf  = document.getElementById('adm-senha-conf').value;
  const okEl  = document.getElementById('adm-pw-ok');
  const errEl = document.getElementById('adm-pw-err');
  okEl.style.display = errEl.style.display = 'none';
  if (!atual||!nova||!conf)   { errEl.textContent = 'Preencha todos os campos.'; errEl.style.display = 'block'; return; }
  if (nova !== conf)           { errEl.textContent = 'As novas senhas não coincidem.'; errEl.style.display = 'block'; return; }
  if (nova.length < 6)         { errEl.textContent = 'A nova senha deve ter ao menos 6 caracteres.'; errEl.style.display = 'block'; return; }
  const { data: check } = await db.rpc('login_admin', { p_username: admLogado.username, p_password: atual });
  if (!check) { errEl.textContent = 'Senha atual incorreta.'; errEl.style.display = 'block'; return; }
  const { error: rpcErr } = await db.rpc('admin_reset_password', { p_username: admLogado.username, p_new_password: nova });
  if (rpcErr) { errEl.textContent = 'Erro ao salvar: ' + rpcErr.message; errEl.style.display = 'block'; return; }
  okEl.style.display = 'block';
  ['adm-senha-atual','adm-senha-nova','adm-senha-conf'].forEach(id => document.getElementById(id).value = '');
  setTimeout(() => okEl.style.display = 'none', 3000);
}

// ── Filtrar posts sem local ───────────────────────────────
function filtrarPostsSemLocal() {
  const tbody = document.getElementById('tbody-posts');
  const semLocal = allPosts.filter(p => !p.location || !p.location.trim());
  if (!semLocal.length) { alert('Todos os posts já têm localização!'); return; }
  tbody.innerHTML = semLocal.map(p => `
    <tr id="adm-post-row-${p.id}">
      <td><strong>${esc(p.users?.username||'—')}</strong></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.caption||'—')}</td>
      <td style="color:var(--red)" id="adm-post-loc-${p.id}">sem local</td>
      <td style="color:var(--muted);white-space:nowrap">${fmtDate(p.created_at)}</td>
      <td style="white-space:nowrap;display:flex;gap:4px">
        <button class="adm-btn adm-btn-sm" style="background:var(--surface2)" onclick="abrirAdmLocModal('${p.id}','${esc(p.users?.username||'')}','${esc((p.caption||'').slice(0,80))}','')">📍 Local</button>
        <button class="adm-btn adm-btn-danger adm-btn-sm" onclick="confirmarDeletar('post','${p.id}','post de ${esc(p.users?.username||'?')}')">🗑</button>
      </td>
    </tr>`).join('');
}

// ── Modal de localização ──────────────────────────────────
let _admLocPostId = null;

function abrirAdmLocModal(postId, author, caption, location) {
  _admLocPostId = postId;
  document.getElementById('adm-loc-author').textContent  = author;
  document.getElementById('adm-loc-caption').textContent = caption || '(sem legenda)';
  document.getElementById('adm-loc-input').value         = location || '';
  document.getElementById('adm-loc-err').style.display   = 'none';
  admLocValidar(location || '');
  const modal = document.getElementById('adm-location-modal');
  modal.style.display = 'flex';
}

function fecharAdmLocModal() {
  document.getElementById('adm-location-modal').style.display = 'none';
  _admLocPostId = null;
}

function admLocValidar(val) {
  const errEl  = document.getElementById('adm-loc-err');
  const hintEl = document.getElementById('adm-loc-hint');
  if (!val.trim()) { errEl.style.display = 'none'; return true; }
  const partes = val.split(',').map(s => s.trim()).filter(Boolean);
  if (partes.length < 2) {
    errEl.textContent = 'Formato inválido. Use: Local, Região ou Local Específico, Local, Região';
    errEl.style.display = 'block';
    return false;
  }
  if (partes.length > 3) {
    errEl.textContent = 'Máximo 3 partes: Local Específico, Local, Região';
    errEl.style.display = 'block';
    return false;
  }
  errEl.style.display = 'none';
  return true;
}

async function salvarAdmLocation() {
  const val = document.getElementById('adm-loc-input').value.trim();
  if (!admLocValidar(val)) return;
  if (!_admLocPostId) return;

  // normaliza: capitaliza cada parte
  const normalized = val.split(',').map(s => s.trim()).filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');

  const { error } = await db.from('posts').update({ location: normalized || null }).eq('id', _admLocPostId);
  if (error) {
    document.getElementById('adm-loc-err').textContent = 'Erro: ' + error.message;
    document.getElementById('adm-loc-err').style.display = 'block';
    return;
  }

  // atualiza a célula na tabela sem recarregar tudo
  const cell = document.getElementById('adm-post-loc-' + _admLocPostId);
  if (cell) {
    cell.textContent = normalized || 'sem local';
    cell.style.color = normalized ? 'var(--text)' : 'var(--red)';
  }
  // atualiza cache
  const cached = allPosts.find(p => p.id === _admLocPostId);
  if (cached) cached.location = normalized || null;

  fecharAdmLocModal();
}

// fechar modal clicando no backdrop
document.getElementById('adm-location-modal')?.addEventListener('click', function(e) {
  if (e.target === this) fecharAdmLocModal();
});

// ── Modal de data de publicação ───────────────────────────
let _admDatePostId = null;

function abrirAdmDateModal(postId, author, createdAt) {
  _admDatePostId = postId;
  document.getElementById('adm-date-author').textContent = author;
  // converte para datetime-local format (YYYY-MM-DDTHH:MM)
  const dt = new Date(createdAt);
  const pad = n => String(n).padStart(2,'0');
  const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  document.getElementById('adm-date-input').value = local;
  document.getElementById('adm-date-err').style.display = 'none';
  const modal = document.getElementById('adm-date-modal');
  modal.style.display = 'flex';
}

function fecharAdmDateModal() {
  document.getElementById('adm-date-modal').style.display = 'none';
  _admDatePostId = null;
}

async function salvarAdmDate() {
  const val = document.getElementById('adm-date-input').value;
  const errEl = document.getElementById('adm-date-err');
  if (!val) { errEl.textContent = 'Selecione uma data.'; errEl.style.display = 'block'; return; }
  if (!_admDatePostId) return;
  const isoDate = new Date(val).toISOString();
  const { error } = await db.from('posts').update({ created_at: isoDate }).eq('id', _admDatePostId);
  if (error) { errEl.textContent = 'Erro: ' + error.message; errEl.style.display = 'block'; return; }
  // atualiza célula na tabela
  const row = document.getElementById('adm-post-row-' + _admDatePostId);
  if (row) { const cells = row.querySelectorAll('td'); if (cells[3]) cells[3].textContent = fmtDate(isoDate); }
  const cached = allPosts.find(p => p.id === _admDatePostId);
  if (cached) cached.created_at = isoDate;
  fecharAdmDateModal();
}

document.getElementById('adm-date-modal')?.addEventListener('click', function(e) {
  if (e.target === this) fecharAdmDateModal();
});

// ── Favicon ───────────────────────────────────────────────
function previewFaviconUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 200 * 1024) { alert('Favicon muito grande. Máximo 200 KB.'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('favicon-new-preview').src = e.target.result;
    document.getElementById('favicon-new-preview-wrap').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function salvarFavicon() {
  const okEl  = document.getElementById('favicon-fb-ok');
  const errEl = document.getElementById('favicon-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  const preview = document.getElementById('favicon-new-preview');
  const base64  = preview?.src;
  if (!base64 || !base64.startsWith('data:')) { errEl.textContent = 'Selecione um arquivo primeiro.'; errEl.style.display = 'block'; return; }
  const { error } = await db.from('settings').upsert({ key: 'favicon_url', value: base64 }, { onConflict: 'key' });
  if (error) { errEl.textContent = 'Erro ao salvar: ' + error.message; errEl.style.display = 'block'; return; }
  // aplica na aba imediatamente
  let link = document.querySelector("link[rel~='icon']");
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.href = base64;
  // atualiza preview do "atual"
  document.getElementById('favicon-preview-adm').src = base64;
  document.getElementById('favicon-preview-adm').style.display = 'block';
  document.getElementById('favicon-preview-empty').style.display = 'none';
  okEl.style.display = 'block';
  setTimeout(() => okEl.style.display = 'none', 3000);
}

async function removerFavicon() {
  const okEl  = document.getElementById('favicon-fb-ok');
  const errEl = document.getElementById('favicon-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  await db.from('settings').delete().eq('key', 'favicon_url');
  let link = document.querySelector("link[rel~='icon']");
  if (link) link.href = '/favicon.ico';
  document.getElementById('favicon-preview-adm').style.display = 'none';
  document.getElementById('favicon-preview-empty').style.display = 'inline';
  document.getElementById('favicon-file-input').value = '';
  document.getElementById('favicon-new-preview-wrap').style.display = 'none';
  okEl.textContent = '✓ Favicon removido.';
  okEl.style.display = 'block';
  setTimeout(() => okEl.style.display = 'none', 3000);
}

// ── Logo do Pokeet (bottom nav) ───────────────────────────
let _pendingPokeetLogoBase64 = null;

async function carregarPokeetLogoAdm() {
  const { data } = await db.from('settings').select('value').eq('key', 'pokeet_logo').maybeSingle();
  const url   = data?.value;
  const img   = document.getElementById('pokeet-logo-preview-adm');
  const empty = document.getElementById('pokeet-logo-preview-empty');
  if (url) { img.src = url; img.style.display = 'block'; empty.style.display = 'none'; }
  else     { img.style.display = 'none'; empty.style.display = 'inline'; }
}

function previewPokeetLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 512 * 1024) {
    const errEl = document.getElementById('pokeet-logo-fb-err');
    errEl.textContent = 'Imagem muito grande. Máximo: 500 KB.';
    errEl.style.display = 'block';
    return;
  }
  document.getElementById('pokeet-logo-fb-err').style.display = 'none';
  const reader = new FileReader();
  reader.onload = e => {
    _pendingPokeetLogoBase64 = e.target.result;
    const wrap = document.getElementById('pokeet-logo-new-preview-wrap');
    const img  = document.getElementById('pokeet-logo-new-preview');
    img.src = _pendingPokeetLogoBase64;
    wrap.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function salvarPokeetLogo() {
  const okEl  = document.getElementById('pokeet-logo-fb-ok');
  const errEl = document.getElementById('pokeet-logo-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  if (!_pendingPokeetLogoBase64) { errEl.textContent = 'Selecione uma imagem primeiro.'; errEl.style.display = 'block'; return; }
  const { error } = await db.from('settings').upsert({ key: 'pokeet_logo', value: _pendingPokeetLogoBase64 }, { onConflict: 'key' });
  if (error) { errEl.textContent = 'Erro ao salvar: ' + error.message; errEl.style.display = 'block'; return; }
  applyPokeetLogo(_pendingPokeetLogoBase64);
  _pendingPokeetLogoBase64 = null;
  document.getElementById('pokeet-logo-file-input').value = '';
  document.getElementById('pokeet-logo-new-preview-wrap').style.display = 'none';
  carregarPokeetLogoAdm();
  okEl.style.display = 'block';
  setTimeout(() => okEl.style.display = 'none', 3000);
}

async function removerPokeetLogo() {
  if (!confirm('Remover a logo do Pokeet? A imagem padrão (base64) voltará a ser exibida.')) return;
  const okEl  = document.getElementById('pokeet-logo-fb-ok');
  const errEl = document.getElementById('pokeet-logo-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  const { error } = await db.from('settings').delete().eq('key', 'pokeet_logo');
  if (error) { errEl.textContent = 'Erro: ' + error.message; errEl.style.display = 'block'; return; }
  _pendingPokeetLogoBase64 = null;
  document.getElementById('pokeet-logo-file-input').value = '';
  document.getElementById('pokeet-logo-new-preview-wrap').style.display = 'none';
  carregarPokeetLogoAdm();
  // Revert btab to default embedded image — reload page so base64 is used again
  const btabImg = document.querySelector('.btab-pokeet-logo');
  if (btabImg) btabImg.removeAttribute('data-custom');
  okEl.textContent = '✓ Logo Pokeet removida.';
  okEl.style.display = 'block';
  setTimeout(() => { okEl.style.display = 'none'; okEl.textContent = '✓ Logo Pokeet salva com sucesso!'; }, 3000);
}

function applyPokeetLogo(url) {
  const imgs = document.querySelectorAll('.btab-pokeet-logo');
  imgs.forEach(img => { img.src = url; img.setAttribute('data-custom', '1'); });
}

async function loadPokeetLogo() {
  const { data } = await db.from('settings').select('value').eq('key', 'pokeet_logo').maybeSingle();
  if (data?.value) applyPokeetLogo(data.value);
}

// ── Ícone do WhatZapp (menu de compartilhar) ───────────────
let _pendingWhatsappIconBase64 = null;

async function carregarWhatsappIconAdm() {
  const { data } = await db.from('settings').select('value').eq('key', 'whatsapp_share_icon').maybeSingle();
  const url   = data?.value;
  const img   = document.getElementById('whatsapp-icon-preview-adm');
  const empty = document.getElementById('whatsapp-icon-preview-empty');
  if (url) { img.src = url; img.style.display = 'block'; empty.style.display = 'none'; }
  else     { img.style.display = 'none'; empty.style.display = 'inline'; }
}

function previewWhatsappIconUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 512 * 1024) {
    const errEl = document.getElementById('whatsapp-icon-fb-err');
    errEl.textContent = 'Imagem muito grande. Máximo: 500 KB.';
    errEl.style.display = 'block';
    return;
  }
  document.getElementById('whatsapp-icon-fb-err').style.display = 'none';
  const reader = new FileReader();
  reader.onload = e => {
    _pendingWhatsappIconBase64 = e.target.result;
    const wrap = document.getElementById('whatsapp-icon-new-preview-wrap');
    const img  = document.getElementById('whatsapp-icon-new-preview');
    img.src = _pendingWhatsappIconBase64;
    wrap.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function salvarWhatsappIcon() {
  const okEl  = document.getElementById('whatsapp-icon-fb-ok');
  const errEl = document.getElementById('whatsapp-icon-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  if (!_pendingWhatsappIconBase64) { errEl.textContent = 'Selecione uma imagem primeiro.'; errEl.style.display = 'block'; return; }
  const { error } = await db.from('settings').upsert({ key: 'whatsapp_share_icon', value: _pendingWhatsappIconBase64 }, { onConflict: 'key' });
  if (error) { errEl.textContent = 'Erro ao salvar: ' + error.message; errEl.style.display = 'block'; return; }
  document.documentElement.dataset.whatsappShareIcon = _pendingWhatsappIconBase64;
  _pendingWhatsappIconBase64 = null;
  document.getElementById('whatsapp-icon-file-input').value = '';
  document.getElementById('whatsapp-icon-new-preview-wrap').style.display = 'none';
  carregarWhatsappIconAdm();
  okEl.style.display = 'block';
  setTimeout(() => okEl.style.display = 'none', 3000);
}

async function removerWhatsappIcon() {
  if (!confirm('Remover o ícone do WhatZapp? O ícone padrão voltará a ser exibido.')) return;
  const okEl  = document.getElementById('whatsapp-icon-fb-ok');
  const errEl = document.getElementById('whatsapp-icon-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  const { error } = await db.from('settings').delete().eq('key', 'whatsapp_share_icon');
  if (error) { errEl.textContent = 'Erro: ' + error.message; errEl.style.display = 'block'; return; }
  _pendingWhatsappIconBase64 = null;
  document.getElementById('whatsapp-icon-file-input').value = '';
  document.getElementById('whatsapp-icon-new-preview-wrap').style.display = 'none';
  carregarWhatsappIconAdm();
  document.documentElement.dataset.whatsappShareIcon = '';
  okEl.textContent = '✓ Ícone do WhatZapp removido.';
  okEl.style.display = 'block';
  setTimeout(() => { okEl.style.display = 'none'; okEl.textContent = '✓ Ícone do WhatZapp salvo com sucesso!'; }, 3000);
}

async function loadWhatsappShareIcon() {
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'whatsapp_share_icon').maybeSingle();
    document.documentElement.dataset.whatsappShareIcon = data?.value || '';
  } catch(e) {}
}
let pendingDelete = null;
function confirmarDeletar(tipo, id, label) {
  pendingDelete = { tipo, id };
  document.getElementById('adm-confirm-title').textContent = 'Confirmar remoção';
  document.getElementById('adm-confirm-msg').textContent   = `Deseja remover "${label}"? Esta ação não pode ser desfeita.`;
  document.getElementById('adm-confirm-modal').classList.add('open');
  document.getElementById('adm-confirm-ok').onclick = executarDelete;
}
async function executarDelete() {
  if (!pendingDelete) return;
  const { tipo, id } = pendingDelete;
  fecharModalAdm();
  const table = tipo === 'usuario' ? 'users' : 'posts';
  const { error } = await db.from(table).delete().eq('id', id);
  if (error) { alert('Erro ao remover: ' + error.message); return; }
  if (tipo === 'usuario') carregarUsuarios(); else carregarPosts();
}
function fecharModalAdm() { document.getElementById('adm-confirm-modal').classList.remove('open'); pendingDelete = null; }

// ── Helpers ───────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(iso) { if(!iso) return '—'; const d=new Date(iso); return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
function rpgBadge(rpg) {
  if (rpg==='kingdom_platinum') return '<span class="rpg-badge rpg-kp">Kingdom Platinum</span>';
  if (rpg==='pchapters')        return '<span class="rpg-badge rpg-pc">PChapters</span>';
  return '<span style="color:var(--muted)">—</span>';
}
function admToggleEye(inputId, btn) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

// ── Logo da Rede Social ───────────────────────────────────
let _pendingLogoBase64 = null;

async function carregarLogoAdm() {
  const url = await getNetworkLogo();
  const previewImg   = document.getElementById('logo-preview-adm');
  const previewEmpty = document.getElementById('logo-preview-empty');
  if (url) {
    previewImg.src = url;
    previewImg.style.display = 'block';
    previewEmpty.style.display = 'none';
  } else {
    previewImg.style.display = 'none';
    previewEmpty.style.display = 'inline';
  }
}

async function carregarFaviconAdm() {
  const { data } = await db.from('settings').select('value').eq('key', 'favicon_url').maybeSingle();
  const url = data?.value;
  const img   = document.getElementById('favicon-preview-adm');
  const empty = document.getElementById('favicon-preview-empty');
  if (url) { img.src = url; img.style.display = 'block'; empty.style.display = 'none'; }
  else     { img.style.display = 'none'; empty.style.display = 'inline'; }
}

function previewLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 512 * 1024) {
    const errEl = document.getElementById('logo-fb-err');
    errEl.textContent = 'Imagem muito grande. Máximo: 500 KB.';
    errEl.style.display = 'block';
    return;
  }
  document.getElementById('logo-fb-err').style.display = 'none';
  const reader = new FileReader();
  reader.onload = e => {
    _pendingLogoBase64 = e.target.result; // data URL (base64)
    const wrap = document.getElementById('logo-new-preview-wrap');
    const img  = document.getElementById('logo-new-preview');
    img.src = _pendingLogoBase64;
    wrap.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function salvarLogo() {
  const okEl  = document.getElementById('logo-fb-ok');
  const errEl = document.getElementById('logo-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  if (!_pendingLogoBase64) { errEl.textContent = 'Selecione uma imagem primeiro.'; errEl.style.display = 'block'; return; }
  const { error } = await db.from('settings').upsert({ key: 'network_logo', value: _pendingLogoBase64 }, { onConflict: 'key' });
  if (error) { errEl.textContent = 'Erro ao salvar: ' + error.message; errEl.style.display = 'block'; return; }
  _logoUrl = _pendingLogoBase64;
  _pendingLogoBase64 = null;
  document.getElementById('logo-file-input').value = '';
  document.getElementById('logo-new-preview-wrap').style.display = 'none';
  carregarLogoAdm();
  applyLogos();
  okEl.style.display = 'block';
  setTimeout(() => okEl.style.display = 'none', 3000);
}

async function removerLogo() {
  if (!confirm('Remover a logo? O nome texto voltará a ser exibido.')) return;
  const okEl  = document.getElementById('logo-fb-ok');
  const errEl = document.getElementById('logo-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  const { error } = await db.from('settings').delete().eq('key', 'network_logo');
  if (error) { errEl.textContent = 'Erro: ' + error.message; errEl.style.display = 'block'; return; }
  _logoUrl = null;
  _pendingLogoBase64 = null;
  carregarLogoAdm();
  // Revert all logos to text placeholder
  document.querySelectorAll('.brand-logo-img').forEach(img => { img.src = ''; img.style.display = 'none'; });
  document.querySelectorAll('.brand-logo-placeholder').forEach(el => el.style.display = '');
  okEl.textContent = '✓ Logo removida.';
  okEl.style.display = 'block';
  setTimeout(() => { okEl.style.display = 'none'; okEl.textContent = '✓ Logo salva com sucesso!'; }, 3000);
}

// ── GIF do Loading ────────────────────────────────────────
let _pendingLoadingGifBase64 = null;

async function carregarLoadingGifAdm() {
  const { data } = await db.from('settings').select('value').eq('key', 'splash_gif').maybeSingle();
  const previewImg   = document.getElementById('loading-gif-preview-adm');
  const previewEmpty = document.getElementById('loading-gif-preview-empty');
  if (data && data.value) {
    previewImg.src          = data.value;
    previewImg.style.display = 'block';
    previewEmpty.style.display = 'none';
  } else {
    previewImg.style.display   = 'none';
    previewEmpty.style.display = 'inline';
  }
}

function previewLoadingGifUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const errEl = document.getElementById('loading-gif-fb-err');
  if (file.type !== 'image/gif') { errEl.textContent = 'Apenas arquivos GIF são aceitos.'; errEl.style.display = 'block'; return; }
  if (file.size > 2 * 1024 * 1024) { errEl.textContent = 'GIF muito grande. Máximo: 2 MB.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  const reader = new FileReader();
  reader.onload = e => {
    _pendingLoadingGifBase64 = e.target.result;
    const wrap = document.getElementById('loading-gif-new-preview-wrap');
    const img  = document.getElementById('loading-gif-new-preview');
    img.src = _pendingLoadingGifBase64;
    wrap.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function salvarLoadingGif() {
  const okEl  = document.getElementById('loading-gif-fb-ok');
  const errEl = document.getElementById('loading-gif-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  if (!_pendingLoadingGifBase64) { errEl.textContent = 'Selecione um GIF primeiro.'; errEl.style.display = 'block'; return; }
  const { error } = await db.from('settings').upsert({ key: 'splash_gif', value: _pendingLoadingGifBase64 }, { onConflict: 'key' });
  if (error) { errEl.textContent = 'Erro ao salvar: ' + error.message; errEl.style.display = 'block'; return; }
  _pendingLoadingGifBase64 = null;
  document.getElementById('loading-gif-file-input').value = '';
  document.getElementById('loading-gif-new-preview-wrap').style.display = 'none';
  carregarLoadingGifAdm();
  okEl.style.display = 'block';
  setTimeout(() => okEl.style.display = 'none', 3000);
}

async function removerLoadingGif() {
  if (!confirm('Remover o GIF? A pokeball padrão voltará a ser usada.')) return;
  const okEl  = document.getElementById('loading-gif-fb-ok');
  const errEl = document.getElementById('loading-gif-fb-err');
  okEl.style.display = errEl.style.display = 'none';
  const { error } = await db.from('settings').delete().eq('key', 'splash_gif');
  if (error) { errEl.textContent = 'Erro: ' + error.message; errEl.style.display = 'block'; return; }
  _pendingLoadingGifBase64 = null;
  carregarLoadingGifAdm();
  okEl.textContent = '✓ GIF removido. Pokeball padrão restaurada.';
  okEl.style.display = 'block';
  setTimeout(() => { okEl.style.display = 'none'; okEl.textContent = '✓ GIF salvo com sucesso!'; }, 3500);
}


// ── Sprites do Topnav ─────────────────────────────────────
// Definição dos sprites gerenciáveis (id, label, seletor do elemento, tamanho padrão)
const SPRITE_DEFS = [
  { key: 'nav_home',    label: 'Início (casa)',        sel: '#btn-feed svg',                              dbKey: 'sprite_nav_home' },
  { key: 'nav_create',  label: 'Criar publicação',     sel: '.tn-btn[onclick="showNewPost()"] svg',        dbKey: 'sprite_nav_create' },
  { key: 'nav_explore', label: 'Explorar (lupa)',      sel: '#btn-explore svg',                           dbKey: 'sprite_nav_explore' },
  { key: 'nav_pokeets', label: 'Pokeets (avião)',      sel: '#btn-pokeets svg',                           dbKey: 'sprite_nav_pokeets' },
  { key: 'nav_notif',   label: 'Notificações (sino)',  sel: '#btn-notif svg',                             dbKey: 'sprite_nav_notif' },
  { key: 'nav_chat',    label: 'Chat (mensagens)',     sel: '#btn-chat svg',                              dbKey: 'sprite_nav_chat' },
  { key: 'nav_profile', label: 'Perfil (avatar nav)',  sel: '#btn-profile',                               dbKey: 'sprite_nav_profile' },
  { key: 'nav_logout',  label: 'Sair (logout)',        sel: '.tn-btn[onclick="doLogout()"] svg',           dbKey: 'sprite_nav_logout' },
  { key: 'story_add',      label: 'Círculo + (stories)',        sel: '#story-ring-add',        dbKey: 'sprite_story_add' },
  { key: 'profile_msg_btn', label: 'Botão mensagem (perfil)',    sel: '.btn-icon-profile',      dbKey: 'sprite_profile_msg_btn' },
];
let _pendingSprites = {}; // key → base64

async function carregarSpritesAdm() {
  const grid = document.getElementById('sprites-grid');
  if (!grid) return;

  console.log('SPRITE_DEFS keys:', SPRITE_DEFS.map(d => d.key));

  // Busca valores salvos do Supabase
  const keys = SPRITE_DEFS.map(d => d.dbKey);
  const { data: rows } = await db.from('settings').select('key,value').in('key', keys);
  const saved = {};
  (rows || []).forEach(r => { saved[r.key] = r.value; });

  grid.innerHTML = SPRITE_DEFS.map(def => {
    const current = saved[def.dbKey] || '';
    return `
    <div class="adm-box" style="display:flex;flex-direction:column;gap:10px;align-items:center;text-align:center">
      <div class="adm-box-title" style="margin-bottom:0">${def.label}</div>
      <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;background:#fafafa" id="sprite-preview-${def.key}">
        ${current
          ? `<img src="${current}" style="width:100%;height:100%;object-fit:contain">`
          : `<span style="font-size:11px;color:var(--muted)">SVG<br>padrão</span>`}
      </div>
      <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">
        <input type="file" accept="image/png,image/webp,image/gif,image/jpeg" style="display:none"
          onchange="previewSprite('${def.key}','${def.dbKey}',this)" id="sprite-file-${def.key}">
        <span class="adm-btn adm-btn-warn adm-btn-sm" onclick="document.getElementById('sprite-file-${def.key}').click()">📁 Selecionar</span>
      </label>
      <button class="adm-btn adm-btn-danger adm-btn-sm" onclick="limparSprite('${def.key}','${def.dbKey}')" style="${current?'':'display:none'}" id="sprite-clear-${def.key}">✕ Remover</button>
    </div>`;
  }).join('');
}

function previewSprite(key, dbKey, input) {
  const file = input.files[0];
  if (!file) return;
  const errEl = document.getElementById('sprites-fb-err');
  if (file.size > 100 * 1024) {
    errEl.textContent = `"${file.name}" é muito grande. Máximo: 100 KB por sprite.`;
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  const reader = new FileReader();
  reader.onload = e => {
    _pendingSprites[dbKey] = e.target.result;
    const prev = document.getElementById('sprite-preview-' + key);
    if (prev) prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:contain">`;
    const clearBtn = document.getElementById('sprite-clear-' + key);
    if (clearBtn) clearBtn.style.display = '';
  };
  reader.readAsDataURL(file);
}

async function limparSprite(key, dbKey) {
  _pendingSprites[dbKey] = null; // marca para remoção
  const prev = document.getElementById('sprite-preview-' + key);
  if (prev) prev.innerHTML = `<span style="font-size:11px;color:var(--muted)">SVG<br>padrão</span>`;
  const clearBtn = document.getElementById('sprite-clear-' + key);
  if (clearBtn) clearBtn.style.display = 'none';
}

async function salvarSprites() {
  const okEl  = document.getElementById('sprites-fb-ok');
  const errEl = document.getElementById('sprites-fb-err');
  okEl.style.display = errEl.style.display = 'none';

  const pending = Object.entries(_pendingSprites);
  if (!pending.length) { errEl.textContent = 'Nenhuma alteração para salvar.'; errEl.style.display = 'block'; return; }

  for (const [dbKey, val] of pending) {
    if (val === null) {
      // remover
      await db.from('settings').delete().eq('key', dbKey);
    } else {
      await db.from('settings').upsert({ key: dbKey, value: val }, { onConflict: 'key' });
    }
  }
  _pendingSprites = {};
  await applyTopnavSprites();
  okEl.style.display = 'block';
  setTimeout(() => okEl.style.display = 'none', 3000);
}

async function resetarSprites() {
  if (!confirm('Resetar todos os sprites para os ícones SVG padrão?')) return;
  const keys = SPRITE_DEFS.map(d => d.dbKey);
  await db.from('settings').delete().in('key', keys);
  _pendingSprites = {};
  await applyTopnavSprites();
  await carregarSpritesAdm();
  const okEl = document.getElementById('sprites-fb-ok');
  okEl.textContent = '✓ Sprites resetados para padrão.';
  okEl.style.display = 'block';
  setTimeout(() => { okEl.style.display = 'none'; okEl.textContent = '✓ Sprites salvos!'; }, 3000);
}

// Aplica sprites salvos no topnav (chamada no initApp)
async function applyTopnavSprites() {
  const keys = SPRITE_DEFS.map(d => d.dbKey);
  const { data: rows } = await db.from('settings').select('key,value').in('key', keys);
  const saved = {};
  (rows || []).forEach(r => { saved[r.key] = r.value; });

  SPRITE_DEFS.forEach(def => {
    const val = saved[def.dbKey];

    // story_add: trata o círculo do + dos stories separadamente
    if (def.key === 'story_add') {
      const ring = document.getElementById('story-ring-add');
      if (!ring) return;
      if (val) {
        ring.style.background = `url(${val}) center/cover no-repeat`;
        // esconde o conteúdo interno (emoji/pic) para mostrar só a imagem
        const pic = ring.querySelector('.story-pic');
        if (pic) pic.style.display = 'none';
      }
      // revela o círculo (com ou sem sprite)
      ring.style.opacity = '1';
      return;
    }

    // profile_msg_btn: botão de mensagem nos perfis de outros usuários
    if (def.key === 'profile_msg_btn') {
      // salva a URL no dataset para aplicar nos botões renderizados dinamicamente
      document.documentElement.dataset.profileMsgSprite = val || '';
      // aplica nos botões já existentes no DOM (se perfil já estiver aberto)
      document.querySelectorAll('.btn-icon-profile').forEach(btn => {
        let img = btn.querySelector('.btn-sprite-img');
        if (val) {
          btn.style.border = 'none';
          if (!img) {
            img = document.createElement('img');
            img.className = 'btn-sprite-img';
            img.style.cssText = 'width:28px;height:28px;object-fit:contain;display:block;pointer-events:none';
            btn.innerHTML = '';
            btn.appendChild(img);
          }
          img.src = val;
        } else if (img) {
          img.remove();
          btn.style.border = '';
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
        }
      });
      return;
    }

    const tnBtn = (() => {
      if (def.key === 'nav_home')    return document.getElementById('btn-feed');
      if (def.key === 'nav_explore') return document.getElementById('btn-explore');
      if (def.key === 'nav_create')  return document.querySelector('.tn-btn[onclick="showNewPost()"]');
      if (def.key === 'nav_logout')  return document.querySelector('.tn-btn[onclick="doLogout()"]');
      if (def.key === 'nav_pokeets') return document.getElementById('btn-pokeets');
      if (def.key === 'nav_notif')   return document.getElementById('btn-notif');
      if (def.key === 'nav_chat')    return document.getElementById('btn-chat');
      if (def.key === 'nav_profile') return document.getElementById('btn-profile');
    })();
    if (!tnBtn) return;

    const defaultSvg = tnBtn.querySelector('.tn-default-icon');
    let spriteImg = tnBtn.querySelector('.tn-sprite-img');

    if (val) {
      // tem sprite: esconde SVG padrão, mostra/cria a imagem
      if (defaultSvg) defaultSvg.style.display = 'none';
      if (def.key === 'nav_profile') {
        const avatar = tnBtn.querySelector('.tn-avatar');
        if (avatar) avatar.style.display = 'none';
      }
      if (!spriteImg) {
        spriteImg = document.createElement('img');
        spriteImg.className = 'tn-sprite-img';
        const sz = def.key === 'nav_profile' ? '28px' : '22px';
        const br = def.key === 'nav_profile' ? 'border-radius:50%;' : '';
        spriteImg.style.cssText = `width:${sz};height:${sz};object-fit:contain;display:block;${br}`;
        tnBtn.insertBefore(spriteImg, tnBtn.firstChild);
      }
      spriteImg.src = val;
      spriteImg.style.display = 'block';
    } else {
      // sem sprite: remove imagem e mostra o SVG padrão
      if (spriteImg) spriteImg.remove();
      if (def.key === 'nav_profile') {
        const avatar = tnBtn.querySelector('.tn-avatar');
        if (avatar) avatar.style.display = '';
      } else if (defaultSvg) {
        defaultSvg.style.display = 'block';
      }
    }
  });

  // revela o topnav após tudo aplicado
  const nav = document.getElementById('topnav');
  if (nav) nav.style.opacity = '1';

  // garante que o story-ring-add apareça mesmo sem sprite cadastrado
  const ring = document.getElementById('story-ring-add');
  if (ring && ring.style.opacity !== '1') ring.style.opacity = '1';
}
window.applyTopnavSprites = applyTopnavSprites;

