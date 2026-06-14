// ════════════════════════════════════════════════════════════
// FEED — Posts, curtidas, comentários, explorar, perfil, notificações
// ════════════════════════════════════════════════════════════

// ── Feed tabs: Feed / Seguindo ───────────────────────────
let _feedMode = 'feed';
// Cache do conteúdo de cada aba para evitar recarregar ao trocar
const _feedCache = { feed: null, following: null };

function switchFeedTab(btn, mode) {
  const container = document.getElementById('feed-posts');
  const isSameTab = (_feedMode === mode);

  // salva o estado atual (com curtidas/comentários atualizados) antes de trocar
  if (!isSameTab && container && _feedCache[_feedMode]) {
    _feedCache[_feedMode] = { html: container.innerHTML, posts: appPosts };
  }

  _feedMode = mode;
  document.querySelectorAll('#feed-tabs .pkTab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (isSameTab) {
    // clicou na aba já ativa → força atualização
    renderPosts(true).catch(e => console.warn('posts error:', e));
    return;
  }

  // trocou de aba → restaura cache se existir, sem refazer a busca
  const cached = _feedCache[mode];
  if (cached && container) {
    container.innerHTML = cached.html;
    appPosts = cached.posts;
    return;
  }

  // sem cache ainda → mostra skeleton (igual ao dos Pokeets) e carrega pela primeira vez
  if (container) {
    container.innerHTML = `<div class="pk-loading">${[1,2,3].map(()=>`
      <div class="pk-skeleton">
        <div class="pk-skel-avatar"></div>
        <div class="pk-skel-body">
          <div class="pk-skel-line" style="width:40%"></div>
          <div class="pk-skel-line" style="width:90%"></div>
          <div class="pk-skel-line" style="width:70%"></div>
        </div>
      </div>`).join('')}</div>`;
  }
  renderPosts().catch(e => console.warn('posts error:', e));
}

async function renderFeed() {
  renderAsideMini();
  try {
    const tasks = [renderStories().catch(e => { console.warn('stories error:', e); })];
    const cached = _feedCache[_feedMode];
    const container = document.getElementById('feed-posts');
    if (cached && container) {
      container.innerHTML = cached.html;
      appPosts = cached.posts;
    } else {
      tasks.push(renderPosts().catch(e => { console.warn('posts error:', e); }));
    }
    await Promise.all(tasks);
  } catch(e) { console.warn('renderFeed error:', e); }

  // Garante que followState esteja carregado antes de renderizar sugestões
  if (!Object.keys(followState).length) {
    const { data } = await db.from('follows').select('following_id').eq('follower_id', currentUser.id).catch(() => ({ data: [] }));
    if (data) data.forEach(r => { followState[r.following_id] = true; });
  }
  renderSuggestions().catch(e => console.warn('suggestions error:', e));
}

// Gera um degradê vistoso a partir de uma cor hex:
// mistura a cor com branco (versão clara) e com preto (versão escura)
function makeStoryGradient(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  // versão clara: misturar com branco (bottom-right)
  const lr = Math.round(r + (255-r)*0.55);
  const lg = Math.round(g + (255-g)*0.55);
  const lb = Math.round(b + (255-b)*0.55);
  // versão escura: misturar com preto (top-left)
  const dr = Math.round(r * 0.55);
  const dg = Math.round(g * 0.55);
  const db = Math.round(b * 0.55);
  const light = `rgb(${lr},${lg},${lb})`;
  const dark  = `rgb(${dr},${dg},${db})`;
  // invertido: escuro no top-left, claro no bottom-right
  return `background: linear-gradient(135deg, ${dark} 0%, ${hex} 55%, ${light} 100%)`;
}

async function renderStories() {
  const list  = document.getElementById('stories-list');
  const myPic = document.getElementById('my-story-pic');
  if (!list) return;

  // avatar do usuário no "Seu story"
  if (myPic) {
    if (currentUser.avatar_url) {
      myPic.innerHTML = `<img src="${currentUser.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      myPic.style.background = 'transparent';
    } else {
      myPic.style.background = currentUser.color || '#e53935';
      myPic.textContent = initials(currentUser.username);
    }
  }

  // buscar stories e meus stories em paralelo
  const now = new Date().toISOString();
  // buscar quem o currentUser segue
  const { data: followRows } = await db.from('follows').select('following_id').eq('follower_id', currentUser.id);
  const followingIds = (followRows || []).map(r => r.following_id);

  const [{ data: stories }, { data: myStories }] = await Promise.all([
    followingIds.length
      ? db.from('stories').select('id, user_id, users(id, username, color, avatar_url, is_npc)').gt('expires_at', now).neq('user_id', currentUser.id).in('user_id', followingIds)
      : Promise.resolve({ data: [] }),
    db.from('stories').select('id').eq('user_id', currentUser.id).gt('expires_at', now).limit(1),
  ]);

  // anel no "Seu story" se eu tiver story ativo
  const myRing = document.querySelector('.story-mine .story-ring');
  const myPlus = document.querySelector('.story-plus');
  const playerColor = currentUser.color || '#e53935';

  // botão + sempre na cor do player
  if (myPlus) myPlus.style.background = playerColor;

  if (myRing) {
    const hasActive = !!(myStories && myStories.length > 0);
    myRing.classList.toggle('story-ring-active', hasActive);
    if (hasActive) {
      myRing.style.cssText += ';' + makeStoryGradient(playerColor).replace('background: ','background:');
    } else {
      myRing.style.background = '';
    }
  }
  // guarda estado para openStoryOrViewer()
  window._myHasActiveStory = !!(myStories && myStories.length > 0);

  // contar stories por usuário
  const countMap = {};
  (stories || []).forEach(s => { countMap[s.user_id] = (countMap[s.user_id] || 0) + 1; });

  // agrupar por user_id (1 bolha por usuário)
  const seenSet = new Set();
  const unique = (stories || []).filter(s => {
    if (seenSet.has(s.user_id)) return false;
    seenSet.add(s.user_id); return true;
  });

  // buscar quais usuários eu já vi TODOS os stories ativos
  const ownerIds = unique.map(s => s.users?.id).filter(Boolean);
  let viewedOwners = new Set();
  if (ownerIds.length) {
    // ids de todos os stories ativos (de todos os donos relevantes)
    const allActiveStoryIds = (stories || []).map(s => s.id).filter(Boolean);
    const { data: views } = await db
      .from('story_views')
      .select('story_id')
      .eq('viewer_id', currentUser.id)
      .in('story_id', allActiveStoryIds);
    const viewedStoryIds = new Set((views || []).map(v => v.story_id));

    // conta quantos stories ativos cada dono tem, e quantos já foram vistos
    const totalByOwner  = {};
    const viewedByOwner = {};
    (stories || []).forEach(s => {
      const oid = s.users?.id;
      if (!oid) return;
      totalByOwner[oid]  = (totalByOwner[oid]  || 0) + 1;
      if (viewedStoryIds.has(s.id)) viewedByOwner[oid] = (viewedByOwner[oid] || 0) + 1;
    });
    ownerIds.forEach(oid => {
      if ((viewedByOwner[oid] || 0) >= (totalByOwner[oid] || 0)) viewedOwners.add(oid);
    });
  }

  // não-vistos primeiro, vistos depois
  const unviewed = unique.filter(s => !viewedOwners.has(s.users?.id));
  const viewed   = unique.filter(s =>  viewedOwners.has(s.users?.id));
  const sorted   = [...unviewed, ...viewed];

  list.innerHTML = sorted.map(s => {
    const u       = s.users || {};
    const count   = countMap[u.id] || 1;
    const color   = u.color || '#e53935';
    const isViewed = viewedOwners.has(u.id);
    const ringGradient = isViewed ? '' : makeStoryGradient(color);
    const ringBorder   = '';
    const badgeStyle   = `background:${color}`;

    const pic = u.avatar_url
      ? `<div class="story-pic" style="background:transparent;overflow:hidden"><img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"></div>`
      : `<div class="story-pic" style="background:${isViewed ? '#b0b0b0' : color}">${initials(u.username||'?')}</div>`;
    const badge = count > 1
      ? `<div class="story-count-badge" style="${badgeStyle}">${count}</div>`
      : '';
    return `<div class="story-item" onclick="openStoryViewer('${u.id}')">
      <div class="story-ring ${isViewed ? 'story-ring-viewed' : 'story-ring-active'}" style="position:relative;${ringGradient}">${pic}${badge}</div>
      <span style="color:${isViewed ? '#999' : ''}">${u.username}</span>
    </div>`;
  }).join('');
}

async function renderPosts() {
  const container = document.getElementById('feed-posts');
  if (!container) return;

  if (_feedMode === 'following') {
    // Busca quem o currentUser segue
    const { data: followRows } = await db.from('follows').select('following_id').eq('follower_id', currentUser.id);
    const followingIds = (followRows || []).map(r => r.following_id);

    if (!followingIds.length) {
      appPosts = [];
      container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#8e8e8e;font-size:16px">Você ainda não segue ninguém.<br>Siga outros treinadores para ver seus posts aqui! 🎉</div>';
      _feedCache.following = { html: container.innerHTML, posts: [] };
      return;
    }

    const { data: posts, error } = await db
      .from('posts')
      .select('*, users!inner(id, username, color, avatar_url, is_npc, rpg)')
      .in('user_id', followingIds)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error || !posts) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#8e8e8e">Erro ao carregar posts.</div>'; return; }
    if (!posts.length)   {
      appPosts = [];
      container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#8e8e8e;font-size:16px">Nenhuma publicação ainda.<br>As pessoas que você segue ainda não postaram. 🎉</div>';
      _feedCache.following = { html: container.innerHTML, posts: [] };
      return;
    }

    appPosts = posts;
    await renderPostsList(container, posts);
    return;
  }

  // Busca apenas posts de usuários do mesmo RPG do currentUser
  const { data: posts, error } = await db
    .from('posts')
    .select('*, users!inner(id, username, color, avatar_url, is_npc, rpg)')
    .eq('users.rpg', currentUser.rpg)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !posts) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#8e8e8e">Erro ao carregar posts.</div>'; return; }
  if (!posts.length)   {
    appPosts = [];
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#8e8e8e;font-size:16px">Nenhuma publicação ainda.<br>Seja o primeiro a postar! 🎉</div>';
    _feedCache.feed = { html: container.innerHTML, posts: [] };
    return;
  }

  // embaralha o feed
  for (let i = posts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [posts[i], posts[j]] = [posts[j], posts[i]];
  }
  appPosts = posts;
  await renderPostsList(container, posts);
}

async function renderPostsList(container, posts) {
  // buscar todas as queries secundárias em paralelo
  const postIds = posts.map(p => p.id);
  const [
    { data: myLikes },
    { data: likeCounts },
    { data: commentCounts },
    { data: lastComments }
  ] = await Promise.all([
    db.from('likes').select('post_id').eq('user_id', currentUser.id).in('post_id', postIds),
    db.from('likes').select('post_id').in('post_id', postIds),
    db.from('comments').select('post_id').in('post_id', postIds),
    db.from('comments').select('post_id, text, users(username, color)').in('post_id', postIds).order('created_at', { ascending: false }),
  ]);
  const likedSet = new Set((myLikes || []).map(l => l.post_id));

  const likeMap    = {};
  const commentMap = {};
  const lastCommentMap = {};
  (likeCounts || []).forEach(l => { likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1; });
  (commentCounts || []).forEach(c => { commentMap[c.post_id] = (commentMap[c.post_id] || 0) + 1; });
  // pega só o primeiro (mais recente) por post
  (lastComments || []).forEach(c => {
    if (!lastCommentMap[c.post_id]) lastCommentMap[c.post_id] = c;
  });

  container.innerHTML = posts.map(p => buildPostHTML(p, likedSet.has(p.id), likeMap[p.id] || 0, commentMap[p.id] || 0, lastCommentMap[p.id] || null)).join('');

  // salva no cache da aba atual para evitar refetch ao trocar de aba
  _feedCache[_feedMode] = { html: container.innerHTML, posts: appPosts };
}

