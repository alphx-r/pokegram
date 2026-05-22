/* ============================
   POKÉGRAM — app.js
   ============================ */

// ——— DATA ———
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

const LOCATIONS = [
  "Pallet Town","Cerulean City","Vermilion City","Lavender Town","Celadon City",
  "Fuchsia City","Cinnabar Island","Pewter City","Viridian Forest","Mt. Moon",
  "Safari Zone","Pokémon Tower","Silph Co.","Victory Road","Indigo Plateau"
];

const DEMO_USERS = {
  ash: {
    password: "pikachu",
    name: "Ash Ketchum",
    username: "ash",
    starter: "⚡ Pikachu",
    bio: "Quero ser o melhor, que nunca houve igual! 🏆\nTreinador de Pallet Town • Liga Pokémon",
    followers: 12847,
    following: 312,
    color: "#e53935"
  },
  misty: {
    password: "staryu",
    name: "Misty",
    username: "misty",
    starter: "💧 Squirtle",
    bio: "Líder do Ginásio de Cerulean City 💧\nEspecialista em Pokémon do tipo Água",
    followers: 9341,
    following: 201,
    color: "#e91e63"
  },
  brock: {
    password: "onix",
    name: "Brock",
    username: "brock",
    starter: "🌿 Bulbasaur",
    bio: "Líder do Ginásio de Pewter City 🪨\nSonho: ser o melhor Criador de Pokémon",
    followers: 7800,
    following: 445,
    color: "#795548"
  },
  gary: {
    password: "eevee",
    name: "Gary Oak",
    username: "gary",
    starter: "🌿 Bulbasaur",
    bio: "Neto do Prof. Carvalho. Rival de sempre. 😎\nCampeão da Liga Pokémon",
    followers: 15900,
    following: 88,
    color: "#7b1fa2"
  },
  dawn: {
    password: "piplup",
    name: "Dawn",
    username: "dawn",
    starter: "💧 Squirtle",
    bio: "Coordenadora Pokémon de Twinleaf Town 🌸\n#PokémonContests #Top5",
    followers: 11200,
    following: 560,
    color: "#0288d1"
  }
};

const SEED_POSTS = [
  { id: 1, author: "misty",  emoji: "💧", bg: "#b3e5fc", caption: "Acabei de capturar um Starmie selvagem! 💙 #PokémonÁgua #CeruleanCity #Ginásio", location: "Cerulean City", pokemon: "Starmie",    likes: 843,  time: "2h",  comments: [{user:"ash",text:"Que show! 🔥"},{user:"gary",text:"Starmie é demais!"}] },
  { id: 2, author: "gary",   emoji: "⭐", bg: "#f57f17", caption: "Mais um badge pra coleção. Facilidade. 😎 #CampeãoPokémon #GaryOak", location: "Indigo Plateau", pokemon: "Arcanine", likes: 2341, time: "5h",  comments: [{user:"ash",text:"Rival eterno 😤"},{user:"dawn",text:"Arrasou!"}] },
  { id: 3, author: "brock",  emoji: "🏔️", bg: "#cfd8dc", caption: "Meu Onix ficou muito mais forte hoje! Treino intenso em Mt. Moon 💪 #PokémonRocha #Criador", location: "Mt. Moon", pokemon: "Onix", likes: 567,  time: "8h",  comments: [{user:"misty",text:"Que fofinho o Onix!"},{user:"ash",text:"Incrível Brock!"}] },
  { id: 4, author: "dawn",   emoji: "🌸", bg: "#fce4ec", caption: "Piplup mandou muito bem no contest hoje! 🏆✨ #Contest #Coordenadora #Piplup", location: "Hearthome City", pokemon: "Piplup",  likes: 1102, time: "12h", comments: [{user:"ash",text:"Você é incrível Dawn!"},{user:"misty",text:"💕💕💕"}] },
  { id: 5, author: "gary",   emoji: "🦋", bg: "#f8bbd0", caption: "Capturei um Butterfree shiny hoje!! Raridade total 🦋✨ #Shiny #PokémonRaro #Lucky", location: "Viridian Forest", pokemon: "Butterfree", likes: 4892, time: "1d",  comments: [{user:"ash",text:"NÃO ACREDITO 😱"},{user:"dawn",text:"Sortudo!!"},{user:"brock",text:"Que maravilha 😍"}] },
];

