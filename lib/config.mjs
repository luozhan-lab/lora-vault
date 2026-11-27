import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* 公开版不能把数据库、配置、预览图写进安装目录（Program Files 可能只读）。
   桌面端启动后端时会传 LORA_LIBRARY_DATA=%APPDATA%/.../data；开发/老用户没传时仍用工作区 data。 */
export const DATA_DIR = process.env.LORA_LIBRARY_DATA
  ? path.resolve(process.env.LORA_LIBRARY_DATA)
  : path.join(ROOT, 'data');
export const PREVIEW_DIR = path.join(DATA_DIR, 'previews');
export const THUMB_DIR = path.join(DATA_DIR, 'thumbs');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DB_PATH = path.join(DATA_DIR, 'lora.db');
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULTS = {
  port: 8787,
  host: '127.0.0.1',
  /* 公开版不写死任何人的盘符：路径由首次启动的 discover() 探测后写入，
     探测不到就留空，让设置/向导去选。 */
  lorasRoot: '',
  /* 额外 LoRA 根；主根仍然是 lorasRoot，保持老配置兼容 */
  lorasRoots: [],
  samplesRoot: '',
  comfyUrl: 'http://127.0.0.1:8188',
  comfyDir: '',
  comfyLaunch: 'python main.py',
  /* 台账默认写在软件自己的 data 目录，不再指向某个人的 studio 目录 */
  genLogPath: path.join(DATA_DIR, 'gen-log.jsonl'),
  watchGenLog: true,
  watchIntervalMs: 10000,
  scanOnStart: true,
  modelRoots: {
    unet: [],
    clip: [],
    vae: [],
    checkpoint: [],
  },
  gen: {
    engine: 'auto',
    script: '',
    cwd: '',
    unet: '',
    clip: '',
    vae: '',
    checkpoint: '',
    clipType: 'stable_diffusion',
    sampler: 'euler',
    scheduler: 'normal',
    workflow: '',
    outputRoot: '',
  },
  civitaiToken: '',
  /* C 站要挂代理才能连；留空就用系统代理自动检测 */
  proxy: '',
  downloadConcurrency: 2,
  /* 更新清单地址（latest.json），可空；支持 https 或本地文件路径 */
  updateUrl: '',
  /* 赞助链接（可空）：填了设置页「关于」才出现「支持作者」；留空就整块不显示 */
  sponsorUrl: '',
  /* 作品展示链接（C 站主页之类），可空 */
  portfolioUrl: '',
  token: null,
};

export function ensureDirs() {
  for (const d of [DATA_DIR, PREVIEW_DIR, THUMB_DIR]) fs.mkdirSync(d, { recursive: true });
}

export function loadConfig() {
  ensureDirs();
  let cfg = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      // 记事本 / PowerShell 5 保存的 JSON 会带 UTF-8 BOM，JSON.parse 直接失败。
      // 以前这种情况下整个配置会被悄悄重置成默认值（token、路径全丢），这里先剥 BOM。
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, '');
      cfg = JSON.parse(raw);
    } catch {
      cfg = {};
      // 真损坏也留个证据，别把用户原来的配置直接覆盖没了
      try { fs.copyFileSync(CONFIG_PATH, `${CONFIG_PATH}.broken-${Date.now()}`); } catch { /* ignore */ }
    }
  }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const merged = {
    ...DEFAULTS,
    ...cfg,
    // 嵌套配置补默认值：老版本 config.json 缺 gen.engine / modelRoots 某一项时不能整块丢
    gen: { ...DEFAULTS.gen, ...(isObj(cfg.gen) ? cfg.gen : {}) },
    modelRoots: { ...DEFAULTS.modelRoots, ...(isObj(cfg.modelRoots) ? cfg.modelRoots : {}) },
  };
  let dirty = false;
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (merged[k] === undefined) { merged[k] = v; dirty = true; }
  }
  if (!merged.token) { merged.token = crypto.randomBytes(24).toString('hex'); dirty = true; }
  if (dirty || !fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

export function relToRoot(absPath) {
  const cfg = loadConfig();
  return path.relative(cfg.lorasRoot, absPath).replaceAll('/', '\\');
}