function buildPostHTML(p, liked, likeCount, commentCount, lastComment) {
  const author    = p.users || { username: '?', color: '#999' };
  const _lc = (liked && p.likerColor) ? p.likerColor : (liked ? (currentUser.color || '#e53935') : '#e53935');
  const likeColor = liked ? `color:${_lc}` : '';
  const likeFill  = liked ? `fill:${_lc};stroke:${_lc}` : 'fill:none';

  const commentPreview = lastComment
    ? `<div class="post-comment-preview">
        <span class="cap-user" onclick="showUserProfile('${lastComment.users?.username || ''}'); event.stopPropagation()" style="cursor:pointer;color:${currentUser.color||'#262626'}">${lastComment.users?.username || '?'}</span>
        <span>${formatCaption(lastComment.text || '')}</span>
       </div>`
    : '';

  return `
<div class="post-card" id="post-${p.id}">
  <div class="post-header">
    <div onclick="showUserProfile('${author.username}')" style="cursor:pointer">${avatarHTML(author, 32, 'border:1px solid #dbdbdb')}</div>
    <div class="post-header-info">
      <div class="post-username" onclick="showUserProfile('${author.username}')">${author.username}${author.is_npc ? '<span style="font-size:10px;font-weight:800;padding:1px 6px;border-radius:10px;background:#9e9e9e;color:#fff;margin-left:5px;letter-spacing:.3px;vertical-align:middle">NPC</span>' : ''}</div>
      ${p.location ? `<div class="post-location-tag" onclick="doSearch('${p.location.replace(/'/g,"\\'")}');event.stopPropagation()" style="cursor:pointer">${p.location}</div>` : ''}
    </div>
    <div class="post-header-more-wrap">
      ${author.id === currentUser.id ? `
      <button class="post-header-more" onclick="togglePostMenu('${p.id}', this)">···</button>
      <div class="post-menu" id="post-menu-${p.id}">
        <button class="post-menu-item" onclick="openEditPost('${p.id}','${(p.caption||'').replace(/'/g,"\'" ).replace(/\n/g,'\n')}','${(p.location||'').replace(/'/g,"\'")}','${(p.image_url||'').replace(/'/g,"\'")}')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar publicação
        </button>
        <button class="post-menu-item post-menu-danger" onclick="deletePost('${p.id}')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Apagar publicação
        </button>
        <button class="post-menu-item" onclick="closePostMenu('${p.id}')">Cancelar</button>
      </div>` : ''}
    </div>
  </div>

  <div class="post-image" style="background:${p.image_url ? '#000' : (p.bg||'#f0f0f0')};cursor:pointer" onclick="_postImageClick('${p.id}',event)" ondblclick="_doubleTapLike('${p.id}',event)" ontouchend="_handlePostTouchEnd('${p.id}',event)">
    ${p.image_url
      ? `<img src="${p.image_url}" alt="post" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none">`
      : `<span>${p.emoji||'📸'}</span>`}
  </div>

  <div class="post-actions">
    <button class="post-action-btn ${liked?'liked':''}" onclick="toggleLike('${p.id}',this)" style="${likeColor}">
      <svg viewBox="0 0 24 24" style="${likeFill};stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke:${liked?(_lc):'currentColor'}"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
    </button>
    <button class="post-action-btn" onclick="openComments('${p.id}')">
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    </button>
    <button class="post-action-btn" onclick="modalSendViaChat('${p.id}')">
      <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>
    </button>
    <button class="post-save-btn" style="margin-left:auto">
      <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
    </button>
  </div>

  <div class="post-likes" id="likes-${p.id}">${fmtNum(likeCount)} curtida${likeCount !== 1 ? 's' : ''}</div>
  <div class="post-caption-text">
    <span class="cap-user" onclick="showUserProfile('${author.username}')" style="cursor:pointer;color:${currentUser.color||'#262626'}">${author.username}</span>${formatCaption(p.caption||'')}
  </div>
  ${commentCount > 1 ? `<div class="post-view-comments" onclick="openComments('${p.id}')">Ver todos os ${commentCount} comentários</div>` : ''}
  ${commentPreview}
  <div class="post-timestamp">${fmtTimeAgo(p.created_at)}</div>

  <div class="post-comment-bar">
    <div class="mini-avatar" style="background:${currentUser.avatar_url?'transparent':(currentUser.color||'#e53935')};overflow:hidden">${currentUser.avatar_url?`<img src="${currentUser.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:initials(currentUser.username)}</div>
    <input type="text" placeholder="Adicione um comentário..." id="inline-comment-${p.id}"
      oninput="document.getElementById('inline-send-${p.id}').classList.toggle('ready', this.value.length>0)"
      onkeydown="if(event.key==='Enter'){event.preventDefault();submitInlineComment('${p.id}');}">
    <button class="btn-inline-send" id="inline-send-${p.id}" onclick="submitInlineComment('${p.id}')">Publicar</button>
  </div>
</div>`;
}

const _captionPrideRx = /^(pridemonth|mesdoorgulho|pride|lgbt\+?|lgbtq\+?|lgbtqia\+?)$/i;
function formatCaption(cap) {
  return cap
    .replace(/\n/g, '<br>')
    .replace(/#([^\s#<&]+)/g, (_, raw) => {
      if (_captionPrideRx.test(raw)) {
        return `<span class="cap-tag cap-tag-pride" onclick="doSearch('#${raw}');event.stopPropagation()" style="cursor:pointer">#${raw}</span>`;
      }
      return `<span class="cap-tag" onclick="doSearch('#${raw}');event.stopPropagation()" style="cursor:pointer">#${raw}</span>`;
    });
}

// ── Likes ─────────────────────────────────────────────────

// Duplo toque em mobile
const _tapTimers = {};
function _handlePostTouchEnd(postId, e) {
  if (e.touches && e.touches.length > 0) return; // ainda tem dedo na tela
  const now = Date.now();
  if (_tapTimers[postId] && now - _tapTimers[postId] < 350) {
    // segundo toque rápido = double tap
    clearTimeout(_tapTimers[postId + '_t']);
    delete _tapTimers[postId];
    e.preventDefault();
    e.stopPropagation();
    _doubleTapLike(postId, e);
  } else {
    _tapTimers[postId] = now;
    // cancela o timer para não abrir modal por engano
    _tapTimers[postId + '_t'] = setTimeout(() => { delete _tapTimers[postId]; }, 400);
  }
}

// Clique simples com proteção contra duplo clique
const _clickTimers = {};
function _postImageClick(postId, e) {
  if (_clickTimers[postId]) return; // duplo clique em andamento, ignora
  _clickTimers[postId] = setTimeout(() => {
    delete _clickTimers[postId];
    openComments(postId);
  }, 250);
}

function _doubleTapLike(postId, e) {
  // Cancela o clique simples pendente
  if (_clickTimers[postId]) {
    clearTimeout(_clickTimers[postId]);
    delete _clickTimers[postId];
  }
  e.preventDefault();
  e.stopPropagation();
  const btn = document.querySelector(`#post-${postId} .post-action-btn`);
  if (!btn) return;
  if (btn.classList.contains('liked')) return; // já curtiu, não faz nada
  // Animação de coração no centro da foto
  const img = document.querySelector(`#post-${postId} .post-image`);
  if (img) {
    const heart = document.createElement('div');
    const _hc = currentUser.color || '#e53935';
    heart.innerHTML = `<svg viewBox="0 0 24 24" width="80" height="80" fill="${_hc}" stroke="${_hc}"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`;
    heart.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);z-index:10;pointer-events:none;transition:transform .2s ease,opacity .4s ease .3s;opacity:1;filter:drop-shadow(0 2px 8px rgba(0,0,0,.3));';
    img.style.position = 'relative';
    img.appendChild(heart);
    requestAnimationFrame(() => { heart.style.transform = 'translate(-50%,-50%) scale(1)'; });
    setTimeout(() => { heart.style.opacity = '0'; setTimeout(() => heart.remove(), 400); }, 600);
  }
  toggleLike(postId, btn);
}

async function toggleLike(postId, btn) {
  const liked = btn.classList.contains('liked');
  btn.classList.toggle('liked', !liked);

  // Animação igual ao story like
  btn.style.transform = 'scale(1.35)';
  setTimeout(() => btn.style.transform = 'scale(1)', 200);

  const svg = btn.querySelector('svg');
  const _uc = currentUser.color || '#e53935';
  if (svg) svg.style.cssText = !liked ? `fill:${_uc};stroke:${_uc};stroke-width:2` : 'fill:none;stroke-width:2';
  btn.style.color = !liked ? _uc : '';

  const countEl = document.getElementById('likes-' + postId);
  if (countEl) {
    const cur = parseInt(countEl.textContent) || 0;
    const next = !liked ? cur + 1 : Math.max(0, cur - 1);
    countEl.textContent = `${fmtNum(next)} curtida${next !== 1 ? 's' : ''}`;
  }

  if (!liked) {
    await db.from('likes').insert({ post_id: postId, user_id: currentUser.id });
    // usa cache local primeiro, senão busca no banco
    let ownerId = (appPosts || []).find(p => p.id === postId)?.user_id;
    if (!ownerId) {
      const { data: post } = await db.from('posts').select('user_id').eq('id', postId).maybeSingle();
      ownerId = post?.user_id;
    }
    if (ownerId && ownerId !== currentUser.id) {
      const { error: ne } = await db.from('notifications').insert({
        user_id: ownerId, actor_id: currentUser.id, type: 'like', post_id: postId
      });
      if (ne) console.error('notif like error:', ne);
      sendPushToUser(ownerId, 'PokéGram', `${currentUser.username} curtiu sua publicação.`, '/');
    }
  } else {
    await db.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
    await db.from('notifications').delete()
      .eq('type', 'like')
      .eq('post_id', postId)
      .eq('actor_id', currentUser.id);
  }
}

