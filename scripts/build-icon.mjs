#!/usr/bin/env node
/**
 * 图标构建：desktop/assets/icon.svg → icon.png(1024) + icon.ico(多尺寸)
 *
 * 依赖 ImageMagick（`magick` 在 PATH 上）。只写文件，不碰服务、不碰数据库。
 *   node scripts/build-icon.mjs
 *
 * ico 用 BMP(DIB) 条目而不是 PNG 条目 —— PNG 条目的 ico 在个别机器上做快捷方式会显示成白纸。
 * 同时把 icon.svg 同步到 public/v2/icon.svg（页面 favicon）、
 * icon.png 同步到 publish/img/icon.png（发布页）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const assetsDir = path.join(root, 'desktop', 'assets');
const svgPath = path.join(assetsDir, 'icon.svg');
const pngPath = path.join(assetsDir, 'icon.png');
const icoPath = path.join(assetsDir, 'icon.ico');
const faviconPath = path.join(root, 'public', 'v2', 'icon.svg');
const publishPath = path.join(root, 'publish', 'img', 'icon.png');

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

if (!fs.existsSync(svgPath)) {
  console.error(`没有图标源文件：${svgPath}`);
  process.exit(1);
}

function magick(args) {
  return execFileSync('magick', args, { maxBuffer: 1 << 27, stdio: ['ignore', 'pipe', 'pipe'] });
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lora-icon-'));

// svg 的 1024 画布按 96dpi 出图，density 拉成目标像素直接光栅化，比缩小 1024 再锐利
const densityFor = (size) => ((size * 96) / 1024).toFixed(3);

function render(size, depth = 8) {
  const out = path.join(tmpDir, `icon-${size}.png`);
  magick(['-density', densityFor(size), '-background', 'none', svgPath, '-strip', '-depth', String(depth), out]);
  return out;
}

/** 单张 PNG → BMP(DIB) 条目：40 字节头 + 自下而上的 BGRA + AND 掩码 */
function dibEntry(pngPathFile, size) {
  const rgba = execFileSync('magick', [pngPathFile, '-depth', '8', 'rgba:-'], { maxBuffer: 1 << 27 });
  const stride = size * 4;
  if (rgba.length < stride * size) throw new Error(`像素数据不足：${pngPathFile}`);

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);            // biSize
  header.writeInt32LE(size, 4);           // biWidth
  header.writeInt32LE(size * 2, 8);       // biHeight（XOR + AND 两半）
  header.writeUInt16LE(1, 12);            // biPlanes
  header.writeUInt16LE(32, 14);           // biBitCount
  header.writeUInt32LE(0, 16);            // BI_RGB
  header.writeUInt32LE(stride * size, 20);

  const xor = Buffer.alloc(stride * size);
  const maskStride = Math.ceil(size / 32) * 4;
  const andMask = Buffer.alloc(maskStride * size);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * stride;
    const dst = y * stride;
    const maskRow = y * maskStride;
    for (let x = 0; x < size; x++) {
      const s = src + x * 4;
      const d = dst + x * 4;
      const a = rgba[s + 3];
      xor[d] = a === 0 ? 0 : rgba[s + 2];
      xor[d + 1] = a === 0 ? 0 : rgba[s + 1];
      xor[d + 2] = a === 0 ? 0 : rgba[s];
      xor[d + 3] = a;
      // AND 掩码：1 = 透明。新系统走 alpha，老外壳走掩码，两边都对。
      if (a < 128) andMask[maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }

  return Buffer.concat([header, xor, andMask]);
}

// 1) 1024 主图
magick(['-background', 'none', svgPath, '-resize', '1024x1024', '-depth', '8', pngPath]);

// 2) 多尺寸 ico
const entries = SIZES.map((size) => ({ size, data: dibEntry(render(size), size) }));
const dir = Buffer.alloc(6 + 16 * entries.length);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(entries.length, 4);
let offset = dir.length;
entries.forEach((entry, i) => {
  const at = 6 + i * 16;
  const dim = entry.size >= 256 ? 0 : entry.size;
  dir.writeUInt8(dim, at);
  dir.writeUInt8(dim, at + 1);
  dir.writeUInt8(0, at + 2);
  dir.writeUInt8(0, at + 3);
  dir.writeUInt16LE(1, at + 4);
  dir.writeUInt16LE(32, at + 6);
  dir.writeUInt32LE(entry.data.length, at + 8);
  dir.writeUInt32LE(offset, at + 12);
  offset += entry.data.length;
});
fs.writeFileSync(icoPath, Buffer.concat([dir, ...entries.map((e) => e.data)]));

// 3) 同步副本
fs.copyFileSync(svgPath, faviconPath);
fs.mkdirSync(path.dirname(publishPath), { recursive: true });
fs.copyFileSync(pngPath, publishPath);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`icon.png  ${(fs.statSync(pngPath).size / 1024).toFixed(0)} KB`);
console.log(`icon.ico  ${(fs.statSync(icoPath).size / 1024).toFixed(0)} KB (${SIZES.join('/')})`);
