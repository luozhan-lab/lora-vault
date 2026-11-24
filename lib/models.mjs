import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';

/* 模型文件：底模 / 文本编码器 / VAE / 整包 checkpoint
   只在配置里给的几个根目录下扫描，删也只允许删这些目录里的文件。 */

const EXT = /\.(safetensors|ckpt|pt|pth|bin|gguf)$/i;

export function modelRoots() {
  const cfg = loadConfig();
  return cfg.modelRoots || {};
}

function walk(dir, depth, out, root) {
  if (depth < 0) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of entries) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) { walk(full, depth - 1, out, root); continue; }
    if (!d.isFile() || !EXT.test(d.name)) continue;
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    out.push({
      name: path.basename(d.name),
      rel: path.relative(root, full).replaceAll('/', '\\'),
      path: full,
      size: st.size,
      mtime: st.mtimeMs,
      root,
    });
  }
}

export function listModels() {
  const cfg = loadConfig();
  const roots = modelRoots();
  const out = {};
  for (const [kind, dirs] of Object.entries(roots)) {
    const seen = new Set();
    const items = [];
    for (const dir of Array.isArray(dirs) ? dirs : [dirs]) {
      if (!dir || !fs.existsSync(dir)) continue;
      const found = [];
      walk(dir, 2, found, dir);
      for (const f of found) {
        const key = (f.rel || f.name).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(f);
      }
    }
    items.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    out[kind] = items;
  }
  return {
    roots,
    defaults: {
      unet: cfg.gen?.unet || '',
      clip: cfg.gen?.clip || '',
      vae: cfg.gen?.vae || '',
      checkpoint: cfg.gen?.checkpoint || '',
      engine: cfg.gen?.engine || 'auto',
    },
    models: out,
  };
}

/* ComfyUI 自己认的名字（生成时必须用这个，磁盘路径可能带子目录） */
export async function comfyModelNames() {
  const cfg = loadConfig();
  const base = String(cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/+$/, '');
  const pick = async (node, field) => {
    try {
      const r = await fetch(`${base}/object_info/${node}`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return [];
      const j = await r.json();
      const list = j?.[node]?.input?.required?.[field]?.[0];
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  };
  const [unets, clips, vaes, checkpoints, loras] = await Promise.all([
    pick('UNETLoader', 'unet_name'),
    pick('CLIPLoader', 'clip_name'),
    pick('VAELoader', 'vae_name'),
    pick('CheckpointLoaderSimple', 'ckpt_name'),
    pick('LoraLoader', 'lora_name'),
  ]);
  return { unets, clips, vaes, checkpoints, loras };
}

/** 删一个模型文件：path 必须落在该 kind 的根目录里 */
export function deleteModel(kind, absPath) {
  const roots = modelRoots()[kind];
  if (!roots) throw new Error('不认识的模型类型：' + kind);
  const target = path.resolve(String(absPath || ''));
  const list = Array.isArray(roots) ? roots : [roots];
  const inside = list.some((r) => {
    const root = path.resolve(r).toLowerCase();
    return target.toLowerCase().startsWith(root + path.sep);
  });
  if (!inside) throw new Error('这个文件不在模型目录里，不许删');
  if (!EXT.test(target)) throw new Error('只删模型文件');
  if (!fs.existsSync(target)) throw new Error('文件已经不在了');
  fs.unlinkSync(target);
  return { deleted: true, path: target };
}