// ── Comments ──────────────────────────────────────────────
async function openComments(postId) {
  currentCommentPostId = postId;

  const imgEl = document.getElementById('comments-post-image');
  const imgElDesktop = document.getElementById('comments-post-image-desktop');
  const capEl = document.getElementById('comments-post-caption');

  // Busca post completo (inclui user_id, bg, emoji, saves)
  let post = (appPosts || []).find(p => p.id === postId);
  if (!post || !post.users) {
    const { data } = await db
      .from('posts')
      .select('*, users(id, username, color, avatar_url, is_npc)')
      .eq('id', postId)
      .maybeSingle();
    post = data;
  }

  if (!post) { openModal('modal-comments'); return; }

  // ── Imagem ──────────────────────────────────────────────
  if (imgEl) {
    if (post.image_url) {
      imgEl.style.background = '#000';
      imgEl.style.padding    = '0';
      imgEl.innerHTML = `<img src="${post.image_url}" alt="post" style="width:100%;height:100%;object-fit:cover;display:block">`;
    } else {
      imgEl.style.background = post.bg || '#f0f0f0';
      imgEl.style.display    = 'flex';
      imgEl.style.alignItems = 'center';
      imgEl.style.justifyContent = 'center';
      imgEl.innerHTML = `<span style="font-size:80px">${post.emoji || '📸'}</span>`;
    }
  }

  // Espelha imagem no painel desktop
  if (imgElDesktop && imgEl) imgElDesktop.innerHTML = imgEl.innerHTML;
  if (imgElDesktop) { imgElDesktop.style.cssText = imgEl ? imgEl.style.cssText : ''; }

  // ── Caption (header com avatar + username + três pontinhos) ──
  if (capEl) {
    const u         = post.users || {};
    const isOwner   = String(u.id) === String(currentUser.id);
    const captionEscaped = (post.caption || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    const locationEscaped = (post.location || '').replace(/'/g, "\\'");
    const imageUrlEscaped = (post.image_url || '').replace(/'/g, "\\'");

    const menuHTML = isOwner
      ? `<div style="position:relative">
           <button onclick="toggleModalPostMenu('${post.id}',this)"
             style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text);padding:4px 8px;line-height:1;border-radius:6px"
             title="Opções">···</button>
           <div id="modal-post-menu-${post.id}" style="display:none;position:absolute;right:0;top:100%;background:#fff;border:1px solid var(--border);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.15);min-width:180px;z-index:99999;overflow:hidden">
             <button onclick="openEditPost('${post.id}','${captionEscaped}','${locationEscaped}','${imageUrlEscaped}');closeModalPostMenu('${post.id}')"
               style="display:flex;align-items:center;gap:8px;width:100%;padding:11px 14px;border:none;background:none;cursor:pointer;font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;color:var(--text);text-align:left">
               <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
               Editar publicação
             </button>
             <button onclick="deletePost('${post.id}');closeModal('modal-comments')"
               style="display:flex;align-items:center;gap:8px;width:100%;padding:11px 14px;border:none;background:none;cursor:pointer;font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;color:#e53935;text-align:left">
               <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
               Apagar publicação
             </button>
           </div>
         </div>`
      : '';

    const avatarHTML_u = u.avatar_url
      ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : initials(u.username || '?');
    const avatarBg = u.avatar_url ? 'transparent' : (u.color || '#999');

    capEl.innerHTML = `
      <div class="cpc-header">
        <div style="width:34px;height:34px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;overflow:hidden;cursor:pointer;border:1px solid var(--border)"
          onclick="closeModal('modal-comments');showUserProfile('${u.username}')">${avatarHTML_u}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;cursor:pointer" onclick="closeModal('modal-comments');showUserProfile('${u.username}')">${u.username || ''}${u.is_npc ? '<span style="font-size:10px;font-weight:800;padding:1px 6px;border-radius:10px;background:#263238;color:#80cbc4;margin-left:5px">NPC</span>' : ''}</div>
          ${post.location ? `<div style="font-size:11px;color:var(--muted);cursor:pointer" onclick="closeModal('modal-comments');doSearch('${post.location.replace(/'/g,"\\'")}')">${post.location}</div>` : ''}
        </div>
        ${menuHTML}
      </div>
      ${post.caption ? `<div class="cpc-text"><span style="font-weight:700">${u.username || ''}</span> ${formatCaption(post.caption)}</div>` : ''}
    `;
  }

  // ── Lista de comentários ─────────────────────────────────
  const list = document.getElementById('comments-list');
  if (list) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#8e8e8e">Carregando...</div>';
    await renderCommentsList(postId);
  }

  // ── Barra de ações (like, comentar, share, salvar) ───────
  const actBar = document.getElementById('comments-actions-bar');
  if (actBar) {
    // Verificar se o usuário já curtiu e se já salvou
    const [{ data: likeData }, { data: saveData }, { data: likesCount }] = await Promise.all([
      db.from('likes').select('id').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle(),
      db.from('saves').select('id').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle(),
      db.from('likes').select('id').eq('post_id', postId),
    ]);
    const liked    = !!likeData;
    const saved    = !!saveData;
    const likeCount = (likesCount || []).length;

    actBar.innerHTML = `
      <div class="cab-actions">
        <button id="modal-like-btn-${postId}" onclick="modalToggleLike('${postId}',this)"
          style="background:none;border:none;cursor:pointer;padding:6px;display:flex;align-items:center;border-radius:8px"
          title="Curtir">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="${liked?(currentUser.color||'#e53935'):'none'}" stroke="${liked?(currentUser.color||'#e53935'):'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <button onclick="document.getElementById('new-comment').focus()"
          style="background:none;border:none;cursor:pointer;padding:6px;display:flex;align-items:center;border-radius:8px"
          title="Comentar">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button onclick="modalSendViaChat('${postId}')"
          style="background:none;border:none;cursor:pointer;padding:6px;display:flex;align-items:center;border-radius:8px"
          title="Enviar">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
        <button id="modal-save-btn-${postId}" onclick="modalToggleSave('${postId}',this)"
          style="background:none;border:none;cursor:pointer;padding:6px;display:flex;align-items:center;border-radius:8px;margin-left:auto"
          title="${saved?'Remover dos salvos':'Salvar'}">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="${saved?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
      <div class="cab-likes" id="modal-like-count-${postId}">${likeCount === 1 ? '1 curtida' : likeCount > 1 ? `${likeCount} curtidas` : ''}</div>
    `;
  }

  // ── Avatar do usuário no input ───────────────────────────
  const myAv = document.getElementById('my-comment-avatar');
  if (myAv) {
    if (currentUser.avatar_url) {
      myAv.style.background = 'transparent';
      myAv.innerHTML = `<img src="${currentUser.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      myAv.style.background = currentUser.color || '#e53935';
      myAv.textContent = initials(currentUser.username);
    }
  }
  document.getElementById('new-comment').value = '';

  // Atualiza a URL para /{username}/post/{id} — permite link direto e back/forward
  if (post?.users?.username) {
    // Não altera a URL ao abrir o modal de post
  }

  _replyToCommentId = null; // limpa reply ao abrir novo modal
  openModal('modal-comments');
}

// ── Helpers do modal de post ─────────────────────────────
function toggleModalPostMenu(postId, btn) {
  const menu = document.getElementById('modal-post-menu-' + postId);
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!menu.contains(e.target) && e.target !== btn) {
          menu.style.display = 'none';
          document.removeEventListener('click', handler);
        }
      });
    }, 0);
  }
}
function closeModalPostMenu(postId) {
  const menu = document.getElementById('modal-post-menu-' + postId);
  if (menu) menu.style.display = 'none';
}

async function modalToggleLike(postId, btn) {
  const { data: existing } = await db.from('likes').select('id').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle();
  const countEl = document.getElementById('modal-like-count-' + postId);
  if (existing) {
    await db.from('likes').delete().eq('id', existing.id);
    btn.querySelector('svg').setAttribute('fill', 'none');
    btn.querySelector('svg').setAttribute('stroke', 'currentColor');
    if (countEl) {
      const n = Math.max(0, parseInt(countEl.textContent) - 1);
      countEl.textContent = n === 1 ? '1 curtida' : n > 1 ? `${n} curtidas` : '';
    }
  } else {
    await db.from('likes').insert({ post_id: postId, user_id: currentUser.id });
    const _mc = currentUser.color || '#e53935';
    btn.querySelector('svg').setAttribute('fill', _mc);
    btn.querySelector('svg').setAttribute('stroke', _mc);
    btn.querySelector('svg').style.stroke = _mc;
    if (countEl) {
      const n = (parseInt(countEl.textContent) || 0) + 1;
      countEl.textContent = n === 1 ? '1 curtida' : `${n} curtidas`;
    }
    // Notifica dono se não for ele mesmo
    const post = (appPosts || []).find(p => p.id === postId);
    if (post && post.user_id && post.user_id !== currentUser.id) {
      await db.from('notifications').insert({ user_id: post.user_id, actor_id: currentUser.id, type: 'like', post_id: postId }).catch(()=>{});
      sendPushToUser(post.user_id, 'PokéGram', `${currentUser.username} curtiu sua publicação.`, '/');
    }
  }
  // Sincroniza o like no card do feed também
  const feedBtn = document.querySelector(`#post-${postId} .post-action-btn`);
  if (feedBtn) toggleLike(postId, feedBtn);
}

async function modalToggleSave(postId, btn) {
  const { data: existing } = await db.from('saves').select('id').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle();
  if (existing) {
    await db.from('saves').delete().eq('id', existing.id);
    btn.querySelector('svg').setAttribute('fill', 'none');
    btn.title = 'Salvar';
  } else {
    await db.from('saves').insert({ post_id: postId, user_id: currentUser.id });
    btn.querySelector('svg').setAttribute('fill', 'currentColor');
    btn.title = 'Remover dos salvos';
  }
}

function modalSharePost(postId) {
  const post = (appPosts || []).find(p => p.id === postId);
  const username = post?.users?.username || post?.author_handle || currentUser.username;
  const url = `${window.location.origin}/${username}/post/${postId}`;

  // Remove menu existente
  const existing = document.getElementById('share-post-menu');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'share-post-menu';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;width:300px;overflow:hidden;font-family:Nunito,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.25)';

  const customWaIcon = document.documentElement.dataset.whatsappShareIcon;
  const waIconHtml = customWaIcon
    ? `<img src="${customWaIcon}" style="width:20px;height:20px;object-fit:contain;display:block">`
    : `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.149-.149.347-.347.521-.521.174-.174.232-.298.347-.521.116-.224.058-.42-.041-.586-.099-.166-.992-2.392-1.36-3.224-.367-.831-.733-.832-.991-.84-.258-.008-.554-.008-.85-.008-.297 0-.778.111-1.183.555-.405.443-1.546 1.51-1.546 3.685s1.587 4.276 1.808 4.573c.222.297 3.067 4.687 7.435 6.39 4.368 1.704 4.368 1.137 5.158 1.066.79-.07 2.555-1.045 2.913-2.057.357-1.011.357-1.879.25-2.057-.108-.179-.396-.288-.694-.437z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.954.555 3.778 1.518 5.327L2 22l4.825-1.466A9.96 9.96 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.27-1.234l-.306-.19-3.225.98.99-3.143-.207-.32A8 8 0 1 1 12 20z"/></svg>`;

  box.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid #f0f0f0;font-weight:800;font-size:15px;text-align:center">Compartilhar publicação</div>
    <button id="share-copy-link-btn" style="width:100%;text-align:left;background:none;border:none;padding:13px 16px;font-size:14px;font-family:Nunito,sans-serif;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f5f5f5">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      Copiar link
    </button>
    <a href="https://wa.me/?text=${encodeURIComponent(url)}" target="_blank" rel="noopener"
       style="width:100%;text-align:left;background:none;border:none;padding:13px 16px;font-size:14px;font-family:Nunito,sans-serif;cursor:pointer;display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none;border-bottom:1px solid #f5f5f5">
      ${waIconHtml}
      Enviar via WhatZapp
    </a>
    <button onclick="document.getElementById('share-post-menu').remove()" style="width:100%;text-align:center;background:none;border:none;padding:13px 16px;font-size:14px;font-family:Nunito,sans-serif;cursor:pointer;color:#8e8e8e;font-weight:700">Cancelar</button>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('share-copy-link-btn').onclick = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => toast('Link copiado!')).catch(() => toast('Link: ' + url));
    } else {
      toast('Link: ' + url);
    }
    overlay.remove();
  };
}

