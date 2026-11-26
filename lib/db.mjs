import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { DB_PATH } from './config.mjs';

let _db = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lora (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  rel_path      TEXT NOT NULL UNIQUE,
  root_path     TEXT NOT NULL DEFAULT '',
  filename      TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  name_en       TEXT NOT NULL DEFAULT '',
  name_zh       TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  description_zh   TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  work          TEXT NOT NULL DEFAULT '',
  base_model    TEXT NOT NULL DEFAULT '',
  trigger       TEXT NOT NULL DEFAULT '',
  triggers_synced INTEGER NOT NULL DEFAULT 0,
  feature_words TEXT NOT NULL DEFAULT '',
  outfit_words  TEXT NOT NULL DEFAULT '',
  body_words    TEXT NOT NULL DEFAULT '',
  negative      TEXT NOT NULL DEFAULT '',
  weight        REAL,
  note          TEXT NOT NULL DEFAULT '',
  source_url    TEXT NOT NULL DEFAULT '',
  download_url  TEXT NOT NULL DEFAULT '',
  model_id      TEXT NOT NULL DEFAULT '',
  version_id    TEXT NOT NULL DEFAULT '',
  file_id       TEXT NOT NULL DEFAULT '',
  preview       TEXT NOT NULL DEFAULT '',
  size_bytes    INTEGER,
  mtime         INTEGER,
  sha256        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'ok',
  meta_json     TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lora_category ON lora(category);
CREATE INDEX IF NOT EXISTS idx_lora_work ON lora(work);
CREATE INDEX IF NOT EXISTS idx_lora_name ON lora(name);

/* 一支 LoRA 可以有多条触发词：角色 / 特征 / 服装 / 身体 / 其他 */
CREATE TABLE IF NOT EXISTS lora_trigger (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  lora_id  INTEGER NOT NULL REFERENCES lora(id) ON DELETE CASCADE,
  text     TEXT NOT NULL,
  kind     TEXT NOT NULL DEFAULT 'other',
  label    TEXT NOT NULL DEFAULT '',
  weight   REAL,
  sort     INTEGER NOT NULL DEFAULT 0,
  enabled  INTEGER NOT NULL DEFAULT 1,
  UNIQUE (lora_id, text)
);
CREATE INDEX IF NOT EXISTS idx_lora_trigger_lora ON lora_trigger(lora_id);

/* 分类树：用户可以自己建/删/改名，内置 7 个顶层由 categories.mjs 播种 */
CREATE TABLE IF NOT EXISTS category (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  parent_id  INTEGER REFERENCES category(id) ON DELETE CASCADE,
  sort       INTEGER NOT NULL DEFAULT 0,
  builtin    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_category_name ON category(COALESCE(parent_id, 0), name);
CREATE INDEX IF NOT EXISTS idx_category_parent ON category(parent_id);

/* 杂项键值：记「分类播种过没有」这类一次性状态 */
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tag (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS lora_tag (
  lora_id INTEGER NOT NULL REFERENCES lora(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (lora_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_lora_tag_tag ON lora_tag(tag_id);

CREATE TABLE IF NOT EXISTS usage (
  lora_id      INTEGER PRIMARY KEY REFERENCES lora(id) ON DELETE CASCADE,
  runs         INTEGER NOT NULL DEFAULT 0,
  last_used    TEXT,
  last_image   TEXT
);

CREATE TABLE IF NOT EXISTS event (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  action  TEXT NOT NULL,
  lora_id INTEGER,
  actor   TEXT NOT NULL DEFAULT '',
  detail  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_event_at ON event(at);

CREATE TABLE IF NOT EXISTS sample (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lora_id    INTEGER NOT NULL REFERENCES lora(id) ON DELETE CASCADE,
  uid        TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL DEFAULT '',
  prompt     TEXT NOT NULL DEFAULT '',
  negative   TEXT NOT NULL DEFAULT '',
  seed       TEXT NOT NULL DEFAULT '',
  size       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sample_uid_lora ON sample(uid, lora_id);
CREATE INDEX IF NOT EXISTS idx_sample_lora ON sample(lora_id);
CREATE INDEX IF NOT EXISTS idx_sample_time ON sample(created_at);

CREATE TABLE IF NOT EXISTS recipe (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  payload    TEXT NOT NULL DEFAULT '{}',
  uses       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gen_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  out_path   TEXT NOT NULL UNIQUE,
  file       TEXT NOT NULL DEFAULT '',
  subfolder  TEXT NOT NULL DEFAULT '',
  seed       TEXT NOT NULL DEFAULT '',
  prompt     TEXT NOT NULL DEFAULT '',
  negative   TEXT NOT NULL DEFAULT '',
  loras      TEXT NOT NULL DEFAULT '[]',
  spec_json  TEXT NOT NULL DEFAULT '{}',
  elapsed    REAL,
  rating     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gen_history_at ON gen_history(at);
`;

export function db() {
  if (_db) return _db;
  _db = new DatabaseSync(DB_PATH);
  _db.exec(SCHEMA);
  _db.exec('PRAGMA busy_timeout = 5000');
  migrate(_db);
  return _db;
}

function migrate(conn) {
  const cols = new Set(conn.prepare('PRAGMA table_info(lora)').all().map((c) => c.name));
  if (!cols.has('root_path')) conn.exec("ALTER TABLE lora ADD COLUMN root_path TEXT NOT NULL DEFAULT ''");
  if (!cols.has('family')) conn.exec("ALTER TABLE lora ADD COLUMN family TEXT NOT NULL DEFAULT ''");
  if (!cols.has('is_variant')) conn.exec('ALTER TABLE lora ADD COLUMN is_variant INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('civitai_at')) conn.exec("ALTER TABLE lora ADD COLUMN civitai_at TEXT NOT NULL DEFAULT ''");
  if (!cols.has('aliases')) conn.exec("ALTER TABLE lora ADD COLUMN aliases TEXT NOT NULL DEFAULT ''");
  if (!cols.has('name_zh')) conn.exec("ALTER TABLE lora ADD COLUMN name_zh TEXT NOT NULL DEFAULT ''");
  if (!cols.has('description')) conn.exec("ALTER TABLE lora ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  if (!cols.has('description_zh')) conn.exec("ALTER TABLE lora ADD COLUMN description_zh TEXT NOT NULL DEFAULT ''");
  if (!cols.has('preview_kind')) conn.exec("ALTER TABLE lora ADD COLUMN preview_kind TEXT NOT NULL DEFAULT ''");
  if (!cols.has('triggers_synced')) conn.exec('ALTER TABLE lora ADD COLUMN triggers_synced INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('category_id')) conn.exec('ALTER TABLE lora ADD COLUMN category_id INTEGER REFERENCES category(id) ON DELETE SET NULL');
  if (!cols.has('category_path')) conn.exec("ALTER TABLE lora ADD COLUMN category_path TEXT NOT NULL DEFAULT ''");
  conn.exec('CREATE INDEX IF NOT EXISTS idx_lora_category_id ON lora(category_id)');

  const scols = new Set(conn.prepare('PRAGMA table_info(sample)').all().map((c) => c.name));
  if (!scols.has('rating')) conn.exec('ALTER TABLE sample ADD COLUMN rating INTEGER NOT NULL DEFAULT 0');

  const tcols = new Set(conn.prepare('PRAGMA table_info(tag)').all().map((c) => c.name));
  if (!tcols.has('kind')) conn.exec("ALTER TABLE tag ADD COLUMN kind TEXT NOT NULL DEFAULT ''");
}

export function closeDb() {
  if (_db) { try { _db.close(); } catch {} _db = null; }
}

export function logEvent(action, loraId = null, actor = '', detail = '') {
  db().prepare('INSERT INTO event (at, action, lora_id, actor, detail) VALUES (?,?,?,?,?)')
    .run(new Date().toISOString(), action, loraId, actor, detail);
}

export function backupDb() {
  if (!fs.existsSync(DB_PATH)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${DB_PATH}.bak-${stamp}`;
  fs.copyFileSync(DB_PATH, dest);
  return dest;
}
