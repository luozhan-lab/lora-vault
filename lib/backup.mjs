/**
 * 数据备份：把 lora.db（一致性快照）和 config.json 打进 data/backups/<时间戳>/。
 * 启动时一天内没备过就自动备一次；手动备份走接口。默认留最近 10 份。
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.mjs';
import { DATA_DIR, CONFIG_PATH, DB_PATH } from './config.mjs';

export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const KEEP = 10;
const DAY = 24 * 3600 * 1000;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sqlQuote(s) {
  return String(s).replace(/'/g, "''");
}

function prune() {
  let dirs = [];
  try {
    dirs = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('backup-'))
      .map((d) => ({ name: d.name, at: safeAt(d.name) }));
  } catch { return; }
  dirs.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  for (const d of dirs.slice(KEEP)) {
    try { fs.rmSync(path.join(BACKUP_DIR, d.name), { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function safeAt(name) {
  const m = String(name).match(/^backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

function readManifest(dir, name) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    return {
      name,
      at: m.at || safeAt(name),
      reason: m.reason || '',
      dbBytes: Number(m.dbBytes) || 0,
      configBytes: Number(m.configBytes) || 0,
      size: (Number(m.dbBytes) || 0) + (Number(m.configBytes) || 0),
    };
  } catch {
    let size = 0;
    try {
      for (const f of fs.readdirSync(dir)) {
        try { size += fs.statSync(path.join(dir, f)).size; } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return { name, at: safeAt(name), reason: '', dbBytes: 0, configBytes: 0, size };
  }
}

export function listBackups() {
  let names = [];
  try {
    names = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('backup-'))
      .map((d) => d.name);
  } catch { return []; }
  return names
    .map((n) => readManifest(path.join(BACKUP_DIR, n), n))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function createBackup(reason = 'manual') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = 'backup-' + stamp();
  const dir = path.join(BACKUP_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  let dbBytes = 0;
  if (fs.existsSync(DB_PATH)) {
    const target = path.join(dir, 'lora.db');
    // VACUUM INTO 拿的是一致的快照，WAL 里的改动也会带上
    db().exec(`VACUUM INTO '${sqlQuote(target)}'`);
    try { dbBytes = fs.statSync(target).size; } catch { dbBytes = 0; }
  }
  let configBytes = 0;
  if (fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(CONFIG_PATH, path.join(dir, 'config.json'));
    try { configBytes = fs.statSync(path.join(dir, 'config.json')).size; } catch { configBytes = 0; }
  }
  const manifest = {
    at: new Date().toISOString(),
    reason,
    dbBytes,
    configBytes,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  prune();
  return { name, at: manifest.at, reason, dbBytes, configBytes, size: dbBytes + configBytes };
}

/** 启动时兜底：超过一天没备份就自动备一份。失败不拦启动。 */
export function autoBackup() {
  try {
    const last = listBackups()[0];
    if (last && Date.now() - Date.parse(last.at) < DAY) return null;
    return createBackup('auto');
  } catch (e) {
    console.error('[backup] 自动备份失败：' + e.message);
    return null;
  }
}
