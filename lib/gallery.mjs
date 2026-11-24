/**
 * 图库：直接读配置里的目录（出图目录 gen.outputRoot / 成品区 samplesRoot）。
 * 递归最多 3 层（成品区是按作品分文件夹的）。
 * 删图只按相对路径删，路径不许跳出根目录。
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';

const IMG = /\.(png|jpe?g|webp|gif)$/i;
const MAX_DEPTH = 3;

export function galleryRoot(kind = 'output') {
  const cfg = loadConfig();
  return (kind === 'samples' ? cfg.samplesRoot : cfg.gen?.outputRoot) || '';
}

function isInside(target, root) {
  const norm = path.resolve(target).toLowerCase();
  const base = path.resolve(root).toLowerCase();
  return norm === base || norm.startsWith(base + path.sep);
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

export function deleteImages({ root: kind = 'output', names = [] } = {}) {
  const root = path.resolve(galleryRoot(kind) || '');
  if (!root || !fs.existsSync(root)) throw new Error('目录不存在');
  const removed = [];
  const errors = [];
  for (const raw of names) {
    const rel = String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (!rel || rel.split('/').some((p) => !p || p === '.' || p === '..')) {
      errors.push(`非法路径：${raw}`);
      continue;
    }
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
