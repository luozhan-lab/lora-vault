/**
 * ③ 名字汉化：把文件名是纯英文的那批，换成中文名 + 版本后缀。
 * 只动「文件名里没有中文」的，中文名的原样不动。
 */
import { db } from '../lib/db.mjs';

const CJK = /[\u4e00-\u9fa5]/;

// 基名 → 中文。基名 = 去掉轮次/版本尾巴后的文件名
const BASE = {
  'xi-lora-v7': '汐 v7',
  'xi-lora': '汐',
  'tushanhonghong': '涂山红红',
  'tushansusu': '涂山苏苏',
  'tushanrongrong': '涂山容容',
  'yaya': '涂山雅雅',
  'huangxiaoyan': '黄小燕',
  'hxy28': '黄小燕',
  'taoyao': '桃夭',
  'kanna-v2': '康娜（训练输出）',
  'tribbie-v1': '缇宝（训练输出）',
  'tribbie': '缇宝',
  'meihua11-v1': '梅花十一',
  'meihua11': '梅花十一',
  'meihua13-v6': '梅花十三',
  'meihua13': '梅花十三',
  'sparkle-anima': '花火（星铁）',
  'sparkle': '花火',
  'yaoshi': '药师（星铁）',
  'genshin-aether-ingame-anima-lora-nochekaiser': '空（原神）',
  'anima-v1-character-howakureav3': '花咲蕾（光之美少女）',
  'belleandwise': '铃与维斯（绝区零）',
  'niji-oil-painting-eop': '二次元油画风',
  'painterly-impasto-v2': '厚涂肌理',
  'vanripperart-anima-basev10': 'Vanripper 画风',
  'malefutafemale16anima8_8_epoch_16': '扶她群像（训练）',
  'hotori': 'Hotori（异环）',
  'z23': 'Z23',
  'z46': 'Z46',
  'z52': 'Z52',
};

/** 去掉轮次尾巴，返回 { base, label } */
function splitVersion(file) {
  let s = String(file).replace(/\.safetensors$/i, '');
  const patterns = [
    [/^(.*?)[-_](\d{6})_comfy$/i, (m) => `第${Number(m[2])}轮`],
    [/^(.*?)[-_](\d{6})$/i, (m) => `第${Number(m[2])}轮`],
    [/^(.*?)[-_]e0*(\d+)[-_]a?(\d+)$/i, (m) => `e${m[2]} a${m[3]}`],
    [/^(.*?)[-_]v(\d+)[-_]e0*(\d+)[-_](fix|a\d+)$/i, (m) => `v${m[2]} e${m[3]} ${m[4]}`],
    [/^(.*?)[-_]v0*(\d+)[-_]e0*(\d+)$/i, (m) => `v${m[2]} e${m[3]}`],
    [/^(.*?)[-_]e0*(\d+)$/i, (m) => `e${m[2]}`],
    [/^(.*?)[-_](final|test|clean)$/i, (m) => m[2]],
    [/^(.*?)[-_](\d{2,3}b)[-_](clean)$/i, (m) => `${m[2]} ${m[3]}`],
    [/^(.*?)[-_](\d{2,3}b)$/i, (m) => m[2]],
  ];
  for (const [re, fmt] of patterns) {
    const m = s.match(re);
    if (m) {
      const base = m[1].toLowerCase().replace(/[-_]$/, '');
      return { base, label: fmt(m) };
    }
  }
  return { base: s.toLowerCase(), label: '' };
}

const rows = db().prepare('SELECT id, name, filename, rel_path, category, work FROM lora').all();
const upd = db().prepare('UPDATE lora SET name = ?, updated_at = ? WHERE id = ?');
const now = new Date().toISOString();

let done = 0, skipped = 0;
const plan = [];
for (const r of rows) {
  if (CJK.test(r.filename)) { skipped++; continue; }
  const plain = r.filename.replace(/\.safetensors$/i, '');
  if (r.name !== plain) { skipped++; continue; } // 已经有人给过名了
  const { base, label } = splitVersion(r.filename);
  let cn = BASE[base];
  if (!cn) {
    // 退路：把英文整理干净，挂上作品
    const pretty = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    cn = r.work ? `${pretty}（${r.work}）` : pretty;
  }
  const name = label ? `${cn} · ${label}` : cn;
  plan.push({ id: r.id, from: plain, to: name });
}

db().exec('BEGIN');
try {
  for (const p of plan) upd.run(p.to, now, p.id);
  db().exec('COMMIT');
} catch (e) {
  try { db().exec('ROLLBACK'); } catch {}
  throw e;
}

console.log(`改名 ${plan.length} 支，跳过 ${skipped}`);
console.log(plan.slice(0, 40).map((p) => `  ${p.from}  →  ${p.to}`).join('\n'));
