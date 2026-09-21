// 驗證 levels.js 裡的每一關是否還能通關（遊戲載入時會略過過不了的關卡）
// 用法：node .github/scripts/validate-levels.js [--strict]
//   預設只警告；加上 --strict 時，只要有一關過不了就讓這個步驟失敗
'use strict';
const fs = require('fs');
const path = require('path');

const STRICT = process.argv.includes('--strict');
const root = ['gravity-switch', '.', '..'].find(r =>
  fs.existsSync(path.join(r, 'core.js')) && fs.existsSync(path.join(r, 'levels.js')));

if (!root) {
  console.log('找不到 core.js / levels.js，略過驗證。');
  process.exit(0);
}

const api = new Function(
  fs.readFileSync(path.join(root, 'core.js'), 'utf8') +
  fs.readFileSync(path.join(root, 'levels.js'), 'utf8') +
  '; return { validateDetailed, stdCols, parseLevel, mirrorLevel, levelConn, CONFIG, LEVELS: typeof HANDMADE_LEVELS !== "undefined" ? HANDMADE_LEVELS : [] };'
)();

const { validateDetailed, stdCols, parseLevel, mirrorLevel, levelConn, CONFIG, LEVELS } = api;

// 遊戲會隨機把關卡上下翻轉使用，所以兩個方向都要檢查
function check(level, mirrored) {
  const lv = parseLevel(level);
  const conn = levelConn(level);
  const cols = stdCols(conn).concat((mirrored ? mirrorLevel(lv) : lv).cols);
  const res = validateDetailed(cols, level.d);
  const bad = res.filter(r => !r.ok);
  return {
    ok: !bad.length,
    detail: bad.map(r => `${r.label}（卡在第 ${Math.floor(r.maxX + r.s + 0.1) - conn + 1} 格）`).join('、'),
  };
}

const rows = [];
let failed = 0;

for (const L of LEVELS) {
  const fwd = check(L, false);
  const mir = check(L, true);
  if (!fwd.ok || !mir.ok) failed++;
  rows.push({
    name: L.name,
    d: L.d,
    cols: L.rows[0].length,
    conn: levelConn(L),
    fwd, mir,
  });
}

const line = r =>
  `| ${r.name} | D${r.d} | ${r.cols} 格 | ${r.conn} 格 | ${r.fwd.ok ? '✅' : '❌ ' + r.fwd.detail} | ${r.mir.ok ? '✅' : '❌ ' + r.mir.detail} |`;

const md = [
  `## 手工關卡驗證`,
  ``,
  `共 ${LEVELS.length} 關，${LEVELS.length - failed} 關通過，${failed} 關無法通關。`,
  failed ? `\n> ⚠ 無法通關的關卡在遊戲中會被自動略過。用 editor.html 打開該關，紅線會標出卡住的位置。\n` : '',
  `速度 ${CONFIG.SPEED}、重力 ${CONFIG.GRAVITY}、切換初速 ${CONFIG.FLIP_KICK}（改動這些參數會影響驗證結果）`,
  ``,
  `| 關卡 | 難度 | 長度 | 銜接 | 正向 | 上下翻轉 |`,
  `| --- | --- | --- | --- | --- | --- |`,
  ...rows.map(line),
].join('\n');

console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');

if (failed) {
  for (const r of rows) {
    if (!r.fwd.ok) console.log(`::warning::關卡「${r.name}」正向無法通關：${r.fwd.detail}`);
    if (!r.mir.ok) console.log(`::warning::關卡「${r.name}」上下翻轉後無法通關：${r.mir.detail}`);
  }
}

process.exit(STRICT && failed ? 1 : 0);
