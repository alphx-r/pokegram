// ════════════════════════════════════════════════════════════
// STORIES — Editor e visualizador de stories
// ════════════════════════════════════════════════════════════

// ── Stories ───────────────────────────────────────────────
let _storyPendingFile = null;
let _storyViewList    = [];
let _storyViewIdx     = 0;
let _storyTimer       = null;
let _storyViewOwnerId = null;

// ── Editor state ──────────────────────────────────────────
const _storyEd = {
  // imagem original (HTMLImageElement com src ObjectURL)
  img: null,
};

function showNewStory() {
  _storyPendingFile = null;
  if (_storyEd.img?.src) URL.revokeObjectURL(_storyEd.img.src);
  _storyEd.img = null;

  // Reset UI
  const ph  = document.getElementById('story-upload-placeholder');
  const cb  = document.getElementById('story-change-photo-btn');
  if (ph)  ph.style.display = 'flex';
  if (cb)  cb.style.display = 'none';

  // Reset snap text bar
  const snapBar    = document.getElementById('snap-text-bar');
  const snapEditor = document.getElementById('snap-text-editor');
  const snapInput  = document.getElementById('snap-text-input');
  const snapToggle = document.getElementById('snap-text-toggle-btn');
  const snapDisp   = document.getElementById('snap-text-display');
  if (snapBar)    snapBar.style.display    = 'none';
  if (snapEditor) snapEditor.style.display = 'none';
  if (snapInput)  snapInput.value          = '';
  if (snapDisp)   snapDisp.textContent     = '';
  if (snapToggle) snapToggle.style.display = 'none';

  // Garante modo normal visível
  const modeNormal = document.getElementById('story-mode-normal');
  if (modeNormal) modeNormal.style.display = 'block';

  openModal('modal-story-new');
  storyDrawCanvas();
  _snapInitDrag();
}