// ── Enviar post via chat ──────────────────────────────────
async function modalSendViaChat(postId) {
  // Busca o post para montar a prévia
  const post = (appPosts || []).find(p => p.id === postId) ||
    (await db.from('posts').select('id,image_url,emoji,bg,caption,users(username)').eq('id', postId).maybeSingle()).data;
  if (!post) return;

  // Busca as conversas existentes do usuário
  const { data: convos } = await db.from('messages')
    .select('sender_id, receiver_id')
    .or(`sender_id.eq.${currentUser.username},receiver_id.eq.${currentUser.username}`)
    .order('created_at', { ascending: false });

  // Pega usernames únicos das conversas
  const peersSet = new Set();
  (convos || []).forEach(m => {
    if (m.sender_id   !== currentUser.username) peersSet.add(m.sender_id);
    if (m.receiver_id !== currentUser.username) peersSet.add(m.receiver_id);
  });
  const peers = [...peersSet].slice(0, 20);

  // Busca avatar/cor reais dos peers
  let peersData = [];
  if (peers.length) {
    const { data } = await db.from('users').select('username,avatar_url,color').in('username', peers);
    peersData = data || [];
  }
  const peersMap = {};
  peersData.forEach(u => { peersMap[u.username] = u; });

  // Cria o mini-modal de seleção
  const existing = document.getElementById('send-via-chat-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'send-via-chat-modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;width:340px;max-height:480px;display:flex;flex-direction:column;overflow:hidden;font-family:Nunito,sans-serif';

  const postUrl = `${window.location.origin}/${post.users?.username || ''}/post/${postId}`;

  const customWaIconSvc = document.documentElement.dataset.whatsappShareIcon;
  const waIconHtmlSvc = customWaIconSvc
    ? `<img src="${customWaIconSvc}" style="width:22px;height:22px;object-fit:contain;display:block">`
    : `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.149-.149.347-.347.521-.521.174-.174.232-.298.347-.521.116-.224.058-.42-.041-.586-.099-.166-.992-2.392-1.36-3.224-.367-.831-.733-.832-.991-.84-.258-.008-.554-.008-.85-.008-.297 0-.778.111-1.183.555-.405.443-1.546 1.51-1.546 3.685s1.587 4.276 1.808 4.573c.222.297 3.067 4.687 7.435 6.39 4.368 1.704 4.368 1.137 5.158 1.066.79-.07 2.555-1.045 2.913-2.057.357-1.011.357-1.879.25-2.057-.108-.179-.396-.288-.694-.437z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.954.555 3.778 1.518 5.327L2 22l4.825-1.466A9.96 9.96 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.27-1.234l-.306-.19-3.225.98.99-3.143-.207-.32A8 8 0 1 1 12 20z"/></svg>`;

  box.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid #dbdbdb;display:flex;align-items:center;justify-content:space-between">
      <span style="font-weight:800;font-size:15px">Enviar</span>
      <button onclick="document.getElementById('send-via-chat-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#8e8e8e;line-height:1">✕</button>
    </div>
    <div style="padding:12px 14px;border-bottom:1px solid #f0f0f0;display:flex;gap:10px">
      <button id="svc-copy-link-btn" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;background:#f5f5f5;border:none;border-radius:12px;padding:12px 8px;cursor:pointer;font-family:Nunito,sans-serif;font-size:12px;font-weight:700;color:#262626;transition:background .15s" onmouseover="this.style.background='#ebebeb'" onmouseout="this.style.background='#f5f5f5'">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Copiar link
      </button>
      <a id="svc-whatsapp-btn" href="https://wa.me/?text=${encodeURIComponent(postUrl)}" target="_blank" rel="noopener"
        style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;background:#f5f5f5;border:none;border-radius:12px;padding:12px 8px;cursor:pointer;font-family:Nunito,sans-serif;font-size:12px;font-weight:700;color:#262626;text-decoration:none;transition:background .15s" onmouseover="this.style.background='#ebebeb'" onmouseout="this.style.background='#f5f5f5'">
        ${waIconHtmlSvc}
        WhatZapp
      </a>
    </div>
    <div style="padding:10px 14px;border-bottom:1px solid #f0f0f0">
      <input id="svc-search" placeholder="Buscar usuário..." autocomplete="off"
        style="width:100%;border:1px solid #dbdbdb;border-radius:20px;padding:7px 14px;font-size:13px;font-family:Nunito,sans-serif;outline:none;box-sizing:border-box"
        oninput="svcSearch(this.value,'${postId}','${encodeURIComponent(postUrl)}')">
    </div>
    <div id="svc-list" style="overflow-y:auto;flex:1;padding:6px 0">
      ${peers.length
        ? peers.map(u => {
            const pu = peersMap[u];
            const av = pu?.avatar_url
              ? `<img src="${pu.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
              : u.charAt(0).toUpperCase();
            const bg = pu?.avatar_url ? 'transparent' : (pu?.color || '#e53935');
            return `
          <div onclick="svcSend('${u}','${postId}','${encodeURIComponent(postUrl)}')"
            style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;transition:background .1s"
            onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background=''">
            <div style="width:40px;height:40px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:14px;flex-shrink:0;overflow:hidden">${av}</div>
            <div style="font-weight:600;font-size:14px">${u}</div>
          </div>`;
          }).join('')
        : '<div style="text-align:center;padding:24px;color:#8e8e8e;font-size:13px">Nenhuma conversa ainda.<br>Busque um usuário acima.</div>'
      }
    </div>`;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('svc-copy-link-btn').onclick = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(postUrl).then(() => toast('Link copiado!')).catch(() => toast('Link: ' + postUrl));
    } else {
      toast('Link: ' + postUrl);
    }
    overlay.remove();
  };

  setTimeout(() => document.getElementById('svc-search')?.focus(), 100);
}

async function svcSearch(query, postId, encodedUrl) {
  const list = document.getElementById('svc-list');
  if (!list) return;
  if (!query.trim()) { list.innerHTML = '<div style="text-align:center;padding:16px;color:#8e8e8e;font-size:13px">Digite para buscar...</div>'; return; }
  list.innerHTML = '<div style="text-align:center;padding:16px;color:#8e8e8e;font-size:13px">Buscando...</div>';
  const { data } = await db.from('users').select('username,avatar_url,color').ilike('username', `%${query}%`).neq('username', currentUser.username).limit(10);
  if (!data || !data.length) { list.innerHTML = '<div style="text-align:center;padding:16px;color:#8e8e8e;font-size:13px">Nenhum usuário encontrado.</div>'; return; }
  list.innerHTML = data.map(u => {
    const av = u.avatar_url
      ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : u.username.charAt(0).toUpperCase();
    const bg = u.avatar_url ? 'transparent' : (u.color || '#e53935');
    return `<div onclick="svcSend('${u.username}','${postId}','${encodedUrl}')"
      style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;transition:background .1s"
      onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background=''">
      <div style="width:40px;height:40px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:14px;flex-shrink:0;overflow:hidden">${av}</div>
      <div style="font-weight:600;font-size:14px">${u.username}</div>
    </div>`;
  }).join('');
}

async function svcSend(toUsername, postId, encodedUrl) {
  // Busca dados do post para montar preview
  const post = (appPosts || []).find(p => p.id === postId) ||
    (await db.from('posts').select('id,image_url,caption,users(username)').eq('id', postId).maybeSingle()).data;

  const { error } = await db.from('messages').insert({
    sender_id:    currentUser.username,
    receiver_id:  toUsername,
    content:      '',
    meta_type:    'post_share',
    meta_ref_id:  postId,
    meta_img:     post?.image_url     || null,
    meta_caption: (post?.caption || '').substring(0, 60),
    meta_author:  post?.users?.username || null,
    read:         false
  });
  document.getElementById('send-via-chat-modal')?.remove();
  if (error) { toast('Erro ao enviar.'); return; }
  toast(`Enviado para @${toUsername}! 📨`);
  // Abre o chat para a pessoa
  const { data: peerUser } = await db.from('users').select('id,username,name,color,avatar_url').eq('username', toUsername).maybeSingle();
  if (peerUser) { await openChatPanel(); await chatOpenWindow(peerUser); }
}

async function renderCommentsList(postId) {
  const list = document.getElementById('comments-list');
  if (!list) return;
  const { data: comments } = await db
    .from('comments')
    .select('*, users(username, color, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (!comments || !comments.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#8e8e8e;font-size:14px">Nenhum comentário ainda.<br>Seja o primeiro! 🎤</div>';
    return;
  }

  // Mapa username → cor para colorir @mentions
  const userColorMap = {};
  userColorMap[currentUser.username] = currentUser.color || '#e53935';
  comments.forEach(c => {
    const u = c.users || {};
    if (u.username && u.color) userColorMap[u.username] = u.color;
  });

  // Separa raízes e replies usando reply_to_id (com fallback para detecção por @texto)
  const roots   = [];
  const replyMap = {}; // parentId → [replies]
  comments.forEach(c => {
    const parentId = c.reply_to_id || null;
    if (parentId) {
      if (!replyMap[parentId]) replyMap[parentId] = [];
      replyMap[parentId].push(c);
    } else {
      roots.push(c);
    }
  });

  function renderComment(c, isReply) {
    const u = c.users || { username: '?', color: '#999' };
    const canDelete = c.user_id === currentUser.id;
    const likes = c.likes || 0;

    // @mention no texto (para exibição)
    const replyMatch  = c.text.match(/^@(\S+)\s*/);
    const mentionUser = replyMatch ? replyMatch[1] : null;
    const bodyText    = replyMatch ? c.text.slice(replyMatch[0].length) : c.text;
    const mentionColor = mentionUser ? (userColorMap[mentionUser] || '#43a047') : '#43a047';

    const textHtml = mentionUser
      ? `<span style="color:${mentionColor};font-weight:700;cursor:pointer" onclick="showUserProfile('${esc(mentionUser)}')">@${esc(mentionUser)}</span> ${esc(bodyText)}`
      : esc(c.text);

    const avatarSize = isReply ? '28px' : '34px';
    const indent     = isReply ? 'margin-left:44px;' : '';

    return `
      <div class="comment-item" id="comment-item-${c.id}" style="${indent}">
        ${isReply ? '<div style="position:absolute;left:-22px;top:14px;width:14px;height:14px;border-left:1.5px solid #ddd;border-bottom:1.5px solid #ddd;border-radius:0 0 0 6px"></div>' : ''}
        <div class="comment-avatar" style="width:${avatarSize};height:${avatarSize};min-width:${avatarSize};background:${u.avatar_url?'transparent':(u.color||'#999')};overflow:hidden">${u.avatar_url?`<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:initials(u.username)}</div>
        <div class="comment-body">
          <strong onclick="showUserProfile('${esc(u.username)}')" style="cursor:pointer;color:${currentUser.color||'#262626'}">${esc(u.username)}</strong><span> ${textHtml}</span>
          <div class="comment-actions">
            <span class="comment-time">${fmtTimeAgo(c.created_at)}</span>
            <button class="comment-action-btn" onclick="replyToComment('${esc(u.username)}','${c.id}')">Responder</button>
            ${canDelete ? `<button class="comment-action-btn comment-action-delete" onclick="deleteComment('${c.id}','${c.post_id}')">Apagar</button>` : ''}
          </div>
        </div>
        <button class="comment-like-btn" id="clbtn-${c.id}" onclick="toggleCommentLike('${c.id}',this)" title="Curtir comentário">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          ${likes > 0 ? `<span class="comment-like-count">${likes}</span>` : ''}
        </button>
      </div>`;
  }

  // Renderiza cada raiz seguida de seus replies
  list.innerHTML = roots.map(root => {
    const children = (replyMap[root.id] || []).map(r => renderComment(r, true)).join('');
    return renderComment(root, false) + children;
  }).join('');
}

// ID do comentário pai sendo respondido (null = comentário raiz)
let _replyToCommentId = null;

function replyToComment(username, commentId) {
  const input = document.getElementById('new-comment');
  if (!input) return;

  // Salva o ID do comentário pai
  _replyToCommentId = commentId;

  input.value = `@${username} `;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  // Destaca o comentário brevemente
  const el = document.getElementById('comment-item-' + commentId);
  if (el) {
    el.style.background = 'rgba(0,149,246,.08)';
    setTimeout(() => el.style.background = '', 1200);
  }
}

// Limpa o reply target ao abrir um novo modal ou digitar do zero
function clearReplyTarget() {
  _replyToCommentId = null;
}

async function toggleCommentLike(commentId, btn) {
  const isLiked = btn.classList.contains('liked');
  btn.classList.toggle('liked', !isLiked);
  const svg = btn.querySelector('svg');
  if (svg) {
    svg.style.fill   = isLiked ? 'none'    : 'currentColor';
    svg.style.stroke = isLiked ? 'currentColor' : 'none';
  }
  // optimistic count update
  let countEl = btn.querySelector('.comment-like-count');
  const current = parseInt(countEl?.textContent || '0');
  const next = isLiked ? current - 1 : current + 1;
  if (next > 0) {
    if (!countEl) { countEl = document.createElement('span'); countEl.className = 'comment-like-count'; btn.appendChild(countEl); }
    countEl.textContent = next;
  } else if (countEl) { countEl.remove(); }

  if (isLiked) {
    await db.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', currentUser.id);
  } else {
    await db.from('comment_likes').insert({ comment_id: commentId, user_id: currentUser.id });
  }
}

async function submitComment() {
  const input = document.getElementById('new-comment');
  const text  = input?.value.trim();
  if (!text) return;

  // Inclui reply_to_id se estiver respondendo a um comentário específico
  const payload = { post_id: currentCommentPostId, user_id: currentUser.id, text };
  if (_replyToCommentId) payload.reply_to_id = _replyToCommentId;

  await db.from('comments').insert(payload);
  input.value = '';
  _replyToCommentId = null; // limpa o reply target após envio
  await renderCommentsList(currentCommentPostId);
  toast('Comentário publicado!');
  const { data: post } = await db.from('posts').select('user_id').eq('id', currentCommentPostId).maybeSingle();
  if (post && post.user_id !== currentUser.id) {
    await db.from('notifications').insert({ user_id: post.user_id, actor_id: currentUser.id, type: 'comment', post_id: currentCommentPostId, comment_text: text });
    sendPushToUser(post.user_id, 'PokéGram', `${currentUser.username} comentou: ${text}`, '/');
  }
}

async function submitInlineComment(postId) {
  const input = document.getElementById('inline-comment-' + postId);
  const text = input?.value.trim();
  if (!text) return;
  await db.from('comments').insert({ post_id: postId, user_id: currentUser.id, text });
  input.value = '';
  document.getElementById('inline-send-' + postId)?.classList.remove('ready');
  toast('Comentário publicado!');
  const { data: post } = await db.from('posts').select('user_id').eq('id', postId).maybeSingle();
  if (post && post.user_id !== currentUser.id) {
    await db.from('notifications').insert({ user_id: post.user_id, actor_id: currentUser.id, type: 'comment', post_id: postId, comment_text: text });
    sendPushToUser(post.user_id, 'PokéGram', `${currentUser.username} comentou: ${text}`, '/');
  }
  await renderPosts();
}

// ── Aside ─────────────────────────────────────────────────
function renderAsideMini() {
  const el = document.getElementById('aside-profile-mini');
  if (!el) return;
  el.innerHTML = `
    <div class="profile-mini-card">
      <div class="pm-avatar" style="background:${currentUser.avatar_url?'transparent':(currentUser.color||'#e53935')};overflow:hidden" onclick="showView('profile')">${currentUser.avatar_url?`<img src="${currentUser.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:initials(currentUser.username)}</div>
      <div class="pm-info">
        <div class="pm-username" onclick="showView('profile')">${currentUser.username}</div>
        <div class="pm-name">${currentUser.name || currentUser.username}</div>
      </div>
      <div class="pm-switch"><a href="#" onclick="doLogout();return false" style="color:${currentUser.color||'#e53935'}">Sair</a></div>
    </div>`;
}

async function renderSuggestions() {
  const el = document.getElementById('suggestions-list');
  if (!el) return;
  try {
  // Busca usuários do mesmo RPG do perfil logado, exclui o próprio usuário
  let sugQuery = db
    .from('users')
    .select('id,username,color,avatar_url,rpg,is_npc')
    .neq('id', currentUser.id);
  if (currentUser.rpg) {
    sugQuery = sugQuery.eq('rpg', currentUser.rpg);
  }
  const { data: allUsers } = await sugQuery.limit(30);
  if (!allUsers || !allUsers.length) { el.innerHTML = ''; return; }

  // Embaralha Fisher-Yates e pega até 5
  const pool = (allUsers || []).slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, 5);

  el.innerHTML = picked.map(u => {
    const isFollowing = !!followState[u.id];
    const color = currentUser.color || '#e53935';
    const npcBadge = u.is_npc
      ? '<span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;background:#9e9e9e;color:#fff;margin-left:4px;vertical-align:middle">NPC</span>'
      : '';
    const rpgLabel = u.rpg === 'kingdom_platinum' ? 'Kingdom Platinum'
                   : u.rpg === 'pchapters'        ? 'PChapters'
                   : (u.is_npc                    ? 'Personagem' : 'Treinador');
    const av   = u.avatar_url
      ? '<img src="'+u.avatar_url+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
      : initials(u.username);
    const avBg = u.avatar_url ? 'transparent' : (u.color || '#e53935');

    // botão: cor do jogador logado quando "Seguir", cinza quando "Seguindo"
    const btnStyle = isFollowing
      ? 'color:#8e8e8e;font-weight:700'
      : 'color:'+color+';font-weight:700';

    return '<div class="suggestion-item">' +
      '<div class="sug-avatar" style="background:'+avBg+';overflow:hidden;cursor:pointer" onclick="showUserProfile(\''+u.username+'\')">'+av+'</div>' +
      '<div class="sug-info">' +
        '<div class="sug-name" onclick="showUserProfile(\''+u.username+'\')" style="cursor:pointer">'+u.username+'</div>' +
        '<div class="sug-sub">'+rpgLabel+npcBadge+'</div>' +
      '</div>' +
      '<button class="btn-follow-sm'+(isFollowing?' following':'')+'" id="follow-btn-'+u.id+'" '+
        'style="'+btnStyle+';background:none;border:none;cursor:pointer;padding:0;font-size:13px;font-family:Nunito,sans-serif;white-space:nowrap" '+
        'onclick="toggleFollow(this,\''+u.id+'\',\''+u.username+'\')">'+
        (isFollowing ? 'Seguindo' : 'Seguir')+
      '</button>' +
    '</div>';
  }).join('');
  } catch(e) { console.warn('renderSuggestions error:', e); }
}

async function toggleFollow(btn, userId, username) {
  const following = followState[userId];
  // Descobre a cor do usuário para colorir o botão "Seguir"
  const targetUser = (typeof _allNpcs !== 'undefined' ? _allNpcs : []).find(u => u.id === userId);
  const userColor = btn?.dataset?.color || targetUser?.color || '#0095f6';

  if (!following) {
    await db.from('follows').insert({ follower_id: currentUser.id, following_id: userId });
    followState[userId] = true;
    if (btn) {
      btn.textContent = 'Seguindo';
      btn.classList.add('following');
      btn.style.color = '#8e8e8e';
    }
    toast(`Seguindo ${username}!`);
    const { error: ne } = await db.from('notifications').insert({
      user_id: userId, actor_id: currentUser.id, type: 'follow', post_id: null
    });
    if (ne) console.error('notif follow error:', ne);
    sendPushToUser(userId, 'PokéGram', `${currentUser.username} começou a seguir você.`, '/');
  } else {
    await db.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', userId);
    followState[userId] = false;
    if (btn) {
      btn.textContent = 'Seguir';
      btn.classList.remove('following');
      btn.style.color = userColor;
    }
    toast(`Deixou de seguir ${username}`);
    await db.from('notifications').delete()
      .eq('type', 'follow').eq('actor_id', currentUser.id).eq('user_id', userId);
  }
}

// ── Explore ───────────────────────────────────────────────
// ── Explore com paginação infinita ───────────────────────
const EXPLORE_FIRST_SIZE = 25; // itens no primeiro carregamento
const EXPLORE_PAGE_SIZE  = 9;  // itens por página subsequente
let _explorePage    = 0;      // próxima página a carregar (0-based, após o primeiro)
let _exploreQuery   = '';     // filtro de busca ativo
let _exploreLoading = false;  // evita requisições duplas
let _exploreEnd     = false;  // não há mais resultados
let _exploreSentinel = null;  // elemento IntersectionObserver

async function renderExplore(query) {
  // nova busca: zera estado
  _exploreQuery   = query || '';
  _explorePage    = 0;
  _exploreEnd     = false;
  _exploreLoading = false;
  if (_exploreSentinel) { _exploreSentinel.remove(); _exploreSentinel = null; }

  const grid = document.getElementById('explore-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#8e8e8e">Carregando...</div>';

  // Busca e renderiza perfis quando há query
  await _exploreSearchProfiles(_exploreQuery);

  await _exploreLoadMore(true);
}

async function _exploreSearchProfiles(query) {
  const container = document.getElementById('explore-profiles');
  if (!container) return;
  if (!query || !query.trim()) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  const q = query.trim().toLowerCase();
  const { data: users } = await db.from('users')
    .select('id,username,name,color,avatar_url,rpg,is_npc')
    .or(`username.ilike.%${q}%,name.ilike.%${q}%`)
    .limit(8);

  if (!users || !users.length) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  const myColor = currentUser?.color || '#e53935';
  container.innerHTML =
    '<div style="font-size:12px;font-weight:700;color:#8e8e8e;text-transform:uppercase;letter-spacing:.5px;padding:12px 14px 6px">Perfis</div>' +
    users.map(u => {
      const av = u.avatar_url
        ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : `<span style="font-size:16px;font-weight:800;color:#fff;font-family:Nunito,sans-serif">${(u.username||'?')[0].toUpperCase()}</span>`;
      const avBg = u.avatar_url ? 'transparent' : (u.color || '#e53935');
      const rpgLabel = u.rpg === 'kingdom_platinum' ? 'Kingdom Platinum'
                     : u.rpg === 'pchapters'        ? 'PChapters'
                     : (u.is_npc ? 'Personagem' : 'Treinador');
      const npcBadge = u.is_npc
        ? '<span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;background:#9e9e9e;color:#fff;margin-left:5px;vertical-align:middle">NPC</span>'
        : '';
      const isFollowing = !!(typeof followState !== 'undefined' && followState[u.id]);
      const btnStyle = isFollowing ? 'color:#8e8e8e' : `color:${myColor}`;
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;transition:background .12s" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background=''" onclick="showUserProfile('${u.username}')">
        <div style="width:44px;height:44px;border-radius:50%;background:${avBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">${av}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:#262626;font-family:Nunito,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.username}${npcBadge}</div>
          <div style="font-size:12px;color:#8e8e8e;font-family:Nunito,sans-serif">${u.name ? u.name + ' · ' : ''}${rpgLabel}</div>
        </div>
        <button style="background:none;border:none;cursor:pointer;font-size:13px;font-weight:700;font-family:Nunito,sans-serif;white-space:nowrap;${btnStyle}" id="ep-follow-${u.id}"
          onclick="event.stopPropagation();toggleFollow(this,'${u.id}','${u.username}')">${isFollowing ? 'Seguindo' : 'Seguir'}</button>
      </div>`;
    }).join('') +
    '<div style="height:1px;background:#efefef;margin:8px 0"></div>';

  container.style.display = 'flex';
  container.style.flexDirection = 'column';
}

async function _exploreLoadMore(reset) {
  if (_exploreLoading || _exploreEnd) return;
  _exploreLoading = true;

  const grid = document.getElementById('explore-grid');
  if (!grid) { _exploreLoading = false; return; }

  const isFirst = _explorePage === 0;
  const pageSize = isFirst ? EXPLORE_FIRST_SIZE : EXPLORE_PAGE_SIZE;
  const from = isFirst ? 0 : EXPLORE_FIRST_SIZE + (_explorePage - 1) * EXPLORE_PAGE_SIZE;
  const to   = from + pageSize - 1;

  let query = db.from('posts').select('id,emoji,bg,caption,location,image_url,users(username)');

  // se há busca, filtra no servidor por caption ou location (hashtag ou palavra-chave)
  if (_exploreQuery && _exploreQuery.trim()) {
    const q = _exploreQuery.trim().replace(/^#/, ''); // remove # se digitado
    query = query.or(`caption.ilike.%${q}%,location.ilike.%${q}%`);
  }

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data: posts } = await query;
  const results = (posts || []).slice();

  // embaralha apenas na primeira página sem busca
  if (isFirst && !_exploreQuery) {
    for (let i = results.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [results[i], results[j]] = [results[j], results[i]];
    }
  }

  let filtered = results;

  if (reset) grid.innerHTML = '';

  if (!filtered.length && _explorePage === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#8e8e8e">Nenhum resultado.</div>';
    _exploreEnd = true;
    _exploreLoading = false;
    return;
  }

  const existingCount = grid.querySelectorAll('.explore-thumb').length;
  const trimmed = filtered.slice(0, filtered.length - ((existingCount + filtered.length) % 3));
  trimmed.forEach(p => {
    const div = document.createElement('div');
    div.className = 'explore-thumb';
    div.style.background = p.bg || '#eee';
    div.onclick = () => openComments(p.id);
    div.innerHTML = p.image_url
      ? `<img src="${p.image_url}" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy">`
      : `<span>${p.emoji||'📸'}</span>`;
    grid.appendChild(div);
  });

  // se veio menos que o tamanho esperado, acabou
  if (results.length < pageSize) {
    _exploreEnd = true;
  } else {
    _explorePage++;
    _attachExploreSentinel(grid);
  }

  _exploreLoading = false;
}

function _attachExploreSentinel(grid) {
  if (_exploreSentinel) _exploreSentinel.remove();
  const sentinel = document.createElement('div');
  sentinel.id = 'explore-sentinel';
  sentinel.style.cssText = 'grid-column:1/-1;height:1px';
  grid.appendChild(sentinel);
  _exploreSentinel = sentinel;

  const obs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      obs.disconnect();
      _exploreSentinel = null;
      _exploreLoadMore(false);
    }
  }, { rootMargin: '200px' });
  obs.observe(sentinel);
}

