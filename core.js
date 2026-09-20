// Gravity Switch 共用核心：設定、物理、關卡驗證、關卡產生器（遊戲與地圖編輯器共用）
'use strict';
// ============================================================
//  可調整參數
// ============================================================
const CONFIG = {
  SPEED: 9,             // 前進速度（格/秒）
  GRAVITY: 200,         // 重力加速度（格/秒²）
  MAX_FALL: 35,         // 最大垂直速度（格/秒）
  FLIP_KICK: 35,        // 切換重力瞬間的初速度（格/秒），讓起飛不拖泥帶水
  COLS_PER_POINT: 4,    // 前進幾格 = 1 分
  BUFFER_TIME: 99,      // 空中預輸入的有效時間（秒）：99 = 飛行中任何時候按下，著地就立刻反彈（只記一次）
                        // 想改回「只有快著地時按才算」，設成 0.15 之類的小數字
  SEG_MIN_POINTS: 2,    // 每一關的長度下限（分）
  SEG_MAX_POINTS: 4,    // 每一關的長度上限（分）
  CHUNK_MIN: 4,         // 一關由數個小段組成，每段的長度（格）
  CHUNK_MAX: 8,
  THEME_POINTS: 15,     // 每幾分換一次配色

  CONN: 5,              // 每關開頭的標準通道長度（格）預設值；個別關卡可以用 conn 欄位覆寫（在編輯器裡調整）

  // 手工關卡（levels.js，由地圖編輯器匯出）
  HANDMADE_CHANCE: 1,   // 該難度有手工關卡時，選用手工關卡的機率（1 = 只用手工關卡）
  HANDMADE_MIRROR: true,// 手工關卡隨機上下翻轉，一關當兩關用
  USE_PROCEDURAL: false,// false = 完全不用隨機產生；該難度沒有手工關卡時，改用最接近難度的手工關卡
  NO_REPEAT: 3,         // 最近幾關內不重複選到同一關（手工關卡數量夠多時才有效果）

  // 依「該關起點的分數」決定抽到難度 1~5 的機率權重
  // 會套用 minScore <= 分數 的最後一列
  DIFFICULTY_TABLE: [
    { minScore: 0,   weights: [80, 20, 0,  0,  0] },
    { minScore: 15,  weights: [60, 25, 15,  0,  0] },
    { minScore: 40,  weights: [20, 35, 40, 5,  0] },
    { minScore: 80,  weights: [ 5, 15, 35, 35, 10] },
    { minScore: 120, weights: [ 1,  5, 22, 43, 29] },
    { minScore: 170, weights: [ 1,  5,  5, 41, 48] },
    { minScore: 250, weights: [ 1,  5,  0, 27, 67] },
  ],
};

const ROWS = 18;          // 畫面高度（格）
const C0 = 3, F0 = 14;    // 標準天花板最底列 / 標準地板最上列
const P = 0.8;            // 玩家方塊邊長（格）
const DT = 1 / 120;       // 固定物理步長
const EPS = 1e-4;
// 每關開頭都會接一段標準通道，確保關與關之間銜接得上。
// 長度預設用 CONFIG.CONN，個別關卡可用 conn 欄位覆寫（開頭就有障礙的關卡可以調長一點）
const MAX_CONN = 20;
function levelConn(L) {
  return L && Number.isFinite(L.conn) ? clamp(Math.round(L.conn), 0, MAX_CONN) : CONFIG.CONN;
}

