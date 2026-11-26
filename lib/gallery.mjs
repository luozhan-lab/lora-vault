/**
 * 图库：直接读配置里的目录（出图目录 gen.outputRoot / 成品区 samplesRoot）。
 * 递归最多 3 层（成品区是按作品分文件夹的）。
 * 删图 / 搬图只按相对路径，路径不许跳出根目录。
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';

const IMG = /\.(png|jpe?g|webp|gif)$/i;
const MAX_DEPTH = 3;
const BAD_DIR = /[<>:"|?*\u0000-\u001f]/;

export function galleryRoot(kind = 'output') {
  const cfg = loadConfig();
  return (kind === 'samples' ? cfg.samplesRoot : cfg.gen?.outputRoot) || '';
}

function isInside(target, root) {
  const norm = path.resolve(target).toLowerCase();
  const base = path.resolve(root).toLowerCase();
  return norm === base || norm.startsWith(base + path.sep);
}

/* 图片相对路径：不带 \、不带开头 /，不许 .. */
function cleanRel(raw) {
  const rel = String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!rel) return '';
  if (rel.split('/').some((p) => !p || p === '.' || p === '..')) return '';
  return rel;
}

/* 目标文件夹：可以是多级（最多 3 层），不许绝对路径、不许 .. 和 Windows 非法字符 */
function cleanTarget(raw) {
  const text = String(raw ?? '').replace(/\\/g, '/').trim();
  if (!text) return '';
  if (/^[a-zA-Z]:/.test(text) || text.startsWith('/')) throw new Error('目标文件夹要写相对路径，例如 纳西妲 / 精选');
  const parts = text.split('/').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length > MAX_DEPTH) throw new Error(`最多 ${MAX_DEPTH} 层文件夹`);
  for (const part of parts) {
    if (part === '.' || part === '..') throw new Error('文件夹名不能是 . 或 ..');
    if (BAD_DIR.test(part)) throw new Error(`文件夹名里有不能用的字符：${part}`);
    if (part.length > 80) throw new Error(`文件夹名太长：${part}`);
    if (/[. ]$/.test(part)) throw new Error(`文件夹名不能用点或空格结尾：${part}`);
  }
  return parts.join('/');
}

function walk(root, rel, out, depth) {
  if (depth > MAX_DEPTH) return;
  let entries = [];
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const d of entries) {
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) { walk(root, childRel, out, depth + 1); continue; }
    if (!d.isFile() || !IMG.test(d.name)) continue;
    const full = path.join(root, rel, d.name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    out.push({ name: d.name, rel: childRel, path: full, size: st.size, mtime: st.mtimeMs });
  }
}

function walkDirs(root, rel, out, depth) {
  if (depth >= MAX_DEPTH) return;
  let entries = [];
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const d of entries) {
    if (!d.isDirectory()) continue;
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    out.push(childRel);
    walkDirs(root, childRel, out, depth + 1);
  }
}

export function listImages({ root: kind = 'output', limit = 60, offset = 0, sort = 'new', q = '' } = {}) {
  const root = galleryRoot(kind);
  if (!root || !fs.existsSync(root)) return { root, kind, total: 0, offset, limit, items: [] };
  const kw = String(q || '').trim().toLowerCase();
  const items = [];
  walk(root, '', items, 0);
  const filtered = kw ? items.filter((it) => it.rel.toLowerCase().includes(kw)) : items;
  filtered.sort((a, b) => (sort === 'old' ? a.mtime - b.mtime : b.mtime - a.mtime));
  return {
    root, kind, total: filtered.length, offset, limit,
    items: filtered.slice(offset, offset + limit),
  };
}

/* 目标目录里同名的就加 (1) (2)，绝不覆盖 */
function nextFree(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n += 1;
    if (n > 9999) throw new Error(`目标里同名文件太多：${name}`);
  }
  return candidate;
}

