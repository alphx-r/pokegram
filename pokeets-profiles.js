// ════════════════════════════════════════════════════════════
// POKEETS PROFILES — Multi-perfil por conta
// ════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
//  POKEET PROFILES — multi-perfil por conta
//  Cada perfil tem seu próprio UUID (id).
//  O perfil ativo é rastreado em _pkActiveProfileId (localStorage).
//
//  SQL necessário (rode no Supabase):
//  ─────────────────────────────────
//  -- Recria a tabela com suporte a múltiplos perfis por usuário
//  DROP TABLE IF EXISTS pokeet_profiles;
//  CREATE TABLE pokeet_profiles (
//    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//    name       TEXT,
//    handle     TEXT,
//    color      TEXT DEFAULT '#e53935',
//    avatar_url TEXT,
//    header_url TEXT,
//    bio        TEXT,
//    updated_at TIMESTAMPTZ DEFAULT NOW()
//  );
//  -- Para tabelas já existentes:
//  ALTER TABLE pokeet_profiles ADD COLUMN IF NOT EXISTS header_url TEXT;
//  ALTER TABLE pokeet_profiles ADD COLUMN IF NOT EXISTS bio        TEXT;
//  ALTER TABLE users           ADD COLUMN IF NOT EXISTS header_url TEXT;
//  CREATE UNIQUE INDEX uq_pokeet_handle ON pokeet_profiles(lower(handle));
//  CREATE INDEX idx_pokeet_profiles_user ON pokeet_profiles(user_id);
//  ALTER TABLE pokeet_profiles ENABLE ROW LEVEL SECURITY;
//  CREATE POLICY "pp_select" ON pokeet_profiles FOR SELECT USING (true);
//  CREATE POLICY "pp_insert" ON pokeet_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
//  CREATE POLICY "pp_update" ON pokeet_profiles FOR UPDATE USING (auth.uid() = user_id);
//  CREATE POLICY "pp_delete" ON pokeet_profiles FOR DELETE USING (auth.uid() = user_id);
// ══════════════════════════════════════════════════════════

const PK_COLORS = ['#e53935','#d81b60','#8e24aa','#3949ab','#039be5','#00897b','#43a047','#f4511e','#6d4c41','#546e7a','#f59e0b','#10b981','#000000'];
const PK_ACTIVE_KEY   = 'pg_pk_active_profile'; // localStorage: profile id ativo
const PK_PROFILES_KEY = 'pg_pk_profiles_cache';  // localStorage: array de perfis do user

let _pkProfTemp      = {};  // estado temporário do modal
let _pkMyProfiles    = [];  // array de perfis do usuário logado
let _pkProfilesMap   = {};  // user_id → perfil ativo (para render de cards alheios)
let _pkActiveProfileId = null; // UUID do perfil ativo

// ── Helpers de localStorage ───────────────────────────────
function pkSaveMyProfilesCache()   { try { localStorage.setItem(PK_PROFILES_KEY, JSON.stringify(_pkMyProfiles)); } catch(e){} }
function pkLoadMyProfilesCache()   { try { _pkMyProfiles = JSON.parse(localStorage.getItem(PK_PROFILES_KEY)) || []; } catch(e){ _pkMyProfiles = []; } }
function pkSaveActiveId(id)        { _pkActiveProfileId = id; try { localStorage.setItem(PK_ACTIVE_KEY, id || ''); } catch(e){} }
function pkLoadActiveId()          { try { _pkActiveProfileId = localStorage.getItem(PK_ACTIVE_KEY) || '__main__'; } catch(e){ _pkActiveProfileId = '__main__'; } }

// ── Perfil ativo do usuário atual ────────────────────────
function pkActiveProfile() {
  if (!currentUser) return null;
  if (_pkActiveProfileId === '__main__') return null; // usa currentUser direto
  // Só retorna um perfil se o id ativo bate exatamente — nunca faz fallback para [0]
  return _pkMyProfiles.find(p => p.id === _pkActiveProfileId) || null;
}

// ── Voltar para o perfil principal ───────────────────────
function pkSwitchToMain() {
  pkSaveActiveId('__main__');
  document.querySelectorAll('.pk-switcher-item').forEach(el => el.classList.remove('active'));
  const first = document.querySelector('.pk-switcher-item');
  if (first) first.classList.add('active');
  pkShowProfileForm();
  pkHideProfileForm(); // só atualiza o avatar sem abrir form
  pkRenderComposerAvatar();
  if (currentUser?.avatar_color || currentUser?.color) applyUserColor(currentUser.avatar_color || currentUser.color);
  pkCloseProfileModal();
  toast('Perfil principal ativado!');
}