// ——— STATE ———
let currentUser = null;
let users = {};
let posts = [];
let currentCommentPostId = null;
let currentViewHistory = ['feed'];
let selectedPostEmoji = null;
let followState = {};

// ——— INIT ———
function init() {
  users = JSON.parse(localStorage.getItem('pg_users') || 'null') || { ...DEMO_USERS };
  posts = JSON.parse(localStorage.getItem('pg_posts') || 'null') || [...SEED_POSTS];
  const saved = localStorage.getItem('pg_session');
  if (saved && users[saved]) {
    currentUser = users[saved];
    startApp();
  }
}

function save() {
  localStorage.setItem('pg_users', JSON.stringify(users));
  localStorage.setItem('pg_posts', JSON.stringify(posts));
}

// ——— AUTH ———
function doLogin() {
  const u = document.getElementById('login-username').value.trim().toLowerCase();
  const p = document.getElementById('login-password').value;
  if (!u || !p) return toast('Preencha todos os campos');
  if (!users[u]) return toast('Usuário não encontrado');
  if (users[u].password !== p) return toast('Senha incorreta');
  currentUser = users[u];
  localStorage.setItem('pg_session', u);
  startApp();
}

function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const u    = document.getElementById('reg-username').value.trim().toLowerCase().replace(/^@/,'');
  const p    = document.getElementById('reg-password').value;
  const s    = document.getElementById('reg-starter').value;
  if (!name || !u || !p || !s) return toast('Preencha todos os campos');
  if (users[u]) return toast('Usuário já existe');
  const colors = ['#e53935','#7b1fa2','#0288d1','#388e3c','#f57c00','#c2185b'];
  users[u] = { password:p, name, username:u, starter:s, bio:'', followers:0, following:0, color: colors[Math.floor(Math.random()*colors.length)] };
  save();
  currentUser = users[u];
  localStorage.setItem('pg_session', u);
  startApp();
}

function doLogout() {
  currentUser = null;
  localStorage.removeItem('pg_session');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  showLogin();
}

function showLogin()    { toggle('login-form',true); toggle('register-form',false); toggle('login-switch',true); toggle('register-switch',false); }
function showRegister() { toggle('login-form',false); toggle('register-form',true); toggle('login-switch',false); toggle('register-switch',true); }

// ——— START APP ———
function startApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderSidebarAvatar();
  showView('feed');
}

function renderSidebarAvatar() {
  const el = document.getElementById('sn-avatar');
  if (!el || !currentUser) return;
  el.style.background = currentUser.color;
  el.textContent = initials(currentUser.name);
}

// ——— VIEW ROUTING ———
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const v = document.getElementById('view-' + name);
  if (v) v.classList.remove('hidden');

  // sidebar active
  document.querySelectorAll('.sn-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bn-item').forEach(b => b.classList.remove('active'));
  const sb = document.getElementById('btn-' + name);
  if (sb) sb.classList.add('active');
  const bn = document.getElementById('bn-' + name);
  if (bn) bn.classList.add('active');

  if (name === 'feed')    renderFeed();
  if (name === 'explore') renderExplore();
  if (name === 'profile') renderProfile(currentUser.username);

  currentViewHistory.push(name);
  window.scrollTo(0,0);
}

function goBack() {
  currentViewHistory.pop();
  const prev = currentViewHistory[currentViewHistory.length-1] || 'feed';
  showView(prev);
}

// ——— FEED ———
function renderFeed() {
  renderStories();
  renderPosts();
  renderAsideMini();
  renderSuggestions();
}

