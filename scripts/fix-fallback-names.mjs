/** 收拾上一轮 fallback 出来的英文名（29b / clean / Hotori 这些） */
import { db } from '../lib/db.mjs';

const RULES = [
  [/^Tushanhonghong 29b Clean/i, '涂山红红 29b clean'],
  [/^Tushanhonghong 29b/i, '涂山红红 29b'],
  [/^Tushanrongrong 29b/i, '涂山容容 29b'],
  [/^Tushansusu 29b/i, '涂山苏苏 29b'],
  [/^Tushansusu V3/i, '涂山苏苏 v3'],
  [/^Yaya 29b Clean/i, '涂山雅雅 29b clean'],
  [/^Yaya 29b/i, '涂山雅雅 29b'],
  [/^Taoyao 29b/i, '桃夭 29b'],
  [/^Huangxiaoyan 29b/i, '黄小燕 29b'],
  [/^Hotori Anima/i, 'Hotori（异环）'],
  [/^Hotori V2/i, 'Hotori v2（异环）'],
  [/^Hotori V4/i, 'Hotori v4（异环）'],
  [/^Hotori ホトリ/i, 'Hotori（异环 28 块）'],
];

const BY_ID = {
  15: '抚颊·贴脸爱抚',
  153: '事后 POV·手撑开',
  232: '拉内裤（姿势）',
};

const d = db();
const rows = d.prepare('SELECT id, name FROM lora').all();
const upd = d.prepare('UPDATE lora SET name = ?, updated_at = ? WHERE id = ?');
const now = new Date().toISOString();
let n = 0;

d.exec('BEGIN');
try {
  for (const r of rows) {
    let next = BY_ID[r.id] || '';
    if (!next) {
      for (const [re, to] of RULES) {
        if (!re.test(r.name)) continue;
        // 去掉原来的「（作品）」尾巴，版本尾巴保留
        next = r.name.replace(re, to).replace(/（[^）]*）(?=\s*·|$)/g, '').replace(/\s+/g, ' ').trim();
        break;
      }
    }
    if (!next || next === r.name) continue;
    upd.run(next, now, r.id);
    n++;
  }
  d.exec('COMMIT');
} catch (e) { try { d.exec('ROLLBACK'); } catch {} throw e; }

console.log('改名', n);
for (const r of d.prepare("SELECT id, name FROM lora WHERE name GLOB '[A-Za-z]*' LIMIT 12").all()) console.log(' ', r.id, r.name);