// ── Perfil efetivo para o composer / snapshot ─────────────
function pkEffectiveUser() {
  if (!currentUser) return null;
  const prof = pkActiveProfile();
  if (!prof) {
    // Perfil principal (__main__ ou sem perfil Pokeet)
    return { ...currentUser };
  }
  return {
    ...currentUser,
    name:         prof.name   || currentUser.name   || currentUser.username,
    username:     prof.handle || currentUser.username,
    // Se o perfil Pokeet existe, usa SOMENTE sua foto (null = sem foto = iniciais)
    // Nunca herda a foto da conta principal
    avatar_url:   prof.avatar_url || null,
    avatar_color: prof.color || currentUser.avatar_color || currentUser.color || '#e53935',
  };
}

// ── Mescla perfil ativo de outro usuário num card ─────────
function pkApplyProfile(userObj) {
  if (!userObj) return userObj;
  // Lookup somente por "user_id:username" — nunca por user_id puro
  // para evitar que o perfil de um usuario vaze no avatar de outro
  const key = userObj.id && userObj.username
    ? userObj.id + ':' + userObj.username.toLowerCase()
    : null;
  const prof = key ? _pkProfilesMap[key] : null;
  if (!prof) return userObj;
  return {
    ...userObj,
    name:         prof.name   || userObj.name   || userObj.username,
    username:     prof.handle || userObj.username,
    // Perfil Pokeet existe → usa SOMENTE sua foto; null = iniciais (sem herdar foto da conta)
    avatar_url:   prof.avatar_url || null,
    avatar_color: prof.color || userObj.avatar_color || userObj.color || '#e53935',
    color:        prof.color || userObj.color || '#e53935',
  };
}

// ── Buscar perfis do usuário logado do Supabase ───────────
async function pkFetchMyProfiles() {
  if (!currentUser) return;
  try {
    const { data } = await db.from('pokeet_profiles').select('*').eq('user_id', currentUser.id).order('updated_at', { ascending: true });
    _pkMyProfiles = data || [];
    pkSaveMyProfilesCache();
    // Garante que o id ativo existe na lista — mas nunca sobrescreve '__main__' nem null
    const _isMainOrNull = !_pkActiveProfileId || _pkActiveProfileId === '__main__';
    const _activeExists = _pkMyProfiles.some(p => p.id === _pkActiveProfileId);
    if (!_isMainOrNull && !_activeExists) {
      // id salvo não existe mais (perfil deletado) → volta para principal
      pkSaveActiveId('__main__');
    }
  } catch(e) { console.warn('pkFetchMyProfiles:', e); }
}

// ── Buscar perfis ativos de outros usuários (para cards) ──
async function pkFetchProfiles(userIds) {
  if (!userIds || !userIds.length) return;
  try {
    // Busca TODOS os perfis de cada user (não só o mais recente)
    const { data } = await db.from('pokeet_profiles').select('*').in('user_id', userIds);
    if (data) {
      // Remove entradas antigas dos user_ids que vamos repopular
      // para evitar que perfis obsoletos vazem entre renders
      userIds.forEach(uid => {
        Object.keys(_pkProfilesMap).forEach(k => {
          if (k === uid || k.startsWith(uid + ':')) delete _pkProfilesMap[k];
        });
      });
      // Indexa SOMENTE por "user_id:handle" — nunca por user_id puro,
      // pois isso causaria vazamento de avatar entre usuarios diferentes
      data.forEach(p => {
        if (p.handle) _pkProfilesMap[p.user_id + ':' + p.handle.toLowerCase()] = p;
      });
    }
  } catch(e) { console.warn('pkFetchProfiles:', e); }
}

// ── Ativar um perfil da lista ─────────────────────────────
function pkActivateProfile(profileId) {
  pkSaveActiveId(profileId);
  pkRenderComposerAvatar();
  const prof = pkActiveProfile();
  if (prof) applyUserColor(prof.color);
}

