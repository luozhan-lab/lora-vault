import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, logEvent } from './db.mjs';
import { loadConfig } from './config.mjs';
import { loraRoots, primaryRoot, splitRooted, rootRel, makeRel, absOf } from './roots.mjs';
import { readSafetensorsMeta, parseTagFrequency, metaSummary, classifyTags, isNameLike } from './safetensors.mjs';
import { identityReport } from './identity.mjs';
import { getTriggers, ensureTriggers } from './triggers.mjs';

/* ------------------------------ 磁盘索引 ------------------------------ */

let _index = null;
let _indexAt = 0;

export function buildDiskIndex({ force = false } = {}) {
  const now = Date.now();
  if (!force && _index && now - _indexAt < 5000) return _index;
  const cfg = loadConfig();
  const primary = primaryRoot(cfg);
  const map = new Map();
  const dupes = new Map();
  const list = [];
  for (const root of loraRoots(cfg)) {
    if (!root || !fs.existsSync(root)) continue;
    const isPrimary = root.toLowerCase() === String(primary || '').toLowerCase();
    const walk = (dir) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) { walk(abs); continue; }
        if (!e.name.toLowerCase().endsWith('.safetensors')) continue;
        const innerRel = path.relative(root, abs);
        if (!innerRel || innerRel.startsWith('..')) continue;
        const rel = makeRel(root, innerRel, isPrimary);
        let st;
        try { st = fs.statSync(abs); } catch { continue; }
        const rec = {
          rel_path: rel,
          root_path: root,
          root_rel: innerRel.replaceAll('/', '\\'),
          abs_path: abs,
          filename: path.basename(innerRel),
          size_bytes: st.size,
          mtime: Math.floor(st.mtimeMs),
          ...splitCategory(innerRel),
        };
        list.push(rec);
        map.set(rel.toLowerCase(), rec);
        const base = path.basename(innerRel).toLowerCase();
        if (!map.has(base)) map.set(base, rec);
        if (!dupes.has(base)) dupes.set(base, []);
        dupes.get(base).push(rec);
      }
    };
    walk(root);
  }
  _index = { map, dupes, list, at: now };
  _indexAt = now;
  return _index;
}

/** 同名文件挑一个最像"正主"的：优先角色目录，避开备份/归档/训练输出/中间轮次 */
export function bestMatch(list) {
  if (!list || !list.length) return null;
  if (list.length === 1) return list[0];
  const score = (r) => {
    const rr = rootRel(r.rel_path);
    let s = 0;
    if (rr.includes('_备份')) s -= 100;
    if (rr.includes('_移出')) s -= 90;
    if (rr.includes('训练输出')) s -= 80;
    if (rr.includes('epochs') || /-\d{6}\./.test(rr)) s -= 20;
    if (rr.startsWith('角色\\')) s += 30;
    if (rr.startsWith('功能\\') || rr.startsWith('自己的\\')) s += 5;
    s -= rr.split(/[\\/]/).length;
    return s;
  };
  return [...list].sort((a, b) => score(b) - score(a) || a.rel_path.length - b.rel_path.length)[0];
}


export function splitCategory(rel) {
  const seg = String(rel).split(/[\\/]/).filter(Boolean);
  // 别人的目录可能是拍平的：只有一个文件名就是「未分类」，别把文件名当分类
  if (seg.length < 2) return { category: '未分类', work: '' };
  const top = seg[0];
  if (top === '角色' && seg.length >= 3) return { category: '角色', work: seg[1] };
  if (top === '功能' && seg.length >= 3) return { category: seg[1], work: '' };
  if (top === '自己的') return { category: '自己的', work: seg.length >= 3 ? seg[1] : '' };
  if (top.startsWith('_移出')) return { category: '归档', work: seg.length >= 3 ? seg[1] : '' };
  // 不认识的目录结构：第一层当分类，第二层当作品，不猜它是角色还是功能
  return { category: top, work: seg.length >= 3 ? seg[1] : '' };
}

export function invalidateIndex() { _index = null; _indexAt = 0; }

