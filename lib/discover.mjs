import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/* 公开版首次启动：不假设任何人的盘符，尽量把
   ComfyUI Desktop / ComfyUI 便携版 / ComfyUI extra_model_paths / A1111 / Forge
   的模型和 LoRA 目录自己找出来。

   找到多个 LoRA 根时，discover() 的 lorasRoot 只取一个「主根」（文件最多那个），
   lorasRoots 里会把全部根带回去；真正多根同时入库需要改数据库，这里先保证
   大多数用户「有一个 ComfyUI，models/loras 能用」。 */

const LORA_NAMES = ['loras', 'lora', 'Loras', 'Lora', 'LoRAs', 'LoRA'];
const KIND_NAMES = {
  checkpoint: ['checkpoints', 'Checkpoints', 'Stable-diffusion', 'stable-diffusion', 'StableDiffusion'],
  unet: ['diffusion_models', 'unet', 'Unet', 'unet_models'],
  clip: ['text_encoders', 'clip', 'CLIP', 'text_encoder', 'TextEncoders'],
  vae: ['vae', 'VAE'],
};

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); } catch { return ''; }
}

function unquote(s) {
  return String(s || '').trim().replace(/^['"]|['"]$/g, '').trim();
}

function resolvePath(raw, base) {
  const v = unquote(raw);
  if (!v) return '';
  if (v === '~' || v.startsWith('~/') || v.startsWith('~\\')) {
    return path.join(os.homedir(), v.slice(2));
  }
  return path.isAbsolute(v) ? path.normalize(v) : path.resolve(base, v);
}

function subdirs(base) {
  let entries;
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const d of entries) {
    const full = path.join(base, d.name);
    let isDir = d.isDirectory();
    if (!isDir) {
      try { isDir = fs.statSync(full).isDirectory(); } catch { isDir = false; }
    }
    if (isDir) out.push(full);
  }
  return out;
}

function findDir(base, names) {
  const subs = subdirs(base);
  for (const name of names) {
    const hit = subs.find((p) => path.basename(p).toLowerCase() === String(name).toLowerCase());
    if (hit) return hit;
  }
  return '';
}

function existingUnique(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const p = String(raw || '').trim();
    if (!p) continue;
    let ok = false;
    try { ok = fs.existsSync(p) && fs.statSync(p).isDirectory(); } catch { ok = false; }
    if (!ok) continue;
    let real = path.resolve(p);
    try { real = fs.realpathSync.native(p); } catch { /* 不是符号链接就保持原路径 */ }
    const key = real.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(path.resolve(p));
  }
  return out;
}

function countLoras(dir) {
  let n = 0;
  const walk = (d, depth) => {
    if (depth < 0) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full, depth - 1); continue; }
      if (/\.safetensors$/i.test(e.name)) n++;
    }
  };
  walk(dir, 3);
  return n;
}

/* 同时兼容两种 YAML：
   - Comfy Desktop 的 instance-model-paths：base_path + 'loras': '...'
   - ComfyUI 的 extra_model_paths.yaml：base_path + loras: models/loras，甚至 loras: |
   只解析路径相关的键，不依赖 yaml 库。 */