// Canvas para exportação — renderiza em 1080×1920
function storyDrawCanvas() {
  const canvas = document.getElementById('story-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = 1080, H = 1920;

  if (_storyEd.img) {
    const iw = _storyEd.img.naturalWidth || _storyEd.img.width;
    const ih = _storyEd.img.naturalHeight || _storyEd.img.height;
    const scale = Math.max(W / iw, H / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(_storyEd.img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, W, H);
  }
}

async function storyRenderFinal() {
  const canvas = document.getElementById('story-canvas');
  if (!canvas) return canvas;
  storyDrawCanvas();

  // Renderiza a faixa de texto no canvas, se houver
  const text = (document.getElementById('snap-text-input')?.value || '').trim();
  if (!text) return canvas;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const W = 1080, H = 1920;

  const modal   = document.getElementById('modal-story-new');
  const bar     = document.getElementById('snap-text-bar');
  const mh      = modal.offsetHeight || window.innerHeight;
  const barTop  = parseInt(bar.style.top) || 0;
  // Escala de px de tela → px do canvas
  const scale   = H / mh;

  const fontSize = Math.round(18 * scale);
  ctx.font      = `700 ${fontSize}px Nunito,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const lines   = text.split('\n');
  const lineH   = fontSize * 1.4;
  const padV    = Math.round(10 * scale);
  const totalH  = lines.length * lineH + padV * 2;
  const barY    = Math.round(barTop * scale);

  // Fundo preto semi-transparente
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, barY, W, totalH);

  // Texto branco
  ctx.fillStyle = '#ffffff';
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, barY + padV + i * lineH, W - 40);
  });

  return canvas;
}

// ── Faixa de texto estilo Snapchat ────────────────────────
let _snapDragging = false;

function snapTextToggle() {
  const bar    = document.getElementById('snap-text-bar');
  const editor = document.getElementById('snap-text-editor');
  const input  = document.getElementById('snap-text-input');
  if (!bar) return;
  const isVisible = bar.style.display !== 'none' || editor.style.display !== 'none';
  if (isVisible) {
    // Remove tudo
    bar.style.display    = 'none';
    editor.style.display = 'none';
    if (input) input.value = '';
    document.getElementById('snap-text-display').textContent = '';
  } else {
    // Posição inicial: ~68% da tela
    const modal = document.getElementById('modal-story-new');
    const mh = modal.offsetHeight || window.innerHeight;
    const top = Math.round(mh * 0.68) + 'px';
    bar.style.top    = top;
    editor.style.top = top;
    // Abre direto no editor
    snapTextEdit();
  }
}

function snapTextEdit() {
  const bar    = document.getElementById('snap-text-bar');
  const editor = document.getElementById('snap-text-editor');
  const input  = document.getElementById('snap-text-input');
  if (!editor) return;
  // Herda posição da barra
  if (bar && bar.style.top) editor.style.top = bar.style.top;
  bar.style.display    = 'none';
  editor.style.display = 'block';
  if (input) {
    // Auto-resize antes de focar
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    setTimeout(() => { input.focus(); }, 30);
  }
}

function snapTextSync() {
  const input = document.getElementById('snap-text-input');
  const disp  = document.getElementById('snap-text-display');
  if (disp && input) disp.textContent = input.value;
  // Auto-resize da textarea
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
}

function snapTextConfirm() {
  const editor = document.getElementById('snap-text-editor');
  const bar    = document.getElementById('snap-text-bar');
  const input  = document.getElementById('snap-text-input');
  if (!editor || editor.style.display === 'none') return;
  const text = input?.value?.trim() || '';
  if (!text) {
    editor.style.display = 'none';
    bar.style.display    = 'none';
    return;
  }
  bar.style.top = editor.style.top;
  document.getElementById('snap-text-display').textContent = input.value;
  editor.style.display = 'none';
  bar.style.display    = 'block';
}

function _snapInitDrag() {
  const bar   = document.getElementById('snap-text-bar');
  const modal = document.getElementById('modal-story-new');
  if (!bar || !modal) return;

  // Remove listeners anteriores
  if (bar._snapDragDown)  bar.removeEventListener('mousedown',  bar._snapDragDown);
  if (bar._snapDragTouch) bar.removeEventListener('touchstart', bar._snapDragTouch);

  let dragging = false, startY = 0, origTop = 0, moved = false;

  function getY(e) { return e.touches ? e.touches[0].clientY : e.clientY; }

  function onStart(e) {
    dragging = true; moved = false;
    startY   = getY(e);
    origTop  = parseInt(bar.style.top) || 0;
    bar.style.cursor = 'grabbing';
    // NÃO faz preventDefault aqui — deixa o click disparar normalmente se não mover
  }

  function onMove(e) {
    if (!dragging) return;
    const dy = getY(e) - startY;
    if (Math.abs(dy) > 5) {
      moved = true;
      const mh   = modal.offsetHeight || window.innerHeight;
      const bh   = bar.offsetHeight || 44;
      const newT = Math.max(0, Math.min(mh - bh, origTop + dy));
      bar.style.top = newT + 'px';
      const ed = document.getElementById('snap-text-editor');
      if (ed) ed.style.top = newT + 'px';
      e.preventDefault();
    }
  }

  function onEnd(e) {
    if (!dragging) return;
    dragging = false;
    bar.style.cursor = 'grab';
    // Se não moveu, abre editor (simula click)
    if (!moved) snapTextEdit();
  }

  bar._snapDragDown  = onStart;
  bar._snapDragTouch = onStart;

  bar.addEventListener('mousedown',  onStart);
  bar.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('mousemove',  onMove, { passive: false });
  modal.addEventListener('touchmove',   onMove, { passive: false });
  window.addEventListener('mouseup',    onEnd);
  window.addEventListener('touchend',   onEnd);
}


function previewStoryImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { toast('Imagem muito grande. Máximo 20MB.'); return; }
  openCropper(file, 'story', croppedFile => {
    _storyPendingFile = croppedFile;
    const url = URL.createObjectURL(croppedFile);
    const img = new Image();
    img.onload = () => {
      if (_storyEd.img?.src) URL.revokeObjectURL(_storyEd.img.src);
      _storyEd.img = img;
      const ph    = document.getElementById('story-upload-placeholder');
      const cb    = document.getElementById('story-change-photo-btn');
      if (ph)    ph.style.display = 'none';
      if (cb)    cb.style.display = 'block';

      // Mostra botão Aa
      const snapToggle = document.getElementById('snap-text-toggle-btn');
      if (snapToggle) snapToggle.style.display = 'block';

      storyDrawCanvas();
    };
    img.src = url;
  });
  input.value = '';
}

async function submitStory() {
  if (!_storyPendingFile) { toast('Adicione uma foto!'); return; }

  const btn = document.getElementById('story-publish-btn');
  if (btn) { btn.textContent = 'Publicando...'; btn.disabled = true; }

  try {
    const canvas = await storyRenderFinal();

    const blob = await new Promise((res, rej) => {
      try {
        canvas.toBlob(b => {
          if (b) { res(b); return; }
          // Brave com Shields ativo pode retornar null em toBlob — fallback via toDataURL
          try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8 = new Uint8Array(n);
            while (n--) u8[n] = bstr.charCodeAt(n);
            res(new Blob([u8], { type: mime }));
          } catch (fe) { rej(new Error('toBlob e toDataURL falharam: ' + fe.message)); }
        }, 'image/jpeg', 0.92);
      } catch (e) { rej(e); }
    });

    const path = `${currentUser.id}_${Date.now()}.jpg`;
    const { error: upErr } = await db.storage.from('stories').upload(path, blob, { upsert: false, contentType: 'image/jpeg' });
    if (upErr) throw upErr;

    const { data: urlData } = db.storage.from('stories').getPublicUrl(path);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await db.from('stories').insert({ user_id: currentUser.id, image_url: urlData.publicUrl, expires_at: expiresAt });
    if (error) throw error;

    _storyPendingFile = null;
    if (_storyEd.img?.src) URL.revokeObjectURL(_storyEd.img.src);
    _storyEd.img = null;
    closeModal('modal-story-new');
    await renderStories();
    toast('Story publicado! Disponível por 24h 🕐');
  } catch(e) {
    toast('Erro ao publicar: ' + (e.message || e));
  } finally {
    if (btn) { btn.textContent = 'Publicar'; btn.disabled = false; }
  }
}

// ── Story Viewer ──────────────────────────────────────────
async function openStoryViewer(userId) {
  // busca stories do usuário (não expirados)
  const { data: stories } = await db
    .from('stories')
    .select('*, users(id, username, color, avatar_url, is_npc)')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });

  if (!stories || !stories.length) { toast('Nenhum story disponível.'); return; }
  _storyViewList   = stories;
  _storyViewIdx    = 0;
  _storyViewOwnerId = userId;
  _storyPaused     = false;
  showStory(_storyViewIdx);
  document.getElementById('modal-story').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // atualiza URL para /usuario/stories
  const storyUsername = stories[0]?.users?.username;
  if (storyUsername) history.replaceState({ storyUserId: userId }, '', '/' + storyUsername + '/stories');
}

function showStory(idx) {
  clearTimeout(_storyTimer);
  const story = _storyViewList[idx];
  if (!story) { closeStoryViewer(); return; }
  const u = story.users || {};

  // imagem
  document.getElementById('sv-image').src = story.image_url;

  // avatar
  const avEl = document.getElementById('sv-avatar');
  avEl.innerHTML = u.avatar_url
    ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">`
    : `<div style="width:100%;height:100%;background:${u.color||'#e53935'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;font-family:'Nunito',sans-serif">${initials(u.username||'?')}</div>`;

  document.getElementById('sv-username').textContent = u.username || '?';
  document.getElementById('sv-time').textContent     = fmtTimeAgo(story.created_at) + ' atrás';

  // botão ... (só dono)
  const isOwn = u.id === currentUser.id;
  const moreWrap = document.getElementById('sv-more-wrap');
  if (moreWrap) {
    moreWrap.style.display = isOwn ? 'flex' : 'none';
    moreWrap.dataset.storyId = story.id;
    moreWrap.dataset.storyPath = new URL(story.image_url).pathname.split('/stories/')[1]?.split('?')[0] || '';
  }

  // botão de visualizações (só dono)
  const viewsBtn = document.getElementById('sv-views-btn');
  if (viewsBtn) {
    viewsBtn.style.display = isOwn ? 'flex' : 'none';
    viewsBtn.dataset.storyId = story.id;
    if (isOwn && story.id) {
      db.from('story_views').select('viewer_id', { count: 'exact' }).eq('story_id', story.id)
        .then(({ data, count, error }) => {
          const span = document.getElementById('sv-views-count');
          if (!span) return;
          if (error) { console.warn('story_views count error:', error); span.textContent = '0'; return; }
          const c = (typeof count === 'number') ? count : (data ? data.length : 0);
          span.textContent = c;
        }).catch(() => {});
    }
  }

  // barra de comentário (só para stories de outros)
  const commentBar = document.getElementById('sv-comment-bar');
  const commentAv  = document.getElementById('sv-comment-avatar');
  commentBar.style.display = isOwn ? 'none' : 'flex';
  if (!isOwn && commentAv) {
    if (currentUser.avatar_url) {
      commentAv.style.background = 'transparent';
      commentAv.innerHTML = `<img src="${currentUser.avatar_url}" style="width:100%;height:100%;object-fit:cover">`;
    } else {
      commentAv.style.background = currentUser.color || '#e53935';
      commentAv.textContent = initials(currentUser.username || '?');
    }
  }
  // salva username do dono do story para o envio
  commentBar.dataset.storyOwner = u.username || '';
  commentBar.dataset.storyId    = story.id || '';
  commentBar.dataset.storyImg   = story.image_url || '';
  // limpa o input
  const inp = document.getElementById('sv-comment-input');
  if (inp) inp.value = '';

  // reseta o botão de curtir
  const likeBtn  = document.getElementById('sv-like-btn');
  const likeIcon = document.getElementById('sv-like-icon');
  if (likeBtn && likeIcon) {
    likeBtn.dataset.liked = 'false';
    likeIcon.setAttribute('fill', 'none');
    likeIcon.setAttribute('stroke', '#fff');
    // verifica se já curtiu esse story
    if (!isOwn && story.id) {
      db.from('story_likes').select('id').eq('story_id', story.id).eq('user_id', currentUser.id).maybeSingle()
        .then(({ data }) => {
          if (data) {
            likeBtn.dataset.liked = 'true';
            const lc = currentUser.color || '#e53935';
            likeIcon.setAttribute('fill', lc);
            likeIcon.setAttribute('stroke', lc);
          }
        });
    }
  }

  // barras de progresso — uma por story do usuário
  const barWrap = document.getElementById('story-progress-bar');
  barWrap.innerHTML = _storyViewList.map((_, i) => `
    <div style="flex:1;height:3px;background:rgba(255,255,255,0.35);border-radius:2px;overflow:hidden">
      <div id="sp-${i}" style="height:100%;background:#fff;width:${i < idx ? '100%' : '0%'};transition:none"></div>
    </div>`).join('');

  requestAnimationFrame(() => {
    const activeFill = document.getElementById('sp-' + idx);
    if (activeFill) {
      activeFill.style.transition = 'width 5s linear';
      activeFill.style.width = '100%';
    }
  });
  _storyTimer = setTimeout(() => storyNav(1), 5000);

  // marca o story atual como visto imediatamente ao exibi-lo
  const _cur = _storyViewList[idx];
  if (_cur && _cur.users?.id && _cur.users.id !== currentUser.id) {
    db.from('story_views').upsert(
      { viewer_id: currentUser.id, owner_id: _cur.users.id, story_id: _cur.id, viewed_at: new Date().toISOString() },
      { onConflict: 'viewer_id,story_id' }
    ).then(({ error }) => {
      if (error) console.warn('Erro ao registrar visualização do story:', error);
    });
  }
}

async function storyNav(dir) {
  const cur = _storyViewList[_storyViewIdx];
  void cur; // mantido para compatibilidade

  const next = _storyViewIdx + dir;
  if (next < 0 || next >= _storyViewList.length) {
    closeStoryViewer();
    renderStories();
    return;
  }
  _storyViewIdx = next;
  showStory(_storyViewIdx);
}

function closeStoryViewer() {
  clearTimeout(_storyTimer);
  _storyPaused = false;
  const drop = document.getElementById('sv-menu-drop');
  if (drop) drop.style.display = 'none';
  const overlay = document.getElementById('sv-dark-overlay');
  if (overlay) overlay.style.display = 'none';
  const qr = document.getElementById('sv-quick-reactions');
  if (qr) qr.style.display = 'none';
  const rs = document.getElementById('sv-reply-sent');
  if (rs) { rs.style.display = 'none'; clearTimeout(rs._hideTimer); }
  document.getElementById('modal-story').style.display = 'none';
  document.body.style.overflow = '';
  // restaura URL anterior se estava em /usuario/stories
  // usa replaceState para não criar nova entrada no histórico
  // (pushState causava popstate ao reabrir o story, fechando-o imediatamente)
  if (window.location.pathname.endsWith('/stories')) {
    history.replaceState(null, '', '/');
  }
}

// ── Lista de quem visualizou o story (só dono) ───────────
async function openStoryViewersModal(e) {
  if (e) e.stopPropagation();
  const story = _storyViewList[_storyViewIdx];
  if (!story || !story.id) return;
  storyClearTimer();
  _storyPaused = true;

  const list = document.getElementById('sv-viewers-list');
  list.innerHTML = '<div style="text-align:center;padding:30px;color:#8e8e8e;font-family:\'Nunito\',sans-serif;font-size:13px">Carregando...</div>';
  document.getElementById('sv-viewers-modal').style.display = 'flex';

  const { data: views, error } = await db
    .from('story_views')
    .select('viewer_id, viewed_at, users:viewer_id(username, color, avatar_url)')
    .eq('story_id', story.id)
    .order('viewed_at', { ascending: false });

  if (error) {
    console.warn('story_views error:', error);
    list.innerHTML = '<div style="text-align:center;padding:30px;color:#8e8e8e;font-family:\'Nunito\',sans-serif;font-size:13px">Não foi possível carregar as visualizações.<br>Verifique se a coluna <code>story_id</code> existe em <code>story_views</code>.</div>';
    return;
  }

  if (!views || !views.length) {
    list.innerHTML = '<div style="text-align:center;padding:30px;color:#8e8e8e;font-family:\'Nunito\',sans-serif;font-size:13px">Ninguém visualizou este story ainda.</div>';
    return;
  }

  list.innerHTML = views.map(v => {
    const u = v.users || {};
    const pic = u.avatar_url
      ? `<div style="width:38px;height:38px;border-radius:50%;overflow:hidden;flex-shrink:0"><img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover"></div>`
      : `<div style="width:38px;height:38px;border-radius:50%;background:${u.color||'#e53935'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;font-family:'Nunito',sans-serif;flex-shrink:0">${initials(u.username||'?')}</div>`;
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 18px;cursor:pointer" onclick="closeStoryViewersModal();closeStoryViewer();showUserProfile('${u.username||''}')">
      ${pic}
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;color:#262626;font-family:'Nunito',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.username||'?'}</div>
      </div>
      <div style="font-size:11px;color:#8e8e8e;font-family:'Nunito',sans-serif;flex-shrink:0">${fmtTimeAgo(v.viewed_at)}</div>
    </div>`;
  }).join('');
}

function closeStoryViewersModal() {
  document.getElementById('sv-viewers-modal').style.display = 'none';
  _storyPaused = false;
  storyRestartTimer();
}

function svToggleMenu(e) {
  e.stopPropagation();
  const drop = document.getElementById('sv-menu-drop');
  if (!drop) return;
  const isOpen = drop.style.display === 'block';
  drop.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    // fecha ao clicar fora
    const handler = (ev) => {
      if (!drop.contains(ev.target) && ev.target.id !== 'sv-more-btn') {
        drop.style.display = 'none';
      }
      document.removeEventListener('click', handler);
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
  }
}

async function svMenuDelete() {
  document.getElementById('sv-menu-drop').style.display = 'none';
  await deleteCurrentStory();
}

async function deleteCurrentStory() {
  const wrap = document.getElementById('sv-more-wrap');
  const id   = wrap.dataset.storyId;
  const path = wrap.dataset.storyPath;
  if (!confirm('Apagar este story?')) return;
  if (path) await db.storage.from('stories').remove([path]);
  await db.from('stories').delete().eq('id', id);
  _storyViewList.splice(_storyViewIdx, 1);
  if (!_storyViewList.length) { closeStoryViewer(); await renderStories(); return; }
  if (_storyViewIdx >= _storyViewList.length) _storyViewIdx = _storyViewList.length - 1;
  showStory(_storyViewIdx);
  await renderStories();
  toast('Story apagado.');
}

// ── Story: pausar timer ao digitar ───────────────────────
function svCommentFocus(on) {
  const inp = document.getElementById('sv-comment-input');
  if (!inp) return;
  inp.style.background  = on ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)';
  inp.style.borderColor = on ? (getComputedStyle(document.documentElement).getPropertyValue('--user-color').trim() || 'rgba(255,255,255,0.7)') : 'var(--user-color, rgba(255,255,255,0.35))';
  // Overlay escuro 30% sobre o story
  const overlay = document.getElementById('sv-dark-overlay');
  if (overlay) overlay.style.display = on ? 'block' : 'none';
  // Quick reactions centralizadas
  const qr = document.getElementById('sv-quick-reactions');
  if (qr) qr.style.display = on ? 'flex' : 'none';
}

function storyClearTimer() {
  clearTimeout(_storyTimer);
  // também pausa a barra de progresso visual
  const fill = document.getElementById('sp-' + _storyViewIdx);
  if (fill) fill.style.animationPlayState = 'paused';
}

// ── Teclado: ← → para navegar, Space para pausar ─────────
let _storyPaused = false;
function _storyKeyHandler(e) {
  const modal = document.getElementById('modal-story');
  if (!modal || modal.style.display === 'none') return;
  // não intercepta se estiver digitando no input de comentário
  if (document.activeElement && document.activeElement.id === 'sv-comment-input') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); storyNav(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); storyNav(-1); }
  else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    const fill = document.getElementById('sp-' + _storyViewIdx);
    if (_storyPaused) {
      // retomar
      _storyPaused = false;
      if (fill) { fill.style.transition = 'width 5s linear'; fill.style.width = '100%'; }
      _storyTimer = setTimeout(() => storyNav(1), 5000);
    } else {
      // pausar
      _storyPaused = true;
      clearTimeout(_storyTimer);
      if (fill) {
        const computed = window.getComputedStyle(fill).width;
        const parentW  = fill.parentElement ? fill.parentElement.offsetWidth : 1;
        fill.style.transition = 'none';
        fill.style.width = computed;
        // congela no ponto atual
        void fill.offsetWidth;
      }
    }
  }
}
document.addEventListener('keydown', _storyKeyHandler);

function storyRestartTimer() {
  clearTimeout(_storyTimer);
  const fill = document.getElementById('sp-' + _storyViewIdx);
  if (fill) {
    fill.style.transition = 'width 5s linear';
    fill.style.width = '100%';
  }
  _storyTimer = setTimeout(() => storyNav(1), 5000);
}

// ── Story: enviar comentário como DM ─────────────────────

// ── Confirmação visual de resposta enviada (sobre o story) ──
function svShowReplySent(emoji, text) {
  const el    = document.getElementById('sv-reply-sent');
  const elEmoji = document.getElementById('sv-reply-sent-emoji');
  const elText  = document.getElementById('sv-reply-sent-text');
  if (!el) return;
  elEmoji.textContent = emoji;
  elText.textContent  = text;
  el.style.display    = 'flex';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 1800);
}

// ── Quick Reaction (story) ────────────────────────────────
async function storySendReaction(emoji) {
  const bar = document.getElementById('sv-comment-bar');
  if (!bar) return;
  const ownerUsername = bar.dataset.storyOwner;
  const effectiveSender = (typeof pkEffectiveUser === 'function' ? pkEffectiveUser() : null) || currentUser;
  if (!ownerUsername || ownerUsername === effectiveSender.username) return;

  // Animação no botão clicado
  document.querySelectorAll('.sv-react-btn').forEach(b => {
    if (b.textContent.trim() === emoji) {
      b.classList.remove('sv-react-sent');
      void b.offsetWidth;
      b.classList.add('sv-react-sent');
      setTimeout(() => b.classList.remove('sv-react-sent'), 400);
    }
  });

  const { error } = await db.from('messages').insert({
    sender_id:   effectiveSender.username,
    receiver_id: ownerUsername,
    content:     emoji,
    meta_type:   'story_reply',
    meta_ref_id: bar.dataset.storyId  || null,
    meta_img:    bar.dataset.storyImg || null,
    read:        false
  });

  if (error) { toast('Erro ao enviar reação.'); return; }

  // Fecha o painel de reações e o overlay escuro
  svCommentFocus(false);
  const inp = document.getElementById('sv-comment-input');
  if (inp) inp.blur();

  // Mostra confirmação sobre o story (não fecha o viewer)
  svShowReplySent(emoji, 'Reação enviada!');

  // Reinicia o timer do story
  storyRestartTimer();
}
async function storyToggleLike() {
  const bar = document.getElementById('sv-comment-bar');
  const btn = document.getElementById('sv-like-btn');
  const icon = document.getElementById('sv-like-icon');
  if (!bar || !btn || !icon) return;

  const ownerUsername = bar.dataset.storyOwner;
  const storyId       = bar.dataset.storyId;
  if (!ownerUsername || ownerUsername === currentUser.username) return;

  const isLiked = btn.dataset.liked === 'true';

  // Animação
  btn.style.transform = 'scale(1.35)';
  setTimeout(() => btn.style.transform = 'scale(1)', 200);

  if (isLiked) {
    // Descurtir
    btn.dataset.liked = 'false';
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', '#fff');
    await db.from('story_likes')
      .delete()
      .eq('story_id', storyId)
      .eq('user_id', currentUser.id);
  } else {
    // Curtir
    btn.dataset.liked = 'true';
    const likeColor = currentUser.color || '#e53935';
    icon.setAttribute('fill', likeColor);
    icon.setAttribute('stroke', likeColor);

    // Evita duplicata
    const { data: existing } = await db.from('story_likes')
      .select('id').eq('story_id', storyId).eq('user_id', currentUser.id).maybeSingle();
    if (!existing) {
      await db.from('story_likes').insert({ story_id: storyId, user_id: currentUser.id });
    }

    // Busca o user_id do dono para notificação
    const { data: ownerUser } = await db.from('users').select('id').eq('username', ownerUsername).maybeSingle();
    if (ownerUser) {
      // Evita notificação duplicada
      const { data: existingNotif } = await db.from('notifications')
        .select('id').eq('type', 'story_like').eq('actor_id', currentUser.id)
        .eq('user_id', ownerUser.id).eq('post_id', storyId).maybeSingle();
      if (!existingNotif) {
        await db.from('notifications').insert({
          user_id:  ownerUser.id,
          actor_id: currentUser.id,
          type:     'story_like',
          post_id:  storyId,
          read:     false
        });
      }
    }
    toast('❤️ Story curtido!');
  }
}

async function storySendComment() {
  const inp  = document.getElementById('sv-comment-input');
  const bar  = document.getElementById('sv-comment-bar');
  if (!inp || !bar) return;
  const text = inp.value.trim();
  if (!text) return;

  const ownerUsername = bar.dataset.storyOwner;
  const effectiveSender = (typeof pkEffectiveUser === 'function' ? pkEffectiveUser() : null) || currentUser;
  if (!ownerUsername || ownerUsername === effectiveSender.username) return;

  inp.value = '';
  inp.disabled = true;

  // Envia via tabela messages (mesmo sistema do chat)
  const { error } = await db.from('messages').insert({
    sender_id:   effectiveSender.username,
    receiver_id: ownerUsername,
    content:     text,
    meta_type:   'story_reply',
    meta_ref_id: bar.dataset.storyId   || null,
    meta_img:    bar.dataset.storyImg  || null,
    read:        false
  });

  inp.disabled = false;

  if (error) {
    toast('Erro ao enviar. Tente novamente.');
    console.error('storySendComment:', error);
    return;
  }

  toast('Mensagem enviada! 💬');

  // Fecha o painel de overlay e reinicia o timer
  svCommentFocus(false);
  inp.blur();

  // Mostra confirmação sobre o story (não fecha o viewer)
  svShowReplySent('💬', 'Mensagem enviada!');
  storyRestartTimer();
}

function expiresIn(isoStr) {
  const diff = Math.max(0, new Date(isoStr) - Date.now());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function selectPostEmoji(idx) {
  selectedPostEmoji = EMOJI_BG_OPTIONS[idx];
  document.querySelectorAll('.emoji-pick-btn').forEach((b, i) => b.classList.toggle('selected', i === idx));
  const area = document.getElementById('post-emoji-area');
  if (area) {
    area.style.background = selectedPostEmoji.bg;
    const existing = area.querySelector('.post-selected-preview');
    if (existing) existing.remove();
    const prev = document.createElement('div');
    prev.className = 'post-selected-preview';
    prev.textContent = selectedPostEmoji.emoji;
    area.insertBefore(prev, area.firstChild);
  }
}

