import fs from 'node:fs';
import path from 'node:path';
import { db, logEvent } from './db.mjs';
import { DATA_DIR, loadConfig } from './config.mjs';
import { resolveRelPath, withTx } from './loras.mjs';
import { runMagick } from './media.mjs';

export const SAMPLE_THUMB_DIR = path.join(DATA_DIR, 'sample-thumbs');

/* ---------------------------- 从台账同步 ---------------------------- */

let lastSignature = '';

export function syncGenLog(ctx = null, { quiet = false } = {}) {
  const cfg = loadConfig();
  const file = cfg.genLogPath;
  if (!file || !fs.existsSync(file)) {
    if (ctx) ctx.log('台账不存在，跳过');
    return { lines: 0, inserted: 0, missing: 0 };
  }

  const st = fs.statSync(file);
  const signature = `${st.size}:${Math.floor(st.mtimeMs)}`;
  if (quiet && signature === lastSignature) return { lines: 0, inserted: 0, missing: 0 };
  lastSignature = signature;

  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);

  const conn = db();
  const idByRel = new Map();
  for (const r of conn.prepare('SELECT id, rel_path FROM lora').all()) {
    idByRel.set(String(r.rel_path).toLowerCase(), r.id);
  }

  const ins = conn.prepare(`
    INSERT OR IGNORE INTO sample (lora_id, uid, image_path, prompt, negative, seed, size, created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `);

  let inserted = 0;
  let missing = 0;
  let touched = 0;
  if (ctx) ctx.setTotal(lines.length);

  withTx(() => {
    for (const line of lines) {
      let o;
      try { o = JSON.parse(line); } catch { if (ctx) ctx.tick(false); continue; }
      const loras = Array.isArray(o.lora) ? o.lora : [];
      // 补预览图跑出来的不算「使用」，也不进样张墙
      if (o.kind === '预览' || o.note === '自出预览') { if (ctx) ctx.tick(true); continue; }
      if (loras.length) {
        const uid = `${o.t || ''}|${o.file || ''}`;
        for (const item of loras) {
          const key = path.basename(String(item).split(':')[0].replaceAll('/', '\\')).toLowerCase();
          const rel = String(resolveRelPath(String(item).split(':')[0])).toLowerCase();
          const id = idByRel.get(rel) || idByRel.get(key);
          if (!id) { missing++; continue; }
          const info = ins.run(
            id, uid, o.file || '', String(o.prompt || ''), String(o.negative || ''),
            String(o.seed || ''), String(o.size || ''), o.t || '',
          );
          if (info.changes) { inserted++; touched++; }
        }
      }
      if (ctx) ctx.tick(true);
    }
  });

  rebuildUsage();
  logEvent('sample-sync', null, ctx ? 'job' : 'boot', `${lines.length} 行 / 新增 ${inserted}`);
  if (ctx) ctx.log(`台账 ${lines.length} 行，新增样张 ${inserted} 条，对不上的挂载 ${missing} 次`);
  return { lines: lines.length, inserted, missing };
}

/** 用样张表重算「用过几次 / 最后一次」*/
export function rebuildUsage() {
  const conn = db();
  withTx(() => {
    conn.prepare('DELETE FROM usage').run();
    conn.prepare(`
      INSERT INTO usage (lora_id, runs, last_used, last_image)
      SELECT s.lora_id, COUNT(*) AS runs, MAX(s.created_at),
             (SELECT s2.image_path FROM sample s2 WHERE s2.lora_id = s.lora_id
              ORDER BY s2.created_at DESC LIMIT 1)
      FROM sample s GROUP BY s.lora_id
    `).run();
  });
}

/* ---------------------------- 查询 ---------------------------- */