// ── Renderizar switcher ───────────────────────────────────
async function pkRenderSwitcher() {
  const strip = document.getElementById('pk-profile-switcher');
  if (!strip) return;

  // Item do perfil principal (conta real)
  // Principal está ativo se: é '__main__', ou se o id ativo não corresponde a nenhum perfil Pokeet
  const _activeMatchesProfile = _pkMyProfiles.some(p => p.id === _pkActiveProfileId);
  const mainIsActive = _pkActiveProfileId === '__main__' || !_activeMatchesProfile;
  const mainColor = currentUser?.avatar_color || currentUser?.color || '#e53935';
  const mainAvatarContent = currentUser?.avatar_url
    ? `<img src="${currentUser.avatar_url}" alt="">`
    : initials(currentUser?.username || currentUser?.name || '?');
  const mainAvatarStyle = currentUser?.avatar_url ? '' : `background:${mainColor}`;
  const mainItem = `
    <div class="pk-switcher-item${mainIsActive ? ' active' : ''}" onclick="pkSwitchToMain()">
      <div class="pk-switcher-avatar" style="${mainAvatarStyle}">${mainAvatarContent}</div>
      <span class="pk-switcher-label">@${currentUser?.username || 'principal'}</span>
    </div>`;

  const items = _pkMyProfiles.map(p => {
    const isActive = p.id === _pkActiveProfileId;
    const avatarStyle = p.avatar_url ? '' : `background:${p.color || '#e53935'}`;
    const avatarContent = p.avatar_url
      ? `<img src="${p.avatar_url}" alt="">`
      : initials(p.handle || p.name || '?');
    return `
      <div class="pk-switcher-item${isActive ? ' active' : ''}" onclick="pkSwitchProfile('${p.id}')">
        <div class="pk-switcher-avatar" style="${avatarStyle}">${avatarContent}</div>
        <span class="pk-switcher-label">@${p.handle || p.name || '?'}</span>
      </div>`;
  }).join('');

  strip.innerHTML = mainItem + items + `
    <div class="pk-switcher-new" onclick="pkNewProfile()">
      <div class="pk-switcher-new-btn">+</div>
      <span class="pk-switcher-new-label">Novo</span>
    </div>`;
}

// ── Clicar em um perfil no switcher ──────────────────────
function pkSwitchProfile(profileId) {
  document.querySelectorAll('.pk-switcher-item').forEach(el => {
    const onclick = el.getAttribute('onclick') || '';
    el.classList.toggle('active', onclick.includes(`'${profileId}'`));
  });
  // Ativa o perfil imediatamente — nao espera clicar em Salvar
  pkActivateProfile(profileId);
  pkShowProfileForm();
  const prof = _pkMyProfiles.find(p => p.id === profileId);
  if (!prof) return;
  _pkProfTemp = {
    id:         prof.id,
    name:       prof.name       || '',
    handle:     prof.handle     || '',
    bio:        prof.bio        || '',
    color:      prof.color      || '#e53935',
    avatar_url: prof.avatar_url || null,
    header_url: prof.header_url || null,
    _avatarFile: null,
    _avatarPreviewUrl: null,
    _headerFile: null,
    _headerPreviewUrl: null,
    _isNew:     false,
  };
  document.getElementById('pk-prof-name').value   = _pkProfTemp.name;
  document.getElementById('pk-prof-handle').value = _pkProfTemp.handle;
  document.getElementById('pk-prof-bio').value    = _pkProfTemp.bio;
  const row = document.getElementById('pk-prof-colors');
  row.innerHTML = PK_COLORS.map(c =>
    `<div class="pk-profile-color-dot${c===_pkProfTemp.color?' selected':''}" style="background:${c}" data-color="${c}" onclick="pkPickColor('${c}')"></div>`
  ).join('');
  pkProfilePreview();
}

// ── Novo perfil ───────────────────────────────────────────
function pkNewProfile() {
  _pkProfTemp = { id: null, name: '', handle: '', bio: '', color: '#e53935', avatar_url: null, header_url: null, _avatarFile: null, _avatarPreviewUrl: null, _headerFile: null, _headerPreviewUrl: null, _isNew: true };
  pkShowProfileForm();
  document.getElementById('pk-prof-name').value   = '';
  document.getElementById('pk-prof-handle').value = '';
  document.getElementById('pk-prof-bio').value    = '';
  const row = document.getElementById('pk-prof-colors');
  row.innerHTML = PK_COLORS.map(c =>
    `<div class="pk-profile-color-dot${c==='#e53935'?' selected':''}" style="background:${c}" data-color="${c}" onclick="pkPickColor('${c}')"></div>`
  ).join('');
  document.querySelectorAll('.pk-switcher-item').forEach(el => el.classList.remove('active'));
  pkProfilePreview();
}

// ── Modal: abrir ─────────────────────────────────────────
async function pkOpenProfileModal() {
  if (!currentUser) return;
  await pkFetchMyProfiles();
  await pkRenderSwitcher();
  openModal('modal-pk-profile');
  // Formulário oculto até o usuário clicar em um perfil ou "Novo"
}

function pkCloseProfileModal() {
  pkHideProfileForm();
  closeModal('modal-pk-profile');
}

function pkShowProfileForm() {
  const el = document.getElementById('pk-profile-form-area');
  if (el) el.style.display = 'block';
}

