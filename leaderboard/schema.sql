-- Gravity Switch 排行榜資料表（全新建立用）
-- 建立方式： npx wrangler d1 execute gravity-scores --remote --file=./schema.sql
-- 已經有舊版資料表（沒有 mode 欄位）的話，改跑 migrate-modes.sql

-- 一位玩家每個模式一列，只保留最高分
CREATE TABLE IF NOT EXISTS scores (
  player     TEXT NOT NULL,                     -- 玩家瀏覽器產生的隨機 ID
  mode       TEXT NOT NULL DEFAULT 'classic',   -- classic / crazy / invisible
  name       TEXT NOT NULL,                     -- 顯示名稱
  score      INTEGER NOT NULL,
  ip_hash    TEXT,                              -- IP 加鹽雜湊，僅供濫用追查，不存原始 IP
  created_at INTEGER NOT NULL,                  -- 破紀錄的時間（毫秒）
  PRIMARY KEY (player, mode)
);

-- 排名查詢用：同模式內分數高的在前，同分先達成的在前
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (mode, score DESC, created_at ASC);

-- 限流用的暫存紀錄，超過 5 分鐘會被清掉
CREATE TABLE IF NOT EXISTS hits (
  ip_hash TEXT NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hits ON hits (ip_hash, at);