function renderStories() {
  const list = document.getElementById('stories-list');
  if (!list) return;
  const myPic = document.getElementById('my-story-pic');
  if (myPic) { myPic.style.background = currentUser.color; myPic.textContent = initials(currentUser.name); }

  const others = Object.values(users).filter(u => u.username !== currentUser.username);
  list.innerHTML = others.map(u => `
    <div class="story-item" onclick="showUserProfile('${u.username}')">
      <div class="story-ring">
        <div class="story-pic" style="background:${u.color}">${initials(u.name)}</div>
      </div>
      <span>${u.username}</span>
    </div>
  `).join('');
}

function renderPosts() {
  const container = document.getElementById('feed-posts');
  if (!container) return;
  const myFollowing = Object.keys(users).filter(u => u !== currentUser.username);
  const visible = posts.filter(p => p.author === currentUser.username || myFollowing.includes(p.author));
  const sorted = [...visible].sort((a,b) => b.id - a.id);

  if (!sorted.length) {
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#8e8e8e;font-size:16px">Nenhuma publicação ainda.<br>Siga outros treinadores!</div>';
    return;
  }
  container.innerHTML = sorted.map(p => buildPostHTML(p)).join('');
}

function buildPostHTML(p) {
  const author = users[p.author] || { name: p.author, color:'#999', username: p.author };
  const liked = p.likedBy && p.likedBy.includes(currentUser.username);
  const likeColor = liked ? 'color:#e53935' : '';
  const likeFill = liked ? 'fill:#e53935;stroke:#e53935' : 'fill:none';
  const commentCount = p.comments ? p.comments.length : 0;

  return `
<div class="post-card" id="post-${p.id}">
  <div class="post-header">
    <div class="post-avatar" style="background:${author.color}" onclick="showUserProfile('${author.username}')">${initials(author.name)}</div>
    <div class="post-header-info">
      <div class="post-username" onclick="showUserProfile('${author.username}')">${author.username}</div>
      ${p.location ? `<div class="post-location-tag">${p.location}</div>` : ''}
    </div>
    <button class="post-header-more">···</button>
  </div>

  <div class="post-image" style="background:${p.bg || '#f0f0f0'}">
    <span>${p.emoji || '📸'}</span>
  </div>

  <div class="post-actions">
    <button class="post-action-btn ${liked?'liked':''}" onclick="toggleLike(${p.id})" style="${likeColor}">
      <svg viewBox="0 0 24 24" style="${likeFill};stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
    </button>
    <button class="post-action-btn" onclick="openComments(${p.id})">
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    </button>
    <button class="post-action-btn">
      <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>
    </button>
    <button class="post-save-btn" style="margin-left:auto">
      <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
    </button>
  </div>

  <div class="post-likes">${fmtNum(p.likes || 0)} curtidas</div>
  <div class="post-caption-text">
    <span class="cap-user">${author.username}</span>${formatCaption(p.caption)}
  </div>
  ${commentCount > 0 ? `<div class="post-view-comments" onclick="openComments(${p.id})">Ver todos os ${commentCount} comentários</div>` : ''}
  <div class="post-timestamp">${p.time || 'agora'}</div>

  <div class="post-comment-bar">
    <div class="mini-avatar" style="background:${currentUser.color}">${initials(currentUser.name)}</div>
    <input type="text" placeholder="Adicione um comentário..." id="inline-comment-${p.id}"
      oninput="document.getElementById('inline-send-${p.id}').classList.toggle('ready', this.value.length>0)">
    <button class="btn-inline-send" id="inline-send-${p.id}" onclick="submitInlineComment(${p.id})">Publicar</button>
  </div>
</div>`;
}