function pkHideProfileForm() {
  const el = document.getElementById('pk-profile-form-area');
  if (el) el.style.display = 'none';
  document.querySelectorAll('.pk-switcher-item').forEach(el => el.classList.remove('active'));
}

function pkPickColor(c) {
  _pkProfTemp.color = c;
  document.querySelectorAll('.pk-profile-color-dot').forEach(d =>
    d.classList.toggle('selected', d.dataset.color === c)
  );
  pkProfilePreview();
}

// ── Preview do avatar e header no modal ───────────────────
function pkProfilePreview() {
  const preview = document.getElementById('pk-prof-avatar-preview');
  if (preview) {
    const color = _pkProfTemp.color || '#e53935';
    const url   = _pkProfTemp._avatarPreviewUrl || _pkProfTemp.avatar_url || null;
    const name  = document.getElementById('pk-prof-name')?.value.trim() ||
                  document.getElementById('pk-prof-handle')?.value.trim() || '?';
    // Remove img/text anterior, mantém overlay
    const overlay = preview.querySelector('.pk-profile-avatar-overlay');
    preview.innerHTML = '';
    if (overlay) preview.appendChild(overlay);
    preview.style.background = url ? 'transparent' : color;
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;position:absolute;inset:0;';
      preview.insertBefore(img, preview.firstChild);
    } else {
      const txt = document.createElement('span');
      txt.style.cssText = 'font-size:28px;font-weight:800;color:#fff;font-family:Nunito,sans-serif;z-index:1;position:relative;';
      txt.textContent = initials(name);
      preview.insertBefore(txt, preview.firstChild);
    }
  }

  const headerPreview = document.getElementById('pk-prof-header-preview');
  if (headerPreview) {
    const headerUrl = _pkProfTemp._headerPreviewUrl || _pkProfTemp.header_url || null;
    headerPreview.style.backgroundImage = headerUrl ? `url('${headerUrl}')` : 'none';
  }
}

// ── Upload de imagem de header do perfil Pokeet ───────────
function pkHandleHeaderImg(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  // Abre o modal de crop com proporção de banner (3:1)
  openCropper(file, 'banner', croppedFile => {
    _pkProfTemp._headerFile = croppedFile;
    _pkProfTemp.header_url  = null;
    if (_pkProfTemp._headerPreviewUrl) URL.revokeObjectURL(_pkProfTemp._headerPreviewUrl);
    _pkProfTemp._headerPreviewUrl = URL.createObjectURL(croppedFile);
    pkProfilePreview();
  });
}

// ── Upload de imagem do perfil Pokeet ─────────────────────
function pkHandleAvatarImg(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  // Abre o modal de crop circular — mesmo fluxo dos avatares principais
  openCropper(file, 'circle', croppedFile => {
    _pkProfTemp._avatarFile = croppedFile;
    _pkProfTemp.avatar_url  = null;
    if (_pkProfTemp._avatarPreviewUrl) URL.revokeObjectURL(_pkProfTemp._avatarPreviewUrl);
    _pkProfTemp._avatarPreviewUrl = URL.createObjectURL(croppedFile);
    pkProfilePreview();
  });
}