export function samplesForLora(loraId, limit = 40) {
  return db().prepare(`
    SELECT id, image_path, prompt, created_at, seed, size, rating
    FROM sample WHERE lora_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(loraId, Number(limit));
}

/** 给一张样张打分：1 好 / -1 废 / 0 取消 */
export function rateSample(id, rating) {
  const v = Number(rating) === 1 ? 1 : Number(rating) === -1 ? -1 : 0;
  db().prepare('UPDATE sample SET rating = ? WHERE id = ?').run(v, Number(id));
  return { id: Number(id), rating: v };
}

/** 每支的成片率 */
export function qualityByLora(loraIds) {
  if (!loraIds || !loraIds.length) return {};
  const rows = db().prepare(`
    SELECT lora_id,
           SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS good,
           SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) AS bad,
           COUNT(*) AS total
    FROM sample WHERE lora_id IN (${loraIds.map(() => '?').join(',')})
    GROUP BY lora_id
  `).all(...loraIds);
  const out = {};
  for (const r of rows) out[r.lora_id] = r;
  return out;
}

export function sampleById(id) {
  return db().prepare('SELECT * FROM sample WHERE id = ?').get(id);
}

/** 出图页结果墙按图片路径找回图库样张（Windows 反斜杠 / 大小写都归一）。 */
export function sampleByImagePath(imagePath) {
  const p = String(imagePath || '').trim().replaceAll('\\', '/');
  if (!p) return null;
  return db().prepare(`
    SELECT id, image_path, rating, prompt, seed
    FROM sample
    WHERE lower(replace(image_path, char(92), '/')) = lower(?)
    ORDER BY id DESC LIMIT 1
  `).get(p);
}

/** 一张图可能因为多支 LoRA 在 sample 里有多行；结果墙一次保留/丢弃要全改。 */
export function rateSamplesByImagePath(imagePath, rating) {
  const v = Number(rating) === 1 ? 1 : Number(rating) === -1 ? -1 : 0;
  const p = String(imagePath || '').trim().replaceAll('\\', '/');
  if (!p) return { updated: 0, rating: v };
  const info = db().prepare(`
    UPDATE sample SET rating = ?
    WHERE lower(replace(image_path, char(92), '/')) = lower(?)
  `).run(v, p);
  return { updated: Number(info.changes) || 0, rating: v };
}

export function promptSearch(q, limit = 40) {
  const like = `%${String(q || '').trim()}%`;
  return db().prepare(`
    SELECT s.uid, MIN(s.image_path) AS image_path, MIN(s.prompt) AS prompt,
           MIN(s.created_at) AS created_at, MIN(s.id) AS sample_id,
           GROUP_CONCAT(DISTINCT l.name) AS lora_names
    FROM sample s JOIN lora l ON l.id = s.lora_id
    WHERE s.prompt LIKE ? OR l.name LIKE ?
    GROUP BY s.uid
    ORDER BY created_at DESC LIMIT ?
  `).all(like, like, Number(limit));
}

/* ---------------------------- 样张缩略图 ---------------------------- */

const inflight = new Map();

export function sampleThumbPath(sampleId) {
  return path.join(SAMPLE_THUMB_DIR, `${sampleId}.jpg`);
}

export async function ensureSampleThumb(sample) {
  if (!sample || !sample.image_path) return null;
  const src = sample.image_path;
  if (!fs.existsSync(src)) return null;
  const dest = sampleThumbPath(sample.id);
  if (fs.existsSync(dest)) return dest;
  if (inflight.has(sample.id)) return inflight.get(sample.id);

  const p = (async () => {
    fs.mkdirSync(SAMPLE_THUMB_DIR, { recursive: true });
    const { ok } = await runMagick([src, '-auto-orient', '-resize', '420x420>', '-quality', '82', dest]);
    return ok && fs.existsSync(dest) ? dest : null;
  })().finally(() => inflight.delete(sample.id));

  inflight.set(sample.id, p);
  return p;
}

/* ---------------------------- 守着台账 ---------------------------- */

let timer = null;

export function startGenLogWatcher() {
  if (timer) return;
  const cfg = loadConfig();
  if (!cfg.watchGenLog) return;
  const interval = Math.max(3000, Number(cfg.watchIntervalMs) || 10000);

  const tick = () => {
    try {
      const r = syncGenLog(null, { quiet: true });
      if (r.inserted) console.log(`[gen-log] 新增样张 ${r.inserted} 条（${r.lines} 行）`);
    } catch (e) {
      // 台账被占用 / 文件暂时读不到，下一轮再试
    }
  };

  // 先跑一次全量补齐
  try {
    const r = syncGenLog(null, { quiet: true });
    if (r.lines) console.log(`[gen-log] 同步 ${r.lines} 行，新增 ${r.inserted} 条样张`);
  } catch { /* ignore */ }

  timer = setInterval(tick, interval);
  if (timer.unref) timer.unref();
}

export function stopGenLogWatcher() {
  if (timer) { clearInterval(timer); timer = null; }
}
