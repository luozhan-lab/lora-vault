#!/usr/bin/env node
/**
 * 给词表补机器中文：只补指定的名次区间，结果写 data/wordbank-zh.json
 *
 *   node scripts/translate-wordbank.mjs --from 801 --to 3000 [--workers 8] [--rounds 3] [--timeout 2500]
 *
 * 说明：
 * - 只补「还没有中文」的；已经人工校订过的（curated）不动
 * - 每 50 条落一次盘，断了重跑会接着来
 * - 翻了但结果是英文原文/空，会留空，下一轮再试
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 ? Number(argv[i + 1]) : d;
};

const FROM = Math.max(1, arg('from', 801));
const TO = Math.max(FROM, arg('to', 3000));
const WORKERS = Math.max(1, Math.min(16, arg('workers', 8)));
const ROUNDS = Math.max(1, Math.min(6, arg('rounds', 3)));
const TIMEOUT = Math.max(800, arg('timeout', 2500));
const argValue = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const PROVIDER = String(argValue('provider', 'auto')).toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const wb = JSON.parse(fs.readFileSync(path.join(root, 'public/v2/wordbank.json'), 'utf8'));
const curated = JSON.parse(fs.readFileSync(path.join(root, 'data/wordbank-zh-curated.json'), 'utf8').replace(/^\uFEFF/, ''));
const cachePath = path.join(root, 'data/wordbank-zh.json');
let cache = {};
try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8').replace(/^\uFEFF/, '')); } catch { /* 首次 */ }

const seg = wb.slice(FROM - 1, TO);

const needZh = () => seg.filter((x) => !curated[x.word] && !cache[x.word]).map((x) => x.word);

async function gtx(text) {
  const u = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=' + encodeURIComponent(text);
  const r = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const arr = await r.json();
  return (Array.isArray(arr) && Array.isArray(arr[0]) ? arr[0] : []).map((x) => (Array.isArray(x) ? x[0] : '')).join('').trim();
}

async function myMemory(text) {
  const u = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|zh-CN';
  const r = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT + 1500) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return String((d.responseData && d.responseData.translatedText) || '').trim();
}

async function microsoftBatch(words) {
  /* Edge 无 Key 翻译端点：body 是裸字符串数组，返回 [{translations:[{text}]}]。
     tag 里的下划线先当空格翻，否则 long_hair 这种会原样返回。 */
  const requestWords = words.map((w) => String(w).replace(/_/g, ' '));
  const url = 'https://edge.microsoft.com/translate/translatetext?from=en&to=zh-Hans&isEnterpriseClient=false';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestWords),
    signal: AbortSignal.timeout(Math.max(15000, TIMEOUT * 6)),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const arr = await r.json();
  if (!Array.isArray(arr) || arr.length !== words.length) throw new Error('返回条数不对');
  return arr.map((x) => String(x && x.translations && x.translations[0] && x.translations[0].text || '').trim());
}

async function translateOne(word) {
  for (const fn of [gtx, myMemory]) {
    try {
      const zh = await fn(word);
      if (zh && /[\u4e00-\u9fff]/.test(zh) && zh.toLowerCase() !== word.toLowerCase()) return zh;
    } catch { /* 换下一个 */ }
  }
  return '';
}

function save() {
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 0), 'utf8');
}

for (let round = 1; round <= ROUNDS; round++) {
  const todo = needZh();
  console.log(`第 ${round} 轮：待翻 ${todo.length} 条（区间 ${FROM}-${TO}）`);
  if (!todo.length) break;
  if (PROVIDER === 'ms') {
    /* 微软 Edge 翻译：一批 40 条，免 Key */
    let ok = 0;
    for (let i = 0; i < todo.length; i += 40) {
      const chunk = todo.slice(i, i + 40);
      let got = null;
      for (let attempt = 1; attempt <= 3 && !got; attempt++) {
        try { got = await microsoftBatch(chunk); }
        catch (e) { console.log(`  批次 ${i / 40 + 1} 失败（${attempt}/3）：${e.message}`); await sleep(800 * attempt); }
      }
      if (!got) continue;
      chunk.forEach((w, j) => {
        const zh = got[j];
        if (zh && /[\u4e00-\u9fff]/.test(zh) && zh.toLowerCase() !== w.toLowerCase()) {
          cache[w] = zh;
          ok++;
        }
      });
      save();
      console.log(`  ${Math.min(i + 40, todo.length)}/${todo.length}，成功 ${ok}`);
      await sleep(250);
    }
    console.log(`  本轮结束：成功 ${ok}/${todo.length}`);
    continue;
  }
  let done = 0;
  let ok = 0;
  const queue = todo.slice();
  const worker = async () => {
    while (queue.length) {
      const w = queue.shift();
      const zh = await translateOne(w);
      done++;
      if (zh) { cache[w] = zh; ok++; }
      if (done % 50 === 0) { save(); console.log(`  ${done}/${todo.length}，成功 ${ok}`); }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  save();
  console.log(`  本轮结束：成功 ${ok}/${todo.length}`);
}

const final = needZh();
console.log(`完成。区间内仍缺中文 ${final.length} 条`);
if (final.length) console.log('  缺的例子：' + final.slice(0, 15).join(' / '));