// ── Salvar perfil (insert ou update) ─────────────────────
async function pkSaveProfile() {
  if (!currentUser) return;

  const name   = document.getElementById('pk-prof-name').value.trim();
  const handle = document.getElementById('pk-prof-handle').value.trim();
  const bio    = document.getElementById('pk-prof-bio').value.trim();

  if (!handle) { toast('Escolha um @usuário para o Pokeet.'); return; }

  const btn = document.querySelector('.pk-profile-btn-save');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Salvando...';

  // Verifica handle duplicado (exceto o próprio perfil)
  try {
    let query = db.from('pokeet_profiles').select('id').ilike('handle', handle);
    if (_pkProfTemp.id) query = query.neq('id', _pkProfTemp.id);
    const { data: existing } = await query.maybeSingle();
    if (existing) {
      toast('Este @' + handle + ' já está em uso. Escolha outro.');
      btn.disabled = false; btn.textContent = orig;
      return;
    }
  } catch(e) {}

  // Upload do avatar para o Supabase Storage (se houver arquivo novo)
  let finalAvatarUrl = _pkProfTemp.avatar_url || null;
  if (_pkProfTemp._avatarFile) {
    try {
      btn.textContent = 'Enviando foto...';
      const file = _pkProfTemp._avatarFile;
      const ext  = file.name.split('.').pop() || 'jpg';
      // Caminho: pokeet-avatars/<user_id>/<profile_id_ou_temp>.<ext>
      const profileKey = _pkProfTemp.id || ('new_' + Date.now());
      const path = `pokeet-avatars/${currentUser.id}/${profileKey}.${ext}`;
      const { error: upErr } = await db.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = db.storage.from('avatars').getPublicUrl(path);
      // Cache-buster para o browser nao usar versao antiga
      finalAvatarUrl = urlData.publicUrl + '?t=' + Date.now();
      // Libera o object URL de preview
      if (_pkProfTemp._avatarPreviewUrl) {
        URL.revokeObjectURL(_pkProfTemp._avatarPreviewUrl);
        _pkProfTemp._avatarPreviewUrl = null;
      }
      _pkProfTemp._avatarFile = null;
    } catch(e) {
      toast('Erro ao enviar foto: ' + (e.message || e));
      btn.disabled = false; btn.textContent = orig;
      return;
    }
  }

  // Upload do header/banner para o Supabase Storage (se houver arquivo novo)
  let finalHeaderUrl = _pkProfTemp.header_url || null;
  if (_pkProfTemp._headerFile) {
    try {
      btn.textContent = 'Enviando cabeçalho...';
      const file = _pkProfTemp._headerFile;
      const ext  = file.name.split('.').pop() || 'jpg';
      const profileKey = _pkProfTemp.id || ('new_' + Date.now());
      const path = `pokeet-headers/${currentUser.id}/${profileKey}.${ext}`;
      const { error: upErr } = await db.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = db.storage.from('avatars').getPublicUrl(path);
      finalHeaderUrl = urlData.publicUrl + '?t=' + Date.now();
      if (_pkProfTemp._headerPreviewUrl) {
        URL.revokeObjectURL(_pkProfTemp._headerPreviewUrl);
        _pkProfTemp._headerPreviewUrl = null;
      }
      _pkProfTemp._headerFile = null;
    } catch(e) {
      toast('Erro ao enviar cabeçalho: ' + (e.message || e));
      btn.disabled = false; btn.textContent = orig;
      return;
    }
  }

  btn.textContent = 'Salvando...';

  const payload = {
    user_id:    currentUser.id,
    name,
    handle,
    bio,
    color:      _pkProfTemp.color,
    avatar_url: finalAvatarUrl,
    header_url: finalHeaderUrl,
    updated_at: new Date().toISOString(),
  };

  let savedId = _pkProfTemp.id;
  let error;

  if (_pkProfTemp._isNew || !savedId) {
    // INSERT — novo perfil Pokeet
    const { data, error: err } = await db.from('pokeet_profiles').insert(payload).select().single();
    error = err;
    if (data) {
      savedId = data.id;

      // Cria automaticamente um perfil secundario na tabela users (is_pokeet_secondary = true)
      // Perfis secundarios nao possuem aba Publicacoes, apenas Pokeets
      try {
        const { data: existingUser } = await db
          .from('users')
          .select('id')
          .ilike('username', handle)
          .maybeSingle();

        if (!existingUser) {
          await db.from('users').insert({
            username:            handle,
            name:                name || handle,
            bio:                 bio || null,
            color:               _pkProfTemp.color || '#e53935',
            avatar_url:          finalAvatarUrl || null,
            header_url:          finalHeaderUrl || null,
            is_pokeet_secondary: true,
            pokeet_profile_id:   savedId,
            owner_user_id:       currentUser.id,
          });
        }
      } catch(e) {
        console.warn('Aviso: nao foi possivel criar o user secundario para o Pokeet:', e);
      }
    }
  } else {
    // UPDATE — perfil existente
    const { error: err } = await db.from('pokeet_profiles').update(payload).eq('id', savedId).eq('user_id', currentUser.id);
    error = err;

    // Atualiza tambem o user secundario se existir
    if (!err) {
      try {
        await db.from('users')
          .update({ name: name || handle, bio: bio || null, color: _pkProfTemp.color || '#e53935', avatar_url: finalAvatarUrl || null, header_url: finalHeaderUrl || null })
          .eq('pokeet_profile_id', savedId);
      } catch(e) {}
    }
  }

  btn.disabled = false; btn.textContent = orig;

  if (error) { toast('Erro ao salvar: ' + error.message); return; }

  // Atualiza cache local e ativa o perfil salvo
  await pkFetchMyProfiles();
  pkActivateProfile(savedId);
  await pkRenderSwitcher();

  pkCloseProfileModal();
  pkRenderComposerAvatar();
  toast('Perfil salvo! 💭');
  await renderPokeets();
}

// ── Inicialização ─────────────────────────────────────────
pkLoadMyProfilesCache();
pkLoadActiveId();
