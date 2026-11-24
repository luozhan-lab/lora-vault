/**
 * 出图历史：把结果落到 gen_history 表，重启后还在。
 * 只存展示和再出需要的字段；spec_json 存当时那份配方，方便「再出」。
 */
import { db } from './db.mjs';

function rowToItem(r) {
  let spec = {};
  try { spec = r.spec_json ? JSON.parse(r.spec_json) : {}; } catch { spec = {}; }
  let loras = [];
  try { loras = r.loras ? JSON.parse(r.loras) : []; } catch { loras = []; }
  return {
    id: r.id,
    at: r.at,
    out: r.out_path,
    file: r.file,
    subfolder: r.subfolder,
    seed: r.seed,
    prompt: r.prompt,
    negative: r.negative,
    loras,
    elapsed_s: r.elapsed,
    rating: r.rating,
    spec,
  };
}

export function listHistory(limit = 40) {
  const n = Math.min(Math.max(Number(limit) || 40, 1), 200);
  return db().prepare('SELECT * FROM gen_history ORDER BY at DESC LIMIT ?').all(n).map(rowToItem);
}

export function addHistory(items) {
  const list = Array.isArray(items) ? items : [items];
  const conn = db();
  const stmt = conn.prepare(`
    INSERT INTO gen_history (at, out_path, file, subfolder, seed, prompt, negative, loras, spec_json, elapsed, rating)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(out_path) DO UPDATE SET
      at = excluded.at,
      file = excluded.file,
      subfolder = excluded.subfolder,
      seed = excluded.seed,
      prompt = excluded.prompt,
      negative = excluded.negative,
      loras = excluded.loras,
      spec_json = excluded.spec_json,
      elapsed = excluded.elapsed
  `);
  const now = new Date().toISOString();
  const out = [];
  for (const item of list) {
    if (!item || !item.out) continue;
    const at = String(item.at || now);
    try {
      stmt.run(
        at,
        String(item.out),
        String(item.file || ''),
        String(item.subfolder || ''),
        String(item.seed === undefined || item.seed === null ? '' : item.seed),
        String(item.prompt || ''),
        String(item.negative || ''),
        JSON.stringify(Array.isArray(item.loras) ? item.loras : []),
        JSON.stringify(item.spec || {}),
        item.elapsed_s === undefined || item.elapsed_s === null ? null : Number(item.elapsed_s),
        Number(item.rating) || 0,
      );
      out.push(String(item.out));
    } catch (e) {
      // 单条坏了别让整批失败
    }
  }
  return { saved: out.length };
}

export function rateHistory(outPath, rating) {
  if (!outPath) return 0;
  const v = Number(rating) === 1 ? 1 : (Number(rating) === -1 ? -1 : 0);
  const r = db().prepare('UPDATE gen_history SET rating = ? WHERE out_path = ?').run(v, String(outPath));
  return r.changes || 0;
}

export function clearHistory() {
  const r = db().prepare('DELETE FROM gen_history').run();
  return r.changes || 0;
}