function doSearch(q) {
  if (document.getElementById('view-explore')?.classList.contains('hidden')) {
    showView('explore').then(() => {
      renderExplore(q);
      const si = document.getElementById('search-input');
      if (si) { si.value = q; si.focus(); }
    });
  } else {
    if (!q || !q.trim()) {
      // Apagou a busca: só esconde perfis, não recarrega o grid
      _exploreSearchProfiles('');
    } else {
      renderExplore(q);
    }
  }
}

// ── Busca no topnav desktop ───────────────────────────────
function topnavSearch(q) {
  doSearch(q);
}

// ── Avatar color palette ──────────────────────────────────
const AVATAR_COLORS = [
  '#e53935','#d81b60','#8e24aa','#3949ab','#1e88e5',
  '#00897b','#43a047','#f4511e','#fb8c00','#fdd835',
  '#6d4c41','#546e7a','#000000','#c0392b','#2980b9'
];

function avatarHTML(u, size, extraStyle) {
  const sz = size || 40;
  const bg = u.color || '#e53935';
  if (u.avatar_url) {
    return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;overflow:hidden;flex-shrink:0;${extraStyle||''}"><img src="${u.avatar_url}" alt="${u.username}" style="width:100%;height:100%;object-fit:cover"></div>`;
  }
  return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:${Math.round(sz*0.35)}px;font-weight:800;color:#fff;font-family:'Nunito',sans-serif;flex-shrink:0;${extraStyle||''}">${initials(u.username)}</div>`;
}

