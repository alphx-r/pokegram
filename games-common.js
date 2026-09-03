// ════════════════════════════════════════════════════════
// POKÉGRAM — utilitários compartilhados entre os jogos
// (tetris.html, flapidgey.html). Requer supabase-js já
// carregado na página antes deste script.
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

// Confirma que existe sessão real no Supabase Auth (compartilhada com o
// app principal via localStorage no mesmo domínio) e retorna os dados
// em cache do usuário (pg_user). Redireciona para "/" se não houver sessão.
async function gRequireSession() {
  const { data: { session } } = await gdb.auth.getSession();
  const cached = gLoadSession();
  if (!session || !cached) {
    window.location.href = '/';
    return null;
  }
  return cached;
}

// Salva uma pontuação no ranking. 'game' é 'tetris' ou 'flapidgey'.
async function gSaveScore(game, score, user) {
  if (!user || !user.id || !Number.isFinite(score)) return;
  try {
    await gdb.from('game_scores').insert({
      user_id: user.id,
      game,
      score: Math.max(0, Math.round(score)),
      author_name: user.username || null,
      author_color: user.color || null,
      author_avatar: user.avatar_url || null,
    });
  } catch (e) {
    console.warn('[gSaveScore]', game, e);
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
