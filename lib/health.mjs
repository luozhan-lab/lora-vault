import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from './db.mjs';
import { loadConfig, DATA_DIR, PREVIEW_DIR } from './config.mjs';
import { absOf } from './roots.mjs';

/* 预览图字段有值不代表文件还在：老库改过名 / 删过图，这里按磁盘实际文件判断 */
function previewUsable(preview, cfg) {
  if (!preview) return false;
  if (/^https?:\/\//i.test(preview)) return true;
  const first = String(preview).split('|')[0].trim();
  if (first.startsWith('local:')) return fs.existsSync(path.join(PREVIEW_DIR, first.slice(6)));
  if (path.isAbsolute(first)) return fs.existsSync(first);
  const samplesRoot = cfg.samplesRoot || '';
  return [
    path.join(DATA_DIR, 'previews', first),
    samplesRoot ? path.join(samplesRoot, first) : '',
    samplesRoot ? path.join(path.dirname(samplesRoot), first) : '',
    first,
  ].filter(Boolean).some((c) => fs.existsSync(c));
}

function sha256File(abs) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(abs, { highWaterMark: 1024 * 1024 });
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

/**
 * 算 hash。默认只算「同大小」的那些组 —— 大小都不同的绝不可能是同一支，
 * 没必要把 100 GB 全读一遍。
 */
export async function hashLoras(ctx, { scope = 'same-size' } = {}) {
  const conn = db();
  const cfg = loadConfig();
  let rows;
  if (scope === 'all') {
    rows = conn.prepare("SELECT id, rel_path, size_bytes FROM lora WHERE status = 'ok' AND sha256 = ''").all();
  } else {
    rows = conn.prepare(`
      SELECT l.id, l.rel_path, l.size_bytes
      FROM lora l
      JOIN (SELECT size_bytes FROM lora WHERE status = 'ok'
            GROUP BY size_bytes HAVING COUNT(*) > 1) g ON g.size_bytes = l.size_bytes
      WHERE l.status = 'ok' AND l.sha256 = ''
    `).all();
  }

  ctx.setTotal(rows.length);
  ctx.log(`待算 ${rows.length} 支（scope=${scope}）`);

  const upd = conn.prepare('UPDATE lora SET sha256 = ? WHERE id = ?');
  for (const r of rows) {
    if (ctx.cancelled()) break;
    const abs = absOf(r.rel_path, cfg);
    try {
      if (!fs.existsSync(abs)) { ctx.tick(false, `缺文件 ${r.rel_path}`); continue; }
      const hash = await sha256File(abs);
      upd.run(hash, r.id);
      ctx.tick(true);
    } catch (e) {
      ctx.tick(false, `失败 ${r.rel_path}: ${e.message}`);
    }
  }
}

export function duplicateGroups() {
  const conn = db();
  const groups = conn.prepare(`
    SELECT sha256, COUNT(*) AS n, SUM(size_bytes) AS total
    FROM lora WHERE sha256 <> '' AND status = 'ok'
    GROUP BY sha256 HAVING n > 1
    ORDER BY total DESC
  `).all();

  return groups.map((g) => {
    const items = conn.prepare(`
      SELECT id, name, rel_path, size_bytes, mtime,
             COALESCE((SELECT runs FROM usage u WHERE u.lora_id = lora.id), 0) AS runs
      FROM lora WHERE sha256 = ? ORDER BY runs DESC, mtime ASC
    `).all(g.sha256);
    const waste = g.total - (items[0] ? items[0].size_bytes : 0);
    return { sha256: g.sha256, count: g.n, totalBytes: g.total, wasteBytes: waste, keep: items[0], items };
  });
}

export function healthReport() {
  const conn = db();
  const cfg = loadConfig();
  const one = (sql) => conn.prepare(sql).get().c;
  const dup = duplicateGroups();

  let noImage = 0;
  let noImageEmpty = 0;
  let noImageFile = 0;
  let noImageCapable = 0;
  let noImageNoSource = 0;
  for (const r of conn.prepare(
    'SELECT id, preview, status, model_id, source_url, download_url FROM lora').all()) {
    if (r.status !== 'ok') continue;
    const empty = !r.preview;
    const broken = !empty && !previewUsable(r.preview, cfg);
    if (!empty && !broken) continue;
    noImage++;
    if (empty) noImageEmpty++;
    else noImageFile++;
    const capable = !!(r.model_id || /civitai/i.test(r.source_url) || /civitai/i.test(r.download_url));
    if (capable) noImageCapable++;
    else noImageNoSource++;
  }

  // 名字「还是文件名」的，只算文件名里没有中文的那些
  const CJK = /[\u4e00-\u9fa5]/;
  const noName = conn.prepare('SELECT name, filename FROM lora').all()
    .filter((r) => !CJK.test(r.filename) && r.name === String(r.filename).replace(/\.safetensors$/i, '')).length;

  return {
    total: one('SELECT COUNT(*) c FROM lora'),
    ok: one("SELECT COUNT(*) c FROM lora WHERE status='ok'"),
    missing: one("SELECT COUNT(*) c FROM lora WHERE status<>'ok'"),
    unused: one(`SELECT COUNT(*) c FROM lora l LEFT JOIN usage u ON u.lora_id = l.id
                 WHERE COALESCE(u.runs,0) = 0`),
    noImage,
    noImageEmpty,
    noImageFile,
    noImageCapable,
    noImageNoSource,
    missingMeta: one(`SELECT COUNT(*) c FROM lora WHERE status='ok' AND (
      trigger = '' OR feature_words = '' OR outfit_words = '' OR
      download_url = '' OR source_url = '')`),
    noName,
    noSource: one("SELECT COUNT(*) c FROM lora WHERE source_url = '' AND model_id = ''"),
    civitaiCapable: one("SELECT COUNT(*) c FROM lora WHERE model_id <> '' OR source_url LIKE '%civitai%'"),
    hashed: one("SELECT COUNT(*) c FROM lora WHERE sha256 <> ''"),
    sameSizeGroups: one(`SELECT COUNT(*) c FROM (
      SELECT size_bytes FROM lora WHERE status='ok' GROUP BY size_bytes HAVING COUNT(*) > 1)`),
    dupGroups: dup.length,
    dupWasteBytes: dup.reduce((s, g) => s + g.wasteBytes, 0),
    samples: one('SELECT COUNT(*) c FROM sample'),
    sampledLoras: one('SELECT COUNT(DISTINCT lora_id) c FROM sample'),
    bytes: one('SELECT COALESCE(SUM(size_bytes),0) c FROM lora'),
  };
}
