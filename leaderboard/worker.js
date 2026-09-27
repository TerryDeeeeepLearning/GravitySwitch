// Gravity Switch 排行榜 API（Cloudflare Workers + D1）
//   GET  /top?n=20&player=<id>   取前 N 名，附上這個玩家自己的名次
//   POST /score  { name, score, player }   送出成績（只保留每位玩家的最高分）
// 部署方式見同資料夾的 README.md
const MAX_SCORE = 2000;      // 超過這個分數一律視為作弊
const NAME_MAX = 12;         // 名字長度上限
const RATE_PER_MIN = 5;      // 同一個 IP 每分鐘最多幾次提交
const TOP_MAX = 50;

// 允許任何網站呼叫。想鎖定只有自己的網站能用，把 '*' 換成你的網址
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
});

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function cleanName(v) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!s) s = '玩家';
  return [...s].slice(0, NAME_MAX).join('');   // 用展開運算子切，避免切壞表情符號
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    try {
      if (url.pathname === '/top' && request.method === 'GET') return await top(url, env);
      if (url.pathname === '/score' && request.method === 'POST') return await submit(request, env);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'server', detail: String((e && e.message) || e) }, 500);
    }
  },
};

async function rankOf(env, score) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE score > ?').bind(score).first();
  return ((r && r.c) || 0) + 1;
}

async function top(url, env) {
  const n = Math.min(TOP_MAX, Math.max(1, parseInt(url.searchParams.get('n') || '20', 10) || 20));
  const player = (url.searchParams.get('player') || '').slice(0, 40);

  const { results } = await env.DB.prepare(
    'SELECT name, score, player FROM scores ORDER BY score DESC, created_at ASC LIMIT ?'
  ).bind(n).all();

  const rows = (results || []).map((r, i) => ({
    rank: i + 1, name: r.name, score: r.score, me: !!player && r.player === player,
  }));

  let me = null;
  if (player) {
    const mine = await env.DB.prepare('SELECT score FROM scores WHERE player = ?').bind(player).first();
    if (mine) me = { score: mine.score, rank: await rankOf(env, mine.score) };
  }
  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores').first();
  return json({ top: rows, me, total: (total && total.c) || 0 });
}

async function submit(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }

  const score = Math.floor(Number(body.score));
  const player = String(body.player || '').slice(0, 40);
  const name = cleanName(body.name);
  if (!player || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return json({ error: 'bad data' }, 400);
  }

  const now = Date.now();
  // IP 只用來限流，存的是加鹽雜湊，不留原始 IP
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipHash = (await sha256(ip + '|' + (env.SALT || 'gravity-switch'))).slice(0, 32);

  const hits = await env.DB.prepare('SELECT COUNT(*) AS c FROM hits WHERE ip_hash = ? AND at > ?')
    .bind(ipHash, now - 60000).first();
  if (hits && hits.c >= RATE_PER_MIN) return json({ error: 'too many', retry: 60 }, 429);
  await env.DB.prepare('INSERT INTO hits (ip_hash, at) VALUES (?, ?)').bind(ipHash, now).run();
  if (Math.random() < 0.05) {                 // 偶爾清掉過期的限流紀錄
    await env.DB.prepare('DELETE FROM hits WHERE at < ?').bind(now - 300000).run();
  }

  // 一位玩家一列：分數取最高，名字每次都更新（改名後下次送分就會同步）
  await env.DB.prepare(
    `INSERT INTO scores (player, name, score, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(player) DO UPDATE SET
       name = excluded.name,
       score = MAX(scores.score, excluded.score),
       created_at = CASE WHEN excluded.score > scores.score THEN excluded.created_at ELSE scores.created_at END`
  ).bind(player, name, score, ipHash, now).run();

  const mine = await env.DB.prepare('SELECT score FROM scores WHERE player = ?').bind(player).first();
  const best = mine ? mine.score : score;
  return json({ ok: true, best, rank: await rankOf(env, best) });
}