function moveFile(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

/* 目录树（含空目录），带每个目录递归的图片数；根目录本身不列 */
export function listDirs({ root: kind = 'samples' } = {}) {
  const root = galleryRoot(kind) || '';
  if (!root || !fs.existsSync(root)) return { root, kind, dirs: [] };
  const names = [];
  walkDirs(root, '', names, 0);
  const items = [];
  walk(root, '', items, 0);
  const counts = new Map();
  for (const it of items) {
    const parts = it.rel.split('/');
    parts.pop();
    counts.set('', (counts.get('') || 0) + 1);
    let acc = '';
    for (const seg of parts) {
      acc = acc ? `${acc}/${seg}` : seg;
      counts.set(acc, (counts.get(acc) || 0) + 1);
    }
  }
  const dirs = names
    .map((rel) => ({ rel, count: counts.get(rel) || 0 }))
    .sort((a, b) => a.rel.localeCompare(b.rel, 'zh-Hans-CN', { numeric: true }) || 0);
  return { root, kind, dirs };
}

/* 搬到另一个根（成品区 / 出图目录）或同根的子文件夹 */
export function moveImages({ root: kind = 'output', to = '', names = [], target = '' } = {}) {
  if (!Array.isArray(names) || !names.length) throw new Error('没选要移动的图');
  const fromKind = kind === 'samples' ? 'samples' : 'output';
  const srcRoot = path.resolve(galleryRoot(fromKind) || '');
  if (!srcRoot || !fs.existsSync(srcRoot)) throw new Error('源目录不存在');
  const toKind = to === 'samples' || to === 'output' ? to : (fromKind === 'samples' ? 'output' : 'samples');
  const destRootRaw = galleryRoot(toKind);
  if (!destRootRaw) throw new Error(toKind === 'samples' ? '成品区目录没设置，去设置里选一下' : '出图目录没设置，去设置里选一下');
  const destRoot = path.resolve(destRootRaw);
  const sub = cleanTarget(target);
  const destDir = sub ? path.join(destRoot, ...sub.split('/')) : destRoot;
  if (!isInside(destDir, destRoot)) throw new Error('目标路径越界');
  fs.mkdirSync(destDir, { recursive: true });

  const moved = [];
  const renamed = [];
  const errors = [];
  for (const raw of names) {
    const rel = cleanRel(raw);
    if (!rel) { errors.push(`非法路径：${raw}`); continue; }
    const full = path.resolve(srcRoot, rel);
    if (!isInside(full, srcRoot)) { errors.push(`越界：${raw}`); continue; }
    if (!IMG.test(full)) { errors.push(`不是图片：${rel}`); continue; }
    if (!fs.existsSync(full)) { errors.push(`不在了：${rel}`); continue; }
    const straight = path.resolve(destDir, path.basename(full));
    if (straight.toLowerCase() === full.toLowerCase()) { errors.push(`已经在这里：${rel}`); continue; }
    let dest;
    try { dest = nextFree(destDir, path.basename(full)); } catch (e) { errors.push(e.message); continue; }
    try {
      moveFile(full, dest);
      const toRel = path.relative(destRoot, dest).replace(/\\/g, '/');
      moved.push(toRel);
      if (path.basename(dest) !== path.basename(full)) renamed.push(toRel);
    } catch (e) {
      errors.push(`${rel}：${e.message}`);
    }
  }
  return {
    moved: moved.length,
    names: moved,
    renamed,
    errors,
    root: fromKind,
    to: toKind,
    target: sub,
    dir: destRoot,
  };
}

export function deleteImages({ root: kind = 'output', names = [] } = {}) {
  const root = path.resolve(galleryRoot(kind) || '');
  if (!root || !fs.existsSync(root)) throw new Error('目录不存在');
  const removed = [];
  const errors = [];
  for (const raw of names) {
    const rel = cleanRel(raw);
    if (!rel) { errors.push(`非法路径：${raw}`); continue; }
    const full = path.resolve(root, rel);
    if (!isInside(full, root)) { errors.push(`越界：${raw}`); continue; }
    if (!IMG.test(full)) { errors.push(`不是图片：${rel}`); continue; }
    try {
      if (!fs.existsSync(full)) { errors.push(`不在了：${rel}`); continue; }
      fs.unlinkSync(full);
      removed.push(rel);
    } catch (e) {
      errors.push(`${rel}：${e.message}`);
    }
  }
  return { removed: removed.length, names: removed, errors };
}
