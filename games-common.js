// ════════════════════════════════════════════════════════
// POKÉGRAM — utilitários compartilhados entre os jogos
// (tetris.html, flapidgey.html, voltorbolha.html). Requer
// supabase-js já carregado na página antes deste script.
// ════════════════════════════════════════════════════════

const GAMES_SUPABASE_URL  = 'https://cofqapsaxrqlmxzpzbkr.supabase.co';
const GAMES_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvZnFhcHNheHJxbG14enB6YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0OTMyMjcsImV4cCI6MjA5NTA2OTIyN30.p331KADbBKl6oPSQvxXpDAga3Hx_YwVDZTruKa6Rp8o';
const gdb = supabase.createClient(GAMES_SUPABASE_URL, GAMES_SUPABASE_ANON);

function gEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function gInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/[\s_]+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function gLoadSession() {
  try {
    const val = JSON.parse(localStorage.getItem('pg_user'));
    if (!val) return null;
    if (Array.isArray(val)) return val[0] || null;
    return val;
  } catch (e) { return null; }
}

function gAvatarHtml(u) {
  if (u && u.avatar_url) return `<img src="${gEsc(u.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  return gInitials(u ? u.username : '?');
}

function gAvatarBg(u) {
  return (u && u.avatar_url) ? 'transparent' : ((u && u.color) || '#e53935');
}

// Confirma que existe login válido (mesma fonte da verdade que o app
// principal: pg_user em localStorage) e retorna os dados em cache do
// usuário. A sessão real do Supabase Auth é só um bônus — quando existe,
// permite escrita em tabelas protegidas por RLS (ex.: game_scores); quando
// não existe (NPCs e alguns perfis KP-linked não têm conta real no Auth),
// o jogo funciona normalmente mesmo assim graças à policy de INSERT em
// game_scores não exigir mais auth.uid() (ver histórico do projeto).
async function gRequireSession() {
  const cached = gLoadSession();
  if (!cached) {
    window.location.href = '/';
    return null;
  }
  try {
    const { data: { session } } = await gdb.auth.getSession();
    if (!session) console.warn('[gRequireSession] sem sessão real do Supabase Auth — jogo segue normal, gravação de pontuação usa a anon key');
  } catch (e) { /* falha ao verificar não derruba o jogador */ }
  // Aproveita todo boot de jogo (chamado por tetris/flapidgey/voltorbolha)
  // pra tentar reenviar silenciosamente qualquer pontuação que ficou
  // presa localmente por falha de rede/servidor numa sessão anterior.
  gFlushPendingScores();
  return cached;
}

const GM_PENDING_KEY = 'gm_pending_scores';
const GM_PENDING_MAX = 20; // evita crescimento infinito se o Supabase ficar fora do ar por muito tempo

function gReadPendingScores() {
  try {
    const arr = JSON.parse(localStorage.getItem(GM_PENDING_KEY));
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function gWritePendingScores(arr) {
  try {
    localStorage.setItem(GM_PENDING_KEY, JSON.stringify(arr.slice(-GM_PENDING_MAX)));
  } catch (e) { /* localStorage indisponível/cheio — não há muito a fazer aqui */ }
}

function gQueuePendingScore(payload) {
  const arr = gReadPendingScores();
  arr.push(payload);
  gWritePendingScores(arr);
}

// Faz o POST cru pro PostgREST. Usado tanto por gSaveScore quanto pelo
// retry de pontuações pendentes, pra não duplicar a lógica de request.
async function gPostScore(payload) {
  const { data: { session } } = await gdb.auth.getSession().catch(() => ({ data: { session: null } }));
  const res = await fetch(`${GAMES_SUPABASE_URL}/rest/v1/game_scores`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': GAMES_SUPABASE_ANON,
      'Authorization': `Bearer ${(session && session.access_token) || GAMES_SUPABASE_ANON}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`status ${res.status} — ${body}`);
  }
}

