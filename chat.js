// ════════════════════════════════════════════════════════════
// CHAT — Mensagens diretas
// ════════════════════════════════════════════════════════════

/* ══════════════════════════════════════════════════════════
   POKÉGRAM — Sistema de Chat
   Requer: Supabase já inicializado como `db` e `currentUser`
══════════════════════════════════════════════════════════ */

const _chat = {
  open:          false,
  windowOpen:    false,
  currentPeer:   null,
  conversations: [],
  messages:      [],
  unreadCount:   0,
  realtimeSub:   null,
  loadingConvos: false,
  replyTo:       null,
};

function _chatAvatarHTML(user, size) {
  size = size || 42;
  const s = 'width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+(user.avatar_color||'#e53935')+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:'+Math.round(size*0.38)+'px;font-weight:800;overflow:hidden;flex-shrink:0;';
  const initial = (user.display_name || user.username || '?').charAt(0).toUpperCase();
  if (user.avatar_url) {
    return '<div style="'+s+'"><img src="'+user.avatar_url+'" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'"></div>';
  }
  return '<div style="'+s+'">'+initial+'</div>';
}

function _chatFormatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  const diffH   = Math.floor((now - d) / 3600000);
  const diffD   = Math.floor((now - d) / 86400000);
  if (diffMin < 1)  return 'agora';
  if (diffMin < 60) return diffMin + 'min';
  if (diffH   < 24) return diffH + 'h';
  if (diffD   < 7)  return diffD + 'd';
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
}

function _chatMsgTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

function _escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _chatSetNavBadge(n) {
  _chat.unreadCount = n;
  const badge = document.getElementById('chat-nav-badge');
  if (badge) badge.style.display = n > 0 ? 'block' : 'none';
}

// ── Abrir / fechar painel ────────────────────────────────
function toggleChatPanel() {
  _chat.open ? closeChatPanel() : openChatPanel();
}

async function openChatPanel() {
  if (!currentUser) return;
  _chat.open = true;
  document.getElementById('chat-panel').classList.add('open');
  document.getElementById('chat-backdrop').style.display = 'block';
  if (typeof closeNotifPanel === 'function') closeNotifPanel();
  await chatLoadConversations();
  chatSubscribeRealtime();
}

function closeChatPanel() {
  _chat.open = false;
  closeChatWindow();
  document.getElementById('chat-panel').classList.remove('open');
  document.getElementById('chat-backdrop').style.display = 'none';
}

// ── Carregar lista de conversas ──────────────────────────
async function chatLoadConversations() {
  if (_chat.loadingConvos) return;
  _chat.loadingConvos = true;
  const loadEl = document.getElementById('chat-convos-loading');
  const listEl = document.getElementById('chat-conversations');
  if (loadEl) loadEl.style.display = 'block';

  try {
    const { data: msgs, error } = await db
      .from('messages')
      .select('*')
      .or('sender_id.eq.'+currentUser.username+',receiver_id.eq.'+currentUser.username)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const convMap = {};
    for (const m of (msgs || [])) {
      const peer = m.sender_id === currentUser.username ? m.receiver_id : m.sender_id;
      if (!convMap[peer]) convMap[peer] = { peer, lastMsg: m, unread: 0 };
      if (!m.read && m.receiver_id === currentUser.username) convMap[peer].unread++;
    }

    const peers = Object.keys(convMap);
    let usersMap = {};
    if (peers.length > 0) {
      const { data: users } = await db.from('users').select('id,username,name,color,avatar_url').in('username', peers);
      (users || []).forEach(u => { usersMap[u.username] = u; });
    }

    _chat.conversations = Object.values(convMap).sort((a,b) => new Date(b.lastMsg.created_at) - new Date(a.lastMsg.created_at));
    _chatSetNavBadge(_chat.conversations.reduce((s,c) => s + c.unread, 0));

    if (loadEl) loadEl.style.display = 'none';

    if (_chat.conversations.length === 0) {
      listEl.innerHTML = '<div class="chat-empty"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><div>Nenhuma conversa ainda</div><div style="font-size:11px;color:#bbb">Visite um perfil e clique em "Mensagem"</div></div>';
      return;
    }

    listEl.innerHTML = '';
    for (const conv of _chat.conversations) {
      const u    = usersMap[conv.peer] || { username: conv.peer, name: conv.peer, color: '#e53935' };
      u.avatar_color = u.avatar_color || u.color || '#e53935';
      u.display_name = u.display_name || u.name || u.username;
      const name = u.display_name || u.username;
      const isMe = conv.lastMsg.sender_id === currentUser.username;
      const rawContent = conv.lastMsg.meta_type === 'story_reply' ? `💬 Story: ${conv.lastMsg.content||''}` :
                         conv.lastMsg.meta_type === 'post_share'  ? '📤 Post compartilhado' :
                         conv.lastMsg.content;
      const preview = (isMe ? 'Você: ' : '') + rawContent;
      const item = document.createElement('div');
      item.className = 'chat-convo-item';
      item.dataset.peer = conv.peer;
      item.innerHTML =
        _chatAvatarHTML(u, 42) +
        '<div class="chat-convo-info">' +
          '<div class="chat-convo-name">'+_escHtml(name)+'</div>' +
          '<div class="chat-convo-preview'+(conv.unread>0?' unread':'')+'">'+_escHtml(preview.substring(0,40))+(preview.length>40?'…':'')+'</div>' +
        '</div>' +
        '<div class="chat-convo-meta">' +
          '<span class="chat-convo-time">'+_chatFormatTime(conv.lastMsg.created_at)+'</span>' +
          (conv.unread > 0 ? '<br><span class="chat-unread-badge">'+conv.unread+'</span>' : '') +
        '</div>';
      item.onclick = () => chatOpenWindow(u);
      listEl.appendChild(item);
    }
  } catch(e) {
    console.error('Chat: erro ao carregar conversas', e);
    if (loadEl) loadEl.textContent = 'Erro ao carregar. Tente novamente.';
  } finally {
    _chat.loadingConvos = false;
  }
}

