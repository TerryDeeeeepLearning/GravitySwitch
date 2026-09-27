-- Gravity Switch 排行榜資料表
-- 建立方式： npx wrangler d1 execute gravity-scores --remote --file=./schema.sql

-- 一位玩家一列，只保留最高分
CREATE TABLE IF NOT EXISTS scores (
  player     TEXT PRIMARY KEY,   -- 玩家瀏覽器產生的隨機 ID
  name       TEXT NOT NULL,      -- 顯示名稱
  score      INTEGER NOT NULL,
  ip_hash    TEXT,               -- IP 加鹽雜湊，僅供濫用追查，不存原始 IP
  created_at INTEGER NOT NULL    -- 破紀錄的時間（毫秒）
);

-- 排名查詢用：分數高的在前，同分先達成的在前
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (score DESC, created_at ASC);

-- 限流用的暫存紀錄，超過 5 分鐘會被清掉
CREATE TABLE IF NOT EXISTS hits (
  ip_hash TEXT NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hits ON hits (ip_hash, at);