// ── Build profile HTML (shared by own + other users) ──────
function buildProfileHTML(u, userPosts, followers, following, isMe) {
  const postCount = (userPosts||[]).length;
  const avatarInner = u.avatar_url
    ? `<img src="${u.avatar_url}" alt="${u.username}" onerror="this.style.display='none';this.nextElementSibling?.style.removeProperty('display');this.parentElement.style.background='${u.color || '#e53935'}'"><span style="display:none">${initials(u.username)}</span>`
    : `<span>${initials(u.username)}</span>`;
  const avatarBg = u.avatar_url ? 'transparent' : (u.color || '#e53935');
  const isSecondary = !!u.is_pokeet_secondary;

  const headerBanner = isSecondary ? `
      <div class="pkprof-header-banner" style="${u.header_url ? `background-image:url('${u.header_url}')` : `background:linear-gradient(135deg, ${u.color||'#e53935'}, ${u.color||'#e53935'}99)`}"></div>
  ` : '';

  return `
    <div class="profile-page${isSecondary ? ' pkprof-page' : ''}">
      ${headerBanner}
      <div class="profile-header">
          <div class="profile-avatar-wrap">
            <div class="profile-avatar" style="background:${avatarBg}">
              ${avatarInner}
            </div>
          </div>
          <div class="profile-meta">
            <div class="profile-top-row">
              <span class="profile-username-text">${u.username}</span>
              ${u.rpg ? `<span class="rpg-profile-badge">${u.rpg === 'kingdom_platinum' ? 'KP' : 'PC'}</span>` : ''}
              ${isMe
                ? `<button class="btn-edit-profile" onclick="openEditProfile()">Editar perfil</button>`
                : (isSecondary
                  ? ''
                  : `<button class="btn-follow-profile ${followState[u.id]?'following':''}" id="follow-btn-prof-${u.id}" onclick="toggleFollow(this,'${u.id}','${u.username}')">${followState[u.id]?'Seguindo':'Seguir'}</button>
                   <button class="btn-icon-profile" onclick="chatStartConversation('${u.username}')" title="Mensagem" style="${document.documentElement.dataset.profileMsgSprite ? 'border:none' : ''}">
                     ${document.documentElement.dataset.profileMsgSprite
                       ? `<img src="${document.documentElement.dataset.profileMsgSprite}" style="width:28px;height:28px;object-fit:contain;display:block;pointer-events:none">`
                       : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`}
                   </button>`)
              }
            </div>
            <div class="profile-stats">
              ${isSecondary
                ? `<div class="stat-item"><strong id="pkprof-count-${u.id}">${fmtNum(postCount)}</strong><span> pokeets</span></div>`
                : `<div class="stat-item"><strong>${fmtNum(postCount)}</strong><span> posts</span></div>
              <div class="stat-item" style="cursor:pointer" onclick="openFollowModal('${u.id}','followers','${u.username}')"><strong>${fmtNum(followers||0)}</strong><span> seguidores</span></div>
              <div class="stat-item" style="cursor:pointer" onclick="openFollowModal('${u.id}','following','${u.username}')"><strong>${fmtNum(following||0)}</strong><span> seguindo</span></div>`
              }
            </div>
          </div>
          <div class="profile-bio">
            <div class="prof-name">${u.name || u.username}${u.pronoun ? `<span style="font-size:12px;font-weight:400;color:#8e8e8e;margin-left:6px">(${u.pronoun})</span>` : ''}</div>
            ${u.pokemon ? `<div class="prof-starter">⭐ ${u.pokemon}</div>` : ''}
            ${u.bio ? `<div class="prof-desc">${u.bio}</div>` : ''}
          </div>
      </div>

      <div class="profile-tabs">
        ${!u.is_pokeet_secondary ? `
        <button class="tab-btn active" id="prof-tab-posts-${u.id}" onclick="profileSwitchTab('${u.id}','posts')">
          <svg viewBox="0 0 24 24" width="16" height="16" style="stroke:currentColor;fill:none;stroke-width:1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Publicações
        </button>
        ` : ''}
        <button class="tab-btn ${u.is_pokeet_secondary ? 'active' : ''}" id="prof-tab-pokeets-${u.id}" onclick="profileSwitchTab('${u.id}','pokeets')">
          <svg viewBox="0 0 24 24" width="16" height="16" style="stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Pokeets
        </button>
      </div>

      <div id="prof-panel-posts-${u.id}" class="profile-grid" style="${u.is_pokeet_secondary ? 'display:none' : ''}">
        ${postCount
          ? userPosts.map(p => `
              <div class="profile-thumb" style="background:${p.bg||'#eee'}" onclick="openComments('${p.id}')">
                ${p.image_url
                  ? `<img src="${p.image_url}" style="width:100%;height:100%;object-fit:cover;display:block">`
                  : `<span>${p.emoji||'📸'}</span>`}
              </div>`).join('')
          : `<div class="profile-empty">Nenhuma publicação ainda.</div>`
        }
      </div>

      <div id="prof-panel-pokeets-${u.id}" class="prof-pokeets-panel" style="${u.is_pokeet_secondary ? '' : 'display:none'}">
        <div class="prof-pokeets-list" id="prof-pokeets-list-${u.id}" data-secondary="${u.is_pokeet_secondary?'1':''}" data-owner="${u.owner_user_id||''}" data-handle="${u.username||''}">
          <div class="pk-thread-empty" style="padding:32px 0">Carregando Pokeets...</div>
        </div>
      </div>
    </div>`;
}

// ── Profile Tab Switch ────────────────────────────────────
function profileSwitchTab(userId, tab) {
  const postsBtn  = document.getElementById(`prof-tab-posts-${userId}`);
  const pokeetsBtn= document.getElementById(`prof-tab-pokeets-${userId}`);
  const postsPanel  = document.getElementById(`prof-panel-posts-${userId}`);
  const pokeetsPanel= document.getElementById(`prof-panel-pokeets-${userId}`);
  if (!pokeetsBtn || !pokeetsPanel) return;

  if (tab === 'pokeets') {
    if (postsBtn) postsBtn.classList.remove('active');
    pokeetsBtn.classList.add('active');
    if (postsPanel) postsPanel.style.display = 'none';
    pokeetsPanel.style.display = '';
    const _listEl = document.getElementById(`prof-pokeets-list-${userId}`);
    const _uObj = _listEl && _listEl.dataset.secondary
      ? { is_pokeet_secondary: true, owner_user_id: _listEl.dataset.owner, username: _listEl.dataset.handle }
      : { is_pokeet_secondary: false, username: _listEl?.dataset.handle || '' };
    loadProfilePokeets(userId, _uObj);
  } else {
    pokeetsBtn.classList.remove('active');
    if (postsBtn) postsBtn.classList.add('active');
    pokeetsPanel.style.display = 'none';
    if (postsPanel) postsPanel.style.display = '';
  }
}

// ── Load Profile Pokeets ──────────────────────────────────
async function loadProfilePokeets(userId, userObj) {
  const container = document.getElementById(`prof-pokeets-list-${userId}`);
  if (!container) return;
  if (container.dataset.loaded === userId) return;
  if (!userObj && container.dataset.secondary) {
    userObj = { is_pokeet_secondary: true, owner_user_id: container.dataset.owner, username: container.dataset.handle };
  }

  container.innerHTML = `<div class="pk-thread-empty" style="padding:32px 0">Carregando Pokeets...</div>`;

  try {
    let baseQuery = db.from('pokeets').select('*')
      .is('reply_to_id', null)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30);
    const { data: pokeets, error } = await (
      (userObj && userObj.is_pokeet_secondary && userObj.owner_user_id)
        ? baseQuery.eq('user_id', userObj.owner_user_id).ilike('author_handle', userObj.username)
        : baseQuery.eq('user_id', userId).or(`author_handle.is.null,author_handle.ilike.${userObj?.username || ''}`)
    );

    if (error) throw error;

    if (!pokeets || !pokeets.length) {
      container.innerHTML = `<div class="pk-thread-empty" style="padding:32px 0">Nenhum Pokeet ainda.</div>`;
      container.dataset.loaded = userId;
      return;
    }

    // Fetch user data
    const { data: userData } = await db.from('users').select('id, username, name, color, avatar_url, rpg').eq('id', userId).maybeSingle();
    pokeets.forEach(p => { p.users = userData || null; });

    // Fetch quoted pokeets
    const quoteIds = pokeets.map(p => p.quote_id).filter(Boolean);
    if (quoteIds.length) {
      const { data: quotedRows } = await db.from('pokeets').select('id, text, created_at, user_id').in('id', quoteIds);
      const quotedAuthorIds = [...new Set((quotedRows || []).map(q => q.user_id).filter(Boolean))];
      let quotedUsersMap = {};
      if (quotedAuthorIds.length) {
        const { data: qUsers } = await db.from('users').select('id, username, name, color, avatar_url').in('id', quotedAuthorIds);
        (qUsers || []).forEach(u => { quotedUsersMap[u.id] = u; });
      }
      const quotedMap = {};
      (quotedRows || []).forEach(q => { q.users = quotedUsersMap[q.user_id] || null; quotedMap[q.id] = q; });
      pokeets.forEach(p => { if (p.quote_id) p.quoted = quotedMap[p.quote_id] || null; });
    }

    // Fetch pokéets originais dos reposts simples
    const repostOrigIds2 = pokeets.filter(p => p.repost_of_id && !p.quote_id).map(p => p.repost_of_id);
    if (repostOrigIds2.length) {
      const { data: origRows2 } = await db.from('pokeets').select('id, text, created_at, user_id, author_name, author_handle, author_color').in('id', repostOrigIds2);
      const origAuthorIds2 = [...new Set((origRows2 || []).map(q => q.user_id).filter(Boolean))];
      let origUsersMap2 = {};
      if (origAuthorIds2.length) {
        const { data: oUsers2 } = await db.from('users').select('id, username, name, color, avatar_url').in('id', origAuthorIds2);
        (oUsers2 || []).forEach(u => { origUsersMap2[u.id] = u; });
      }
      const origMap2 = {};
      (origRows2 || []).forEach(q => { q.users = origUsersMap2[q.user_id] || null; origMap2[q.id] = q; });
      pokeets.forEach(p => { if (p.repost_of_id && !p.quote_id) p._original = origMap2[p.repost_of_id] || null; });
    }

    // Fetch profiles for author snapshots
    const allAuthorIds = [userId, ...pokeets.map(p => p.quoted?.user_id).filter(Boolean), ...pokeets.map(p => p._original?.user_id).filter(Boolean)];
    if (typeof pkFetchProfiles === 'function') await pkFetchProfiles([...new Set(allAuthorIds)]);

    // Counts & likes
    const ids = pokeets.map(p => p.id);
    const [{ data: myLikes }, { data: likeCounts }, { data: replyCounts }, { data: repostCounts }] = await Promise.all([
      db.from('pokeet_likes').select('pokeet_id').eq('user_id', currentUser.id).in('pokeet_id', ids),
      db.from('pokeet_likes').select('pokeet_id').in('pokeet_id', ids),
      db.from('pokeets').select('reply_to_id').in('reply_to_id', ids),
      db.from('pokeets').select('repost_of_id').in('repost_of_id', ids).is('quote_id', null),
    ]);

    const likedSet  = new Set((myLikes     || []).map(l => l.pokeet_id));
    const likeMap   = {}; (likeCounts  || []).forEach(l => { likeMap[l.pokeet_id]    = (likeMap[l.pokeet_id]    || 0) + 1; });
    const replyMap  = {}; (replyCounts || []).forEach(r => { replyMap[r.reply_to_id] = (replyMap[r.reply_to_id] || 0) + 1; });
    const repostMap = {}; (repostCounts|| []).forEach(r => { repostMap[r.repost_of_id]= (repostMap[r.repost_of_id]|| 0) + 1; });

    const { data: myReposts } = await db.from('pokeets').select('repost_of_id').eq('user_id', currentUser.id).in('repost_of_id', ids).is('quote_id', null);
    const repostedSet = new Set((myReposts || []).map(r => r.repost_of_id));

    container.innerHTML = pokeets
      .filter(p => !(p.repost_of_id && !p.quote_id && !p._original))
      .map(p => pkRenderCard(p, likedSet, likeMap, replyMap, repostMap, repostedSet)).join('');
    container.dataset.loaded = userId;

  } catch(e) {
    console.error('loadProfilePokeets error:', e);
    container.innerHTML = `<div class="pk-thread-empty" style="padding:32px 0">Erro ao carregar Pokeets.</div>`;
  }
}

// ── Load user data helper ─────────────────────────────────
async function loadUserData(username) {
  const { data: u, error } = await db.from('users').select('*').ilike('username', username).maybeSingle();
  if (error) console.error('Erro ao carregar usuário:', error);
  if (!u) {
    // Fallback: perfil secundário do Pokeet ainda sem user correspondente em 'users'
    // (perfis criados antes da sincronização automática, ou onde o insert falhou)
    try {
      const { data: prof } = await db.from('pokeet_profiles').select('*').ilike('handle', username).maybeSingle();
      if (prof) {
        const synthetic = {
          id:                 prof.id,
          username:           prof.handle,
          name:               prof.name || prof.handle,
          bio:                prof.bio || null,
          color:              prof.color || '#e53935',
          avatar_url:         prof.avatar_url || null,
          header_url:         prof.header_url || null,
          is_pokeet_secondary: true,
          pokeet_profile_id:  prof.id,
          owner_user_id:      prof.user_id,
        };
        // Tenta criar o user secundário agora, para futuras consultas
        try {
          await db.from('users').insert({
            username:            prof.handle,
            name:                prof.name || prof.handle,
            bio:                 prof.bio || null,
            color:               prof.color || '#e53935',
            avatar_url:          prof.avatar_url || null,
            header_url:          prof.header_url || null,
            is_pokeet_secondary: true,
            pokeet_profile_id:   prof.id,
            owner_user_id:       prof.user_id,
          });
        } catch(e) {}
        return { u: synthetic, userPosts: [], followers: 0, following: 0 };
      }
    } catch(e) {}
    return null;
  }
  const [postsRes, followersRes, followingRes, myFollowRes] = await Promise.all([
    db.from('posts').select('id,emoji,bg,image_url').eq('user_id', u.id).order('created_at', { ascending: false }),
    db.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', u.id),
    db.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', u.id),
    db.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', u.id).maybeSingle(),
  ]);
  // atualiza followState para que buildProfileHTML use o valor correto
  followState[u.id] = !!myFollowRes.data;
  return { u, userPosts: postsRes.data || [], followers: followersRes.count || 0, following: followingRes.count || 0 };
}

// ── Profile (own) ─────────────────────────────────────────
async function renderProfile(username) {
  const container = document.getElementById('profile-content');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:#8e8e8e">Carregando...</div>';
  history.replaceState(null, '', '/' + username);
  const res = await loadUserData(username);
  if (!res) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#8e8e8e">Perfil não encontrado.</div>'; return; }
  const { u, userPosts, followers, following } = res;
  container.innerHTML = buildProfileHTML(u, userPosts, followers, following, true);
  if (u.is_pokeet_secondary) { loadProfilePokeets(u.id, u); }
}

// ── Profile (other users) ─────────────────────────────────
async function showUserProfile(username) {
  // Fecha tudo antes de navegar
  document.querySelectorAll('.modal-overlay, .adm-modal-overlay').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('[id^="modal-"]').forEach(m => {
    if (!m.classList.contains('adm-modal-overlay')) m.classList.add('hidden');
  });
  if (typeof closeChatWindow === 'function') closeChatWindow();
  if (typeof closeChatPanel  === 'function') {
    try { document.getElementById('chat-panel')?.classList.remove('open'); } catch(e) {}
  }
  // Fecha modal de NPC perfil (ADM)
  document.getElementById('adm-npc-profile-modal')?.classList.remove('open');
  document.getElementById('adm-npc-edit-modal')?.classList.remove('open');

  if (username === currentUser.username) { showView('profile'); return; }
  const container = document.getElementById('user-profile-content');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:40px;color:#8e8e8e">Carregando...</div>';
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-user').classList.remove('hidden');
  currentViewHistory.push('user');
  window.scrollTo(0, 0);
  const res = await loadUserData(username);
  if (!res) {
    history.pushState(null, '', '/' + username);
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#8e8e8e">Usuário não encontrado.</div>'; return;
  }
  const { u, userPosts, followers, following } = res;
  history.pushState(null, '', u.is_pokeet_secondary ? '/pokeet/' + username : '/' + username);
  container.innerHTML = buildProfileHTML(u, userPosts, followers, following, false);

  // Para perfis secundarios do Pokeet, carrega os pokeets automaticamente
  if (u.is_pokeet_secondary) {
    loadProfilePokeets(u.id, u);
  }
}

// ── Modal Seguidores / Seguindo ───────────────────────────
async function openFollowModal(userId, type, username) {
  document.getElementById('follow-modal-title').textContent =
    type === 'followers' ? `Seguidores de ${username}` : `${username} segue`;
  document.getElementById('follow-modal-list').innerHTML =
    '<div style="text-align:center;padding:30px;color:#8e8e8e">Carregando...</div>';
  openModal('modal-follow-list');

  // 1ª query: pegar os IDs das pessoas
  let userIds = [];
  if (type === 'followers') {
    const { data } = await db.from('follows').select('follower_id').eq('following_id', userId);
    userIds = (data || []).map(r => r.follower_id);
  } else {
    const { data } = await db.from('follows').select('following_id').eq('follower_id', userId);
    userIds = (data || []).map(r => r.following_id);
  }

  if (!userIds.length) {
    document.getElementById('follow-modal-list').innerHTML =
      `<div style="text-align:center;padding:30px;color:#8e8e8e">${type === 'followers' ? 'Nenhum seguidor ainda.' : 'Não segue ninguém ainda.'}</div>`;
    return;
  }

  // 2ª query: buscar dados dos usuários pelos IDs
  const { data: usersData } = await db.from('users')
    .select('id,username,name,avatar_url,color')
    .in('id', userIds);
  const users = usersData || [];

  if (!users.length) {
    document.getElementById('follow-modal-list').innerHTML =
      `<div style="text-align:center;padding:30px;color:#8e8e8e">Nenhum usuário encontrado.</div>`;
    return;
  }

  document.getElementById('follow-modal-list').innerHTML = users.map(u => {
    const av = u.avatar_url
      ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : initials(u.username||'?');
    const avBg = u.avatar_url ? 'transparent' : (u.color || '#e53935');
    const isMe = u.id === currentUser.id;
    const isFollowing = !!followState[u.id];
    const followBtn = isMe ? '' :
      `<button id="flw-btn-${u.id}"
        data-color="${u.color||'#0095f6'}" onclick="event.stopPropagation();toggleFollow(this,'${u.id}','${u.username}')"
        style="padding:6px 16px;border-radius:8px;font-size:13px;font-weight:700;font-family:'Nunito',sans-serif;cursor:pointer;border:1px solid ${isFollowing?'var(--border)':'#0095f6'};background:${isFollowing?'transparent':'#0095f6'};color:${isFollowing?'var(--text)':'#fff'};transition:all .15s;flex-shrink:0">
        ${isFollowing ? 'Seguindo' : 'Seguir'}
       </button>`;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer" onclick="closeModal('modal-follow-list');showUserProfile('${u.username}')">
      <div style="width:44px;height:44px;border-radius:50%;background:${avBg};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;overflow:hidden;flex-shrink:0;font-family:'Nunito',sans-serif">${av}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;font-family:'Nunito',sans-serif">${u.username}</div>
        ${u.name ? `<div style="font-size:12px;color:#8e8e8e;font-family:'Nunito',sans-serif">${u.name}</div>` : ''}
      </div>
      ${followBtn}
    </div>`;
  }).join('');
}
let _epSelectedColor = null;