function formatCaption(cap) {
  if (!cap) return '';
  return cap.replace(/#(\w+)/g, '<span class="cap-tag">#$1</span>');
}

function toggleLike(postId) {
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  if (!post.likedBy) post.likedBy = [];
  const idx = post.likedBy.indexOf(currentUser.username);
  if (idx === -1) { post.likedBy.push(currentUser.username); post.likes = (post.likes||0)+1; }
  else            { post.likedBy.splice(idx,1); post.likes = Math.max(0,(post.likes||1)-1); }
  save();
  // re-render only this post
  const card = document.getElementById('post-'+postId);
  if (card) { const tmp = document.createElement('div'); tmp.innerHTML = buildPostHTML(post); card.replaceWith(tmp.firstChild); }
}

function submitInlineComment(postId) {
  const input = document.getElementById('inline-comment-'+postId);
  if (!input || !input.value.trim()) return;
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  if (!post.comments) post.comments = [];
  post.comments.push({ user: currentUser.username, text: input.value.trim() });
  save();
  input.value = '';
  document.getElementById('inline-send-'+postId)?.classList.remove('ready');
  toast('Comentário publicado!');
  renderPosts();
}

// ——— ASIDE ———
function renderAsideMini() {
  const el = document.getElementById('aside-profile-mini');
  if (!el) return;
  el.innerHTML = `
    <div class="profile-mini-card">
      <div class="pm-avatar" style="background:${currentUser.color}" onclick="showView('profile')">${initials(currentUser.name)}</div>
      <div class="pm-info">
        <div class="pm-username" onclick="showView('profile')">${currentUser.username}</div>
        <div class="pm-name">${currentUser.name}</div>
      </div>
      <div class="pm-switch"><a href="#" onclick="doLogout();return false">Sair</a></div>
    </div>`;
}

function renderSuggestions() {
  const el = document.getElementById('suggestions-list');
  if (!el) return;
  const others = Object.values(users).filter(u => u.username !== currentUser.username).slice(0,5);
  el.innerHTML = others.map(u => `
    <div class="suggestion-item">
      <div class="sug-avatar" style="background:${u.color}" onclick="showUserProfile('${u.username}')">${initials(u.name)}</div>
      <div class="sug-info">
        <div class="sug-name" onclick="showUserProfile('${u.username}')">${u.username}</div>
        <div class="sug-sub">${u.starter || 'Treinador'}</div>
      </div>
      <button class="btn-follow-sm" onclick="toggleFollow(this,'${u.username}')">${followState[u.username] ? 'Seguindo' : 'Seguir'}</button>
    </div>`).join('');
}

function toggleFollow(btn, username) {
  followState[username] = !followState[username];
  btn.textContent = followState[username] ? 'Seguindo' : 'Seguir';
  toast(followState[username] ? `Seguindo ${username}!` : `Deixou de seguir ${username}`);
}

// ——— EXPLORE ———
function renderExplore(query) {
  const grid = document.getElementById('explore-grid');
  if (!grid) return;
  let filtered = [...posts];
  if (query && query.trim()) {
    const q = query.toLowerCase();
    filtered = posts.filter(p =>
      p.author.toLowerCase().includes(q) ||
      (p.caption && p.caption.toLowerCase().includes(q)) ||
      (p.location && p.location.toLowerCase().includes(q))
    );
  }
  if (!filtered.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#8e8e8e">Nenhum resultado encontrado</div>';
    return;
  }
  grid.innerHTML = filtered.map(p => `
    <div class="explore-thumb" style="background:${p.bg||'#eee'}" onclick="openComments(${p.id})">
      <span>${p.emoji||'📸'}</span>
    </div>`).join('');
}

function doSearch(q) { renderExplore(q); }

// ——— PROFILE ———
function renderProfile(username) {
  const container = document.getElementById('profile-content');
  if (!container) return;
  const u = users[username] || currentUser;
  const isMe = u.username === currentUser.username;
  const userPosts = posts.filter(p => p.author === u.username);

  container.innerHTML = `
    <div class="profile-page">
      <div class="profile-header">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar" style="background:${u.color}">${initials(u.name)}</div>
        </div>
        <div class="profile-meta">
          <div class="profile-top-row">
            <span class="profile-username-text">${u.username}</span>
            ${isMe
              ? `<button class="btn-edit-profile" onclick="editProfile()">Editar perfil</button>`
              : `<button class="${followState[u.username]?'btn-follow-profile following':'btn-follow-profile'}" onclick="toggleFollow(this,'${u.username}')">${followState[u.username]?'Seguindo':'Seguir'}</button>`
            }
          </div>
          <div class="profile-stats">
            <div class="stat-item"><strong>${userPosts.length}</strong> publicações</div>
            <div class="stat-item"><strong>${fmtNum(u.followers||0)}</strong> seguidores</div>
            <div class="stat-item"><strong>${fmtNum(u.following||0)}</strong> seguindo</div>
          </div>
          <div class="profile-bio">
            <div class="prof-name">${u.name}</div>
            ${u.starter ? `<div class="prof-starter">${u.starter}</div>` : ''}
            ${u.bio ? `<div class="prof-desc">${u.bio}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="profile-tabs">
        <button class="tab-btn active" id="tab-posts" onclick="switchProfileTab('posts')">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Publicações
        </button>
        ${isMe ? `<button class="tab-btn" id="tab-saved" onclick="switchProfileTab('saved')">
          <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
          Salvos
        </button>` : ''}
      </div>

      <div id="profile-grid" class="profile-grid">
        ${userPosts.length
          ? userPosts.map(p => `
              <div class="profile-thumb" style="background:${p.bg||'#eee'}" onclick="openComments(${p.id})">
                <span>${p.emoji||'📸'}</span>
              </div>`).join('')
          : `<div class="profile-empty">Nenhuma publicação ainda.</div>`
        }
      </div>
    </div>`;
}

function switchProfileTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-'+tab)?.classList.add('active');
  // simplified: same grid for both
}

function editProfile() {
  const bio = prompt('Editar bio:', currentUser.bio || '');
  if (bio !== null) {
    currentUser.bio = bio;
    users[currentUser.username].bio = bio;
    save();
    renderProfile(currentUser.username);
    toast('Perfil atualizado!');
  }
}

function showUserProfile(username) {
  const container = document.getElementById('user-profile-content');
  if (!container) return;
  const u = users[username];
  if (!u) return;
  if (u.username === currentUser.username) { showView('profile'); return; }
  renderUserProfile(username);
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-user').classList.remove('hidden');
  currentViewHistory.push('user');
  window.scrollTo(0,0);
}

function renderUserProfile(username) {
  const container = document.getElementById('user-profile-content');
  const u = users[username];
  if (!u || !container) return;
  const userPosts = posts.filter(p => p.author === u.username);

  container.innerHTML = `
    <div class="profile-page">
      <div class="profile-header">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar" style="background:${u.color}">${initials(u.name)}</div>
        </div>
        <div class="profile-meta">
          <div class="profile-top-row">
            <span class="profile-username-text">${u.username}</span>
            <button class="${followState[u.username]?'btn-follow-profile following':'btn-follow-profile'}" onclick="toggleFollow(this,'${u.username}')">${followState[u.username]?'Seguindo':'Seguir'}</button>
          </div>
          <div class="profile-stats">
            <div class="stat-item"><strong>${userPosts.length}</strong> publicações</div>
            <div class="stat-item"><strong>${fmtNum(u.followers||0)}</strong> seguidores</div>
            <div class="stat-item"><strong>${fmtNum(u.following||0)}</strong> seguindo</div>
          </div>
          <div class="profile-bio">
            <div class="prof-name">${u.name}</div>
            ${u.starter ? `<div class="prof-starter">${u.starter}</div>` : ''}
            ${u.bio ? `<div class="prof-desc">${u.bio}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="profile-tabs">
        <button class="tab-btn active">
          <svg viewBox="0 0 24 24" width="16" height="16" style="stroke:currentColor;fill:none;stroke-width:1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Publicações
        </button>
      </div>
      <div class="profile-grid">
        ${userPosts.length
          ? userPosts.map(p => `
              <div class="profile-thumb" style="background:${p.bg||'#eee'}" onclick="openComments(${p.id})">
                <span>${p.emoji||'📸'}</span>
              </div>`).join('')
          : `<div class="profile-empty">Nenhuma publicação ainda.</div>`
        }
      </div>
    </div>`;
}

// ——— NEW POST MODAL ———
function showNewPost() {
  selectedPostEmoji = null;
  document.getElementById('post-caption').value = '';
  document.getElementById('post-location').value = '';

  // author row
  const row = document.getElementById('post-author-row');
  if (row) row.innerHTML = `
    <div class="pa-avatar" style="background:${currentUser.color}">${initials(currentUser.name)}</div>
    <span class="pa-name">${currentUser.username}</span>`;

  // emoji picker
  const picker = document.getElementById('emoji-bg-picker');
  if (picker) picker.innerHTML = EMOJI_BG_OPTIONS.map((o,i) => `
    <div class="emoji-pick-btn" onclick="selectPostEmoji(${i})" data-idx="${i}">${o.emoji}</div>`).join('');

  // pokemon select
  const sel = document.getElementById('post-pokemon');
  if (sel) {
    sel.innerHTML = '<option value="">Pokémon em destaque</option>' +
      POKEMON_LIST.map(pk => `<option value="${pk}">${pk}</option>`).join('');
  }

  openModal('modal-post');
}

function selectPostEmoji(idx) {
  selectedPostEmoji = EMOJI_BG_OPTIONS[idx];
  document.querySelectorAll('.emoji-pick-btn').forEach((b,i) => b.classList.toggle('selected', i===idx));
  const area = document.getElementById('post-image-area');
  if (area) {
    area.style.background = selectedPostEmoji.bg;
    area.innerHTML = `<div class="post-selected-preview">${selectedPostEmoji.emoji}</div>`;
  }
}

function submitPost() {
  const caption = document.getElementById('post-caption').value.trim();
  const location = document.getElementById('post-location').value.trim();
  const pokemon = document.getElementById('post-pokemon').value;
  if (!caption) return toast('Escreva uma legenda!');
  if (!selectedPostEmoji) return toast('Escolha uma imagem!');

  const newPost = {
    id: Date.now(),
    author: currentUser.username,
    emoji: selectedPostEmoji.emoji,
    bg: selectedPostEmoji.bg,
    caption, location, pokemon,
    likes: 0, likedBy: [], comments: [],
    time: 'agora'
  };
  posts.unshift(newPost);
  save();
  closeModal('modal-post');
  showView('feed');
  toast('Publicação criada! 🎉');
}

// ——— COMMENTS MODAL ———
function openComments(postId) {
  currentCommentPostId = postId;
  const post = posts.find(p => p.id === postId);
  if (!post) return;

  const list = document.getElementById('comments-list');
  if (list) renderCommentsList(post);

  const myAv = document.getElementById('my-comment-avatar');
  if (myAv) { myAv.style.background = currentUser.color; myAv.textContent = initials(currentUser.name); }

  document.getElementById('new-comment').value = '';
  openModal('modal-comments');
}

function renderCommentsList(post) {
  const list = document.getElementById('comments-list');
  if (!list) return;
  if (!post.comments || !post.comments.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#8e8e8e;font-size:14px">Nenhum comentário ainda.<br>Seja o primeiro! 🎤</div>';
    return;
  }
  list.innerHTML = post.comments.map(c => {
    const cu = users[c.user] || { name: c.user, color:'#999' };
    return `
      <div class="comment-item">
        <div class="comment-avatar" style="background:${cu.color}">${initials(cu.name)}</div>
        <div class="comment-body">
          <strong>${c.user}</strong><span>${c.text}</span>
          <div class="comment-time">agora</div>
        </div>
      </div>`;
  }).join('');
}

function submitComment() {
  const input = document.getElementById('new-comment');
  const text = input?.value.trim();
  if (!text) return;
  const post = posts.find(p => p.id === currentCommentPostId);
  if (!post) return;
  if (!post.comments) post.comments = [];
  post.comments.push({ user: currentUser.username, text });
  save();
  input.value = '';
  renderCommentsList(post);
  renderPosts();
  toast('Comentário publicado!');
}

// ——— MODAL HELPERS ———
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); document.body.style.overflow='hidden'; }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden');    document.body.style.overflow='';       }

// ——— UTILS ———
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function fmtNum(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n/1000).toFixed(1) + 'K';
  return String(n);
}

function toggle(id, show) {
  const el = document.getElementById(id);
  if (!el) return;
  if (show) el.classList.remove('hidden');
  else      el.classList.add('hidden');
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

// ——— KEYBOARD ESC ———
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal('modal-post');
    closeModal('modal-comments');
  }
});

// ——— START ———
init();