function parseModelYaml(file, defaultBase) {
  const text = readText(file);
  const out = {
    base: defaultBase,
    loras: [], checkpoints: [], vae: [], diffusion_models: [], unet: [], text_encoders: [], clip: [],
  };
  if (!text) return out;
  let curBase = defaultBase;
  let listKey = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').replace(/\s+$/, '');
    if (!line.trim()) continue;
    const indent = (line.match(/^\s*/) || [''])[0].length;

    if (listKey) {
      if (indent > 0) {
        const v = unquote(line.trim());
        if (v) out[listKey].push(resolvePath(v, curBase));
        continue;
      }
      listKey = null;
    }

    /* 新的顶层段（comfyui: / a111:）：base 回到默认，除非下一行 base_path 重新指定 */
    if (indent === 0 && /^[^\s:][^:]*:\s*$/.test(line)) {
      curBase = defaultBase;
      continue;
    }

    const mBase = line.match(/^\s*base_path\s*:\s*(.+?)\s*$/);
    if (mBase) { curBase = resolvePath(mBase[1], defaultBase); continue; }

    const mKey = line.match(/^\s*['"]?(loras|checkpoints|vae|diffusion_models|unet|text_encoders|clip)['"]?\s*:\s*(.*?)\s*$/);
    if (!mKey) continue;
    const key = mKey[1];
    const val = String(mKey[2] || '').trim();
    if (val === '|' || val === '>' || val === '|-') { listKey = key; continue; }
    const v = unquote(val);
    if (v) out[key].push(resolvePath(v, curBase));
  }
  return out;
}

function collectBase(baseDir) {
  const modelsDir = fs.existsSync(path.join(baseDir, 'models')) ? path.join(baseDir, 'models') : baseDir;
  const loras = [];
  for (const dir of [modelsDir, baseDir]) {
    const hit = findDir(dir, LORA_NAMES);
    if (hit) loras.push(hit);
  }
  const kinds = {};
  for (const [kind, names] of Object.entries(KIND_NAMES)) {
    kinds[kind] = [];
    for (const dir of [modelsDir, baseDir]) {
      const hit = findDir(dir, names);
      if (hit) kinds[kind].push(hit);
    }
  }

  /* extra_model_paths.yaml 可能在 ComfyUI 根、models 的上一级，或 yaml 自己指了 base_path */
  const yamls = [
    path.join(baseDir, 'extra_model_paths.yaml'),
    path.join(baseDir, '..', 'extra_model_paths.yaml'),
    path.join(modelsDir, '..', 'extra_model_paths.yaml'),
  ];
  for (const yaml of [...new Set(yamls.map((p) => path.resolve(p)))]) {
    if (!fs.existsSync(yaml)) continue;
    const parsed = parseModelYaml(yaml, baseDir);
    loras.push(...parsed.loras);
    kinds.unet.push(...parsed.diffusion_models, ...parsed.unet);
    kinds.clip.push(...parsed.text_encoders, ...parsed.clip);
    kinds.vae.push(...parsed.vae);
    kinds.checkpoint.push(...parsed.checkpoints);
  }

  const output = existingUnique([
    path.join(baseDir, 'output'),
    path.join(baseDir, 'outputs'),
  ])[0] || '';
  const samples = existingUnique([
    path.join(baseDir, 'samples'),
    path.join(baseDir, 'outputs'),
  ])[0] || '';

  return {
    base: baseDir,
    loras: existingUnique(loras),
    ...Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, existingUnique(v)])),
    output,
    samples,
  };
}

/* 用哪条命令拉起 ComfyUI：优先用安装目录里的 venv python，少依赖 PATH */
function buildComfyLaunch(entry, settings) {
  const q = (s) => `"${s}"`;
  const parts = [];
  const cands = [
    entry && entry.py,
    entry && entry.dir ? path.join(entry.dir, '..', 'python_embeded', 'python.exe') : '',
    entry && entry.dir ? path.join(entry.dir, '.venv', 'Scripts', 'python.exe') : '',
  ];
  const py = cands.find((p) => p && fs.existsSync(p)) || '';
  parts.push(py ? q(py) : 'python');
  parts.push('-s', (entry && entry.mainRel) || 'main.py');
  const instId = entry && entry.instId ? String(entry.instId) : '';
  if (instId) {
    const yaml = path.join(process.env.APPDATA || '', 'Comfy Desktop', 'instance-model-paths', instId + '.yaml');
    if (fs.existsSync(yaml)) parts.push('--extra-model-paths-config', q(yaml));
  }
  const inDir = String((settings && settings.inputDir) || '').trim();
  const outDir = String((settings && settings.outputDir) || '').trim();
  if (inDir && fs.existsSync(inDir)) parts.push('--input-directory', q(inDir));
  if (outDir && fs.existsSync(outDir)) parts.push('--output-directory', q(outDir));
  parts.push('--enable-manager');
  return parts.join(' ');
}