function openEditProfile() {
  const u = currentUser;
  _epSelectedColor = u.color || '#e53935';

  // preenche campos
  document.getElementById('ep-username').value = u.username || '';
  document.getElementById('ep-name').value     = u.name    || '';
  document.getElementById('ep-bio').value      = u.bio     || '';
  document.getElementById('ep-bio-count').textContent = (u.bio||'').length + '/150';
  document.getElementById('ep-rpg').value      = u.rpg     || '';
  document.getElementById('ep-pronoun').value  = u.pronoun || '';
  document.getElementById('ep-username-err').style.display = 'none';
  document.getElementById('ep-save-err').style.display     = 'none';


  // avatar preview — foto ou iniciais
  _epPendingAvatarFile = null;
  const imgEl  = document.getElementById('ep-avatar-img');
  const initEl = document.getElementById('ep-avatar-initials');
  const prev   = document.getElementById('ep-avatar-preview');
  prev.style.background = _epSelectedColor;
  if (u.avatar_url) {
    imgEl.src = u.avatar_url;
    imgEl.style.display = 'block';
    initEl.style.display = 'none';
  } else {
    imgEl.style.display = 'none';
    initEl.style.display = '';
    initEl.textContent = initials(u.username);
  }
  document.getElementById('ep-avatar-file').value = '';

  // color picker
  const picker = document.getElementById('ep-color-picker');
  picker.innerHTML = AVATAR_COLORS.map(c => `
    <div onclick="selectEpColor('${c}')" id="ep-color-${c.replace('#','')}"
      style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===_epSelectedColor?'#fff':'transparent'};box-shadow:${c===_epSelectedColor?'0 0 0 2px #262626':'none'};transition:all .15s"></div>
  `).join('');

  // bio counter
  document.getElementById('ep-bio').oninput = function() {
    document.getElementById('ep-bio-count').textContent = this.value.length + '/150';
  };

  openModal('modal-edit-profile');
}

let _epPendingAvatarFile = null;

function previewAvatarUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('Imagem muito grande. Máximo 10MB.'); return; }
  openCropper(file, 'circle', croppedFile => {
    _epPendingAvatarFile = croppedFile;
    const reader = new FileReader();
    reader.onload = e => {
      const imgEl  = document.getElementById('ep-avatar-img');
      const initEl = document.getElementById('ep-avatar-initials');
      if (imgEl)  { imgEl.src = e.target.result; imgEl.style.display = 'block'; }
      if (initEl) initEl.style.display = 'none';
    };
    reader.readAsDataURL(croppedFile);
  });
  input.value = '';
}

function selectEpColor(color) {
  _epSelectedColor = color;
  const prev = document.getElementById('ep-avatar-preview');
  prev.style.background = color;
  AVATAR_COLORS.forEach(c => {
    const el = document.getElementById('ep-color-' + c.replace('#',''));
    if (!el) return;
    const sel = c === color;
    el.style.border      = `3px solid ${sel?'#fff':'transparent'}`;
    el.style.boxShadow   = sel ? '0 0 0 2px #262626' : 'none';
  });
}

async function submitEditProfile() {
  const username = document.getElementById('ep-username').value.trim();
  const name     = document.getElementById('ep-name').value.trim();
  const bio      = document.getElementById('ep-bio').value.trim();
  const rpg      = document.getElementById('ep-rpg').value;
  const pronoun  = document.getElementById('ep-pronoun').value;
  const color    = _epSelectedColor || currentUser.color || '#e53935';
  const errEl    = document.getElementById('ep-save-err');
  const usernErr = document.getElementById('ep-username-err');
  const saveBtn  = document.querySelector('#modal-edit-profile .btn-share-modal');
  errEl.style.display = usernErr.style.display = 'none';

  if (!username) { usernErr.textContent = 'Username obrigatório.'; usernErr.style.display = 'block'; return; }
  if (!/^[a-zA-Z0-9_.]{2,30}$/.test(username)) {
    usernErr.textContent = 'Apenas letras, números, _ e . (2–30 caracteres).';
    usernErr.style.display = 'block'; return;
  }
  if (username !== currentUser.username) {
    const { data: exists } = await db.from('users').select('id').eq('username', username).maybeSingle();
    if (exists) { usernErr.textContent = 'Este username já está em uso.'; usernErr.style.display = 'block'; return; }
  }

  if (saveBtn) { saveBtn.textContent = 'Salvando...'; saveBtn.disabled = true; }

  // 1 — upload da foto PRIMEIRO (antes de salvar o resto)
  let avatar_url = currentUser.avatar_url || null;
  if (_epPendingAvatarFile) {
    // usar path com timestamp para forçar nova URL sem cache
    const path = `${currentUser.id}_${Date.now()}.png`;
    const { error: upErr } = await db.storage
      .from('avatars')
      .upload(path, _epPendingAvatarFile, { upsert: false, contentType: 'image/png' });
    if (upErr) {
      errEl.textContent = 'Erro ao enviar foto: ' + upErr.message + '. Verifique as políticas do bucket "avatars" no Supabase.';
      errEl.style.display = 'block';
      if (saveBtn) { saveBtn.textContent = 'Salvar'; saveBtn.disabled = false; }
      return;
    }
    const { data: urlData } = db.storage.from('avatars').getPublicUrl(path);
    avatar_url = urlData.publicUrl; // URL limpa, sem ?t= — evita duplicatas no banco
    _epPendingAvatarFile = null;
  }

  // 2 — salva todos os campos juntos (incluindo avatar_url se mudou)
  const updatePayload = { username, name, bio, rpg, pronoun, color, avatar_url };
  const { error: textErr } = await db.from('users')
    .update(updatePayload)
    .eq('id', currentUser.id);

  if (saveBtn) { saveBtn.textContent = 'Salvar'; saveBtn.disabled = false; }
  if (textErr) { errEl.textContent = 'Erro ao salvar: ' + textErr.message; errEl.style.display = 'block'; return; }

  // 2b — se o username mudou, atualiza o email no Supabase Auth também
  if (username !== currentUser.username) {
    const newEmail = username + '@pokegram.app';
    await db.auth.updateUser({ email: newEmail }).catch(() => {});
  }

  // 3 — atualiza estado local
  Object.assign(currentUser, { username, name, bio, rpg, pronoun, color, avatar_url });
  saveSession(currentUser);
  document.documentElement.style.setProperty('--user-color', color || '#e53935');
  renderSidebarAvatar();
  applyUserColor(color);
  closeModal('modal-edit-profile');
  await renderProfile(currentUser.username);
  toast('Perfil atualizado! ✨');
}