// ── Abrir conversa individual ────────────────────────────
async function chatOpenWindow(peerUser) {
  _chat.currentPeer = peerUser;
  _chat.windowOpen  = true;

  const winAv = document.getElementById('chat-win-avatar');
  winAv.style.background = peerUser.avatar_color || '#e53935';
  if (peerUser.avatar_url) {
    winAv.innerHTML = '<img src="'+peerUser.avatar_url+'" style="width:100%;height:100%;object-fit:cover">';
  } else {
    winAv.textContent = (peerUser.display_name || peerUser.username || '?').charAt(0).toUpperCase();
  }
  document.getElementById('chat-win-username').textContent = peerUser.display_name || peerUser.username;
  document.getElementById('chat-window').classList.add('open');
  document.getElementById('chat-messages').innerHTML = '<div class="chat-msgs-loading">Carregando...</div>';

  await chatLoadMessages();
  await chatMarkRead();
  document.getElementById('chat-msg-input').focus();
}

function closeChatWindow() {
  _chat.windowOpen  = false;
  _chat.currentPeer = null;
  document.getElementById('chat-window').classList.remove('open');
  document.getElementById('chat-messages').innerHTML = '';
}

// ── Carregar mensagens ───────────────────────────────────
async function chatLoadMessages() {
  if (!_chat.currentPeer) return;
  const peer = _chat.currentPeer.username, me = currentUser.username;

  const { data, error } = await db
    .from('messages')
    .select('*')
    .or('and(sender_id.eq.'+me+',receiver_id.eq.'+peer+'),and(sender_id.eq.'+peer+',receiver_id.eq.'+me+')')
    .order('created_at', { ascending: true });

  if (error) {
    document.getElementById('chat-messages').innerHTML = '<div class="chat-msgs-loading">Erro ao carregar mensagens.</div>';
    return;
  }
  _chat.messages = data || [];
  chatRenderMessages();
}

function chatRenderMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  if (_chat.messages.length === 0) {
    container.innerHTML = '<div class="chat-empty"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><div>Comece a conversa!</div></div>';
    return;
  }

  container.innerHTML = '';
  let lastDate = '';
  for (const msg of _chat.messages) {
    const isSent = msg.sender_id === currentUser.username;

    // Separador de data
    const msgDate = new Date(msg.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
    if (msgDate !== lastDate) {
      lastDate = msgDate;
      const sep = document.createElement('div');
      sep.className = 'chat-date-sep';
      sep.textContent = msgDate;
      container.appendChild(sep);
    }

    const row = document.createElement('div');
    row.className = 'chat-msg-row ' + (isSent ? 'sent' : 'received');
    row.id = 'chat-msg-' + msg.id;

    // Wrapper bolha + horário (sem mini-avatar)
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg-wrap';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    const mtype = msg.meta_type || '';

    // preview de reply
    if (msg.reply_to_id) {
      const isSent = msg.sender_id === currentUser.username;
      const replyDiv = document.createElement('div');
      replyDiv.style.cssText = `display:flex;flex-direction:column;gap:2px;margin:-8px -12px 8px -12px;padding:7px 12px 8px;background:${isSent ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.10)'};border-radius:14px 14px 0 0;border-bottom:1px solid ${isSent ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'};cursor:pointer`;
      const senderLabel = msg.reply_sender ? _escHtml(msg.reply_sender) : '';
      const previewText = msg.reply_preview ? _escHtml(msg.reply_preview) : '<em style="opacity:.6">Mensagem</em>';
      replyDiv.innerHTML = `${senderLabel ? `<div style="font-size:10px;font-weight:800;color:${isSent ? 'rgba(255,255,255,0.9)' : 'var(--user-color,#e53935)'};letter-spacing:.2px">${senderLabel}</div>` : ''}<div style="font-size:11px;color:${isSent ? 'rgba(255,255,255,0.7)' : '#555'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${previewText}</div>`;
      replyDiv.onclick = () => {
        const orig = document.getElementById('chat-msg-' + msg.reply_to_id);
        if (orig) { orig.scrollIntoView({ behavior:'smooth', block:'center' }); orig.style.background='rgba(0,149,246,.1)'; setTimeout(()=>orig.style.background='',1200); }
      };
      bubble.appendChild(replyDiv);
    }

    if (mtype === 'story_reply') {
      bubble.className += ' chat-bubble-rich';
      const storyDiv = document.createElement('div');
      const isEmoji = msg.content && /^\p{Emoji}/u.test(msg.content.trim()) && msg.content.trim().length <= 4;
      const hasText = msg.content && !isEmoji;
      if (isEmoji) bubble.classList.add('chat-bubble-story-emoji');
      const previewRadius = hasText ? '14px 14px 0 0' : '14px';
      const emojiSide = isSent ? 'left:0;transform:translate(-50%,50%)' : 'right:0;transform:translate(50%,50%)';
      storyDiv.innerHTML = `
        <div style="position:relative;display:inline-block;">
          <div class="chat-story-preview" style="border-radius:${previewRadius}" onclick="openStoryViewer('${_escHtml(msg.meta_ref_id||msg.sender_id||'')}')">
            ${msg.meta_img
              ? `<img src="${_escHtml(msg.meta_img)}" style="width:100%;height:100%;object-fit:cover;display:block">`
              : `<div style="width:100%;height:100%;background:#222;display:flex;align-items:center;justify-content:center;color:#888;font-size:11px">Story</div>`}
            <div class="chat-story-label">
              <span style="display:flex;align-items:center;gap:4px;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg>
                Story
              </span>
            </div>
          </div>
          ${isEmoji ? `<span style="position:absolute;bottom:0;${emojiSide};font-size:39px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5));pointer-events:none;z-index:2">${_escHtml(msg.content.trim())}</span>` : ''}
        </div>
        ${hasText ? `<div class="chat-rich-text">${_escHtml(msg.content)}</div>` : ''}`;
      bubble.appendChild(storyDiv);
    } else if (mtype === 'post_share') {
      bubble.className += ' chat-bubble-rich';
      const postDiv = document.createElement('div');
      postDiv.innerHTML = `
        <div class="chat-post-preview" onclick="openComments('${_escHtml(msg.meta_ref_id||'')}')">
          ${msg.meta_img
            ? `<img src="${_escHtml(msg.meta_img)}" style="width:100%;height:160px;object-fit:cover;display:block">`
            : `<div style="width:100%;height:80px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:24px">📸</div>`}
          <div class="chat-post-preview-info">
            ${msg.meta_author ? `<div style="font-weight:700;font-size:12px;margin-bottom:2px;color:#1a1a1a">@${_escHtml(msg.meta_author)}</div>` : ''}
            ${msg.meta_caption ? `<div style="font-size:12px;color:#444;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${_escHtml(msg.meta_caption)}</div>` : ''}
          </div>
        </div>`;
      bubble.appendChild(postDiv);
    } else {
      const textNode = document.createTextNode(msg.content);
      bubble.appendChild(textNode);
    }

    const time = document.createElement('div');
    time.className = 'chat-msg-time';
    time.textContent = _chatMsgTime(msg.created_at);

    // monta hierarquia: wrap → bubble + time
    wrap.appendChild(bubble);
    wrap.appendChild(time);

    // botão responder (aparece no hover via CSS)
    const replyBtn = document.createElement('button');
    replyBtn.className = 'chat-reply-btn';
    replyBtn.title = 'Responder';
    replyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>';
    replyBtn.onclick = () => chatSetReply(msg);
    row.appendChild(wrap);
    row.appendChild(replyBtn);
    container.appendChild(row);
  }
  container.scrollTop = container.scrollHeight;
}

// ── Compartilhar post no chat ─────────────────────────────
async function sharePostToChat(postId, authorUsername, imageUrl, caption) {
  const peer = prompt('Enviar para (username):');
  if (!peer || !peer.trim()) return;
  const peerUsername = peer.trim().toLowerCase();
  if (peerUsername === currentUser.username) { toast('Você não pode enviar para si mesmo.'); return; }
  const { data: peerUser } = await db.from('users').select('id,username,name,color,avatar_url').eq('username', peerUsername).maybeSingle();
  if (!peerUser) { toast('Usuário não encontrado.'); return; }
  const { error } = await db.from('messages').insert({
    sender_id:    currentUser.username,
    receiver_id:  peerUsername,
    content:      '',
    meta_type:    'post_share',
    meta_ref_id:  postId,
    meta_img:     imageUrl || null,
    meta_caption: (caption || '').substring(0, 60),
    meta_author:  authorUsername || null,
    read:         false
  });
  if (error) { toast('Erro ao compartilhar.'); return; }
  toast(`Post enviado para @${peerUsername}! 📤`);
  await openChatPanel();
  await chatOpenWindow(peerUser);
}

// ── Enviar mensagem ──────────────────────────────────────
function chatSetReply(msg) {
  _chat.replyTo = msg;
  const preview  = document.getElementById('chat-reply-preview');
  const nameEl   = document.getElementById('chat-reply-name');
  const textEl   = document.getElementById('chat-reply-text');
  if (preview) preview.style.display = 'flex';
  if (nameEl)  nameEl.textContent  = msg.sender_id === currentUser.username ? 'Você' : msg.sender_id;
  if (textEl)  textEl.textContent  = msg.content || '';
  document.getElementById('chat-msg-input')?.focus();
}

function chatCancelReply() {
  _chat.replyTo = null;
  const preview = document.getElementById('chat-reply-preview');
  if (preview) preview.style.display = 'none';
}

async function chatSendMessage() {
  if (!currentUser || !_chat.currentPeer) return;
  const input   = document.getElementById('chat-msg-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';

  const me = currentUser.username, peer = _chat.currentPeer.username;
  const replyData = _chat.replyTo ? { reply_to_id: _chat.replyTo.id, reply_preview: _chat.replyTo.content?.slice(0,80), reply_sender: _chat.replyTo.sender_id } : {};
  chatCancelReply();

  const tempMsg = { id:'temp_'+Date.now(), sender_id:me, receiver_id:peer, content, read:false, created_at:new Date().toISOString(), ...replyData };
  _chat.messages.push(tempMsg);
  chatRenderMessages();

  const { data, error } = await db.from('messages').insert({ sender_id:me, receiver_id:peer, content, read:false, ...replyData }).select().single();
  if (error) {
    console.error('Chat: erro ao enviar', error);
    _chat.messages = _chat.messages.filter(m => m.id !== tempMsg.id);
    chatRenderMessages();
    if (typeof showToast === 'function') showToast('Erro ao enviar mensagem.');
    return;
  }
  const idx = _chat.messages.findIndex(m => m.id === tempMsg.id);
  if (idx !== -1) _chat.messages[idx] = data;
  chatRenderMessages();
}

// ── Marcar como lidas ────────────────────────────────────
async function chatMarkRead() {
  if (!currentUser || !_chat.currentPeer) return;
  await db.from('messages').update({ read:true }).eq('receiver_id', currentUser.username).eq('sender_id', _chat.currentPeer.username).eq('read', false);
  await chatRefreshUnreadBadge();
}

async function chatRefreshUnreadBadge() {
  if (!currentUser) return;
  const { count } = await db.from('messages').select('*', { count:'exact', head:true }).eq('receiver_id', currentUser.username).eq('read', false);
  _chatSetNavBadge(count || 0);
}

// ── Realtime ─────────────────────────────────────────────
function chatSubscribeRealtime() {
  if (_chat.realtimeSub || !currentUser) return;
  _chat.realtimeSub = db
    .channel('chat_messages')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:'receiver_id=eq.'+currentUser.username }, payload => {
      const msg = payload.new;
      if (_chat.windowOpen && _chat.currentPeer?.username === msg.sender_id) {
        _chat.messages.push(msg);
        chatRenderMessages();
        chatMarkRead();
      } else {
        _chatSetNavBadge(_chat.unreadCount + 1);
        if (_chat.open) chatLoadConversations();
      }
    })
    .subscribe();
}

// ── Iniciar conversa a partir de um perfil ───────────────
async function chatStartConversation(peerUsername) {
  if (!currentUser || peerUsername === currentUser.username) return;
  const { data: peerUser } = await db.from('users').select('id,username,name,color,avatar_url').eq('username', peerUsername).maybeSingle();
  if (!peerUser) { toast('Usuário não encontrado.'); return; }
  if (!peerUser.avatar_color) peerUser.avatar_color = peerUser.color;
  if (!peerUser.display_name)  peerUser.display_name  = peerUser.name || peerUser.username;
  await openChatPanel();
  await chatOpenWindow(peerUser);
}

// ════════════════════════════════════════════════════════
// POKÉETS — lógica completa
// ════════════════════════════════════════════════════════