export function resolveRelPath(input) {
  const cfg = loadConfig();
  if (!input) return null;
  let raw = String(input).replaceAll('/', '\\').trim();
  if (raw.startsWith('\\\\?\\')) raw = raw.slice(4);

  // 已经是带根前缀的记录：直接用，不重复拼主根
  if (raw.startsWith('@@root:')) return raw;

  // 绝对路径 → 找它落在哪一个根里
  if (path.isAbsolute(raw)) {
    for (const root of loraRoots(cfg)) {
      const relFromRoot = path.relative(root, raw);
      if (!relFromRoot.startsWith('..') && fs.existsSync(raw)) {
        return makeRel(root, relFromRoot, root === primaryRoot(cfg));
      }
    }
  } else {
    const primary = primaryRoot(cfg);
    const abs = primary ? path.join(primary, raw) : '';
    if (abs && fs.existsSync(abs)) return raw;
  }

  const index = buildDiskIndex();
  const key = raw.toLowerCase();
  if (key.includes('\\') && index.map.has(key)) return index.map.get(key).rel_path;
  const base = path.basename(raw).toLowerCase();
  if (index.dupes && index.dupes.has(base)) return bestMatch(index.dupes.get(base)).rel_path;
  if (index.map.has(key)) return index.map.get(key).rel_path;
  return raw;
}

/* ------------------------------ 标签 ------------------------------ */

function setTags(loraId, tags) {
  const conn = db();
  conn.prepare('DELETE FROM lora_tag WHERE lora_id = ?').run(loraId);
  if (!tags || !tags.length) return;
  const insTag = conn.prepare('INSERT INTO tag (name) VALUES (?) ON CONFLICT(name) DO NOTHING');
  const selTag = conn.prepare('SELECT id FROM tag WHERE name = ?');
  const ins = conn.prepare('INSERT OR REPLACE INTO lora_tag (lora_id, tag_id, count) VALUES (?,?,?)');
  for (const t of tags) {
    const name = String(t.tag ?? t.name ?? t).trim().toLowerCase();
    if (!name) continue;
    const count = Number(t.count ?? 0) || 0;
    insTag.run(name);
    const row = selTag.get(name);
    if (row) ins.run(loraId, row.id, count);
  }
}

function tagsToObjects(tags) {
  return (tags || [])
    .map((t) => (typeof t === 'string'
      ? { tag: t.trim().toLowerCase(), count: 0 }
      : { tag: String(t.tag ?? t.name ?? '').trim().toLowerCase(), count: Number(t.count) || 0 }))
    .filter((t) => t.tag);
}

/* ------------------------------ 版本族 ------------------------------ */

/** 把文件名的「轮次/导出」尾巴去掉，得到族名（只按文件名，跨目录算一族） */
export function familyOf(relPath) {
  const file = String(relPath).split(/[\\/]/).pop() || '';
  return file
    .replace(/([_-]\d{6})(_comfy)?\.safetensors$/i, '.safetensors')
    .replace(/[_-]v\d+[_-]e\d+([_-](fix|a\d+))?\.safetensors$/i, '.safetensors')
    .replace(/[_-]e\d+\.safetensors$/i, '.safetensors')
    .replace(/_comfy\.safetensors$/i, '.safetensors')
    .toLowerCase();
}

/**
 * 重算版本族：同一族里挑一支当主，其余标 is_variant。
 * 主的挑法：用过次数最多 → 不是中间轮次 → 角色目录优先 → 文件更新。
 */
export function recomputeFamilies() {
  const conn = db();
  const rows = conn.prepare(`
    SELECT l.id, l.rel_path, l.filename, l.mtime,
           COALESCE((SELECT runs FROM usage u WHERE u.lora_id = l.id), 0) AS runs
    FROM lora l
  `).all();

  const groups = new Map();
  for (const r of rows) {
    const fam = familyOf(r.rel_path);
    const isEpoch = fam !== String(r.filename).toLowerCase() ? 1 : 0;
    if (!groups.has(fam)) groups.set(fam, []);
    groups.get(fam).push({ ...r, fam, isEpoch, isRole: /^角色\\/.test(rootRel(r.rel_path)) ? 1 : 0 });
  }

  const upd = conn.prepare('UPDATE lora SET family = ?, is_variant = ? WHERE id = ?');
  let variants = 0;
  withTx(() => {
    for (const [fam, list] of groups) {
      if (list.length === 1) { upd.run(fam, 0, list[0].id); continue; }
      const sorted = [...list].sort((a, b) =>
        (b.runs - a.runs) || (a.isEpoch - b.isEpoch) || (b.isRole - a.isRole) || ((b.mtime || 0) - (a.mtime || 0)));
      sorted.forEach((r, i) => {
        const v = i === 0 ? 0 : 1;
        if (v) variants++;
        upd.run(fam, v, r.id);
      });
    }
  });
  return { families: groups.size, variants };
}

