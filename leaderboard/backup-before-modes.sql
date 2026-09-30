PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE scores (
  player     TEXT PRIMARY KEY,   -- 玩家瀏覽器產生的隨機 ID
  name       TEXT NOT NULL,      -- 顯示名稱
  score      INTEGER NOT NULL,
  ip_hash    TEXT,               -- IP 加鹽雜湊，僅供濫用追查，不存原始 IP
  created_at INTEGER NOT NULL    -- 破紀錄的時間（毫秒）
);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('kt1bnumt2ihmuk5nndm','玩家',27,'c1decc199f661eecf644e30fd16a69ad',1790534261671);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('psx4d6867rmuk5wz07','玩家',85,'c1decc199f661eecf644e30fd16a69ad',1790706674989);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('fpbc9e9g625muk67pk3','亞軍喵',146,'3ededd64b0669467becb5394ae4be06a',1790571810110);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('44zcj9xqhj4muk6ftpu','冬',110,'4ffda4889568f43cf5f02bff8e36a75b',1790695033207);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('a9flmj0byrsmuk7blhq','玩家',38,'a49bb65e9d16663068ebf0e716dea17d',1790537159437);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('m57xbm6e2mpmuk7l7s0','玩家',88,'6af38dd1b4d3d3d50589926f961f9ec0',1790537375092);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('zrw64myabamuki6x0l','施承喵',168,'0643febb83033d18810692bccb54e126',1790582598680);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('ybotdicd1kmukineuz','蔡怡喵',122,'0643febb83033d18810692bccb54e126',1790583528276);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('ikivlpzfxpnmukpyusq','趙',84,'98ac899e23b6cb638a5e810b4bc3abf0',1790568076599);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('cq0vbntzgxbmukpyyz6','5pl',140,'3af763a9af80f15c66910083ed12c329',1790644676693);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('3fi4po6d1hqmul85137','玩家',24,'6bf568c45ffbf627a3b74221b61df887',1790598556172);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('lroumm5nhnomul87of3','玩家',50,'6bf568c45ffbf627a3b74221b61df887',1790663059903);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('b5u2gcxjj9dmul8ohtl','玩家',51,'6bf568c45ffbf627a3b74221b61df887',1790662585798);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('r30pnci6ugemulioj6f','玩家',14,'fefaf2724fc3221adb4346f5dcd1a94c',1790616355679);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('ycgbsroqcr8mulmkt89','便便貓',57,'e8325aef144ce4dd8d7d649a95598a9b',1790624534284);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('tdohe38nn9munmtnov','殿軍喵',133,'320da32d4867246a224a81f09ce8002b',1790744914217);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('om4rh5aq35muno3ag6','尼哥哭',94,'c665bd777b4567d6e051b91ebae91800',1790747180061);
INSERT INTO "scores" ("player","name","score","ip_hash","created_at") VALUES('g2lxoyszf64munrpob6','玩家',65,'320da32d4867246a224a81f09ce8002b',1790752455050);
CREATE TABLE hits (
  ip_hash TEXT NOT NULL,
  at      INTEGER NOT NULL
);
INSERT INTO "hits" ("ip_hash","at") VALUES('320da32d4867246a224a81f09ce8002b',1790752373877);
INSERT INTO "hits" ("ip_hash","at") VALUES('320da32d4867246a224a81f09ce8002b',1790752385744);
INSERT INTO "hits" ("ip_hash","at") VALUES('320da32d4867246a224a81f09ce8002b',1790752415168);
INSERT INTO "hits" ("ip_hash","at") VALUES('320da32d4867246a224a81f09ce8002b',1790752455050);
CREATE INDEX idx_scores_rank ON scores (score DESC, created_at ASC);
CREATE INDEX idx_hits ON hits (ip_hash, at);