// Tenta reenviar todas as pontuações que ficaram presas em localStorage
// por falha de rede/servidor em uma tentativa anterior de gSaveScore.
// Silencioso por design (não bloqueia nem avisa o jogador) — roda no
// boot de qualquer jogo via gRequireSession. Reentrância é evitada com
// gFlushingPending pra não disparar duas rodadas em paralelo (ex.: se
// gRequireSession for chamado mais de uma vez rapidamente).
let gFlushingPending = false;
async function gFlushPendingScores() {
  if (gFlushingPending) return;
  const pending = gReadPendingScores();
  if (pending.length === 0) return;
  gFlushingPending = true;
  const stillPending = [];
  for (const payload of pending) {
    try {
      await gPostScore(payload);
    } catch (e) {
      console.warn('[gFlushPendingScores] ainda falhando, mantendo na fila —', payload.game, e);
      stillPending.push(payload);
    }
  }
  gWritePendingScores(stillPending);
  gFlushingPending = false;
}

// Salva uma pontuação no ranking. 'game' é 'tetris', 'flapidgey' ou
// 'voltorbolha'. Usa fetch cru pro PostgREST (em vez do client supabase-js)
// porque o client engolia qualquer erro de RLS em silêncio (só um
// console.warn) — com fetch cru, um erro aparece completo no console
// (status + corpo da resposta do PostgREST), em vez de sumir.
//
// Se o insert falhar (rede fora do ar, Supabase indisponível, etc.), o
// payload é guardado em localStorage (gm_pending_scores) e reenviado
// automaticamente no próximo boot de qualquer jogo (ver gFlushPendingScores,
// chamada dentro de gRequireSession) — assim uma pontuação não se perde
// só porque a conexão falhou no momento exato do game over.
async function gSaveScore(game, score, user) {
  if (!user || !user.id || !Number.isFinite(score)) return false;
  const payload = {
    user_id: user.id,
    game,
    score: Math.max(0, Math.round(score)),
    author_name: user.username || null,
    author_color: user.color || null,
    author_avatar: user.avatar_url || null,
  };
  try {
    await gPostScore(payload);
    return true;
  } catch (e) {
    console.error('[gSaveScore] falha ao salvar pontuação — guardando pra reenviar depois —', game, e);
    gQueuePendingScore(payload);
    return false;
  }
}

// Busca o top N (por jogador único, melhor score) de um jogo.
async function gLoadTopScores(game, limit) {
  limit = limit || 10;
  try {
    const { data, error } = await gdb
      .from('game_scores')
      .select('score, author_name, author_color, author_avatar, user_id')
      .eq('game', game)
      .order('score', { ascending: false })
      .limit(100);
    if (error) throw error;
    const seen = new Set();
    const top = [];
    for (const row of (data || [])) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      top.push(row);
      if (top.length >= limit) break;
    }
    return top;
  } catch (e) {
    console.warn('[gLoadTopScores]', game, e);
    return [];
  }
}

// Busca o melhor score pessoal do usuário atual para um jogo.
async function gLoadMyBest(game, userId) {
  if (!userId) return 0;
  try {
    const { data, error } = await gdb
      .from('game_scores')
      .select('score')
      .eq('game', game)
      .eq('user_id', userId)
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? data.score : 0;
  } catch (e) {
    console.warn('[gLoadMyBest]', game, e);
    return 0;
  }
}

// Detecta dispositivo "tipo mobile" de verdade (celular/tablet sem
// ponteiro fino disponível). "pointer:coarse" sozinho dá falso positivo
// em notebooks Windows com tela touch (o digitalizador touch conta como
// "coarse" mesmo quando o jogador está usando mouse/trackpad) — por isso
// exigimos também "hover:none", que só é verdade quando NENHUM ponteiro
// de precisão está disponível (celulares/tablets de verdade).
function gIsMobileLike() {
  try {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch (e) { return false; }
}

// Tenta entrar em fullscreen assim que o usuário interagir pela primeira
// vez com a página (toque, clique ou tecla). Navegadores bloqueiam
// requestFullscreen() sem um gesto do usuário, então isso serve de
// fallback pro tryEnterFullscreenNow() que roda no boot (que só funciona
// se já houver um gesto pendente, ex.: o toque que abriu a página).
// Só entra em ação em dispositivos mobile-like — no desktop, nunca força
// fullscreen automático.
function gSetupFullscreenOnFirstInteraction() {
  if (document.fullscreenElement) return;
  if (!gIsMobileLike()) return;
  let done = false;
  const tryFs = () => {
    if (done) return;
    done = true;
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
    document.removeEventListener('pointerdown', tryFs);
    document.removeEventListener('keydown', tryFs);
  };
  document.addEventListener('pointerdown', tryFs, { once: true });
  document.addEventListener('keydown', tryFs, { once: true });
}