function fromDesktop() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const candidates = [
    path.join(appData, 'ComfyUI'),
    path.join(appData, 'Comfy Desktop'),
  ];
  const bases = [];
  const comfyDirs = [];
  const extraDirs = [];
  let outputRoot = '';
  let samplesRoot = '';
  let lastSettings = {};

  const pushComfy = (entry) => {
    if (!entry || !entry.dir) return;
    const key = path.resolve(entry.dir).toLowerCase();
    if (comfyDirs.some((c) => path.resolve(c.dir).toLowerCase() === key)) return;
    comfyDirs.push(entry);
  };

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    const settings = readJson(path.join(dir, 'settings.json')) || readJson(path.join(dir, 'config.json')) || {};
    lastSettings = settings;

    /* ① settings 里直接写了 ComfyUI 代码目录（便携版 / 旧版 Desktop） */
    for (const key of ['basePath', 'installDir', 'comfyDir', 'installPath']) {
      const p = String(settings[key] || '').trim();
      if (!p) continue;
      if (fs.existsSync(path.join(p, 'main.py'))) {
        pushComfy({ dir: p, mainRel: 'main.py', py: path.join(p, '.venv', 'Scripts', 'python.exe'), instId: '' });
      } else if (fs.existsSync(path.join(p, 'ComfyUI', 'main.py'))) {
        pushComfy({ dir: p, mainRel: 'ComfyUI\\main.py', py: path.join(p, 'ComfyUI', '.venv', 'Scripts', 'python.exe'), instId: '' });
      }
    }

    /* ② Comfy Desktop 2：installDir 只是父目录，真正的安装路径在 installations.json */
    const installs = readJson(path.join(dir, 'installations.json'));
    if (Array.isArray(installs)) {
      for (const it of installs) {
        const ip = String((it && it.installPath) || '').trim();
        if (!ip || !fs.existsSync(ip)) continue;
        if (fs.existsSync(path.join(ip, 'ComfyUI', 'main.py'))) {
          pushComfy({ dir: ip, mainRel: 'ComfyUI\\main.py', py: path.join(ip, 'ComfyUI', '.venv', 'Scripts', 'python.exe'), instId: String(it.id || '') });
        } else if (fs.existsSync(path.join(ip, 'main.py'))) {
          pushComfy({ dir: ip, mainRel: 'main.py', py: path.join(ip, '.venv', 'Scripts', 'python.exe'), instId: String(it.id || '') });
        }
      }
    }

    const modelDirs = [];
    const rawModelDirs = Array.isArray(settings.modelsDirs)
      ? settings.modelsDirs
      : (settings.modelsDirs ? [settings.modelsDirs] : []);
    for (const md of rawModelDirs) {
      const p = String(md || '').trim();
      if (p && fs.existsSync(p)) modelDirs.push(p);
    }
    const yamlDir = path.join(dir, 'instance-model-paths');
    let yamls = [];
    try { yamls = fs.readdirSync(yamlDir).filter((n) => n.endsWith('.yaml')).map((n) => path.join(yamlDir, n)); } catch { /* ignore */ }
    for (const y of yamls) {
      const parsed = parseModelYaml(y, path.dirname(y));
      if (parsed.base && fs.existsSync(parsed.base)) modelDirs.push(parsed.base);
      extraDirs.push(parsed);
    }
    for (const md of modelDirs) bases.push(collectBase(md));
    if (settings.outputDir && fs.existsSync(settings.outputDir)) outputRoot = outputRoot || settings.outputDir;
    if (settings.samplesDir && fs.existsSync(settings.samplesDir)) samplesRoot = samplesRoot || settings.samplesDir;
  }

  if (!bases.length && extraDirs.length) {
    for (const parsed of extraDirs) {
      bases.push(collectBase(parsed.base));
    }
  }
  return { bases, comfyDirs, extraDirs, outputRoot, samplesRoot, settings: lastSettings };
}

function fromPortable() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const cands = [
    process.env.COMFYUI_DIR,
    process.env.COMFYUI_PATH,
    path.join(home, 'ComfyUI'),
    path.join(home, 'comfyui'),
    path.join(home, 'Documents', 'ComfyUI'),
    path.join(home, 'Desktop', 'ComfyUI'),
    path.join(home, 'ComfyUI_windows_portable', 'ComfyUI'),
    path.join(home, 'Documents', 'ComfyUI_windows_portable', 'ComfyUI'),
    path.join(local, 'Programs', 'ComfyUI'),
    path.join(local, 'Programs', '@comfyorgcomfyui-electron'),
    path.join(local, 'Programs', '@comfyorgcomfyui-electron', 'resources', 'ComfyUI'),
    path.join(programFiles, 'ComfyUI'),
    'C:\\ComfyUI',
    'D:\\ComfyUI',
    'D:\\ComfyUI_windows_portable\\ComfyUI',
    'E:\\ComfyUI',
    'D:\\AI\\ComfyUI',
  ];
  const bases = [];
  for (const base of cands) {
    if (!base) continue;
    if (!fs.existsSync(base)) continue;
    const hasModels = fs.existsSync(path.join(base, 'models')) || fs.existsSync(path.join(base, 'loras'));
    if (!hasModels) continue;
    bases.push(collectBase(base));
  }
  return { bases };
}

