import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../lib/config.mjs';
import { db as appDb, logEvent } from '../lib/db.mjs';
import { upsertLora, buildDiskIndex, invalidateIndex, bestMatch } from '../lib/loras.mjs';
import { makeThumb, resolvePreviewAbs } from '../lib/media.mjs';
import { splitTriggerDump } from '../lib/safetensors.mjs';

const cfg = loadConfig();
const args = process.argv.slice(2);
const DO_THUMBS = !args.includes('--no-thumbs');
const LEGACY_DB = 'D:\\Comfy-Desktop\\studio\\data\\library.db';
const CHARS = 'D:\\Comfy-Desktop\\studio\\tools\\data\\characters.json';
const AUX = 'D:\\Comfy-Desktop\\studio\\tools\\data\\aux-loras.json';
const GENLOG = 'D:\\Comfy-Desktop\\studio\\docs\\gen-log.jsonl';

const base = (p) => path.basename(String(p || '').replaceAll('/', '\\')).toLowerCase();

console.log('== 1. 磁盘索引');
invalidateIndex();
const index = buildDiskIndex({ force: true });
const byBase = new Map();
for (const rec of index.list) {
  const b = base(rec.rel_path);
  if (!byBase.has(b)) byBase.set(b, []);
  byBase.get(b).push(rec);
}
console.log(`磁盘 ${index.list.length} 支，唯一文件名 ${byBase.size}`);

function matchDisk(p) {
  const list = byBase.get(base(p));
  return list && list.length ? bestMatch(list) : null;
}

/* ---------------- 合并器 ---------------- */
const payload = new Map(); // basename -> partial record

function merge(key, obj, force = []) {
  const cur = payload.get(key) || {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    const empty = cur[k] === undefined || cur[k] === '' || cur[k] === null;
    if (empty || force.includes(k)) cur[k] = v;
  }
  payload.set(key, cur);
}

const keyOf = (p) => {
  const rec = matchDisk(p);
  return rec ? base(rec.rel_path) : base(p);
};

