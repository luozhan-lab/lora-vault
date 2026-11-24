import path from 'node:path';
import { loadConfig } from './config.mjs';

/* 多 LoRA 根：
   - cfg.lorasRoot 是主根，保持老行为，主根里的 rel_path 不变；
   - cfg.lorasRoots 是额外根；
   - 额外根的文件在数据库里用 @@root:<编码后的根>@@\ <相对路径> 做 rel_path，
     这样 rel_path 仍然全局唯一，不用重做 unique 约束；
   - 取绝对路径、给 ComfyUI 的名字、移动分类都走这里，别直接拼 cfg.lorasRoot。 */

const PREFIX = '@@root:';
const SUFFIX = '@@\\';

export function loraRoots(cfg = loadConfig()) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    const v = String(p || '').trim();
    if (!v) return;
    let abs;
    try { abs = path.resolve(v); } catch { return; }
    const key = abs.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(abs);
  };
  add(cfg.lorasRoot);
  for (const p of Array.isArray(cfg.lorasRoots) ? cfg.lorasRoots : []) add(p);
  return out;
}

export function primaryRoot(cfg = loadConfig()) {
  const roots = loraRoots(cfg);
  return roots[0] || '';
}

export function rootKey(root) {
  return PREFIX + encodeURIComponent(path.resolve(root)) + SUFFIX;
}

export function isRooted(rel) {
  return String(rel || '').startsWith(PREFIX);
}

export function splitRooted(rel) {
  const s = String(rel || '');
  if (!isRooted(s)) return { root: '', rel: s };
  const m = s.slice(PREFIX.length).match(/^([^@]*)@@[\\/](.*)$/);
  if (!m) return { root: '', rel: s };
  let root = '';
  try { root = decodeURIComponent(m[1]); } catch { root = ''; }
  return { root, rel: m[2] };
}

export function rootRel(rel) {
  return splitRooted(rel).rel;
}

export function rootOf(rel, cfg = loadConfig()) {
  const r = splitRooted(rel).root;
  return r ? path.resolve(r) : primaryRoot(cfg);
}

export function absOf(rel, cfg = loadConfig()) {
  const s = splitRooted(rel);
  const root = s.root || primaryRoot(cfg);
  if (!root) return '';
  return path.join(root, s.rel);
}

export function makeRel(root, rel, primary = false) {
  const r = String(rel || '').replaceAll('/', '\\');
  return primary ? r : rootKey(root) + r;
}

/** 给 ComfyUI / 生成日志用的名字：额外根去掉前缀，只留根内相对路径。 */
export function comfyNameOf(rel) {
  return rootRel(rel);
}
