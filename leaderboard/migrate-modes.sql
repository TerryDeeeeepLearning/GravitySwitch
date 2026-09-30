-- 把舊版排行榜（沒有 mode 欄位）升級成分模式的排行榜，舊成績全部歸到經典模式
-- 只需要執行一次： npx wrangler d1 execute gravity-scores --remote --file=./migrate-modes.sql

CREATE TABLE scores_new (
  player     TEXT NOT NULL,
  mode       TEXT NOT NULL DEFAULT 'classic',
  name       TEXT NOT NULL,
  score      INTEGER NOT NULL,
  ip_hash    TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player, mode)
);

INSERT INTO scores_new (player, mode, name, score, ip_hash, created_at)
  SELECT player, 'classic', name, score, ip_hash, created_at FROM scores;

DROP TABLE scores;
ALTER TABLE scores_new RENAME TO scores;

CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (mode, score DESC, created_at ASC);
