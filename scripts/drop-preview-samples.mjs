/** 把「补预览图」那批从样张/使用记录里清掉 */
import fs from 'node:fs';
import { db } from '../lib/db.mjs';
import { rebuildUsage } from '../lib/samples.mjs';

const GENLOG = 'D:\\Comfy-Desktop\\studio\\docs\\gen-log.jsonl';
const lines = fs.readFileSync(GENLOG, 'utf8').split(/\r?\n/).filter(Boolean);
const uids = new Set();
for (const l of lines) {
  try {
    const o = JSON.parse(l);
    if (o.kind === '预览' || o.note === '自出预览') uids.add(`${o.t || ''}|${o.file || ''}`);
  } catch { /* ignore */ }
}
console.log('预览类台账行', uids.size);

const conn = db();
let n = 0;
conn.exec('BEGIN');
try {
  const del = conn.prepare('DELETE FROM sample WHERE uid = ?');
  for (const u of uids) n += del.run(u).changes;
  conn.exec('COMMIT');
} catch (e) { try { conn.exec('ROLLBACK'); } catch {} throw e; }

rebuildUsage();
console.log('删掉样张', n);
console.log('样张剩', conn.prepare('SELECT COUNT(*) AS c FROM sample').get().c);