function fromA1111() {
  const home = os.homedir();
  const cands = [
    path.join(home, 'stable-diffusion-webui'),
    path.join(home, 'Documents', 'stable-diffusion-webui'),
    path.join(home, 'Desktop', 'stable-diffusion-webui'),
    path.join(home, 'sd.webui', 'webui'),
    path.join(home, 'webui'),
    path.join(home, 'webui_forge'),
    path.join(home, 'stable-diffusion-webui-forge'),
    'C:\\stable-diffusion-webui',
    'D:\\stable-diffusion-webui',
    'D:\\AI\\stable-diffusion-webui',
    'D:\\sd.webui\\webui',
    'D:\\webui_forge',
    'D:\\stable-diffusion-webui-forge',
    'D:\\AI\\sd-webui',
  ];
  const bases = [];
  for (const base of cands) {
    if (!base) continue;
    if (!fs.existsSync(base)) continue;
    if (!fs.existsSync(path.join(base, 'models'))) continue;
    bases.push(collectBase(base));
  }
  return { bases };
}

export function discover() {
  const desk = fromDesktop();
  const port = fromPortable();
  const a1111 = fromA1111();
  const bases = [...desk.bases, ...port.bases, ...a1111.bases];
  const seenBase = new Set();
  const all = [];
  for (const b of bases) {
    const key = path.resolve(b.base).toLowerCase();
    if (seenBase.has(key)) continue;
    seenBase.add(key);
    all.push(b);
  }

  const lorasRootsAll = existingUnique(all.flatMap((b) => b.loras || []));
  const loraCounts = new Map(lorasRootsAll.map((root) => [root, countLoras(root)]));
  let lorasRoots = lorasRootsAll.filter((root) => (loraCounts.get(root) || 0) > 0);
  if (!lorasRoots.length && lorasRootsAll.length) lorasRoots = [lorasRootsAll[0]];
  const modelRoots = {};
  for (const kind of ['unet', 'clip', 'vae', 'checkpoint']) {
    modelRoots[kind] = existingUnique(all.flatMap((b) => b[kind] || []));
  }
  const outputs = existingUnique([
    desk.outputRoot,
    ...all.map((b) => b.output),
  ]);
  const samples = existingUnique([
    desk.samplesRoot,
    ...all.map((b) => b.samples),
  ]);

  /* 主 LoRA 根：文件最多的那个；多个根只提示，不在这里做多根入库 */
  let lorasRoot = '';
  let best = -1;
  for (const root of lorasRoots) {
    const n = loraCounts.get(root) || 0;
    if (n > best) { best = n; lorasRoot = root; }
  }
  if (!lorasRoot && lorasRoots.length) lorasRoot = lorasRoots[0];

  const notes = [];
  if (lorasRoot) notes.push(`LoRA：${lorasRoot}（${best > 0 ? best + ' 支' : '目录'}）`);
  if (lorasRoots.length > 1) {
    notes.push(`还检测到 ${lorasRoots.length - 1} 个额外 LoRA 目录：${lorasRoots.filter((r) => r !== lorasRoot).join('；')}`);
  }
  for (const [kind, dirs] of Object.entries(modelRoots)) {
    if (dirs.length) notes.push(`${kind}：${dirs.join('；')}`);
  }
  if (a1111.bases.length) notes.push('A1111 / Forge 目录只做发现；出图仍要 ComfyUI 也认这些目录。');
  if (outputs[0]) notes.push(`出图目录：${outputs[0]}`);
  if (!lorasRoot && !Object.values(modelRoots).some((v) => v.length)) {
    notes.push('没找到 ComfyUI / A1111 的目录。可以手动选，或先打开 ComfyUI 再点自动检测。');
  }

  /* 用于「启动 ComfyUI」的目录 + 命令：便携版优先认 base，Desktop 2 认 installations.json 里的安装路径 */
  const portableBase = (port.bases[0] || {}).base || '';
  const comfyPick = portableBase
    ? { dir: portableBase, mainRel: 'main.py', py: '', instId: '' }
    : (desk.comfyDirs[0] || null);
  const comfyDir = comfyPick ? comfyPick.dir : '';
  const comfyLaunch = comfyPick ? buildComfyLaunch(comfyPick, desk.settings || {}) : '';
  if (comfyDir) notes.push(`启动目录：${comfyDir}`);

  return {
    found: !!(lorasRoot || Object.values(modelRoots).some((v) => v.length)),
    lorasRoot,
    lorasRoots,
    modelRoots,
    outputRoot: outputs[0] || '',
    samplesRoot: samples[0] || '',
    comfyDir,
    comfyLaunch,
    notes,
  };
}
