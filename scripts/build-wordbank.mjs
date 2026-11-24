#!/usr/bin/env node
/**
 * 从 lora.db 导出内置词表：public/v2/wordbank.json
 *
 *   node scripts/build-wordbank.mjs                 # 只导出（cn 取缓存）
 *   node scripts/build-wordbank.mjs --translate 800 # 顺便翻前 800 条（结果写 data/wordbank-zh.json，可重跑续上）
 *
 * 排序：被多少支 LoRA 用过（COUNT(*) 走 lora_tag）
 * 分类 cat：hair / eyes / body / clothes / expression / action / pose / composition / scene / light / quality / other
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../lib/db.mjs';
import { translateToZh } from '../lib/translate.mjs';
import { catOf as catOfImpl } from './wordbank-cats.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'public', 'v2', 'wordbank.json');
const zhCacheFile = path.join(root, 'data', 'wordbank-zh.json');

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : ''; };
const TRANSLATE = Math.max(0, Number(arg('translate') || 0));
const TOP = Math.max(1, Number(arg('top') || 20000));

const catOf = (name, kind) => catOfImpl(name, kind);

/* 角色名：所有 LoRA 的 trigger 里出现过的整词，命中就当角色/作品名 */
const charNames = new Set();
for (const r of db().prepare("SELECT trigger FROM lora WHERE trigger IS NOT NULL AND trigger <> ''").all()) {
  for (const part of String(r.trigger).split(',')) {
    const t = part.trim().toLowerCase();
    if (t) charNames.add(t);
  }
}
console.log('角色名候选 ' + charNames.size + ' 个（来自 LoRA trigger）');

const rows = db().prepare(`
  SELECT t.name AS name, t.kind AS kind, COUNT(*) AS c
  FROM lora_tag lt JOIN tag t ON t.id = lt.tag_id
  GROUP BY t.name
  ORDER BY c DESC, length(t.name), t.name
  LIMIT ?
`).all(TOP);

let zh = {};
/* 保命：上一次产物里可能有人直接手补过 cn（改的是 wordbank.json），重建时先捡回来 */
const prevCn = {};
try {
  const old = JSON.parse(fs.readFileSync(outFile, 'utf8').replace(/^\uFEFF/, ''));
  for (const x of old) if (x && x.cn && x.word) prevCn[x.word] = x.cn;
} catch { /* 第一次没有 */ }
console.log('上一次产物里带中文 ' + Object.keys(prevCn).length + ' 条，会保留');

/* 人工校对的优先（机器翻译对 tag 这种短词经常翻错，比如 arm up → 武装起来） */
try {
  zh = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wordbank-zh-curated.json'), 'utf8').replace(/^\uFEFF/, ''));
} catch { /* 没有也行 */ }
const curatedCount = Object.keys(zh).length;
try {
  const cache = JSON.parse(fs.readFileSync(zhCacheFile, 'utf8').replace(/^\uFEFF/, ''));
  for (const [k, v] of Object.entries(cache)) if (!zh[k]) zh[k] = v;
} catch { /* 首次没有 */ }

/* 翻译：只补前 N 条还没有中文的 */
if (TRANSLATE > 0) {
  const todo = rows.slice(0, TRANSLATE).filter((r) => !zh[r.name]);
  console.log(`要翻 ${todo.length} 条（前 ${TRANSLATE} 条里缺中文的）…`);
  let done = 0;
  const save = () => fs.writeFileSync(zhCacheFile, JSON.stringify(zh, null, 0), 'utf8');
  const worker = async () => {
    while (todo.length) {
      const row = todo.shift();
      const t = await translateToZh(row.name);
      if (t) zh[row.name] = t;
      done++;
      if (done % 20 === 0) { save(); console.log(`  ${done}…`); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  save();
  console.log(`翻译完成 ${done} 条`);
}

/* 兜底：按「这支词主要被哪类 LoRA 用」判
   角色 LoRA 大量用到的词 → character；服装 LoRA 大量用到 → clothes。 */
const dominant = new Map();
for (const r of db().prepare(`
  SELECT t.name AS name, l.category AS cat, COUNT(*) AS c
  FROM lora_tag lt
  JOIN tag t ON t.id = lt.tag_id
  JOIN lora l ON l.id = lt.lora_id
  GROUP BY t.name, l.category
`).all()) {
  const prev = dominant.get(r.name);
  if (!prev || r.c > prev.c) dominant.set(r.name, { cat: r.cat, c: r.c });
}

const items = rows.map((r) => {
  /* 顺序：关键词 → 角色名（LoRA trigger）→ 被哪类 LoRA 用得多（只兜低频长尾） */
  let cat = catOf(r.name, r.kind);
  const isChar = charNames.has(String(r.name).toLowerCase());
  if (cat === 'other' && isChar) cat = 'character';
  if (cat === 'other') {
    const d = dominant.get(r.name);
    if (d && r.c <= 30) {
      /* 角色 LoRA 用得多、又低频、且是多词 → 当角色名；单词长尾留在 other，别把垃圾词塞进角色 */
      if (d.cat === '角色' && String(r.name).includes(' ')) cat = 'character';
      else if (d.cat === '服装' && String(r.name).includes(' ')) cat = 'clothes';
    }
  }
  return { word: r.name, cn: zh[r.name] || prevCn[r.name] || '', cat, count: r.c };
});
fs.writeFileSync(outFile, JSON.stringify(items), 'utf8');
const withCn = items.filter((x) => x.cn).length;
const byCat = {};
for (const it of items) byCat[it.cat] = (byCat[it.cat] || 0) + 1;
console.log(`写出 ${outFile}`);
console.log(`  ${items.length} 条，有中文 ${withCn} 条（人工 ${curatedCount} 条）${(fs.statSync(outFile).size / 1048576).toFixed(2)} MB`);
console.log('  分类：' + Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' / '));
