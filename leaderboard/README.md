# Gravity Switch 排行榜部署步驟

免費方案就夠用：Workers 每天 10 萬次請求、D1 每天 500 萬列讀取與 10 萬列寫入。
以下指令都在這個 `leaderboard` 資料夾裡執行。需要先安裝 Node.js（已經有了）。

---

## 1. 註冊並登入 Cloudflare

到 https://dash.cloudflare.com/sign-up 註冊，免費方案不需要信用卡。接著：

```
cd gravity-switch/leaderboard
npx wrangler login
```

瀏覽器會跳出授權頁面，按 Allow。

## 2. 建立資料庫

```
npx wrangler d1 create gravity-scores
```

指令會印出一段設定，其中有一行 `database_id = "xxxxxxxx-..."`。
把那串 id 複製到 `wrangler.jsonc` 的 `"database_id"` 欄位。

順便把同一個檔案裡的 `"SALT"` 換成你自己的一串隨機字元。

## 3. 建立資料表

```
npx wrangler d1 execute gravity-scores --remote --file=./schema.sql
```

（把 `--remote` 換成 `--local` 就是只建在本機，用於測試。）

## 4. 部署 API

```
npx wrangler deploy
```

成功後會印出網址，像是：

```
https://gravity-scores.你的帳號.workers.dev
```

## 5. 接回遊戲

打開 `gravity-switch/index.html`，找到這一行：

```js
const LEADERBOARD_API = '';
```

把網址貼進去（結尾不要加斜線）：

```js
const LEADERBOARD_API = 'https://gravity-scores.你的帳號.workers.dev';
```

存檔後排行榜按鈕就會出現在主選單。最後把改動推上 GitHub。

---

## 測試指令

送一筆假資料：

```
curl -X POST https://gravity-scores.你的帳號.workers.dev/score ^
  -H "content-type: application/json" ^
  -d "{\"name\":\"測試\",\"score\":123,\"player\":\"test-001\"}"
```

看榜單：

```
curl "https://gravity-scores.你的帳號.workers.dev/top?n=20"
```

刪掉測試資料：

```
npx wrangler d1 execute gravity-scores --remote --command "DELETE FROM scores WHERE player='test-001'"
```

## 常用維護指令

看目前榜單：

```
npx wrangler d1 execute gravity-scores --remote --command "SELECT name, score FROM scores ORDER BY score DESC LIMIT 20"
```

刪掉某個作弊的人：

```
npx wrangler d1 execute gravity-scores --remote --command "DELETE FROM scores WHERE name='壞人'"
```

看即時記錄（除錯用）：

```
npx wrangler tail
```

---

## 目前的防護與限制

- 同一個 IP 每分鐘最多 5 次提交，超過回 429。
- 分數上限 2000，超過直接拒絕（在 `worker.js` 的 `MAX_SCORE`）。
- 一位玩家只留最高分，不會洗版。
- IP 只存加鹽雜湊，不存原始 IP。

**擋不住認真作弊的人**：任何人都能直接用 curl 送出一筆高分。真的遇到再考慮做重播驗證
（上傳關卡種子與操作紀錄、伺服器用同一份 `core.js` 重跑），那需要先把 `core.js` 的亂數
改成可指定種子。