/* ------------------------------ 写 ------------------------------ */

const STRING_FIELDS = [
  'name', 'name_en', 'name_zh', 'description', 'description_zh', 'category', 'work', 'base_model', 'trigger',
  'feature_words', 'outfit_words', 'body_words', 'negative', 'note',
  'source_url', 'download_url', 'model_id', 'version_id', 'file_id',
  'preview', 'status', 'aliases', 'preview_kind',
];

export function upsertLora(input, actor = 'api') {
  const cfg = loadConfig();
  const rel = resolveRelPath(input.rel_path || input.path || input.file || input.filename || input.name);
  if (!rel) throw new Error('缺少文件路径或文件名');

  const index = buildDiskIndex();
  const onDisk = index.map.get(rel.toLowerCase()) || index.map.get(path.basename(rel).toLowerCase()) || null;
  const rootInfo = splitRooted(rel);
  const innerRel = onDisk?.root_rel || rootInfo.rel || rel;
  const rootPath = onDisk?.root_path || rootInfo.root || primaryRoot(cfg) || cfg.lorasRoot || '';
  const abs = onDisk ? onDisk.abs_path : absOf(rel, cfg);
  const exists = onDisk ? true : (!!abs && fs.existsSync(abs));

  const now = new Date().toISOString();
  const conn = db();
  const existing = conn.prepare('SELECT * FROM lora WHERE rel_path = ?').get(rel);

  const data = { rel_path: rel, root_path: rootPath, filename: path.basename(innerRel), family: familyOf(innerRel) };
  // 已有记录：目录推出来的分类 / 作品不能盖掉手动改过的；新文件才按目录猜
  const derived = onDisk ? { category: onDisk.category, work: onDisk.work } : splitCategory(innerRel);
  data.category = (existing && existing.category) ? existing.category : derived.category;
  data.work = (existing && existing.work) ? existing.work : derived.work;

  for (const f of STRING_FIELDS) {
    if (input[f] !== undefined && input[f] !== null) data[f] = String(input[f]);
  }
  if (input.weight !== undefined && input.weight !== null && input.weight !== '') {
    const w = Number(input.weight);
    data.weight = Number.isFinite(w) ? w : null;
  }

  // 从文件补元数据
  let meta = null;
  let tagObjs = null;
  if (exists) {
    const st = fs.statSync(abs);
    data.size_bytes = st.size;
    data.mtime = Math.floor(st.mtimeMs);
    data.status = 'ok';
    if (input.read_meta !== false) {
      meta = readSafetensorsMeta(abs);
      const freq = parseTagFrequency(meta);
      if (freq.length) {
        tagObjs = tagsToObjects(freq);
        const cls = classifyTags(freq);
        // 只补空字段，别把手动改过的触发词 / 特征词用训练标签盖回去
        if (!data.trigger && !(existing && existing.trigger) && cls.trigger) data.trigger = cls.trigger;
        if (!data.feature_words && !(existing && existing.feature_words) && cls.feature) data.feature_words = cls.feature;
        if (!data.outfit_words && !(existing && existing.outfit_words) && cls.outfit) data.outfit_words = cls.outfit;
        if (!data.body_words && !(existing && existing.body_words) && cls.body) data.body_words = cls.body;
      }
      if (meta) {
        const sum = metaSummary(meta);
        if (!data.base_model && !(existing && existing.base_model) && sum.base_model) data.base_model = sum.base_model;
        const title = (sum.title || '').trim();
        if (!data.name_en && !(existing && existing.name_en) && title.length >= 4 && !/^[\d_.\-\s]+$/.test(title) && title.toLowerCase() !== 'lora') {
          data.name_en = title;
        }
        // 重读头部时只覆盖头部字段，别把 civitai 这类后补的键冲掉
        const prevMeta = existing ? safeJson(existing.meta_json) : {};
        data.meta_json = JSON.stringify({ ...prevMeta, ...sum });
      }
    }
  } else {
    data.status = 'missing';
  }

  // 默认名：新记录用文件名去扩展名；已有记录保留手动改过的名字
  if (!data.name) data.name = (existing && existing.name) ? existing.name : path.basename(rel, '.safetensors');

  const result = withTx(() => {
    let id;
    let created = false;
    if (existing) {
      id = existing.id;
      const sets = [];
      const vals = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === 'rel_path' || k === 'filename') continue;
        sets.push(`${k} = ?`);
        vals.push(v);
      }
      vals.push(now, id);
      conn.prepare(`UPDATE lora SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals);
    } else {
      created = true;
      const cols = Object.keys(data);
      const placeholders = cols.map(() => '?').join(',');
      const info = conn.prepare(
        `INSERT INTO lora (${cols.join(',')}, created_at, updated_at) VALUES (${placeholders},?,?)`
      ).run(...cols.map((c) => data[c]), now, now);
      id = Number(info.lastInsertRowid);
    }

    if (input.tags) setTags(id, tagsToObjects(input.tags));
    else if (tagObjs) setTags(id, tagObjs);

    logEvent(created ? 'create' : 'update', id, actor, rel);
    return { id, created, rel_path: rel };
  });
  /* 新记录 / 新补到 meta 的记录：补一次逐条触发词；写失败不影响扫描 */
  if (result && result.id) {
    try { ensureTriggers(result.id); } catch (e) { console.warn('[trigger] 自动整理失败：' + (e.message || e)); }
  }
  return result;
}

/**
 * ComfyUI 已经在 LoraLoader 里认得的名字，本地却没扫到文件时，先建一条「只有名字」的记录。
 * 状态用 comfy：扫描时不会被标 missing，用户仍能在出图页选到它；触发词可以在库里补。
 */
export function importComfyLoras(names, actor = 'comfy') {
  const list = (Array.isArray(names) ? names : []).map((n) => String(n || '').replaceAll('/', '\\').trim()).filter(Boolean);
  if (!list.length) return { added: 0 };
  const conn = db();
  const existing = new Map(conn.prepare('SELECT rel_path, status FROM lora').all().map((r) => [String(r.rel_path).toLowerCase(), r.status]));
  /* ComfyUI 的名字都是「根内相对路径」；先看本地磁盘有没有同名文件。
     有的话入库本地文件（带 root 前缀/根路径），不要再造一条 comfy-only 记录。 */
  const localByComfy = new Map();
  try {
    for (const rec of buildDiskIndex().list) {
      const k = String(rec.root_rel || '').toLowerCase();
      if (k && !localByComfy.has(k)) localByComfy.set(k, rec);
    }
  } catch { /* ignore */ }
  const now = new Date().toISOString();
  const cols = ['rel_path', 'filename', 'name', 'category', 'work', 'status', 'meta_json', 'created_at', 'updated_at'];
  const ins = conn.prepare(`INSERT OR IGNORE INTO lora (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  let added = 0;
  let updated = 0;
  const localToAdd = [];
  withTx(() => {
    for (const rel of list) {
      if (!/\.(safetensors|ckpt|pt|pth)$/i.test(rel)) continue;
      const key = rel.toLowerCase();
      const local = localByComfy.get(key);
      if (local) {
        if (!existing.has(String(local.rel_path).toLowerCase())) localToAdd.push(local);
        continue;
      }
      const status = existing.get(key);
      if (status !== undefined) {
        if (status === 'missing') {
          conn.prepare("UPDATE lora SET status = 'comfy', updated_at = ? WHERE lower(rel_path) = ?").run(now, key);
          updated++;
        }
        continue;
      }
      const filename = path.basename(rel);
      const name = path.basename(filename, path.extname(filename)).replace(/[_-]+/g, ' ').trim() || filename;
      const { category, work } = splitCategory(rel);
      ins.run(rel, filename, name, category, work, 'comfy', '{}', now, now);
      existing.set(key, 'comfy');
      added++;
    }
  });
  /* upsertLora 自己会开事务，放在 withTx 外面，避免嵌套 BEGIN */
  for (const rec of localToAdd) {
    try { upsertLora({ rel_path: rec.rel_path, read_meta: false }, actor); added++; } catch { /* ignore */ }
  }
  if (added || updated) logEvent('import_comfy', null, actor, `新增 ${added}，恢复 ${updated}`);
  return { added, updated };
}

/** 一个事务包一段写操作。SQLite 每条语句单开事务时会 fsync，上千条标签能慢几十倍。 */
export function withTx(fn) {
  const conn = db();
  conn.exec('BEGIN');
  try {
    const out = fn();
    conn.exec('COMMIT');
    return out;
  } catch (e) {
    try { conn.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

export function patchLora(id, input, actor = 'api') {
  const conn = db();
  const row = conn.prepare('SELECT * FROM lora WHERE id = ?').get(id);
  if (!row) return null;
  const now = new Date().toISOString();
  const sets = [];
  const vals = [];
  for (const f of STRING_FIELDS) {
    if (input[f] !== undefined) { sets.push(`${f} = ?`); vals.push(input[f] === null ? '' : String(input[f])); }
  }
  if (input.weight !== undefined) {
    const w = Number(input.weight);
    sets.push('weight = ?');
    vals.push(input.weight === null || input.weight === '' || !Number.isFinite(w) ? null : w);
  }
  if (sets.length) {
    vals.push(now, id);
    conn.prepare(`UPDATE lora SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals);
  }
  if (input.tags !== undefined) setTags(id, tagsToObjects(input.tags));
  /* 手动补了 trigger 但还没有逐条列表：允许自动补一次 */
  if (input.trigger !== undefined) {
    const count = conn.prepare('SELECT COUNT(*) AS c FROM lora_trigger WHERE lora_id = ?').get(id).c;
    if (!count) conn.prepare('UPDATE lora SET triggers_synced = 0 WHERE id = ?').run(id);
  }
  try { ensureTriggers(id); } catch (e) { console.warn('[trigger] 自动整理失败：' + (e.message || e)); }
  logEvent('patch', id, actor, Object.keys(input).join(','));
  return getLora(id);
}

export function deleteLora(id) {
  const conn = db();
  const row = conn.prepare('SELECT * FROM lora WHERE id = ?').get(id);
  if (!row) return false;
  conn.prepare('DELETE FROM lora WHERE id = ?').run(id);
  logEvent('delete', null, 'api', row.rel_path);
  return true;
}

export function setPreview(id, { file, url, thumbFile }) {
  const conn = db();
  const row = conn.prepare('SELECT * FROM lora WHERE id = ?').get(id);
  if (!row) return null;
  conn.prepare('UPDATE lora SET preview = ?, updated_at = ? WHERE id = ?')
    .run(file || url || '', new Date().toISOString(), id);
  logEvent('preview', id, 'api', file || url || '');
  return getLora(id);
}

/** 把一支 LoRA 挪到分类目录，磁盘文件跟着走 */
export function moveLora(id, targetDir) {
  const conn = db();
  const row = conn.prepare('SELECT * FROM lora WHERE id = ?').get(id);
  if (!row) throw new Error('没有这条记录');
  const cfg = loadConfig();
  const rowInfo = splitRooted(row.rel_path);
  const primary = primaryRoot(cfg);
  const root = path.resolve(rowInfo.root || primary || cfg.lorasRoot);
  if (!root) throw new Error('还没配 LoRA 目录');
  const raw = String(targetDir || '').replaceAll('/', '\\').replace(/^\\+|\\+$/g, '').trim();
  if (!raw) throw new Error('目标分类不能为空');
  if (path.isAbsolute(raw) || raw.split(/[\\/]/).includes('..')) throw new Error('目标路径不合法');
  const targetFolder = path.resolve(root, raw);
  if (!targetFolder.toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
    throw new Error('目标不在 LoRA 目录里');
  }
  const src = absOf(row.rel_path, cfg);
  if (!src || !fs.existsSync(src)) throw new Error('源文件不在磁盘上，没法移动');
  fs.mkdirSync(targetFolder, { recursive: true });

  let filename = path.basename(src);
  let dest = path.join(targetFolder, filename);
  if (dest.toLowerCase() !== src.toLowerCase() && fs.existsSync(dest)) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let n = 1;
    do { dest = path.join(targetFolder, `${base}-${n}${ext}`); n++; } while (fs.existsSync(dest));
    filename = path.basename(dest);
  }
  if (dest.toLowerCase() !== src.toLowerCase()) {
    try {
      fs.renameSync(src, dest);
    } catch (e) {
      if (e.code === 'EXDEV') {
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      } else throw e;
    }
  }

  const innerRel = path.relative(root, dest).replaceAll('/', '\\');
  const rel = makeRel(root, innerRel, root === primary);
  const { category, work } = splitCategory(innerRel);
  conn.prepare('UPDATE lora SET rel_path = ?, root_path = ?, filename = ?, category = ?, work = ?, updated_at = ? WHERE id = ?')
    .run(rel, root, filename, category, work, new Date().toISOString(), id);
  invalidateIndex();
  logEvent('move', id, 'api', `${row.rel_path} -> ${rel}`);
  return { id, rel_path: rel, filename, category, work };
}

/* ------------------------------ 读 ------------------------------ */

function tagsFor(id) {
  return db().prepare(`
    SELECT t.name AS tag, lt.count AS count
    FROM lora_tag lt JOIN tag t ON t.id = lt.tag_id
    WHERE lt.lora_id = ? ORDER BY lt.count DESC, t.name ASC
  `).all(id);
}

/**
 * 一支 LoRA 里可能有好几个角色/好几套衣服。
 * 主要看 trigger —— 它本来就是「名字那一段」，装了多个角色的会列好几个。
 * trigger 不够用时，补几条「带作品括号」的标签。
 */
export function nameCandidates(tags, trigger) {
  const pool = [];
  const fromTrigger = String(trigger || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (fromTrigger.length >= 2) {
    for (const t of fromTrigger) if (isNameLike(t)) pool.push(t);
  }

  if (pool.length < 2 && tags && tags.length) {
    const max = tags[0].count || 1;
    for (const t of tags) {
      if (t.count < max * 0.35) continue;
      if (!/\([^)]+\)/.test(t.tag)) continue;   // 只认「xxx (作品名)」这种
      if (!isNameLike(t.tag)) continue;
      pool.push(t.tag);
      if (pool.length >= 8) break;
    }
  }

  // 去重：去掉括号后同名 / 互相包含
  const uniq = [];
  const keys = new Set();
  for (const p of pool) {
    const k = p.replace(/\s*\(.*$/, '').trim().toLowerCase();
    if (!k || keys.has(k)) continue;
    keys.add(k);
    uniq.push(p);
  }
  const kept = uniq.filter((a) => !uniq.some((b) => b !== a && b.includes(a)));
  return kept.slice(0, 8);
}

export function getLora(id) {
  const conn = db();
  const row = conn.prepare(`
    SELECT l.*, COALESCE(u.runs,0) AS runs, u.last_used, u.last_image,
           (SELECT COUNT(*) FROM sample s WHERE s.lora_id = l.id) AS sample_count,
           (SELECT SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) FROM sample s WHERE s.lora_id = l.id) AS good,
           (SELECT SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) FROM sample s WHERE s.lora_id = l.id) AS bad
    FROM lora l LEFT JOIN usage u ON u.lora_id = l.id WHERE l.id = ?
  `).get(id);
  if (!row) return null;
  /* 运行中导入的记录可能还没整理过逐条触发词；打开详情时补一次 */
  try { ensureTriggers(id); } catch (e) { console.warn('[trigger] 自动整理失败：' + (e.message || e)); }
  row.good = row.good || 0;
  row.bad = row.bad || 0;
  const tags = tagsFor(id);
  const siblings = conn.prepare(`
    SELECT l.id, l.name, l.rel_path, l.is_variant, l.size_bytes,
           COALESCE(u.runs,0) AS runs
    FROM lora l LEFT JOIN usage u ON u.lora_id = l.id
    WHERE l.family = ? AND l.family <> '' AND l.id <> ?
    ORDER BY l.is_variant ASC, runs DESC, l.id ASC
  `).all(row.family, id);
  const meta0 = safeJson(row.meta_json);
  const mCands = (meta0 && meta0.civitai && Array.isArray(meta0.civitai.candidates)) ? meta0.civitai.candidates : [];
  const mergedCands = [];
  const seenCand = new Set();
  // 已经存进 meta 的名单（手填的 / 从 C 站解析后缓存下来的）是可信的：
  // 以前这里再拿 isRoleName 过一遍，会把「可莉」「纳西妲」这种中文名全滤掉。
  for (const c of mCands) {
    const s = String(c || '').trim();
    const k = s.toLowerCase();
    if (!s || seenCand.has(k)) continue;
    seenCand.add(k);
    mergedCands.push(s);
  }
  // 从训练标签推出来的候选才需要防「服装」「人物」这类说明词
  for (const c of nameCandidates(tags, row.trigger)) {
    const s = String(c || '').trim();
    const k = s.toLowerCase();
    if (!s || seenCand.has(k)) continue;
    if (!isRoleName(s)) continue;
    seenCand.add(k);
    mergedCands.push(s);
  }
  const savedCands = mCands.map((c) => String(c || '').trim()).filter(Boolean);
  // 特征词清洗：训练标签 ≠ 这个人的长相。出图只拿 identity_words，其余留在报告里备查
  const ident = identityReport(row.feature_words);
  // 服装、光照、滑块这些支本来就不该有「长相」，别把提示挂在它们头上误伤
  const wantsIdentity = !row.category || ['角色', '自己的', '其他'].includes(row.category);
  if (!wantsIdentity) { ident.level = 'ok'; ident.note = ''; }
  return {
    ...row,
    tags,
    candidates: mergedCands,
    characters: savedCands,
    identity_words: ident.identity,
    identity_level: ident.level,
    identity_note: ident.note,
    identity_counts: ident.counts,
    feature_dropped: ident.dropped,
    triggers: getTriggers(row.id),
    meta: meta0,
    siblings,
  };
}

/* 「选哪个角色」那一排里只该出现人名。纯中文的短词以前一律当说明扔掉，
   结果「可莉」「纳西妲」也进不来。现在只拦明确的说明词 / 说明性词尾。 */
const CAND_STOP = new Set(['服装', '人物', '衣服', '角色', '场景', '道具', '动作', '视角', '风格', '其他', '整合', '混合']);
const CAND_NOTE = /(说明|介绍|注意|使用方法|使用方式|下载地址|下载链接|作者|权重|标签|提示|预览|封面|列表|目录|版本|更新|内容|简介|特点|效果)/;
export function isRoleName(c) {
  const s = String(c || '').trim();
  if (!s || s.length > 60) return false;
  if (CAND_STOP.has(s)) return false;
  if (CAND_NOTE.test(s)) return false;
  return true;
}

function safeJson(s) { try { return s ? JSON.parse(s) : {}; } catch { return {}; } }

export function searchLoras({
  q = '', category = '', work = '', tag = '', status = '', hasPreview = '',
  flag = '', variants = '0', sort = 'name', limit = 60, offset = 0,
} = {}) {
  const where = [];
  const params = [];
  if (String(variants) !== '1') where.push('l.is_variant = 0');
  const words = String(q).trim().split(/\s+/).filter(Boolean);
  for (const w of words) {
    const like = `%${w}%`;
    where.push(`(l.name LIKE ? OR l.name_en LIKE ? OR l.name_zh LIKE ? OR l.trigger LIKE ? OR l.feature_words LIKE ?
      OR l.outfit_words LIKE ? OR l.body_words LIKE ? OR l.note LIKE ? OR l.rel_path LIKE ?
      OR l.aliases LIKE ? OR EXISTS (SELECT 1 FROM lora_tag lt JOIN tag t ON t.id = lt.tag_id WHERE lt.lora_id = l.id AND t.name LIKE ?))`);
    params.push(like, like, like, like, like, like, like, like, like, like, like);
  }
  if (category) { where.push('l.category = ?'); params.push(category); }
  if (work) { where.push('l.work = ?'); params.push(work); }
  if (status) { where.push('l.status = ?'); params.push(status); }
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM lora_tag lt JOIN tag t ON t.id = lt.tag_id WHERE lt.lora_id = l.id AND t.name = ?)');
    params.push(tag);
  }
  if (hasPreview === '1') where.push("l.preview <> ''");
  if (hasPreview === '0') where.push("l.preview = ''");
  if (flag === 'unused') where.push('COALESCE(u.runs,0) = 0');
  if (flag === 'noimage') where.push("l.preview = ''");
  if (flag === 'noname') where.push("l.name = replace(l.filename,'.safetensors','')");
  if (flag === 'nosource') where.push("l.source_url = '' AND l.model_id = ''");
  if (flag === 'dup') where.push("l.sha256 <> ''");

  const orderBy = {
    name: 'l.name COLLATE NOCASE ASC',
    recent: 'l.updated_at DESC',
    size: 'l.size_bytes DESC',
    used: 'runs DESC, l.name COLLATE NOCASE ASC',
    work: 'l.work ASC, l.name COLLATE NOCASE ASC',
  }[sort] || 'l.name COLLATE NOCASE ASC';

  const sqlBase = `FROM lora l LEFT JOIN usage u ON u.lora_id = l.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;

  const total = db().prepare(`SELECT COUNT(*) AS c ${sqlBase}`).get(...params).c;
  const rows = db().prepare(`
    SELECT l.id, l.name, l.name_en, l.name_zh, l.category, l.work, l.trigger, l.feature_words, l.outfit_words,
           l.preview, l.weight, l.size_bytes, l.status, l.rel_path, l.source_url,
           l.body_words, l.negative, l.updated_at, l.is_variant, l.family, l.preview_kind,
           COALESCE(u.runs,0) AS runs, u.last_used
    ${sqlBase} ORDER BY ${orderBy} LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  return { total, limit: Number(limit), offset: Number(offset), items: rows };
}

export function stats() {
  const conn = db();
  const one = (sql, ...p) => conn.prepare(sql).get(...p);
  const total = one('SELECT COUNT(*) c FROM lora').c;
  const byCategory = conn.prepare('SELECT category, COUNT(*) c FROM lora GROUP BY category ORDER BY c DESC').all();
  const byWork = conn.prepare("SELECT work, COUNT(*) c FROM lora WHERE work <> '' GROUP BY work ORDER BY c DESC LIMIT 30").all();
  const withPreview = one("SELECT COUNT(*) c FROM lora WHERE preview <> ''").c;
  const withTrigger = one("SELECT COUNT(*) c FROM lora WHERE trigger <> ''").c;
  const withSource = one("SELECT COUNT(*) c FROM lora WHERE source_url <> '' OR model_id <> ''").c;
  const missing = one("SELECT COUNT(*) c FROM lora WHERE status <> 'ok'").c;
  const bytes = one('SELECT COALESCE(SUM(size_bytes),0) s FROM lora').s;
  const withTags = one('SELECT COUNT(DISTINCT lora_id) c FROM lora_tag').c;
  const variants = one('SELECT COUNT(*) c FROM lora WHERE is_variant = 1').c;
  const families = one("SELECT COUNT(*) c FROM (SELECT family FROM lora WHERE family <> '' GROUP BY family HAVING COUNT(*) > 1)").c;
  const recent = conn.prepare('SELECT id, name, updated_at FROM lora ORDER BY updated_at DESC LIMIT 8').all();
  return { total, byCategory, byWork, withPreview, withTrigger, withSource, missing, withTags, bytes, recent, variants, families };
}

export function facets() {
  const conn = db();
  return {
    // 侧栏数字要和默认列表（不含「其它版本」）对得上，否则点「角色 804」只出来 751 支
    categories: conn.prepare('SELECT category AS name, COUNT(*) c FROM lora WHERE is_variant = 0 GROUP BY category ORDER BY c DESC').all(),
    works: conn.prepare("SELECT work AS name, category, COUNT(*) c FROM lora WHERE work <> '' AND is_variant = 0 GROUP BY category, work ORDER BY c DESC").all(),
    tags: conn.prepare(`
      SELECT t.name, COUNT(*) c FROM lora_tag lt
      JOIN tag t ON t.id = lt.tag_id
      JOIN lora l ON l.id = lt.lora_id AND l.is_variant = 0
      GROUP BY t.id ORDER BY c DESC LIMIT 150
    `).all(),
  };
}

/* ------------------------------ 使用记录 ------------------------------ */

export function recordUsage(relPaths, image = '', actor = 'gen-log') {
  const conn = db();
  const index = buildDiskIndex();
  const stamp = new Date().toISOString();
  let n = 0;
  withTx(() => {
    for (const raw of relPaths || []) {
      const clean = String(raw).split(':')[0].trim();
      const rel = resolveRelPath(clean);
      const hit = index.map.get(String(rel).toLowerCase());
      const row = conn.prepare('SELECT id FROM lora WHERE rel_path = ?').get(hit ? hit.rel_path : rel);
      if (!row) continue;
      conn.prepare(`
        INSERT INTO usage (lora_id, runs, last_used, last_image) VALUES (?,1,?,?)
        ON CONFLICT(lora_id) DO UPDATE SET runs = runs + 1, last_used = excluded.last_used,
          last_image = CASE WHEN excluded.last_image <> '' THEN excluded.last_image ELSE last_image END
      `).run(row.id, stamp, image || '');
      n++;
    }
    if (n) logEvent('usage', null, actor, `${n} lora`);
  });
  return n;
}

export function fileSha256(absPath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(absPath, 'r');
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let pos = 0;
    while (true) {
      const r = fs.readSync(fd, buf, 0, buf.length, pos);
      if (!r) break;
      hash.update(buf.subarray(0, r));
      pos += r;
    }
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