const rand = Math.random;
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = arr => arr[Math.floor(rand() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------- 地形欄位 ----------
// 每一欄是 Uint8Array(ROWS)，1 = 實心。貼齊上/下邊界的實心會視為無限延伸的柱子
function colCF(c, f) {
  const a = new Uint8Array(ROWS);
  for (let r = 0; r <= c && r < ROWS; r++) a[r] = 1;
  for (let r = Math.max(0, f); r < ROWS; r++) a[r] = 1;
  return a;
}
function stdCols(n) { const a = []; for (let i = 0; i < n; i++) a.push(colCF(C0, F0)); return a; }
function openCols(n) { const a = []; for (let i = 0; i < n; i++) a.push(new Uint8Array(ROWS)); return a; }
function setRange(col, r0, r1) { for (let r = Math.max(0, r0); r <= Math.min(ROWS - 1, r1); r++) col[r] = 1; }

// ---------- 物理（遊戲與關卡驗證共用同一份） ----------
function overlaps(S, x, y, s) {
  const c0 = Math.floor(x + EPS), c1 = Math.floor(x + s - EPS);
  const r0 = Math.floor(y + EPS), r1 = Math.floor(y + s - EPS);
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (S(c, r)) return true;
  return false;
}

// b.s = 碰撞箱大小。遊戲中為 P；驗證關卡時會加大，讓合格關卡保留操作餘裕
function stepBody(b, S) {
  const s = b.s;
  b.vy += b.g * CONFIG.GRAVITY * DT;
  if (b.vy > CONFIG.MAX_FALL) b.vy = CONFIG.MAX_FALL;
  if (b.vy < -CONFIG.MAX_FALL) b.vy = -CONFIG.MAX_FALL;
  let ny = b.y + b.vy * DT;
  if (overlaps(S, b.x, ny, s)) {
    ny = b.vy > 0 ? Math.floor(ny + s - EPS) - s : Math.floor(ny + EPS) + 1;
    b.vy = 0;
  }
  b.y = ny;
  const nx = b.x + CONFIG.SPEED * DT;
  if (overlaps(S, nx, b.y, s)) { b.dead = true; return; }   // 正面撞到 = 死亡
  b.x = nx;
  const was = b.grounded;
  b.grounded = overlaps(S, b.x, b.y + b.g * 0.02, s);
  if (b.grounded) b.vy = 0;
  b.justLanded = b.grounded && !was;
  b.n++;
  if (b.y > ROWS + 0.5 || b.y + s < -0.5) b.dead = true;  // 掉出畫面
}

function flipBody(b) { b.g = -b.g; b.vy = b.g * CONFIG.FLIP_KICK; b.grounded = false; }

// ---------- 關卡驗證：搜尋是否存在可通關的切換時機 ----------
function makeAccessor(cols) {
  const std = colCF(C0, F0), L = cols.length;
  return (c, r) => {
    const col = c < 0 || c >= L ? std : cols[c];
    return col[r < 0 ? 0 : r >= ROWS ? ROWS - 1 : r];
  };
}

function search(S, start, goal, budget) {
  const visited = new Set();
  const stack = [{ b: Object.assign({ vy: 0, grounded: true, dead: false, justLanded: false, n: 0 }, start), flips: [] }];
  while (stack.length) {
    const node = stack.pop();
    const b = node.b;
    for (;;) {
      if (budget.maxX === undefined || b.x > budget.maxX) budget.maxX = b.x;   // 記錄最遠到哪裡（編輯器顯示卡關位置用）
      if (b.x >= goal) return node.flips;
      if (b.grounded) {
        const key = b.n * 4 + (b.g > 0 ? 0 : 2) + '|' + Math.round(b.y * 64);
        if (visited.has(key)) break;
        visited.add(key);
        const nb = Object.assign({}, b);
        flipBody(nb);
        stack.push({ b: nb, flips: node.flips.concat(b.n) });
      }
      stepBody(b, S);
      if (--budget.v < 0) return null;
      if (b.dead) break;
    }
  }
  return null;
}

function replay(S, start, flips, goal) {
  const b = Object.assign({ vy: 0, grounded: true, dead: false, justLanded: false, n: 0 }, start);
  const pts = [];
  let fi = 0;
  while (b.x < goal && !b.dead && b.n < 20000) {
    if (fi < flips.length && flips[fi] === b.n) { flipBody(b); fi++; }
    stepBody(b, S);
    pts.push({ x: b.x, y: b.y, air: !b.grounded });
  }
  return pts;
}

// 驗證用碰撞箱比實際大多少（依難度 1~5）：越大 = 容錯越多
const SAFETY_MARGIN = [0.3, 0.3, 0.25, 0.2, 0.14, 0.1];

// 驗證的進場狀態：從地板或天花板、兩種進場時機
function validationStarts(d) {
  const m = SAFETY_MARGIN[d] || 0, s = P + m, x0 = 0.05 - m / 2;
  return [
    { label: '地板進場', x: x0, y: F0 - s, g: 1, s },
    { label: '天花板進場', x: x0, y: C0 + 1, g: -1, s },
    { label: '地板進場（晚一點）', x: x0 + 0.8, y: F0 - s, g: 1, s },
    { label: '天花板進場（晚一點）', x: x0 + 0.8, y: C0 + 1, g: -1, s },
  ];
}

// 所有進場狀態都必須能通關，才算合格關卡；回傳第一條通關路線
function validate(cols, d) {
  const S = makeAccessor(cols);
  const goal = cols.length + 1;
  const starts = validationStarts(d);
  let path = null;
  for (let i = 0; i < starts.length; i++) {
    const flips = search(S, starts[i], goal, { v: 150000 });
    if (!flips) return null;
    if (i === 0) path = replay(S, starts[0], flips, goal);
  }
  return path;
}

// 編輯器用：每個進場狀態的結果、通關路線、失敗時最遠到哪
function validateDetailed(cols, d) {
  const S = makeAccessor(cols), goal = cols.length + 1;
  return validationStarts(d).map(st => {
    const budget = { v: 150000 };
    const flips = search(S, st, goal, budget);
    return { label: st.label, s: st.s, ok: !!flips, path: flips ? replay(S, st, flips, goal) : null, maxX: budget.maxX };
  });
}

// ============================================================
//  手工關卡：rows 為 18 個字串（由上到下），'#' = 方塊、'.' = 空、'o' = 黃色方塊
// ============================================================
function parseLevel(L) {
  const N = L.rows[0].length, cols = [], coins = [];
  for (let c = 0; c < N; c++) {
    const col = new Uint8Array(ROWS);
    for (let r = 0; r < ROWS; r++) {
      const ch = (L.rows[r] || '')[c];
      if (ch === '#') col[r] = 1;
      else if (ch === 'o') coins.push({ x: c + .5, y: r + .5 });
    }
    cols.push(col);
  }
  return { cols, coins };
}
function mirrorLevel(lv) {
  return { cols: lv.cols.map(c => c.slice().reverse()), coins: lv.coins.map(k => ({ x: k.x, y: ROWS - k.y })) };
}

let HANDMADE = null;
function prepareHandmade() {
  HANDMADE = [];
  const src = typeof HANDMADE_LEVELS !== 'undefined' ? HANDMADE_LEVELS : [];
  for (const L of src) {
    try {
      const d = clamp(L.d | 0, 1, 5), lv = parseLevel(L), conn = levelConn(L);
      const variants = CONFIG.HANDMADE_MIRROR ? [lv, mirrorLevel(lv)] : [lv];
      variants.forEach((v, i) => {
        const cols = stdCols(conn).concat(v.cols);
        const path = validate(cols, d);
        if (path) HANDMADE.push({ name: L.name + (i ? '（翻轉）' : ''), d, conn, cols, coins: v.coins, path });
        else if (typeof console !== 'undefined') console.warn('手工關卡無法通關，已略過：', L.name, i ? '（翻轉）' : '');
      });
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('手工關卡格式錯誤：', L && L.name, e);
    }
  }
}
// 最近用過的手工關卡（同一張的正向與翻轉算同一張），盡量不要連續重複
const recentHandmade = [];
function pickHandmade(pool) {
  const key = l => l.name.replace('（翻轉）', '');
  const fresh = pool.filter(l => !recentHandmade.includes(key(l)));
  const lv = pick(fresh.length ? fresh : pool);
  recentHandmade.push(key(lv));
  while (recentHandmade.length > CONFIG.NO_REPEAT) recentHandmade.shift();
  return lv;
}

function handmadeSegment(lv, requested) {
  const coins = lv.coins.length ? lv.coins.map(k => ({ x: k.x + lv.conn, y: k.y })) : placeCoins(lv.path, lv.cols.length, lv.d, lv.conn);
  return { cols: lv.cols, d: lv.d, name: '★' + lv.name, coins, requested, handmade: true };
}

// ============================================================
//  關卡產生器：每一種有適用的難度範圍 [min, max]
//  一關 = 開頭銜接段 + 數個「小段」，每個小段隨機挑一種產生器，所以同一關內也有變化
// ============================================================
const GENS = [
  { name: 'wave', min: 1, max: 3, desc: '地板與天花板高低起伏', fn(N, d) {
    const minGap = [0, 7, 6, 5][d], every = [0, 2, 2, 1][d], amp = [0, 2, 3, 3][d];
    let c = C0, f = F0; const out = [];
    for (let i = 0; i < N; i++) {
      if (i % every === 0) {
        if (rand() < .5) c = clamp(c + randInt(-amp, amp), 0, 8);
        else f = clamp(f + randInt(-amp, amp), 9, 17);
        if (f - c - 1 < minGap) { if (rand() < .5) c = Math.max(0, f - 1 - minGap); else f = Math.min(17, c + 1 + minGap); }
      }
      out.push(colCF(c, f));
    }
    return out;
  }},
  { name: 'bumps', min: 1, max: 5, desc: '上下凸起的柱子', fn(N, d) {
    // 換邊時要留足夠距離讓玩家切換；同一邊連續出現時可以很密
    const out = stdCols(N);
    const altGap = [0, 5, 5, 4, 4, 4][d], hmin = [0, 3, 4, 4, 5, 5][d], hmax = [0, 5, 6, 6, 7, 7][d], wmax = d <= 2 ? 2 : 3;
    let side = rand() < .5 ? 1 : -1, i = randInt(0, 1);
    while (i < N) {
      const w = randInt(1, wmax), h = randInt(hmin, hmax);
      for (let k = 0; k < w && i + k < N; k++) out[i + k] = side > 0 ? colCF(C0, F0 - h) : colCF(C0 + h, F0);
      const swap = d <= 1 || rand() < .6;
      i += w + (swap ? altGap + randInt(0, 1) : randInt(1, 2));
      if (swap) side = -side;
    }
    return out;
  }},
  { name: 'stairs', min: 1, max: 3, desc: '一階一階升高的地板或降低的天花板', fn(N, d) {
    const out = [], onFloor = rand() < .5, stepW = d >= 3 ? 1 : randInt(1, 2), maxH = 5 + d;
    let h = randInt(0, 2);
    for (let i = 0; i < N; i++) {
      if (i > 0 && i % stepW === 0) { h += randInt(1, d >= 2 ? 2 : 1); if (h > maxH) h = randInt(0, 1); }
      out.push(onFloor ? colCF(C0, F0 - h) : colCF(C0 + h, F0));
    }
    return out;
  }},
  { name: 'blocks', min: 2, max: 4, desc: '貼地 / 貼頂的小方塊，加上懸浮方塊', fn(N, d) {
    const out = stdCols(N);
    let i = randInt(0, 1);
    while (i < N) {
      const w = randInt(1, 2), onFloor = rand() < .5, h = randInt(1, 2);
      for (let k = 0; k < w && i + k < N; k++) {
        if (onFloor) setRange(out[i + k], F0 - h, F0 - 1); else setRange(out[i + k], C0 + 1, C0 + h);
        if (d >= 3 && rand() < .5) out[i + k][randInt(7, 10)] = 1;
      }
      i += w + randInt(1, d >= 4 ? 2 : 3);
    }
    return out;
  }},
  { name: 'holes', min: 2, max: 4, desc: '地板 / 天花板的缺口', fn(N, d) {
    const out = stdCols(N);
    const spacing = [0, 0, 3, 2, 2][d], wmin = [0, 0, 2, 2, 3][d], wmax = [0, 0, 3, 4, 4][d];
    let side = rand() < .5 ? 1 : -1, i = randInt(0, 1);
    while (i < N) {
      const w = randInt(wmin, wmax), bump = d >= 3 && rand() < .35;
      for (let k = 0; k < w && i + k < N; k++) {
        if (bump) out[i + k] = side > 0 ? colCF(C0, F0 - 5) : colCF(C0 + 5, F0);
        else out[i + k] = side > 0 ? colCF(C0, ROWS) : colCF(-1, F0);
      }
      i += w + spacing + randInt(0, 1);
      side = d <= 3 ? -side : (rand() < .7 ? -side : side);
    }
    return out;
  }},
  { name: 'windows', min: 2, max: 4, desc: '牆上的窗口，要對準高度穿過', fn(N, d) {
    const out = stdCols(N);
    const winH = [0, 0, 5, 5, 4][d], spacing = [0, 0, 4, 4, 3][d];
    let i = randInt(0, 1);
    while (i < N) {
      const w = randInt(1, 2), top = randInt(C0 + 1, F0 - winH);
      for (let k = 0; k < w && i + k < N; k++) out[i + k] = colCF(top - 1, top + winH);
      i += w + spacing + randInt(0, 1);
    }
    return out;
  }},
  { name: 'pillars', min: 3, max: 5, desc: '通道中間的懸浮直柱，只留貼地或貼頂的縫', fn(N, d) {
    const out = stdCols(N);
    let i = randInt(0, 1);
    while (i < N) {
      // 只留一格高的縫：必須貼著地板或天花板滑過去，不能在半空中
      const w = randInt(1, 2), gapTop = rand() < .5 ? 1 : randInt(1, 2), gapBot = gapTop > 1 ? 1 : randInt(1, 2);
      for (let k = 0; k < w && i + k < N; k++) setRange(out[i + k], C0 + 1 + gapTop, F0 - 1 - gapBot);
      i += w + randInt(d >= 5 ? 1 : 2, 3);
    }
    return out;
  }},
  { name: 'platforms', min: 3, max: 5, desc: '沒有地板，在上下兩排懸浮平台間切換', fn(N, d) {
    const out = openCols(N);
    const lmin = [0, 0, 0, 3, 2, 2][d], lmax = [0, 0, 0, 5, 4, 4][d];
    let lane = rand() < .5 ? 1 : -1, x = 0;
    while (x < N) {
      const len = randInt(lmin, lmax), row = lane > 0 ? randInt(11, 14) : randInt(3, 6);
      for (let k = 0; k < len && x + k < N; k++) out[x + k][row] = 1;
      x += Math.max(1, len - randInt(0, 1));
      lane = -lane;
    }
    return out;
  }},
  { name: 'tunnel', min: 3, max: 5, desc: '上下曲折的窄隧道', fn(N, d) {
    const gap = [0, 0, 0, 6, 5, 5][d], smin = [0, 0, 0, 4, 4, 3][d], smax = [0, 0, 0, 5, 5, 4][d];
    const out = []; let top = rand() < .5 ? C0 + 1 : F0 - gap;   // 入口對齊標準地板或天花板
    while (out.length < N) {
      const len = randInt(smin, smax);
      for (let k = 0; k < len && out.length < N; k++) out.push(colCF(top - 1, top + gap));
      top = clamp(top + randInt(2, gap - 2) * (rand() < .5 ? -1 : 1), 2, ROWS - 2 - gap);
    }
    return out;
  }},
  { name: 'split', min: 4, max: 5, desc: '中間有橫桿的雙層通道', fn(N, d) {
    const out = stdCols(N), m = randInt(8, 9);
    let x = 0;
    while (x < N) {
      const len = randInt(2, 5);
      for (let k = 0; k < len && x + k < N; k++) out[x + k][m] = 1;
      x += len + 1;
    }
    let i = randInt(0, 2);
    while (i < N) {
      const w = randInt(1, 2), h = randInt(2, 4), onFloor = rand() < .5;
      for (let k = 0; k < w && i + k < N; k++) {
        if (onFloor) setRange(out[i + k], F0 - h, F0 - 1); else setRange(out[i + k], C0 + 1, C0 + h);
      }
      i += w + randInt(2, d >= 5 ? 3 : 4);
    }
    return out;
  }},
  { name: 'scatter', min: 4, max: 5, desc: '沒有地板，散落的小方塊群', fn(N, d) {
    const out = openCols(N); let x = 0;
    while (x < N) {
      const n = randInt(1, 2), used = [];
      for (let j = 0; j < n; j++) {
        let row, tries = 0;
        do { row = randInt(3, 14); tries++; } while (used.some(u => Math.abs(u - row) < 4) && tries < 20);
        used.push(row);
        const len = randInt(2, 3);
        for (let k = 0; k < len && x + k < N; k++) out[x + k][row] = 1;
      }
      x += randInt(2, 3);
    }
    return out;
  }},
];

function pickDifficulty(score) {
  let row = CONFIG.DIFFICULTY_TABLE[0];
  for (const r of CONFIG.DIFFICULTY_TABLE) if (score >= r.minScore) row = r;
  const total = row.weights.reduce((a, b) => a + b, 0);
  let t = rand() * total;
  for (let i = 0; i < 5; i++) { t -= row.weights[i]; if (t < 0) return i + 1; }
  return 1;
}

// 產生一關：長度 SEG_MIN~MAX 分，由數個不同類型的小段拼成；驗證可通關，失敗就重試，最後才降一級難度
function buildSegment(d) {
  if (!HANDMADE) prepareHandmade();
  if (HANDMADE.length) {
    const pool = HANDMADE.filter(l => l.d === d);
    if (pool.length && rand() < CONFIG.HANDMADE_CHANCE) return handmadeSegment(pickHandmade(pool), d);
    if (!CONFIG.USE_PROCEDURAL) {
      // 這個難度沒有手工關卡（或抽到不用），改用難度最接近的手工關卡
      const best = Math.min(...HANDMADE.map(l => Math.abs(l.d - d)));
      return handmadeSegment(pickHandmade(HANDMADE.filter(l => Math.abs(l.d - d) === best)), d);
    }
  }
  const N =randInt(CONFIG.SEG_MIN_POINTS, CONFIG.SEG_MAX_POINTS) * CONFIG.COLS_PER_POINT;
  for (let dd = d; dd >= 1; dd--) {
    const gens = GENS.filter(g => dd >= g.min && dd <= g.max);
    const tries = dd === d ? 40 : 15;
    for (let a = 0; a < tries; a++) {
      const cols = stdCols(CONFIG.CONN), names = [];
      let prev = null;
      while (cols.length < N) {
        let g = pick(gens);
        if (g === prev && gens.length > 1) g = pick(gens.filter(x => x !== prev));
        let len = Math.min(randInt(CONFIG.CHUNK_MIN, CONFIG.CHUNK_MAX), N - cols.length);
        if (N - cols.length - len < CONFIG.CHUNK_MIN) len = N - cols.length;   // 避免尾巴剩一小截
        for (const c of g.fn(len, dd)) cols.push(c);
        names.push(g.name); prev = g;
      }
      const path = validate(cols, dd);
      if (path) return { cols, d: dd, name: names.join('+'), coins: placeCoins(path, cols.length, dd, CONFIG.CONN), requested: d };
    }
  }
  return { cols: stdCols(N), d: 0, name: 'flat', coins: [], requested: d };
}

// 黃色方塊沿著驗證出來的路徑擺放，保證吃得到
function placeCoins(path, L, d, conn) {
  const cand = path.filter(p => p.x > (conn === undefined ? CONFIG.CONN : conn) && p.x < L - 2);
  if (!cand.length) return [];
  const air = cand.filter(p => p.air);
  const pool = air.length > 10 ? air : cand;
  const count = d <= 2 ? (rand() < .6 ? 1 : 0) : (rand() < .8 ? 1 : 2);
  const coins = [];
  for (let i = 0; i < count; i++) {
    const p = pick(pool);
    const h = (P + (SAFETY_MARGIN[d] || 0)) / 2;
    if (coins.some(c => Math.abs(c.x - (p.x + h)) < 3)) continue;
    coins.push({ x: p.x + h, y: p.y + h });
  }
  return coins;
}
