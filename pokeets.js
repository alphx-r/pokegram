// ════════════════════════════════════════════════════════════
// POKEETS — Feed, threads, reposts, tendências, hashtags
// ════════════════════════════════════════════════════════════
let _pk = {
  tab: 'for-you',         // aba ativa
  feed: [],               // pokéets carregados
  repostTarget: null,     // pokéet alvo do repost
  threadTarget: null,     // pokéet alvo do thread
  realtimeSub: null,
};

// ── Helpers ──────────────────────────────────────────────
function pkAvatar(user, size) {
  const sz = size || 42;
  const color = user.avatar_color || user.color || '#e53935';
  const cls = size === 20 ? 'pk-rq-avatar' : (size === 42 ? 'pk-card-avatar' : 'pokeet-composer-avatar');
  if (user.avatar_url) {
    return `<div class="${cls}" style="width:${sz}px;height:${sz}px;background:${color}"><img src="${esc(user.avatar_url)}" alt=""></div>`;
  }
  return `<div class="${cls}" style="width:${sz}px;height:${sz}px;background:${color};font-size:${Math.round(sz*0.36)}px">${initials(user.username||'?')}</div>`;
}

// ── Normaliza hashtag removendo acentos (para busca/agrupamento) ──
function normalizeTag(tag) {
  return (tag || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ── Highlight de hashtags em tempo real (editor "Nova publicação") ──
function pkSyncCaptionHighlight() {
  const ta  = document.getElementById('post-caption');
  const hl  = document.getElementById('post-caption-highlight');
  if (!ta || !hl) return;
  const text = ta.value;
  // escapa HTML e colore hashtags com a cor do perfil
  let html = esc(text).replace(/#([^\s#<&]+)/g, (m, raw) => `<span class="cap-tag-live">#${raw}</span>`);
  // garante quebra de linha visual igual ao textarea
  if (html.endsWith('\n') || text === '') html += '&nbsp;';
  hl.innerHTML = html;
  pkSyncCaptionScroll();
}

function pkSyncCaptionScroll() {
  const ta = document.getElementById('post-caption');
  const hl = document.getElementById('post-caption-highlight');
  if (!ta || !hl) return;
  hl.scrollTop  = ta.scrollTop;
  hl.scrollLeft = ta.scrollLeft;
}

function pkFormatText(text) {
  if (!text) return '';
  return esc(text)
    .replace(/@([a-zA-Z0-9_.]+)/g, '<span class="pk-mention" onclick="event.stopPropagation();showUserProfile(\'$1\')">@$1</span>')
    .replace(/#([^\s#<&]+)/g, (match, raw) => {
      // Passa a tag original para pkSearchHashtag — ela mesma normaliza internamente
      const safe = raw.replace(/'/g, "\\'");
      const isPrideTag = /^(pridemonth|mesdoorgulho|pride|lgbt\+?|lgbtq\+?|lgbtqia\+?)$/i.test(raw);
      const cls = isPrideTag ? 'pk-hashtag pk-hashtag-pride' : 'pk-hashtag';
      return `<span class="${cls}" onclick="event.stopPropagation();pkSearchHashtag('${safe}')">#${raw}</span>`;
    });
}

function pkTimeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return 'agora';
  if (diff < 3600)  return Math.floor(diff/60)   + 'min';
  if (diff < 86400) return Math.floor(diff/3600)  + 'h';
  if (diff < 604800)return Math.floor(diff/86400) + 'd';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
}

function pkCharRing(circleId, countId, val, max) {
  const fill = document.getElementById(circleId);
  const count = document.getElementById(countId);
  if (!fill || !count) return;
  const remaining = max - val;
  const pct = val / max;
  const circumference = 88;
  const offset = circumference * (1 - pct);
  fill.style.strokeDashoffset = offset;
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--pk-accent').trim() || '#e53935';
  fill.style.stroke = pct > 0.9 ? '#c62828' : pct > 0.7 ? '#ffa726' : accentColor;
  count.textContent = remaining;
  count.style.color = pct > 0.9 ? '#c62828' : pct > 0.7 ? '#ffa726' : '';
}

// ── Composer ─────────────────────────────────────────────
function pkOnInput(el) {
  const val = el.value.length;
  pkCharRing('pkc-ring-fill', 'pkc-char-count', val, 280);
  const btn = document.getElementById('pokeet-btn-post');
  if (btn) btn.disabled = val === 0;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function pkOnInputReply(el) {
  const val = el.value.length;
  pkCharRing('pkc-ring-fill-reply', 'pkc-char-count-reply', val, 280);
  const btn = document.getElementById('pk-reply-btn');
  if (btn) btn.disabled = val === 0;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function pkOnInputQuote(el) {
  const val = el.value.length;
  pkCharRing('pkc-ring-fill-quote', 'pkc-char-count-quote', val, 280);
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ── Render composer avatar ────────────────────────────────
function pkRenderComposerAvatar() {
  if (!currentUser) return;
  const u = (typeof pkEffectiveUser === 'function') ? pkEffectiveUser() : currentUser;
  const ids = ['pkc-avatar', 'pk-reply-avatar', 'pk-quote-avatar'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const color = u.avatar_color || u.color || '#e53935';
    el.style.background = color;
    if (u.avatar_url) {
      el.innerHTML = `<img src="${esc(u.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      el.textContent = initials(u.username || '?');
    }
  });
}

// ── Load feed ─────────────────────────────────────────────
async function renderPokeets() {
  const container = document.getElementById('pokeets-feed');
  if (!container) return;

  // Carrega cache de perfis Pokeet (para exibição imediata)
  pkLoadMyProfilesCache(); pkLoadActiveId();

  // skeleton
  container.innerHTML = `<div class="pk-loading">${[1,2,3].map(()=>`
    <div class="pk-skeleton">
      <div class="pk-skel-avatar"></div>
      <div class="pk-skel-body">
        <div class="pk-skel-line" style="width:40%"></div>
        <div class="pk-skel-line" style="width:90%"></div>
        <div class="pk-skel-line" style="width:70%"></div>
      </div>
    </div>`).join('')}</div>`;

  pkRenderComposerAvatar();

  try {
    // Busca pokéets sem join (evita conflito de múltiplas FKs para users)
    let pokeetsQuery = db
      .from('pokeets')
      .select('*')
      .is('reply_to_id', null)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40);

    if (_pk.tab === 'following') {
      const { data: follows } = await db.from('follows').select('following_id').eq('follower_id', currentUser.id);
      const userIds = (follows || []).map(f => f.following_id);
      if (!userIds.length) {
        container.innerHTML = `<div class="pk-thread-empty">Você ainda não segue ninguém.<br>Explore perfis para seguir pessoas!</div>`;
        return;
      }
      pokeetsQuery = pokeetsQuery.in('user_id', userIds);
    }

    const { data: pokeets, error } = await pokeetsQuery;
    if (error) throw error;

    if (!pokeets || !pokeets.length) {
      container.innerHTML = `<div class="pk-thread-empty">Nenhum Pokeet ainda.<br>Seja o primeiro a tweetar! 💭</div>`;
      return;
    }

    // Busca dados dos usuários separadamente
    const authorIds = [...new Set(pokeets.map(p => p.user_id).filter(Boolean))];
    const { data: usersData } = await db.from('users').select('id, username, name, color, avatar_url, rpg').in('id', authorIds);
    const usersMap = {};
    (usersData || []).forEach(u => { usersMap[u.id] = u; });
    pokeets.forEach(p => { p.users = usersMap[p.user_id] || null; });

    // Busca pokéets citados separadamente
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

    // Busca pokéets originais dos reposts simples
    const repostOrigIds = pokeets.filter(p => p.repost_of_id && !p.quote_id).map(p => p.repost_of_id);
    if (repostOrigIds.length) {
      const { data: origRows } = await db.from('pokeets').select('id, text, created_at, user_id, author_name, author_handle, author_color').in('id', repostOrigIds);
      const origAuthorIds = [...new Set((origRows || []).map(q => q.user_id).filter(Boolean))];
      let origUsersMap = {};
      if (origAuthorIds.length) {
        const { data: oUsers } = await db.from('users').select('id, username, name, color, avatar_url').in('id', origAuthorIds);
        (oUsers || []).forEach(u => { origUsersMap[u.id] = u; });
      }
      const origMap = {};
      (origRows || []).forEach(q => { q.users = origUsersMap[q.user_id] || null; origMap[q.id] = q; });
      pokeets.forEach(p => { if (p.repost_of_id && !p.quote_id) p._original = origMap[p.repost_of_id] || null; });
    }

    // Busca perfis Pokeet de todos os autores (inclui citados)
    const allAuthorIds = [...new Set([
      ...authorIds,
      ...pokeets.map(p => p.quoted?.user_id).filter(Boolean),
      ...pokeets.map(p => p._original?.user_id).filter(Boolean)
    ])];
    if (typeof pkFetchProfiles === 'function') await pkFetchProfiles(allAuthorIds);

    _pk.feed = pokeets;
    // Atualiza o timestamp mais recente visto (para o polling)
    if (pokeets.length) {
      _pkLatestSeenAt = pokeets[0].created_at || null;
    }
    pkHideNewBanner();

    // Buscar likes e contagens em paralelo
    const ids = pokeets.map(p => p.id);
    const [{ data: myLikes }, { data: likeCounts }, { data: replyCounts }, { data: repostCounts }] = await Promise.all([
      db.from('pokeet_likes').select('pokeet_id').eq('user_id', currentUser.id).in('pokeet_id', ids),
      db.from('pokeet_likes').select('pokeet_id').in('pokeet_id', ids),
      db.from('pokeets').select('reply_to_id').in('reply_to_id', ids),
      db.from('pokeets').select('repost_of_id').in('repost_of_id', ids).is('quote_id', null),
    ]);

    const likedSet   = new Set((myLikes     || []).map(l => l.pokeet_id));
    const likeMap    = {};  (likeCounts   || []).forEach(l => { likeMap[l.pokeet_id]   = (likeMap[l.pokeet_id]   || 0) + 1; });
    const replyMap   = {};  (replyCounts  || []).forEach(r => { replyMap[r.reply_to_id] = (replyMap[r.reply_to_id] || 0) + 1; });
    const repostMap  = {};  (repostCounts || []).forEach(r => { repostMap[r.repost_of_id] = (repostMap[r.repost_of_id] || 0) + 1; });

    // Verificar quais o usuário repostou
    const { data: myReposts } = await db.from('pokeets').select('repost_of_id').eq('user_id', currentUser.id).in('repost_of_id', ids).is('quote_id', null);
    const repostedSet = new Set((myReposts || []).map(r => r.repost_of_id));

    const renderedCards = pokeets
      .filter(p => !(p.repost_of_id && !p.quote_id && !p._original))
      .map(p => pkRenderCard(p, likedSet, likeMap, replyMap, repostMap, repostedSet)).join('');
    container.innerHTML = renderedCards || '<div class="pk-thread-empty">Nenhum Pokeet para exibir.</div>';

    // Carregar tendências
    pkLoadTrends(pokeets);
    // Inicia polling em segundo plano
    pkStartPolling();

  } catch(e) {
    console.error('Pokeets error:', e);
    container.innerHTML = `<div class="pk-thread-empty">Erro ao carregar Pokeets.<br>${e.message || ''}</div>`;
  }
}

// ── Polling de novos Pokeets em segundo plano ─────────────
let _pkPollInterval  = null;
let _pkLatestSeenAt  = null; // ISO string do pokeet mais recente visto

function pkStartPolling() {
  pkStopPolling();
  // Registra o pokeet mais recente ao iniciar o polling
  if (_pk.feed && _pk.feed.length) {
    _pkLatestSeenAt = _pk.feed[0]?.created_at || null;
  }
  _pkPollInterval = setInterval(pkPollNewPokeets, 30000); // a cada 30s
}

function pkStopPolling() {
  if (_pkPollInterval) { clearInterval(_pkPollInterval); _pkPollInterval = null; }
}

async function pkPollNewPokeets() {
  // Só faz polling se a aba Pokeets estiver visível e não for a aba Tendências
  const feedEl = document.getElementById('pokeets-feed');
  if (!feedEl || feedEl.style.display === 'none') return;
  if (_pk.tab === 'trends') return;
  if (!currentUser) return;

  try {
    let q = db.from('pokeets').select('created_at').is('reply_to_id', null).order('created_at', { ascending: false }).limit(1);
    if (_pk.tab === 'following') {
      const { data: follows } = await db.from('follows').select('following_id').eq('follower_id', currentUser.id);
      const userIds = (follows || []).map(f => f.following_id);
      if (!userIds.length) return;
      q = q.in('user_id', userIds);
    }
    const { data } = await q;
    if (!data || !data.length) return;

    const newestAt = data[0].created_at;
    if (_pkLatestSeenAt && newestAt > _pkLatestSeenAt) {
      pkShowNewBanner();
    }
  } catch(e) {
    // silencioso — polling não deve quebrar a interface
  }
}

function pkShowNewBanner() {
  const banner = document.getElementById('pk-new-banner');
  if (banner) banner.style.display = 'block';
}

function pkHideNewBanner() {
  const banner = document.getElementById('pk-new-banner');
  if (banner) banner.style.display = 'none';
}

async function pkLoadNewPokeets() {
  pkHideNewBanner();
  // Scroll suave para o topo antes de recarregar
  const feedEl = document.getElementById('pokeets-feed');
  if (feedEl) feedEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await renderPokeets();
  // Após renderizar, atualiza o timestamp mais recente visto
  if (_pk.feed && _pk.feed.length) {
    _pkLatestSeenAt = _pk.feed[0]?.created_at || null;
  }
}


function pkRenderCard(p, likedSet, likeMap, replyMap, repostMap, repostedSet, isThread) {
  if (!p) return '';
  // Se p.users vier null (ex: RLS bloqueando users) mas há snapshot do autor, constrói objeto mínimo
  if (!p.users) {
    if (p.author_handle || p.author_name) {
      p.users = { id: p.user_id, username: p.author_handle || '', name: p.author_name || '', color: p.author_color || '#e53935', avatar_url: null };
    } else {
      return '';
    }
  }

  // Se o pokeet tem snapshot do autor, usa ele; caso contrário aplica perfil atual
  let u;
  if (p.author_handle) {
    // Nome/handle/cor: snapshot fixo do momento da publicação
    // Avatar: ao vivo do perfil exato pelo handle — mas nunca vaza para outro perfil
    const _snapHandle = (p.author_handle || '').toLowerCase();
    let liveAvatar;
    if (p.user_id === currentUser?.id) {
      // Próprio usuário: busca pelo handle exato em _pkMyProfiles
      const matchProf = _pkMyProfiles.find(x => x.handle?.toLowerCase() === _snapHandle);
      if (matchProf) {
        liveAvatar = matchProf.avatar_url || null;      // perfil Pokeet encontrado
      } else {
        liveAvatar = p.users.avatar_url || null;        // publicado com perfil principal
      }
    } else {
      // Outro usuário: busca pelo índice user_id:handle
      const matchProf = _pkProfilesMap[p.user_id + ':' + _snapHandle];
      liveAvatar = matchProf ? (matchProf.avatar_url || null) : (p.users.avatar_url || null);
    }
    u = {
      ...p.users,
      name:         p.author_name   || p.users.name     || p.users.username,
      username:     p.author_handle || p.users.username,
      avatar_color: p.author_color  || p.users.avatar_color || p.users.color || '#e53935',
      color:        p.author_color  || p.users.color || '#e53935',
      avatar_url:   liveAvatar,
    };
  } else {
    // Post antigo sem snapshot — aplica perfil atual (comportamento legado)
    if (typeof pkApplyProfile === 'function') {
      p = { ...p, users: pkApplyProfile(p.users) };
      if (p.quoted && p.quoted.users) p = { ...p, quoted: { ...p.quoted, users: pkApplyProfile(p.quoted.users) } };
    }
    u = p.users;
  }
  const isRepost = !!p.repost_of_id && !p.quote_id;
  const isQuote  = !!p.quote_id;
  const isPinned = !!p.pinned;

  // Para reposts simples: repostador é 'u', autor original vem de p._original
  let reposterName = u.name || u.username || '';
  // Guarda o ID do repost ANTES do swap, para que o delete apague o repost e não o original
  const _repostOwnId   = isRepost ? p.id       : null;
  const _repostOwnerId = isRepost ? p.user_id  : null;
  if (isRepost && p._original) {
    // Substitui 'u' pelo autor original para renderizar o card
    const orig = p._original;
    const origU = orig.users || {};
    u = {
      ...origU,
      name:         orig.author_name   || origU.name     || origU.username || '?',
      username:     orig.author_handle || origU.username || '?',
      avatar_color: orig.author_color  || origU.color || '#e53935',
      color:        orig.author_color  || origU.color || '#e53935',
      avatar_url:   origU.avatar_url || null,
    };
    // Texto e id do pokeet original (para likes/replies/ações)
    p = { ...p, text: orig.text, id: orig.id, created_at: orig.created_at, _repostCard: true, _reposterId: p.user_id };
  }

  // Calculado APÓS o swap de p.id para que usem o ID correto (original, não o repost)
  // Para repost: isOwn = false (não é dono do original), mas _isRepostOwner = true se for dono do repost
  const isOwn          = p._repostCard ? false : (p.user_id === currentUser.id);
  const _isRepostOwner = _repostOwnerId === currentUser.id;
  const liked    = likedSet   ? likedSet.has(p.id)   : false;
  const _activeProfColor = pkEffectiveUser()?.avatar_color || pkEffectiveUser()?.color || currentUser?.color || '#e53935';
  const pkLikeColor = liked ? _activeProfColor : 'none';
  // Detecta hashtags Pride no texto (normalizado para ignorar acentos)
  const _textNorm = normalizeTag(p.text || '');
  const _prideRx  = /#(pridemonth|mesdoorgulho|lgbt\+?|lgbtq\+?|lgbtqia\+?)/i;
  const isPride   = _prideRx.test(_textNorm);
  const reposted = repostedSet? repostedSet.has(p.id) : false;
  const likes    = likeMap    ? (likeMap[p.id]    || 0) : (p._likes    || 0);
  const replies  = replyMap   ? (replyMap[p.id]   || 0) : (p._replies  || 0);
  const reposts  = repostMap  ? (repostMap[p.id]  || 0) : (p._reposts  || 0);
  const color    = u.avatar_color || u.color || '#e53935';

  let pinnedLabel = isPinned ? `<div class="pk-pinned-label">📌 Pokeet fixado</div>` : '';
  let repostLabel = isRepost ? `<div class="pk-card-repost-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>${esc(reposterName)} repostou</div>` : '';

  let quoteHtml = '';
  if (isQuote && p.quoted) {
    const q = p.quoted;
    const qu = q.users || {};
    const qColor = qu.color || '#e53935';
    quoteHtml = `<div class="pk-repost-quote" onclick="event.stopPropagation();pkOpenThread('${q.id}')">
      <div class="pk-repost-quote-header">
        ${pkAvatar(qu, 20)}
        <span class="pk-rq-name">${esc(qu.name || qu.username || '')}</span>
        <span class="pk-rq-user">@${esc(qu.username || '')}</span>
      </div>
      <div class="pk-rq-text">${pkFormatText(q.text)}</div>
    </div>`;
  }

  const avatarHtml = u.avatar_url
    ? `<div class="pk-card-avatar" style="background:${color};overflow:hidden"><img src="${esc(u.avatar_url)}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${initials(u.username||'?')}';this.parentElement.style.fontSize='15px'"></div>`
    : `<div class="pk-card-avatar" style="background:${color};font-size:15px">${initials(u.username||'?')}</div>`;

  const _menuDropId = _isRepostOwner ? _repostOwnId : p.id;
  const menuHtml = isOwn
    ? `<div class="pk-menu" style="flex-shrink:0;margin-left:auto">
    <button class="pk-menu-btn" onclick="event.stopPropagation();pkToggleMenu('${p.id}')" title="Opções">···</button>
    <div class="pk-dropdown" id="pkdrop-${p.id}">
      <div class="pk-dd-item" onclick="pkTogglePin('${p.id}',${isPinned})">${isPinned ? '📌 Desafixar' : '📌 Fixar'} Pokeet</div>
      <div class="pk-dd-item danger" onclick="pkDelete('${p.id}',event)">🗑 Apagar Pokeet</div>
    </div>
  </div>`
    : _isRepostOwner
    ? `<div class="pk-menu" style="flex-shrink:0;margin-left:auto">
    <button class="pk-menu-btn" onclick="event.stopPropagation();pkToggleMenu('${_menuDropId}')" title="Opções">···</button>
    <div class="pk-dropdown" id="pkdrop-${_menuDropId}">
      <div class="pk-dd-item danger" onclick="pkDeleteRepost('${_repostOwnId}',event)">🔁 Desfazer repost</div>
    </div>
  </div>`
    : '';

  return `<div class="pokeet-card${isPinned?' pk-card-pinned':''}" id="pkcard-${p.id}" onclick="pkOpenThread('${p.id}')" style="flex-direction:column;gap:0">
    ${pinnedLabel}${repostLabel}
    <div style="display:flex;gap:12px">
    ${avatarHtml}
    <div class="pk-card-body">
      <div class="pk-card-header">
        <span class="pk-card-name" onclick="event.stopPropagation();showUserProfile('${esc(u.username)}')">${esc(u.name || u.username)}</span>
        <span class="pk-card-user">@${esc(u.username)}</span>
        <span class="pk-card-time">${pkTimeAgo(p.created_at)}</span>
      </div>
      <div class="pk-card-text" onclick="event.stopPropagation()">${pkFormatText(p.text)}</div>
      ${quoteHtml}
      <div class="pk-actions">
        <button class="pk-action-btn" onclick="event.stopPropagation();pkOpenThread('${p.id}')" title="Responder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          ${replies > 0 ? replies : ''}
        </button>
        <button class="pk-action-btn${reposted?' reposted':''}" id="pkbtn-repost-${p.id}" onclick="event.stopPropagation();pkOpenRepost('${p.id}')" title="Repostar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          ${reposts > 0 ? reposts : ''}
        </button>
        <button class="pk-action-btn${liked?(isPride?' liked-pride':' liked'):''}" id="pkbtn-like-${p.id}" onclick="event.stopPropagation();pkToggleLike('${p.id}')" title="Curtir" data-pride="${isPride?'1':'0'}"${liked&&!isPride?` style="color:${_activeProfColor}"`:''}>
          ${isPride ? `
          <span class="pk-pride-heart-wrap${liked?' popping':''}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${liked?'url(#pk-pride-flag-grad)':'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            <span class="pk-pride-heart-fill${liked?' filling':''}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="url(#pk-pride-flag-grad)" stroke="url(#pk-pride-flag-grad)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            </span>
          </span>${likes > 0 ? `<span style="color:#8e8e8e"> ${likes}</span>` : ''}` : `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${liked?_activeProfColor:'none'}" stroke="${liked?_activeProfColor:'currentColor'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          ${likes > 0 ? likes : ''}`}
        </button>
        ${menuHtml}
      </div>
    </div>
    </div>
  </div>`;
}

// ── Submit Pokeet ─────────────────────────────────────────
async function submitPokeet() {
  if (!currentUser) return;
  const input = document.getElementById('pokeet-text');
  const text  = input.value.trim();
  if (!text) return;
  const btn = document.getElementById('pokeet-btn-post');
  btn.disabled = true; btn.textContent = 'Publicando...';

  const _au = (typeof pkEffectiveUser === 'function') ? pkEffectiveUser() : currentUser;
  const _authorSnap = {
    author_name:   _au.name     || _au.username || '',
    author_handle: _au.username || '',
    author_color:  _au.avatar_color || _au.color || '#e53935',
    author_avatar: _au.avatar_url || null,
  };
  const { error } = await db.from('pokeets').insert({ user_id: currentUser.id, text, ..._authorSnap });
  btn.textContent = 'Pokeet';
  if (error) { toast('Erro ao publicar: ' + error.message); btn.disabled = false; return; }
  input.value = '';
  input.style.height = 'auto';
  pkCharRing('pkc-ring-fill', 'pkc-char-count', 0, 280);
  btn.disabled = true;
  toast('Pokeet publicado! 💭');
  await renderPokeets();
}

// ── Toggle like ───────────────────────────────────────────
async function pkToggleLike(pokeetId) {
  if (!currentUser) return;
  const btn = document.getElementById('pkbtn-like-' + pokeetId);
  if (!btn) return;
  const isPride  = btn.dataset.pride === '1';
  const isLiked  = btn.classList.contains('liked') || btn.classList.contains('liked-pride');

  // Atualiza contador otimisticamente (antes de remodelar o DOM)
  const currentCount = parseInt(btn.textContent.replace(/\D/g,'')) || 0;
  const newCount = isLiked ? Math.max(0, currentCount - 1) : currentCount + 1;

  if (isPride) {
    // ── Coração arco-íris ────────────────────────────────
    const wrap = btn.querySelector('.pk-pride-heart-wrap');
    const fill = btn.querySelector('.pk-pride-heart-fill');
    const outlineSvg = wrap ? wrap.querySelector(':scope > svg') : null;

    if (isLiked) {
      // Descurtir
      btn.classList.remove('liked-pride');
      if (fill)      { fill.classList.remove('filling'); fill.style.opacity = '0'; }
      if (outlineSvg){ outlineSvg.setAttribute('stroke','currentColor'); }
      if (wrap)      { wrap.classList.remove('popping'); }
      // Pequena animação de "deflate"
      btn.style.transform = 'scale(0.85)';
      setTimeout(() => btn.style.transform = 'scale(1)', 180);
    } else {
      // Curtir com animação arco-íris
      btn.classList.add('liked-pride');
      if (outlineSvg){ outlineSvg.setAttribute('stroke','url(#pk-pride-flag-grad)'); }
      if (wrap) {
        wrap.classList.remove('popping');
        // Força reflow para reiniciar animação
        void wrap.offsetWidth;
        wrap.classList.add('popping');
      }
      if (fill) {
        fill.classList.remove('filling');
        void fill.offsetWidth;
        fill.classList.add('filling');
        fill.style.opacity = '1';
      }
    }

    // Atualiza número sem desmontar a estrutura pride
    // Remove texto avulso e spans de contador anteriores, depois recoloca
    Array.from(btn.childNodes)
      .filter(n => n.nodeType === 3 || (n.nodeType === 1 && n.dataset && n.dataset.likeCount))
      .forEach(n => n.remove());
    if (newCount > 0) {
      const countSpan = document.createElement('span');
      countSpan.dataset.likeCount = '1';
      countSpan.style.color = '#8e8e8e';
      countSpan.textContent = ' ' + newCount;
      btn.append(countSpan);
    }

  } else {
    // ── Coração normal (cor do perfil) ───────────────────
    btn.style.transform = 'scale(1.35)';
    setTimeout(() => btn.style.transform = 'scale(1)', 200);

    if (isLiked) {
      btn.classList.remove('liked');
      btn.style.color = '';
      btn.querySelector('svg').setAttribute('fill', 'none');
      btn.querySelector('svg').setAttribute('stroke', 'currentColor');
    } else {
      btn.classList.add('liked');
      const _activeProf = pkActiveProfile();
      const _likeColor = (_activeProf?.color) || pkEffectiveUser()?.avatar_color || currentUser.color || '#e53935';
      btn.style.color = _likeColor;
      btn.querySelector('svg').setAttribute('fill', _likeColor);
      btn.querySelector('svg').setAttribute('stroke', _likeColor);
    }
    // Atualiza contador
    const svg = btn.querySelector('svg');
    btn.innerHTML = '';
    btn.appendChild(svg);
    if (newCount > 0) btn.append(document.createTextNode(' ' + newCount));
  }

  // ── DB ───────────────────────────────────────────────────
  if (isLiked) {
    await db.from('pokeet_likes').delete().eq('user_id', currentUser.id).eq('pokeet_id', pokeetId);
    await db.from('notifications').delete()
      .eq('type', 'pokeet_like')
      .eq('post_id', pokeetId)
      .eq('actor_id', currentUser.id);
  } else {
    await db.from('pokeet_likes').upsert({ user_id: currentUser.id, pokeet_id: pokeetId }, { onConflict: 'user_id,pokeet_id' });
    try {
      const { data: pkRow } = await db.from('pokeets').select('user_id').eq('id', pokeetId).maybeSingle();
      if (pkRow && pkRow.user_id !== currentUser.id) {
        const { data: existingNotif } = await db.from('notifications')
          .select('id').eq('type', 'pokeet_like').eq('actor_id', currentUser.id)
          .eq('user_id', pkRow.user_id).eq('post_id', pokeetId).maybeSingle();
        if (!existingNotif) {
          await db.from('notifications').insert({
            user_id:  pkRow.user_id,
            actor_id: currentUser.id,
            type:     'pokeet_like',
            post_id:  pokeetId,
            read:     false
          });
        }
      }
    } catch(e) { console.warn('pkToggleLike notif:', e); }
  }
}

// ── Thread (replies) ──────────────────────────────────────
async function pkOpenThread(pokeetId) {
  if (!pokeetId) return;
  _pk.threadTarget = pokeetId;
  const content = document.getElementById('pk-thread-content');
  const title   = document.getElementById('pk-thread-title');
  if (!content) return;
  content.innerHTML = '<div class="pk-thread-empty">Carregando...</div>';
  openModal('modal-pokeet-thread');
  pkRenderComposerAvatar();

  try {
    // Busca pokéet raiz (sem join para evitar conflito de múltiplas FKs)
    const { data: root } = await db.from('pokeets').select('*').eq('id', pokeetId).maybeSingle();
    if (!root) { content.innerHTML = '<div class="pk-thread-empty">Pokeet não encontrado.</div>'; return; }

    // Busca usuário do root
    const { data: rootUser } = await db.from('users').select('id, username, name, color, avatar_url').eq('id', root.user_id).maybeSingle();
    root.users = rootUser || null;

    // Busca pokéet citado separadamente
    if (root.quote_id) {
      const { data: quotedRow } = await db.from('pokeets').select('id, text, created_at, user_id').eq('id', root.quote_id).maybeSingle();
      if (quotedRow) {
        const { data: qUser } = await db.from('users').select('id, username, name, color, avatar_url').eq('id', quotedRow.user_id).maybeSingle();
        quotedRow.users = qUser || null;
        root.quoted = quotedRow;
      }
    }

    // Busca respostas
    const { data: replies } = await db.from('pokeets').select('*').eq('reply_to_id', pokeetId).order('created_at', { ascending: true });
    // Busca usuários das respostas
    const replyAuthorIds = [...new Set((replies || []).map(r => r.user_id).filter(Boolean))];
    if (replyAuthorIds.length) {
      const { data: replyUsers } = await db.from('users').select('id, username, name, color, avatar_url').in('id', replyAuthorIds);
      const ruMap = {};
      (replyUsers || []).forEach(u => { ruMap[u.id] = u; });
      (replies || []).forEach(r => { r.users = ruMap[r.user_id] || null; });
    }

    // Curtidas do usuário
    const allIds = [root.id, ...(replies||[]).map(r=>r.id)];
    const [{ data: myLikes }, { data: likeCounts }] = await Promise.all([
      db.from('pokeet_likes').select('pokeet_id').eq('user_id', currentUser.id).in('pokeet_id', allIds),
      db.from('pokeet_likes').select('pokeet_id').in('pokeet_id', allIds),
    ]);
    const likedSet = new Set((myLikes || []).map(l => l.pokeet_id));
    const likeMap  = {};  (likeCounts || []).forEach(l => { likeMap[l.pokeet_id] = (likeMap[l.pokeet_id]||0)+1; });

    if (title) title.textContent = root.users?.username ? `@${root.users.username}` : 'Pokeet';

    content.innerHTML = `
      <div class="pk-thread-root">
        ${pkRenderCard(root, likedSet, likeMap, null, null, null, true)}
      </div>
      <div class="pk-thread-replies">
        ${(replies || []).length === 0
          ? '<div class="pk-thread-empty">Nenhuma resposta ainda. Seja o primeiro!</div>'
          : (replies || []).map(r => {
            // Avatar ao vivo pelo handle exato — nome/cor/handle fixos do snapshot
            const _rHandle = (r.author_handle || r.users?.username || '').toLowerCase();
            let rLiveAvatar;
            if (r.user_id === currentUser?.id) {
              const rMatchProf = _pkMyProfiles.find(x => x.handle?.toLowerCase() === _rHandle);
              rLiveAvatar = rMatchProf ? (rMatchProf.avatar_url || null) : (r.users?.avatar_url || null);
            } else {
              const rMatchProf = _pkProfilesMap[r.user_id + ':' + _rHandle];
              rLiveAvatar = rMatchProf ? (rMatchProf.avatar_url || null) : (r.users?.avatar_url || null);
            }
            const rColor  = r.author_color  || r.users?.color || '#e53935';
            const rName   = r.author_name   || r.users?.name  || r.users?.username || '';
            const rHandle = r.author_handle || r.users?.username || '';
            return `
            <div class="pk-thread-reply">
              ${rLiveAvatar
                ? `<div class="pk-card-avatar" style="width:36px;height:36px;background:${rColor};flex-shrink:0;overflow:hidden"><img src="${esc(rLiveAvatar)}" alt=""></div>`
                : `<div class="pk-card-avatar" style="width:36px;height:36px;background:${rColor};font-size:12px;flex-shrink:0">${initials(rHandle||'?')}</div>`
              }
              <div class="pk-card-body">
                <div class="pk-card-header">
                  <span class="pk-card-name">${esc(rName)}</span>
                  <span class="pk-card-user">@${esc(rHandle||'')}</span>
                  <span class="pk-card-time">${pkTimeAgo(r.created_at)}</span>
                </div>
                <div class="pk-card-text" onclick="event.stopPropagation()">${pkFormatText(r.text)}</div>
                <div class="pk-actions">
                  ${(()=>{ const _rPride = /\#(pridemonth|mesdoorgulho|lgbt\+?|lgbtq\+?|lgbtqia\+?)/i.test(normalizeTag(r.text||'')); const _rLiked = likedSet.has(r.id); const _rColor = pkEffectiveUser()?.avatar_color||pkEffectiveUser()?.color||currentUser?.color||'#e53935'; const _rIsOwn = r.user_id === currentUser.id; return `<button class="pk-action-btn${_rLiked?(_rPride?' liked-pride':' liked'):''}" id="pkbtn-like-${r.id}" onclick="pkToggleLike('${r.id}')" data-pride="${_rPride?'1':'0'}"${_rLiked&&!_rPride?` style="color:${_rColor}"`:''}>
                    ${_rPride ? `<span class="pk-pride-heart-wrap${_rLiked?' popping':''}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${_rLiked?'url(#pk-pride-flag-grad)':'currentColor'}" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg><span class="pk-pride-heart-fill${_rLiked?' filling':''}"><svg width="15" height="15" viewBox="0 0 24 24" fill="url(#pk-pride-flag-grad)" stroke="url(#pk-pride-flag-grad)" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></span></span>` : `<svg width="15" height="15" viewBox="0 0 24 24" fill="${_rLiked?_rColor:'none'}" stroke="${_rLiked?_rColor:'currentColor'}" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`}
                    ${(likeMap[r.id]||0) > 0 ? likeMap[r.id] : ''}
                  </button>${_rIsOwn ? `<div class="pk-menu" style="flex-shrink:0;margin-left:auto"><button class="pk-menu-btn" onclick="event.stopPropagation();pkToggleMenu('reply-${r.id}')" title="Opções">···</button><div class="pk-dropdown" id="pkdrop-reply-${r.id}"><div class="pk-dd-item danger" onclick="event.stopPropagation();pkDeleteReply('${r.id}')">🗑 Apagar resposta</div></div></div>` : ''}`; })()}
                </div>
              </div>
            </div>`;}).join('')
        }
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="pk-thread-empty">Erro ao carregar thread: ${e.message}</div>`;
  }
}

async function submitPokeetReply() {
  if (!currentUser || !_pk.threadTarget) return;
  const input = document.getElementById('pk-reply-text');
  const text  = input.value.trim();
  if (!text) return;
  const btn = document.getElementById('pk-reply-btn');
  btn.disabled = true; btn.textContent = 'Enviando...';

  const _au = (typeof pkEffectiveUser === 'function') ? pkEffectiveUser() : currentUser;
  const _authorSnap = {
    author_name:   _au.name     || _au.username || '',
    author_handle: _au.username || '',
    author_color:  _au.avatar_color || _au.color || '#e53935',
    author_avatar: _au.avatar_url || null,
  };
  const { error } = await db.from('pokeets').insert({
    user_id: currentUser.id, text, reply_to_id: _pk.threadTarget, ..._authorSnap
  });
  btn.textContent = 'Responder'; btn.disabled = false;
  if (error) { toast('Erro ao responder: ' + error.message); return; }
  input.value = ''; input.style.height = 'auto';
  pkCharRing('pkc-ring-fill-reply', 'pkc-char-count-reply', 0, 280);
  btn.disabled = true;
  toast('Resposta enviada! 💬');
  await pkOpenThread(_pk.threadTarget);
}

// ── Repost ────────────────────────────────────────────────
async function pkOpenRepost(pokeetId) {
  if (!currentUser) return;
  // Se já repostou, desfaz direto sem abrir modal
  const { data: existing } = await db.from('pokeets').select('id').eq('user_id', currentUser.id).eq('repost_of_id', pokeetId).is('quote_id', null).maybeSingle();
  if (existing) {
    await db.from('pokeets').delete().eq('id', existing.id);
    toast('Repost desfeito.');
    await renderPokeets();
    return;
  }
  _pk.repostTarget = pokeetId;
  document.getElementById('pk-quote-compose-area').style.display = 'none';
  document.getElementById('pk-quote-text').value = '';
  document.getElementById('pk-quote-preview').style.display = 'none';
  openModal('modal-pokeet-repost');
  pkRenderComposerAvatar();
}

async function pkRepostSimple() {
  if (!currentUser || !_pk.repostTarget) return;
  const btn = document.getElementById('pk-repost-simple-btn');
  btn.disabled = true;
  // Toggle: se já repostou, remove
  const { data: existing } = await db.from('pokeets').select('id').eq('user_id', currentUser.id).eq('repost_of_id', _pk.repostTarget).is('quote_id', null).maybeSingle();
  if (existing) {
    await db.from('pokeets').delete().eq('id', existing.id);
    toast('Repost removido.');
  } else {

  const _au = (typeof pkEffectiveUser === 'function') ? pkEffectiveUser() : currentUser;
  const _authorSnap = {
    author_name:   _au.name     || _au.username || '',
    author_handle: _au.username || '',
    author_color:  _au.avatar_color || _au.color || '#e53935',
    author_avatar: _au.avatar_url || null,
  };
    const { error } = await db.from('pokeets').insert({ user_id: currentUser.id, repost_of_id: _pk.repostTarget, text: '', ..._authorSnap });
    if (error) { toast('Erro ao repostar.'); btn.disabled = false; return; }
    toast('Repostado! 🔁');
  }
  closeModal('modal-pokeet-repost');
  btn.disabled = false;
  await renderPokeets();
}

function pkOpenQuoteCompose() {
  const area = document.getElementById('pk-quote-compose-area');
  area.style.display = 'flex';
  area.style.flexDirection = 'column';
  // Show preview of original pokéet
  const target = _pk.feed.find(p => p.id === _pk.repostTarget);
  if (target) {
    const preview = document.getElementById('pk-quote-preview');
    const u = target.users || {};
    preview.innerHTML = `
      <div class="pk-repost-quote-header">
        ${pkAvatar(u, 20)}
        <span class="pk-rq-name">${esc(u.name || u.username || '')}</span>
        <span class="pk-rq-user">@${esc(u.username||'')}</span>
      </div>
      <div class="pk-rq-text">${pkFormatText(target.text)}</div>`;
    preview.style.display = 'block';
  }
  document.getElementById('pk-quote-text').focus();
}

async function submitPokeetQuote() {
  if (!currentUser || !_pk.repostTarget) return;
  const input = document.getElementById('pk-quote-text');
  const text  = input.value.trim();
  const btn   = document.getElementById('pk-quote-btn');
  btn.disabled = true; btn.textContent = 'Publicando...';

  const _au = (typeof pkEffectiveUser === 'function') ? pkEffectiveUser() : currentUser;
  const _authorSnap = {
    author_name:   _au.name     || _au.username || '',
    author_handle: _au.username || '',
    author_color:  _au.avatar_color || _au.color || '#e53935',
    author_avatar: _au.avatar_url || null,
  };
  const { error } = await db.from('pokeets').insert({
    user_id: currentUser.id,
    text,
    repost_of_id: _pk.repostTarget,
    quote_id: _pk.repostTarget,
    ..._authorSnap
  });
  btn.textContent = 'Citar'; btn.disabled = false;
  if (error) { toast('Erro ao citar: ' + error.message); return; }
  closeModal('modal-pokeet-repost');
  toast('Pokeet citado! ✏️');
  await renderPokeets();
}

// ── Pin / Delete ──────────────────────────────────────────
function pkToggleMenu(pokeetId) {
  document.querySelectorAll('.pk-dropdown').forEach(d => {
    if (d.id !== 'pkdrop-' + pokeetId) d.classList.remove('open');
  });
  document.getElementById('pkdrop-' + pokeetId)?.classList.toggle('open');
  // Fecha ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', function closer() {
      document.querySelectorAll('.pk-dropdown').forEach(d => d.classList.remove('open'));
      document.removeEventListener('click', closer);
    });
  }, 10);
}

async function pkTogglePin(pokeetId, isPinned) {
  document.querySelectorAll('.pk-dropdown').forEach(d => d.classList.remove('open'));
  if (!isPinned) {
    // Desfixa todos antes de fixar o novo
    await db.from('pokeets').update({ pinned: false }).eq('user_id', currentUser.id).eq('pinned', true);
  }
  const { error } = await db.from('pokeets').update({ pinned: !isPinned }).eq('id', pokeetId);
  if (error) { toast('Erro ao ' + (isPinned ? 'desafixar' : 'fixar') + '.'); return; }
  toast(isPinned ? 'Pokeet desafixado.' : 'Pokeet fixado! 📌');
  await renderPokeets();
}

async function pkDelete(pokeetId, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  document.querySelectorAll('.pk-dropdown').forEach(d => d.classList.remove('open'));
  if (!confirm('Apagar este Pokeet?')) return;
  // Apaga reposts simples que apontem para este pokeet (cascata)
  await db.from('pokeets').delete().eq('repost_of_id', pokeetId).is('quote_id', null);
  const { error } = await db.from('pokeets').delete().eq('id', pokeetId);
  if (error) { toast('Erro ao apagar.'); return; }
  toast('Pokeet apagado.');
  await renderPokeets();
}

// Apaga apenas o repost (não o pokeet original)
async function pkDeleteRepost(repostId, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  document.querySelectorAll('.pk-dropdown').forEach(d => d.classList.remove('open'));
  const { error } = await db.from('pokeets').delete().eq('id', repostId).eq('user_id', currentUser.id);
  if (error) { toast('Erro ao desfazer repost.'); return; }
  toast('Repost desfeito.');
  await renderPokeets();
}

async function pkDeleteReply(replyId) {
  document.querySelectorAll('.pk-dropdown').forEach(d => d.classList.remove('open'));
  if (!confirm('Apagar esta resposta?')) return;
  const { error } = await db.from('pokeets').delete().eq('id', replyId).eq('user_id', currentUser.id);
  if (error) { toast('Erro ao apagar.'); return; }
  toast('Resposta apagada.');
  await pkOpenThread(_pk.threadTarget);
}

// ── Tabs ──────────────────────────────────────────────────
function pkSwitchTab(btn, tab, skipSync) {
  document.querySelectorAll('.pkTab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _pk.tab = tab;
  pkHideNewBanner();
  pkStopPolling();

  const feedEl   = document.getElementById('pokeets-feed');
  const trendsEl = document.getElementById('pokeets-trends-mobile');

  if (tab === 'trends') {
    if (feedEl)   feedEl.style.display   = 'none';
    if (trendsEl) {
      trendsEl.style.display = 'block';
      // skipSync=true quando pkSearchHashtag vai preencher o conteúdo logo em seguida
      if (!skipSync) {
        const src = document.getElementById('pokeets-trends');
        if (src && src.innerHTML.trim()) {
          trendsEl.innerHTML = src.innerHTML;
        } else if (_pk.feed && _pk.feed.length) {
          // Fallback: reconstrói tendências a partir do feed em memória
          pkLoadTrends(_pk.feed);
        }
      }
    }
  } else {
    if (feedEl)   feedEl.style.display   = '';
    if (trendsEl) trendsEl.style.display = 'none';
    renderPokeets();
  }
}

// ── Trends ────────────────────────────────────────────────
function pkLoadTrends(pokeets) {
  const container = document.getElementById('pokeets-trends');
  if (!container) return;

  // Agrupa por tag normalizada (sem acentos), guarda a variante original mais usada
  const tagCount   = {}; // normKey → count
  const tagDisplay = {}; // normKey → variante original mais frequente
  const tagOrigFreq = {}; // normKey:orig → count (para eleger o display)

  (pokeets || []).forEach(p => {
    const matches = (p.text || '').match(/#([^\s#<&]+)/g) || [];
    matches.forEach(m => {
      const orig = m.slice(1);
      const key  = normalizeTag(orig);
      tagCount[key] = (tagCount[key] || 0) + 1;
      const origKey = key + ':' + orig.toLowerCase();
      tagOrigFreq[origKey] = (tagOrigFreq[origKey] || 0) + 1;
      // Atualiza display para a variante original mais frequente
      if (!tagDisplay[key] || tagOrigFreq[origKey] > tagOrigFreq[key + ':' + tagDisplay[key].toLowerCase()]) {
        tagDisplay[key] = orig;
      }
    });
  });

  const sorted = Object.entries(tagCount).sort((a,b) => b[1]-a[1]).slice(0, 5);
  if (!sorted.length) {
    container.innerHTML = '<div style="font-size:13px;color:#aaa;font-family:\'Nunito\',sans-serif">Nenhuma hashtag ainda.</div>';
  } else {
    container.innerHTML = sorted.map(([normKey, count]) => {
      const displayTag = tagDisplay[normKey] || normKey;
      return `
      <div class="pk-trend-item" onclick="pkSearchHashtag('${esc(displayTag)}')">
        <div class="pk-trend-cat">Pokémon · Tendência</div>
        <div class="pk-trend-tag">#${esc(displayTag)}</div>
        <div class="pk-trend-count">${count} Pokeet${count>1?'s':''}</div>
      </div>`;
    }).join('');
  }
  // Sincroniza com o painel mobile (aba Tendências) se estiver visível
  const mobile = document.getElementById('pokeets-trends-mobile');
  if (mobile && mobile.style.display !== 'none') {
    mobile.innerHTML = container.innerHTML;
  }
}

async function pkSearchHashtag(tag) {
  // Normaliza: remove # inicial, gera versão sem acentos
  const rawTag   = tag.replace(/^#/, '');
  const normTag  = normalizeTag(rawTag);   // sem acentos, minúsculo
  const cleanTag = rawTag;                 // preserva acentos para exibição no título

  // Se estiver no Feed (não na aba Tendências), muda para Tendências primeiro
  if (_pk.tab !== 'trends') {
    const trendsBtn = document.querySelector('.pkTab[onclick*="trends"]');
    if (trendsBtn) pkSwitchTab(trendsBtn, 'trends', true);
  }

  // Exibe o feed de hashtag no painel de Tendências mobile
  const mobileEl = document.getElementById('pokeets-trends-mobile');
  if (!mobileEl) return;

  // Header com botão de voltar + título da tag
  mobileEl.innerHTML = `
    <div class="pk-hashtag-feed-header">
      <button class="pk-hashtag-back-btn" onclick="pkHashtagBack()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="pk-hashtag-feed-title">#${esc(cleanTag)}</div>
    </div>
    <div id="pk-hashtag-feed-list"><div class="pk-loading">${[1,2,3].map(() => `
      <div class="pk-skeleton">
        <div class="pk-skel-avatar"></div>
        <div class="pk-skel-body">
          <div class="pk-skel-line" style="width:40%"></div>
          <div class="pk-skel-line" style="width:90%"></div>
          <div class="pk-skel-line" style="width:60%"></div>
        </div>
      </div>`).join('')}</div></div>`;

  try {
    // Monta variantes para busca: original + sem acentos (deduplica se iguais)
    const variants = [...new Set([rawTag, normTag])];

    // Busca paralela para cada variante e une os resultados
    const queries = variants.map(v =>
      db.from('pokeets')
        .select('*')
        .ilike('text', `%#${v}%`)
        .is('reply_to_id', null)
        .order('created_at', { ascending: false })
        .limit(40)
    );
    const results = await Promise.all(queries);

    // Une resultados, deduplica por id, filtra pelo normalizado client-side
    const allRows = results.flatMap(r => r.data || []);
    const seenIds = new Set();
    const pokeets = allRows.filter(p => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      // Confirma que o texto contém a tag normalizada (evita falsos positivos do ilike)
      const textNorm = normalizeTag(p.text || '');
      return textNorm.includes('#' + normTag);
    });

    const listEl = document.getElementById('pk-hashtag-feed-list');
    if (!listEl) return;

    if (!pokeets.length) {
      listEl.innerHTML = `<div class="pk-thread-empty">Nenhum Pokeet com #${esc(cleanTag)} ainda.</div>`;
      return;
    }

    // Ordena por data decrescente após merge
    pokeets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Busca autores
    const authorIds = [...new Set(pokeets.map(p => p.user_id).filter(Boolean))];
    const { data: usersData } = await db.from('users').select('id, username, name, color, avatar_url, rpg').in('id', authorIds);
    const usersMap = {};
    (usersData || []).forEach(u => { usersMap[u.id] = u; });
    pokeets.forEach(p => { p.users = usersMap[p.user_id] || null; });

    // Busca perfis Pokeet
    if (typeof pkFetchProfiles === 'function') await pkFetchProfiles(authorIds);

    // Likes e contagens
    const ids = pokeets.map(p => p.id);
    const [{ data: myLikes }, { data: likeCounts }, { data: replyCounts }, { data: repostCounts }] = await Promise.all([
      db.from('pokeet_likes').select('pokeet_id').eq('user_id', currentUser.id).in('pokeet_id', ids),
      db.from('pokeet_likes').select('pokeet_id').in('pokeet_id', ids),
      db.from('pokeets').select('reply_to_id').in('reply_to_id', ids),
      db.from('pokeets').select('repost_of_id').in('repost_of_id', ids).is('quote_id', null),
    ]);

    const likedSet  = new Set((myLikes     || []).map(l => l.pokeet_id));
    const likeMap   = {}; (likeCounts   || []).forEach(l => { likeMap[l.pokeet_id]    = (likeMap[l.pokeet_id]    || 0) + 1; });
    const replyMap  = {}; (replyCounts  || []).forEach(r => { replyMap[r.reply_to_id] = (replyMap[r.reply_to_id] || 0) + 1; });
    const repostMap = {}; (repostCounts || []).forEach(r => { repostMap[r.repost_of_id] = (repostMap[r.repost_of_id] || 0) + 1; });

    const { data: myReposts } = await db.from('pokeets').select('repost_of_id').eq('user_id', currentUser.id).in('repost_of_id', ids).is('quote_id', null);
    const repostedSet = new Set((myReposts || []).map(r => r.repost_of_id));

    listEl.innerHTML = pokeets
      .filter(p => p.users)
      .map(p => pkRenderCard(p, likedSet, likeMap, replyMap, repostMap, repostedSet))
      .join('');

  } catch(e) {
    const listEl = document.getElementById('pk-hashtag-feed-list');
    if (listEl) listEl.innerHTML = `<div class="pk-thread-empty">Erro ao buscar pokeets.<br>${e.message || ''}</div>`;
  }
}

function pkHashtagBack() {
  // Volta para a listagem de tendências
  const mobileEl = document.getElementById('pokeets-trends-mobile');
  const src = document.getElementById('pokeets-trends');
  if (mobileEl && src) mobileEl.innerHTML = src.innerHTML;
}

// ── SQL para criar as tabelas (exibido no console) ────────
// Execute isso no SQL Editor do Supabase:
/*
CREATE TABLE IF NOT EXISTS pokeets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text           TEXT NOT NULL DEFAULT '',
  reply_to_id    UUID REFERENCES pokeets(id) ON DELETE CASCADE,
  repost_of_id   UUID REFERENCES pokeets(id) ON DELETE SET NULL,
  quote_id       UUID REFERENCES pokeets(id) ON DELETE SET NULL,
  pinned         BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  -- Snapshot do autor no momento da publicação
  author_name    TEXT,
  author_handle  TEXT,
  author_color   TEXT,
  author_avatar  TEXT
);

-- Para tabelas já existentes, rode:
-- ALTER TABLE pokeets ADD COLUMN IF NOT EXISTS author_name   TEXT;
-- ALTER TABLE pokeets ADD COLUMN IF NOT EXISTS author_handle TEXT;
-- ALTER TABLE pokeets ADD COLUMN IF NOT EXISTS author_color  TEXT;
-- ALTER TABLE pokeets ADD COLUMN IF NOT EXISTS author_avatar TEXT;

CREATE TABLE IF NOT EXISTS pokeet_likes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pokeet_id  UUID NOT NULL REFERENCES pokeets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, pokeet_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pokeets_user_id    ON pokeets(user_id);
CREATE INDEX IF NOT EXISTS idx_pokeets_reply_to   ON pokeets(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_pokeets_repost_of  ON pokeets(repost_of_id);
CREATE INDEX IF NOT EXISTS idx_pokeets_created_at ON pokeets(created_at DESC);

-- RLS
ALTER TABLE pokeets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokeet_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pokeets_select" ON pokeets      FOR SELECT USING (true);
CREATE POLICY "pokeets_insert" ON pokeets      FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pokeets_update" ON pokeets      FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pokeets_delete" ON pokeets      FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "pokeet_likes_select" ON pokeet_likes FOR SELECT USING (true);
CREATE POLICY "pokeet_likes_insert" ON pokeet_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pokeet_likes_delete" ON pokeet_likes FOR DELETE USING (auth.uid() = user_id);
*/