// ── Alterar senha no editar perfil ───────────────────────
function toggleEpPasswordSection() {
  const section = document.getElementById('ep-password-section');
  const icon    = document.getElementById('ep-pw-toggle-icon');
  if (!section) return;
  const open = section.style.display === 'flex';
  section.style.display = open ? 'none' : 'flex';
  if (icon) icon.style.transform = open ? '' : 'rotate(180deg)';
  // limpa feedbacks ao fechar
  if (open) {
    ['ep-pw-atual','ep-pw-nova','ep-pw-conf'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['ep-pw-err','ep-pw-ok'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  }
}

function epTogglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
  else { input.type = 'password'; btn.textContent = '👁'; }
}

async function submitChangePw() {
  const atual = document.getElementById('ep-pw-atual')?.value || '';
  const nova  = document.getElementById('ep-pw-nova')?.value  || '';
  const conf  = document.getElementById('ep-pw-conf')?.value  || '';
  const errEl = document.getElementById('ep-pw-err');
  const okEl  = document.getElementById('ep-pw-ok');
  const btn   = document.querySelector('#ep-password-section button[onclick="submitChangePw()"]');

  errEl.style.display = okEl.style.display = 'none';

  if (!atual)          { errEl.textContent = 'Informe a senha atual.'; errEl.style.display = 'block'; return; }
  if (nova.length < 6) { errEl.textContent = 'A nova senha deve ter ao menos 6 caracteres.'; errEl.style.display = 'block'; return; }
  if (nova !== conf)   { errEl.textContent = 'As novas senhas não coincidem.'; errEl.style.display = 'block'; return; }

  if (btn) { btn.textContent = 'Salvando...'; btn.disabled = true; }

  try {
    // Reautentica para verificar a senha atual
    const userEmail = (await db.auth.getUser()).data?.user?.email;
    if (!userEmail) throw new Error('Sessão expirada. Faça login novamente.');

    const { error: signInErr } = await db.auth.signInWithPassword({ email: userEmail, password: atual });
    if (signInErr) {
      errEl.textContent = 'Senha atual incorreta.';
      errEl.style.display = 'block';
      return;
    }

    // Atualiza a senha
    const { error: updateErr } = await db.auth.updateUser({ password: nova });
    if (updateErr) throw updateErr;

    // Limpa campos e mostra sucesso
    ['ep-pw-atual','ep-pw-nova','ep-pw-conf'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    okEl.style.display = 'block';
    setTimeout(() => { okEl.style.display = 'none'; toggleEpPasswordSection(); }, 2500);
  } catch (err) {
    errEl.textContent = 'Erro ao alterar senha: ' + (err.message || err);
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.textContent = 'Salvar nova senha'; btn.disabled = false; }
  }
}

// ── New Story ─────────────────────────────────────────────
function openStoryOrViewer() {
  if (window._myHasActiveStory) {
    openStoryViewer(currentUser.id);
  } else {
    showNewStory();
  }
}

// ── New Post ─────────────────────────────────────────────
let _postPendingImageFile = null;

function showNewPost() {
  _postPendingImageFile = null;
  document.getElementById('post-caption').value  = '';
  pkSyncCaptionHighlight();
  document.getElementById('post-location').value = '';
  document.getElementById('post-img-file').value = '';

  // volta para step 1 (seleção)
  document.getElementById('post-step-select').style.display  = '';
  document.getElementById('post-step-caption').style.display = 'none';

  // reset preview
  const prevImg = document.getElementById('post-preview-img');
  if (prevImg) { prevImg.src = ''; prevImg.style.display = 'none'; }
  const hint = document.getElementById('post-change-hint');
  if (hint) hint.style.display = 'none';

  // drag-and-drop
  const dropArea = document.getElementById('post-drop-area');
  if (dropArea) {
    dropArea.ondragover  = e => { e.preventDefault(); dropArea.style.background = '#f0f8ff'; };
    dropArea.ondragleave = () => { dropArea.style.background = ''; };
    dropArea.ondrop      = e => {
      e.preventDefault();
      dropArea.style.background = '';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handlePostImageFile(file);
    };
  }

  const row = document.getElementById('post-author-row');
  if (row) row.innerHTML = `
    <div class="pa-avatar" style="background:${currentUser.avatar_url?'transparent':(currentUser.color||'#e53935')};overflow:hidden">${currentUser.avatar_url?`<img src="${currentUser.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:initials(currentUser.username)}</div>
    <span class="pa-name">${currentUser.username}</span>`;

  openModal('modal-post');
}

function previewPostImage(input) {
  const file = input.files[0];
  if (!file) return;
  handlePostImageFile(file);
  input.value = '';
}

function handlePostImageFile(file) {
  if (file.size > 15 * 1024 * 1024) { toast('Imagem muito grande. Máximo 15MB.'); return; }
  openCropper(file, 'square', croppedFile => {
    _postPendingImageFile = croppedFile;
    const reader = new FileReader();
    reader.onload = e => {
      const img  = document.getElementById('post-preview-img');
      const hint = document.getElementById('post-change-hint');
      if (img)  { img.src = e.target.result; img.style.display = 'block'; }
      if (hint) hint.style.display = 'block';
      // avança para step 2
      document.getElementById('post-step-select').style.display  = 'none';
      document.getElementById('post-step-caption').style.display = '';
    };
    reader.readAsDataURL(croppedFile);
  });
}

function switchPostTab() {} // mantido para compatibilidade, sem uso


// ── Post Menu (···) ───────────────────────────────────────
function togglePostMenu(postId, btn) {
  // fecha todos os outros menus abertos
  document.querySelectorAll('.post-menu.open').forEach(m => {
    if (m.id !== 'post-menu-' + postId) m.classList.remove('open');
  });
  const menu = document.getElementById('post-menu-' + postId);
  if (menu) menu.classList.toggle('open');
  // fecha ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!menu?.contains(e.target) && e.target !== btn) {
        menu?.classList.remove('open');
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
}

function closePostMenu(postId) {
  document.getElementById('post-menu-' + postId)?.classList.remove('open');
}

async function deletePost(postId) {
  closePostMenu(postId);
  if (!confirm('Tem certeza que quer apagar esta publicação?')) return;
  // remove do storage se tiver imagem
  const post = appPosts?.find(p => p.id === postId);
  if (post?.image_url) {
    try {
      const url  = new URL(post.image_url);
      const path = url.pathname.split('/posts/')[1]?.split('?')[0];
      if (path) await db.storage.from('posts').remove([path]);
    } catch (e) {}
  }
  // apaga likes e comentários primeiro
  await db.from('likes').delete().eq('post_id', postId);
  await db.from('comments').delete().eq('post_id', postId);
  const { error } = await db.from('posts').delete().eq('id', postId);
  if (error) { toast('Erro ao apagar: ' + error.message); return; }
  // remove o card do DOM imediatamente
  const card = document.getElementById('post-' + postId);
  if (card) { card.style.transition = 'opacity .25s'; card.style.opacity = '0'; setTimeout(() => card.remove(), 250); }
  toast('Publicação apagada.');
}

async function submitPost() {
  const caption     = document.getElementById('post-caption').value.trim();
  const postLocation = document.getElementById('post-location').value.trim();
  if (!caption)              return toast('Escreva uma legenda!');
  if (!_postPendingImageFile) return toast('Selecione uma foto!');

  const shareBtn = document.querySelector('#modal-post .btn-share-modal');
  if (shareBtn) { shareBtn.textContent = 'Publicando...'; shareBtn.disabled = true; }

  const path = `${currentUser.id}_${Date.now()}.png`;
  const { error: upErr } = await db.storage.from('posts').upload(path, _postPendingImageFile, { upsert: false, contentType: 'image/png' });
  if (upErr) {
    toast('Erro ao enviar foto: ' + upErr.message);
    if (shareBtn) { shareBtn.textContent = 'Compartilhar'; shareBtn.disabled = false; }
    return;
  }
  const { data: urlData } = db.storage.from('posts').getPublicUrl(path);
  const image_url = urlData.publicUrl;

  const payload = { user_id: currentUser.id, caption, location: postLocation, image_url, emoji: null, bg: null };
  const { data: inserted, error } = await db.from('posts').insert(payload).select('id').maybeSingle();
  if (shareBtn) { shareBtn.textContent = 'Compartilhar'; shareBtn.disabled = false; }
  if (error) { toast('Erro ao publicar. Tente novamente.'); return; }

  _postPendingImageFile = null;
  closeModal('modal-post');
  await showView('feed');

  toast('Publicação criada! 🎉');
}


// ── Keyboard ──────────────────────────────────────────────
// ════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ════════════════════════════════════════════════════════
let _notifOpen = false;

async function loadNotifBadge() {
  if (!currentUser) return;
  const { count } = await db.from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', currentUser.id).eq('read', false);
  const badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = (count && count > 0) ? 'block' : 'none';
}

async function toggleNotifPanel() {
  if (_notifOpen) { closeNotifPanel(); return; }
  _notifOpen = true;
  document.getElementById('notif-panel').style.display    = 'flex';
  document.getElementById('notif-backdrop').style.display = 'block';
  await renderNotifList();
}

function closeNotifPanel() {
  _notifOpen = false;
  document.getElementById('notif-panel').style.display    = 'none';
  document.getElementById('notif-backdrop').style.display = 'none';
}

async function renderNotifList() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  list.innerHTML = '<div style="padding:24px;text-align:center;color:#8e8e8e;font-size:13px">Carregando...</div>';

  // busca notificações sem join (evita problema de FK alias no Supabase)
  const { data: notifs, error } = await db
    .from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) { console.error('notif error', error); }
  if (!notifs || !notifs.length) {
    list.innerHTML = '<div style="padding:40px 16px;text-align:center;color:#8e8e8e;font-size:13px">Nenhuma notificação ainda.</div>';
    return;
  }

  // busca actors e posts em paralelo
  const actorIds = [...new Set(notifs.map(n => n.actor_id).filter(Boolean))];
  const postIds  = [...new Set(notifs.map(n => n.post_id).filter(Boolean))];
  const [{ data: actors }, { data: posts }] = await Promise.all([
    db.from('users').select('id, username, color, avatar_url').in('id', actorIds),
    db.from('posts').select('id, image_url, emoji, bg').in('id', postIds)
  ]);
  const actorMap = Object.fromEntries((actors||[]).map(a => [a.id, a]));
  const postMap  = Object.fromEntries((posts||[]).map(p => [p.id, p]));

  // marca como lidas
  await db.from('notifications').update({ read: true }).eq('user_id', currentUser.id).eq('read', false);
  const badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = 'none';

  list.innerHTML = notifs.map(n => {
    const actor = actorMap[n.actor_id] || { username: '?', color: '#999' };
    const post  = postMap[n.post_id];
    const av = actor.avatar_url
      ? `<img src="${actor.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : initials(actor.username);
    const avBg = actor.avatar_url ? 'transparent' : (actor.color || '#e53935');
    const thumb = post ? (post.image_url
      ? `<img src="${post.image_url}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0">`
      : `<div style="width:44px;height:44px;border-radius:6px;background:${post.bg||'#eee'};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${post.emoji||'📸'}</div>`)
      : '';
    const msg = n.type === 'like'
      ? `<span style="font-weight:700">${esc(actor.username)}</span> curtiu sua publicação.`
      : n.type === 'story_like'
      ? `<span style="font-weight:700">${esc(actor.username)}</span> curtiu seu story. ❤️`
      : n.type === 'pokeet_like'
      ? `<span style="font-weight:700">${esc(actor.username)}</span> curtiu seu Pokeet. 💭`
      : n.type === 'follow'
      ? `<span style="font-weight:700">${esc(actor.username)}</span> começou a seguir você.`
      : `<span style="font-weight:700">${esc(actor.username)}</span> comentou: <span style="color:#555">${esc(n.comment_text || '')}</span>`;
    const unread = !n.read ? 'background:#f0f7ff;' : '';
    const notifAction = n.type === 'follow'
      ? `closeNotifPanel();showUserProfile('${esc(actor.username)}')`
      : n.type === 'pokeet_like'
      ? `closeNotifPanel();showTab('pokeets')`
      : `closeNotifPanel();openComments('${n.post_id}')`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;${unread}" onclick="${notifAction}">
      <div style="width:38px;height:38px;border-radius:50%;background:${avBg};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;overflow:hidden;flex-shrink:0">${av}</div>
      <div style="font-size:13px;color:#1a1a1a;flex:1;line-height:1.4;min-width:0">${msg}<div style="font-size:11px;color:#8e8e8e;margin-top:2px">${fmtTimeAgo(n.created_at)}</div></div>
      ${thumb}
    </div>`;
  }).join('');
}

async function markAllRead() {
  await db.from('notifications').update({ read: true }).eq('user_id', currentUser.id);
  const badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = 'none';
  renderNotifList();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal('modal-comments'); closeModal('modal-post'); closeModal('modal-story-new'); closeCropper(); closeNotifPanel(); }
});

