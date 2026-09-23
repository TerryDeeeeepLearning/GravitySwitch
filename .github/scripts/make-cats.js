// 掃描 win/ 與 lose/ 資料夾，把檔名清單寫進 cats.js
// 網頁沒辦法自己列出資料夾內容，所以新增或刪除照片後要重跑一次：
//   node .github/scripts/make-cats.js
'use strict';
const fs = require('fs');
const path = require('path');

const IMG = /\.(jpe?g|png|gif|webp|avif)$/i;
const root = ['gravity-switch', '.', '..'].find(r => fs.existsSync(path.join(r, 'index.html')));
if (!root) { console.error('找不到 index.html，請在專案資料夾裡執行'); process.exit(1); }

function list(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) { console.warn(`找不到資料夾 ${dir}/`); return []; }
  return fs.readdirSync(full).filter(f => IMG.test(f)).sort()
    .map(f => `${dir}/${f}`);
}

const win = list('win'), lose = list('lose');
const out = '// 結算時彈出的貓咪照片清單 —— 由 .github/scripts/make-cats.js 產生\n' +
  '// 新增或刪除照片後請重跑： node .github/scripts/make-cats.js\n' +
  `const WIN_CATS = ${JSON.stringify(win, null, 2)};\n\n` +
  `const LOSE_CATS = ${JSON.stringify(lose, null, 2)};\n`;

fs.writeFileSync(path.join(root, 'cats.js'), out);
console.log(`win  ${win.length} 張：${win.map(f => path.basename(f)).join(', ') || '（無）'}`);
console.log(`lose ${lose.length} 張：${lose.map(f => path.basename(f)).join(', ') || '（無）'}`);
console.log(`已寫入 ${path.join(root, 'cats.js')}`);