/** 「可莉 Klee」→ { name:'可莉', name_en:'Klee' }；去掉 Civitai 编号尾巴；「汐 v4」不动 */
function splitName(raw) {
  let s = String(raw || '').trim().replace(/-\d{4,}$/, '');
  const m = s.match(/^(.+?)\s+([A-Z][A-Za-z .'’\-]{2,})$/);
  return m ? { name: m[1].trim(), name_en: m[2].trim() } : { name: s, name_en: '' };
}

/** 多个逗号串合并去重，保持顺序 */
function dedupeWords(...parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    for (const w of String(p || '').split(',')) {
      const t = w.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out.join(', ');
}

/* ---------------- 1) aux-loras.json ---------------- */
if (fs.existsSync(AUX)) {
  const aux = JSON.parse(fs.readFileSync(AUX, 'utf8'));
  const list = aux.loras || [];
  for (const a of list) {
    if (!a.path) continue;
    const tags = Array.isArray(a.tags) && a.tags.length
      ? dedupeWords(a.tags.join(', ')).split(', ').map((t, i) => ({ tag: t.toLowerCase(), count: 1000 - i }))
      : undefined;
    merge(keyOf(a.path), {
      name: a.name || '',
      category: a.cat || '',
      trigger: splitTriggerDump(a.trigger).trigger || a.trigger || '',
      weight: a.weight ?? '',
      note: a.note || '',
      source_url: a.url || '',
      model_id: a.model_id ? String(a.model_id) : '',
      version_id: a.version_id ? String(a.version_id) : '',
      download_url: a.url || '',
      tags,
    });
  }
  console.log(`aux-loras.json ${list.length} 条已并`);
}

/* ---------------- 2) characters.json ---------------- */
if (fs.existsSync(CHARS)) {
  const chars = JSON.parse(fs.readFileSync(CHARS, 'utf8'));
  const list = chars.characters || [];
  for (const c of list) {
    if (!c.lora) continue;
    const cn = String(c.cn || '').trim();
    const nm = splitName(cn);
    const trig = splitTriggerDump(c.trigger).trigger || c.trigger || '';
    merge(keyOf(c.lora), {
      name: nm.name,
      name_en: nm.name_en,
      trigger: trig,
      feature_words: dedupeWords(c.core, c.body),
      outfit_words: dedupeWords(c.outfit, c.optional),
      negative: c.negative || '',
      weight: c.weight ?? '',
      source_url: c.source && /^https?:/.test(c.source) ? c.source : '',
    });
  }
  console.log(`characters.json ${list.length} 条已并`);
}

/* ---------------- 3) 旧库 library.db ---------------- */
if (fs.existsSync(LEGACY_DB)) {
  const ldb = new DatabaseSync(LEGACY_DB, { readOnly: true });
  const rows = ldb.prepare('SELECT * FROM lora').all();
  const tags = ldb.prepare('SELECT * FROM lora_tag ORDER BY count DESC').all();
  const sources = ldb.prepare('SELECT * FROM lora_source').all();

  const tagMap = new Map();
  for (const t of tags) {
    if (!t.tag) continue;
    if (!tagMap.has(t.lora_id)) tagMap.set(t.lora_id, []);
    tagMap.get(t.lora_id).push({ tag: t.tag, count: t.count || 0 });
  }
  const srcMap = new Map();
  for (const s of sources) if (!srcMap.has(s.lora_id)) srcMap.set(s.lora_id, s);

  for (const r of rows) {
    const src = srcMap.get(r.id);
    const dump = splitTriggerDump(r.trigger);
    const nm = splitName(r.name);
    merge(keyOf(r.file), {
      name: nm.name,
      name_en: nm.name_en,
      category: r.category || '',
      work: r.work || '',
      trigger: dump.trigger,
      feature_words: dump.feature,
      outfit_words: dump.outfit,
      weight: r.weight ?? '',
      base_model: r.base || '',
      note: r.note || '',
      preview: r.sample_img || '',
      source_url: src && src.url ? src.url : '',
      model_id: src && src.model_id ? String(src.model_id) : '',
      version_id: src && src.version_id ? String(src.version_id) : '',
      file_id: src && src.file_id ? String(src.file_id) : '',
      tags: tagMap.get(r.id) || undefined,
    }, ['name', 'category', 'work', 'weight']);
  }
  ldb.close();
  console.log(`旧库 ${rows.length} 条已并`);
}

/* ---------------- 4) 逐支入库 ---------------- */
console.log('== 2. 入库（读 safetensors 头）');
const t0 = Date.now();
let done = 0, created = 0, updated = 0;
const previewed = [];
for (const rec of index.list) {
  const p = payload.get(base(rec.rel_path)) || {};
  if (p.preview) previewed.push(rec.rel_path);
  try {
    const r = upsertLora({ rel_path: rec.rel_path, ...p, read_meta: true }, 'import');
    r.created ? created++ : updated++;
  } catch (e) {
    console.error('  ! 失败', rec.rel_path, e.message);
  }
  done++;
  if (done % 200 === 0) console.log(`  ${done}/${index.list.length}  ${Math.round((Date.now() - t0) / 1000)}s`);
}
console.log(`入库完成 新增 ${created} / 更新 ${updated}  用时 ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(`带预览 ${previewed.length} 条`);

/* ---------------- 5) 缩略图 ---------------- */
if (DO_THUMBS) {
  console.log('== 3. 生成缩略图');
  const targets = appDb().prepare("SELECT id, preview FROM lora WHERE preview <> '' AND preview NOT LIKE 'http%'").all();
  let ok = 0, fail = 0, n = 0;
  const t1 = Date.now();
  const queue = [...targets];
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift();
      const abs = resolvePreviewAbs(row.preview);
      if (!abs) { fail++; continue; }
      const r = await makeThumb(row.id, abs);
      r ? ok++ : fail++;
      n++;
      if (n % 200 === 0) console.log(`  ${n}/${targets.length}  ${Math.round((Date.now() - t1) / 1000)}s`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`缩略图 成功 ${ok} 失败 ${fail} 用时 ${Math.round((Date.now() - t1) / 1000)}s`);
}

/* ---------------- 6) 台账使用记录 ---------------- */
if (fs.existsSync(GENLOG)) {
  console.log('== 4. 台账使用记录');
  const conn = appDb();
  const rows = conn.prepare('SELECT id, rel_path FROM lora').all();
  const idByBase = new Map(rows.map((r) => [base(r.rel_path), r.id]));
  const agg = new Map();
  const lines = fs.readFileSync(GENLOG, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (!Array.isArray(o.lora)) continue;
    for (const s of o.lora) {
      const id = idByBase.get(base(String(s).split(':')[0]));
      if (!id) continue;
      const cur = agg.get(id) || { runs: 0, last: '', image: '' };
      cur.runs++;
      const t = o.t || '';
      if (t > cur.last) { cur.last = t; cur.image = o.file || ''; }
      agg.set(id, cur);
    }
  }
  const up = conn.prepare(`INSERT INTO usage (lora_id, runs, last_used, last_image) VALUES (?,?,?,?)
    ON CONFLICT(lora_id) DO UPDATE SET runs = excluded.runs, last_used = excluded.last_used, last_image = excluded.last_image`);
  conn.exec('BEGIN');
  try {
    for (const [id, v] of agg) up.run(id, v.runs, v.last, v.image);
    conn.exec('COMMIT');
  } catch (e) {
    try { conn.exec('ROLLBACK'); } catch {}
    throw e;
  }
  console.log(`  ${agg.size} 支有出图记录，共 ${lines.length} 条台账`);
}

logEvent('import', null, 'import', 'legacy import');
const s = appDb().prepare('SELECT COUNT(*) c FROM lora').get().c;
const withPreview = appDb().prepare("SELECT COUNT(*) c FROM lora WHERE preview <> ''").get().c;
console.log(`\n== 完成：库里 ${s} 条，带预览 ${withPreview}`);
