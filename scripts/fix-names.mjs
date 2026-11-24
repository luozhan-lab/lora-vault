import { db } from '../lib/db.mjs';

const fixes = {
  297: '涂山苏苏 · v1',
  298: '涂山苏苏 v3 · 第10轮',
  299: '涂山苏苏 v3 · 第16轮',
  309: '缇宝 · comfy 导出',
  691: '桃夭 29b · v1',
  692: '桃夭 · a8',
  395: '花咲蕾（光之美少女）',
  506: '空（原神）',
  983: '铃与维斯（绝区零）',
};
const d = db();
const now = new Date().toISOString();
d.exec('BEGIN');
try {
  for (const [id, name] of Object.entries(fixes)) {
    d.prepare('UPDATE lora SET name = ?, updated_at = ? WHERE id = ?').run(name, now, Number(id));
  }
  d.exec('COMMIT');
} catch (e) { try { d.exec('ROLLBACK'); } catch {} throw e; }
console.log('修了', Object.keys(fixes).length, '条');
