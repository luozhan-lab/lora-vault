import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { DATA_DIR, PREVIEW_DIR, THUMB_DIR, loadConfig } from './config.mjs';

let _magick = null;
let _magickChecked = false;

function findMagick() {
  if (_magickChecked) return _magick;
  _magickChecked = true;
  const candidates = [
    'magick',
    'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe',
    'C:\\Program Files\\ImageMagick-7.1.1-Q16-HDRI\\magick.exe',
  ];
  for (const c of candidates) {
    if (c.includes('\\')) { if (fs.existsSync(c)) { _magick = c; return _magick; } }
  }
  _magick = 'magick';
  return _magick;
}

export function thumbPathFor(id) {
  return path.join(THUMB_DIR, `${id}.jpg`);
}

export function runMagick(args, timeout = 30000) {
  return new Promise((resolve) => {
    execFile(findMagick(), args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, err: err ? String(err.message) : '', stderr: stderr || '' });
    });
  });
}

/**
 * 生成缩略图。失败返回 false，前端会自动退回原图。
 */
export async function makeThumb(id, srcAbs, size = 560) {
  if (!srcAbs || !fs.existsSync(srcAbs)) return false;
  const dest = thumbPathFor(id);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const { ok } = await runMagick([srcAbs, '-auto-orient', '-resize', `${size}x${size}>`, '-quality', '82', dest]);
  return ok && fs.existsSync(dest);
}

/**
 * preview 字段解析成磁盘路径。
 * 支持：
 *   local:xxx.jpg            → data/previews/xxx.jpg
 *   samples/服装/a.png       → <samplesRoot>/服装/a.png（或原样相对 samplesRoot）
 *   绝对路径                  → 直出
 *   http(s)://               → 返回 null（前端直接 img src，不代理）
 */
export function resolvePreviewAbs(preview) {
  if (!preview) return null;
  // 老库有的字段是多张图用 | 拼的，取第一张
  const first = String(preview).split('|')[0].trim();
  if (/^https?:\/\//i.test(first)) return null;
  const cfg = loadConfig();
  if (first.startsWith('local:')) {
    const f = path.join(PREVIEW_DIR, first.slice(6));
    return fs.existsSync(f) ? f : null;
  }
  if (path.isAbsolute(first)) return fs.existsSync(first) ? first : null;

  const candidates = [
    path.join(DATA_DIR, 'previews', first),
    path.join(cfg.samplesRoot, first),
    path.join(path.dirname(cfg.samplesRoot), first),
    first,
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function previewUrlFor(lora) {
  if (!lora || !lora.preview) return '';
  if (/^https?:\/\//i.test(lora.preview)) return lora.preview;
  return `/media/${lora.id}/full`;
}

export function thumbUrlFor(lora) {
  if (!lora || !lora.preview) return '';
  if (/^https?:\/\//i.test(lora.preview)) return lora.preview;
  if (fs.existsSync(thumbPathFor(lora.id))) return `/media/${lora.id}/thumb`;
  return `/media/${lora.id}/full`;
}

export function contentTypeFor(file) {
  const e = path.extname(file).toLowerCase();
  return {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp',
  }[e] || 'application/octet-stream';
}
