import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { loadConfig, saveConfig, ensureDirs, PUBLIC_DIR, PREVIEW_DIR, ROOT, DATA_DIR } from './lib/config.mjs';
import { db, logEvent } from './lib/db.mjs';
import { backfillTriggers, setTriggers, organizeTriggers, splitTriggerEntries } from './lib/triggers.mjs';
import { trainedWordList } from './lib/safetensors.mjs';
import {
  searchLoras, getLora, upsertLora, patchLora, deleteLora, stats, facets,
  setPreview, recordUsage, resolveRelPath, buildDiskIndex, recomputeFamilies, isRoleName, moveLora,
} from './lib/loras.mjs';
import { scanLibrary, startLoraWatcher } from './lib/scan-service.mjs';
import { translateToZh, translateLong } from './lib/translate.mjs';
import {
  makeThumb, resolvePreviewAbs, contentTypeFor, thumbPathFor,
} from './lib/media.mjs';
import { startJob, getJob, listJobs, cancelJob, clearFinishedDownloads } from './lib/jobs.mjs';
import {
  createDownload, initDownloads, listDownloads, pauseDownload, resumeDownload,
  pauseAllDownloads, resumeAllDownloads, clearDownloadHistory,
} from './lib/download-manager.mjs';
import { enrichOne, searchModels, downloadVersion, fetchCandidates, guessModelByName, getModelDetail, importDownloadedFile, checkToken, importExternalFile, fillPreviews, fillMeta, downloadByText } from './lib/civitai.mjs';
import { hashLoras, duplicateGroups, healthReport } from './lib/health.mjs';
import {
  syncGenLog, samplesForLora, sampleById, sampleByImagePath, rateSamplesByImagePath, promptSearch, ensureSampleThumb,
  startGenLogWatcher,
} from './lib/samples.mjs';
import { rateSample, qualityByLora } from './lib/samples.mjs';
import { listTags, rebuildTagKinds } from './lib/tags.mjs';
import { listModels, deleteModel, comfyModelNames } from './lib/models.mjs';
import { loraRoots, absOf } from './lib/roots.mjs';
import { genOptions, slotLoras, runGenerate, precheckGenerate } from './lib/generate.mjs';
import { discover } from './lib/discover.mjs';
import { listImages, deleteImages, galleryRoot, listDirs, moveImages } from './lib/gallery.mjs';
import { createBackup, listBackups, BACKUP_DIR, autoBackup, KEEP as BACKUP_KEEP } from './lib/backup.mjs';
import { listHistory, addHistory, rateHistory, clearHistory } from './lib/history.mjs';
import { checkUpdate, downloadUpdate } from './lib/update.mjs';
import { listWorkflows, saveWorkflow, renameWorkflow, deleteWorkflow } from './lib/workflows.mjs';

/* 版本号以 package.json 为准，免得三处各写一个慢慢对不上 */
const VERSION = (() => {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8').replace(/^\uFEFF/, '')).version;
    return String(v || '1.0.0');
  } catch { return '1.0.0'; }
})();

const WORK_EN = {
  '鸣潮': 'wuthering waves',
  '原神': 'genshin impact',
  '崩坏：星穹铁道': 'honkai: star rail',
  '崩坏星穹铁道': 'honkai: star rail',
  '崩铁': 'honkai: star rail',
  '崩坏3': 'honkai impact 3rd',
  '明日方舟': 'arknights',
  '碧蓝航线': 'azur lane',
  '蔚蓝档案': 'blue archive',
  '葬送的芙莉莲': 'sousou no frieren',
  '海贼王': 'one piece',
  '宝可梦': 'pokemon',
  '初音未来': 'hatsune miku',
  'fate': 'fate/grand order',
  'fgo': 'fate/grand order',
};

/* 从 meta.dataset（训练集目录）和逐条触发词拆多角色/多服装触发词 */
function loraVariants(row) {
  const out = [];
  const push = (label, trigger, kind = 'other') => {
    const t = String(trigger || '').trim();
    if (!t) return;
    if (out.some((x) => x.trigger === t)) return;
    out.push({ label: String(label || t).trim(), trigger: t, kind });
  };
  const base = String(row.trigger || '').trim();
  let meta = {};
  try { meta = row.meta_json ? JSON.parse(row.meta_json) : {}; } catch { meta = {}; }
  /* C 站多角色包：每个 trainedWords 项是一整个角色的「名字 + 特征 + 服装」块。
     优先按块返回，选中一个角色时把整块都带上，而不是只带名字。 */
  const charBlocks = [];
  for (const block of trainedWordList(meta && meta.civitai && meta.civitai.trainedWords)) {
    const first = splitTriggerEntries({ trigger: block, meta_json: '{}', category: row.category })[0];
    if (!first || first.kind !== 'character') continue;
    if (charBlocks.some((b) => b.trigger === block)) continue;
    charBlocks.push({ label: first.text, trigger: block });
  }
  const rows = (Array.isArray(row.triggers) ? row.triggers : [])
    .filter((t) => t && t.enabled && t.kind === 'character' && String(t.text || '').trim());
  if (charBlocks.length >= 2) {
    /* 多角色包一次只能选一个；「全部」会把几十个角色混在一起，反而失败 */
    for (const b of charBlocks) push(b.label, b.trigger, 'block');
  } else if (rows.length) {
    if (base) push('全部', base, 'all');
    for (const t of rows) push(String(t.label || t.text), String(t.text), t.kind);
  } else if (base) {
    push('默认', base, 'all');
  }
  const work = String(row.work || '').trim();
  const workEn = WORK_EN[work.toLowerCase()] || WORK_EN[work] || '';
  const dataset = String(meta.dataset || '');
  /* 已经有整段角色块时，训练集目录只会重复一遍，别再塞进弹窗 */
  for (const raw of (charBlocks.length >= 2 ? [] : dataset.split(/\s*\/\s*/))) {
    const s = raw.trim();
    if (!s) continue;
    const body = s.replace(/^\d+_/, '');
    const parts = body.split('_').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) continue;
    const zh = parts.filter((x) => /[\u4e00-\u9fff]/.test(x)).join('');
    const latin = parts.filter((x) => /[a-zA-Z]/.test(x)).join(' ').trim();
    if (!latin) continue;
    const tag = (workEn ? `${latin.toLowerCase()} (${workEn})` : latin.toLowerCase());
    push(zh ? `${zh} ${latin}` : latin, tag, 'dataset');
  }
  return out;
}
let cfg = loadConfig();
ensureDirs();
db();
{
  const auto = autoBackup();
  if (auto) console.log(`[backup] 自动备份 ${auto.name}（${Math.round(auto.size / 1048576)} MB）`);
}
try {
  const n = backfillTriggers();
  if (n) console.log(`[trigger] 已整理 ${n} 条 LoRA 的逐条触发词`);
} catch (e) {
  console.warn('[trigger] 回填失败：' + (e.message || e));
}

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : cfg.port;
const HOST = '127.0.0.1';

/* ------------------------------ helpers ------------------------------ */

function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr || []) {
    const s = String(x || '').trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out;
}
function json(res, code, data, extraHeaders = {}) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-api-token',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function readBody(req, limit = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch (e) { throw new Error('JSON 解析失败: ' + e.message); }
}

function tokenOf(req, url) {
  return req.headers['x-api-token'] || url.searchParams.get('token') || '';
}

/* ---------- 下载并发队列 ---------- */
let downloadActive = 0;
const downloadWaiters = [];
function downloadLimit() {
  const n = Number(loadConfig().downloadConcurrency);
  return Math.max(1, Math.min(8, Number.isFinite(n) ? n : 2));
}
function acquireDownloadSlot() {
  if (downloadActive < downloadLimit()) {
    downloadActive++;
    return Promise.resolve();
  }
  return new Promise((resolve) => downloadWaiters.push(resolve));
}
function releaseDownloadSlot() {
  const next = downloadWaiters.shift();
  if (next) next();
  else downloadActive = Math.max(0, downloadActive - 1);
}

/* ---------- 实时推送：磁盘里新下 / 删掉的 LoRA，前端不用刷新 ---------- */
const sseClients = new Set();
function sseBroadcast(payload) {
  if (!sseClients.size) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of [...sseClients]) {
    try { res.write(data); } catch { sseClients.delete(res); }
  }
}
const ssePing = setInterval(() => {
  for (const res of [...sseClients]) {
    try { res.write(': ping\n\n'); } catch { sseClients.delete(res); }
  }
}, 25000);
if (ssePing.unref) ssePing.unref();

function requireToken(req, res, url) {
  if (tokenOf(req, url) === cfg.token) return true;
  json(res, 401, { error: '需要 token：请求头 X-API-Token 或 ?token=' });
  return false;
}

function sendFile(res, file, req, { cache = 'public, max-age=86400' } = {}) {
  let st;
  try { st = fs.statSync(file); } catch { json(res, 404, { error: '文件不存在' }); return; }
  const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': contentTypeFor(file),
    'Content-Length': st.size,
    'Cache-Control': cache,
    ETag: etag,
  });
  fs.createReadStream(file).pipe(res);
}

function serveStatic(res, rawPath) {
  const clean = rawPath.split('?')[0];
  let rel = clean.replace(/^\/+/, '');
  if (!rel) rel = 'index.html';
  if (rel === 'v2' || rel === 'v2/') rel = 'v2/index.html';
  /* 默认首页就是新版；旧版 2026-11-24 下线，文件备份在 backup/classic-20261124/ */
  if (rel === 'index.html') rel = 'v2/index.html';
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { json(res, 400, { error: '路径编码不对' }); return; }
  const file = path.join(PUBLIC_DIR, decoded);
  const norm = path.normalize(file);
  if (norm !== PUBLIC_DIR && !norm.startsWith(PUBLIC_DIR + path.sep)) { json(res, 403, { error: '禁止访问' }); return; }
  if (!fs.existsSync(norm) || !fs.statSync(norm).isFile()) {
    // 单页应用回退
    const index = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(index)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(index));
      return;
    }
    json(res, 404, { error: 'not found' });
    return;
  }
  const ext = path.extname(norm).toLowerCase();
  const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  }[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  fs.createReadStream(norm).pipe(res);
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** 目标路径是否在某个根目录里（按目录边界算，不能拿 output 前缀去放 output2 的文件） */
function isInside(target, root) {
  if (!target || !root) return false;
  const t = path.resolve(target).toLowerCase();
  const r = path.resolve(root).toLowerCase();
  return t === r || t.startsWith(r + path.sep);
}

/* ------------------------------ 路由 ------------------------------ */

async function route(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: '路径编码不对' }); }
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, x-api-token',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    });
    res.end();
    return;
  }

  /* ---------- 元信息 ---------- */
  if (p === '/api/health') return json(res, 200, { ok: true, version: VERSION, time: new Date().toISOString() });

  if (p === '/api/about') {
    return json(res, 200, {
      app: '洛栈 · LoRA-Vault',
      version: VERSION,
      license: 'All Rights Reserved',
      licenseLabel: '保留所有权利',
      licenseUrl: '/api/license',
      copyright: '© 2026 洛栈 · LoRA-Vault',
      sponsorUrl: cfg.sponsorUrl || '',
      portfolioUrl: cfg.portfolioUrl || '',
      thirdParty: ['Node.js', 'Electron'],
    });
  }

  if (p === '/api/license') {
    const file = path.join(ROOT, 'LICENSE');
    if (!fs.existsSync(file)) return json(res, 404, { error: '没有 LICENSE 文件' });
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(file));
    return;
  }

  /* 中文名自动翻译：先 Google，再 MyMemory */
  if (p === '/api/translate' && method === 'POST') {
    const body = await readJson(req).catch(() => ({}));
    const text = String(body.text || '').trim().slice(0, 300);
    if (!text) return json(res, 400, { error: '缺文本' });
    const zh = await translateToZh(text);
    if (!zh) return json(res, 502, { error: '翻译失败（Google / MyMemory 都没返回）' });
    return json(res, 200, { text: zh });
  }

  /* ---------- 实时事件流：目录里新下 / 删掉的 LoRA，前端自动刷新 ---------- */
  if (p === '/api/stream' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (p === '/api/config' && method === 'GET') {
    return json(res, 200, {
      version: VERSION, port: PORT, host: HOST,
      lorasRoot: cfg.lorasRoot, lorasRoots: cfg.lorasRoots || [], samplesRoot: cfg.samplesRoot,
      comfyUrl: cfg.comfyUrl, token: cfg.token,
      comfyDir: cfg.comfyDir || '',
      comfyLaunch: cfg.comfyLaunch || '',
      updateUrl: cfg.updateUrl || '',
      gen: {
        outputRoot: cfg.gen?.outputRoot || '',
      },
      civitaiToken: cfg.civitaiToken || '',
      downloadConcurrency: cfg.downloadConcurrency ?? 2,
      modelRoots: cfg.modelRoots || {},
      scanOnStart: cfg.scanOnStart !== false,
    });
  }

  /* 第一次用 / 换目录：给个「配没配好」的判据 */
  if (p === '/api/setup' && method === 'GET') {
    const lorasOk = loraRoots().some((r) => { try { return fs.existsSync(r); } catch { return false; } });
    const outOk = !!(cfg.gen?.outputRoot && fs.existsSync(cfg.gen.outputRoot));
    /* 公开版：能不能出图看的是「有没有模型 + ComfyUI 认不认」，不是有没有 LoRA。
       别人可能只有 checkpoint、没有 LoRA；也可能 ComfyUI 在线但模型目录在别处。 */
    let modelsOk = false;
    try {
      const c = await comfyModelNames();
      modelsOk = !!(c.checkpoints?.length || c.unets?.length);
    } catch { /* ComfyUI 没开就只看磁盘 */ }
    if (!modelsOk) {
      try {
        const disk = listModels();
        modelsOk = !!((disk.models?.checkpoint || []).length || (disk.models?.unet || []).length);
      } catch { /* ignore */ }
    }
    return json(res, 200, {
      needsSetup: !modelsOk,
      modelsOk,
      lorasRoot: cfg.lorasRoot || '', lorasOk,
      outputRoot: cfg.gen?.outputRoot || '', outputOk: outOk,
    });
  }

  /* 启动 ComfyUI：只发命令，不等它加载完 */
  if (p === '/api/comfy/test' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const raw = String(body.url || cfg.comfyUrl || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(raw)) return json(res, 200, { ok: false, stage: 'url', error: '地址要以 http:// 或 https:// 开头' });
    let remote = false;
    try {
      const h = new URL(raw).hostname.toLowerCase();
      remote = !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(h);
    } catch { /* ignore */ }
    const t0 = Date.now();
    const count = async (node, field) => {
      try {
        const r = await fetch(`${raw}/object_info/${node}`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return null;
        const j = await r.json();
        const arr = j && j[node] && j[node].input && j[node].input.required
          ? j[node].input.required[field] && j[node].input.required[field][0]
          : null;
        return Array.isArray(arr) ? arr.length : 0;
      } catch { return null; }
    };
    try {
      const r = await fetch(`${raw}/system_stats`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return json(res, 200, { ok: false, remote, url: raw, stage: 'system_stats', latency_ms: Date.now() - t0, error: 'HTTP ' + r.status });
      let stats = {};
      try { stats = await r.json(); } catch { stats = {}; }
      const sys = stats.system || {};
      const counts = {
        checkpoints: await count('CheckpointLoaderSimple', 'ckpt_name'),
        unets: await count('UNETLoader', 'unet_name'),
        clips: await count('CLIPLoader', 'clip_name'),
        vaes: await count('VAELoader', 'vae_name'),
        loras: await count('LoraLoader', 'lora_name'),
      };
      const outRoot = cfg.gen?.outputRoot || '';
      const output = { configured: !!outRoot, exists: false, writable: false, path: outRoot };
      if (outRoot) {
        try { output.exists = fs.existsSync(outRoot); } catch { /* ignore */ }
        if (output.exists) {
          try { fs.accessSync(outRoot, fs.constants.W_OK); output.writable = true; } catch { /* ignore */ }
        }
      }
      return json(res, 200, {
        ok: true,
        remote,
        url: raw,
        latency_ms: Date.now() - t0,
        version: sys.comfyui_version || sys.version || '',
        python: sys.python_version || '',
        os: sys.os || '',
        counts,
        output,
      });
    } catch (e) {
      return json(res, 200, { ok: false, remote, url: raw, stage: 'system_stats', latency_ms: Date.now() - t0, error: e.message });
    }
  }

  if (p === '/api/comfy/start' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const base = String(cfg.comfyUrl || '').replace(/\/+$/, '');
    if (base) {
      try {
        const r = await fetch(base + '/system_stats', { signal: AbortSignal.timeout(1500) });
        if (r.ok) return json(res, 200, { ok: true, already: true });
      } catch { /* not running */ }
    }
    const dir = String(cfg.comfyDir || '').trim();
    if (!dir) return json(res, 400, { error: '先在设置里填 ComfyUI 目录并保存' });
    if (!fs.existsSync(dir)) return json(res, 400, { error: 'ComfyUI 目录不存在：' + dir });
    const cmd = String(cfg.comfyLaunch || 'python main.py').trim();
    try {
      const child = spawn(cmd, { cwd: dir, shell: true, detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      return json(res, 200, { ok: true, pid: child.pid, cmd, cwd: dir });
    } catch (e) {
      return json(res, 500, { error: '启动失败：' + e.message });
    }
  }

  /* 自动检测目录（Comfy Desktop / 便携版） */
  if (p === '/api/config/discover' && method === 'GET') {
    return json(res, 200, discover());
  }

  /* 保存设置：只接受白名单字段，路径必须真的存在（出图脚本/目录除外，允许先填） */
  if (p === '/api/config' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const next = JSON.parse(JSON.stringify(cfg));
    const bad = [];
    if (typeof body.lorasRoot === 'string' && body.lorasRoot.trim()) {
      const v = body.lorasRoot.trim();
      let okDir = false;
      try { okDir = fs.existsSync(v) && fs.statSync(v).isDirectory(); } catch { okDir = false; }
      if (!okDir) bad.push('LoRA 目录不存在：' + v);
      else next.lorasRoot = v;
    }
    if (Array.isArray(body.lorasRoots)) {
      const list = [];
      for (const raw of body.lorasRoots) {
        const v = String(raw || '').trim();
        if (!v) continue;
        let okDir = false;
        try { okDir = fs.existsSync(v) && fs.statSync(v).isDirectory(); } catch { okDir = false; }
        if (!okDir) { bad.push('额外 LoRA 目录不存在：' + v); continue; }
        if (!list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
      }
      if (!bad.length) next.lorasRoots = list;
    }
    if (typeof body.samplesRoot === 'string' && body.samplesRoot.trim()) next.samplesRoot = body.samplesRoot.trim();
    if (typeof body.comfyUrl === 'string' && body.comfyUrl.trim()) next.comfyUrl = body.comfyUrl.trim();
    if (typeof body.comfyDir === 'string') next.comfyDir = body.comfyDir.trim();
    if (typeof body.comfyLaunch === 'string') next.comfyLaunch = body.comfyLaunch.trim();
    if (typeof body.updateUrl === 'string') next.updateUrl = body.updateUrl.trim();
    for (const [key, label] of [['sponsorUrl', '赞助链接'], ['portfolioUrl', '作品链接']]) {
      if (typeof body[key] === 'string') {
        const v = body[key].trim();
        if (!v || /^https?:\/\//i.test(v)) next[key] = v;
        else bad.push(label + '得是 http(s) 地址');
      }
    }
    if (typeof body.civitaiToken === 'string') next.civitaiToken = body.civitaiToken.trim();
    if (body.downloadConcurrency !== undefined) {
      const n = Number(body.downloadConcurrency);
      if (Number.isFinite(n)) next.downloadConcurrency = Math.max(1, Math.min(8, Math.round(n)));
    }
    if (body.gen && typeof body.gen === 'object') {
      next.gen = { ...(next.gen || {}) };
      for (const k of ['outputRoot', 'unet', 'clip', 'vae', 'checkpoint', 'clipType']) {
        if (typeof body.gen[k] !== 'string') continue;
        next.gen[k] = body.gen[k].trim();
      }
      genOptions({ force: true }).catch(() => {});
    }
    if (body.modelRoots && typeof body.modelRoots === 'object') {
      next.modelRoots = { ...(next.modelRoots || {}) };
      for (const k of ['unet', 'clip', 'vae', 'checkpoint']) {
        const v = body.modelRoots[k];
        if (v === undefined) continue;
        next.modelRoots[k] = (Array.isArray(v) ? v : String(v).split(/[\r\n;]+/))
          .map((s) => String(s || '').trim()).filter(Boolean);
      }
    }
    if (bad.length) return json(res, 400, { error: bad.join('；'), problems: bad });

    const oldRoots = loraRoots(cfg).map((r) => r.toLowerCase()).sort().join('|');
    saveConfig(next);
    cfg = loadConfig();
    const newRoots = loraRoots(cfg).map((r) => r.toLowerCase()).sort().join('|');
    let scan = null;
    if (oldRoots !== newRoots) {
      try { scan = scanLibrary({ readMeta: false, actor: 'config' }); } catch (e) { scan = { error: e.message }; }
    }
    return json(res, 200, {
      saved: true, lorasRoot: cfg.lorasRoot, lorasRoots: cfg.lorasRoots || [], gen: cfg.gen, modelRoots: cfg.modelRoots, scan,
    });
  }

  if (p === '/api/history' && method === 'GET') {
    return json(res, 200, { items: listHistory(Number(url.searchParams.get('limit')) || 40) });
  }

  if (p === '/api/history' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    try { return json(res, 200, addHistory(body.items || body)); }
    catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (p === '/api/history' && method === 'DELETE') {
    if (!requireToken(req, res, url)) return;
    return json(res, 200, { deleted: clearHistory() });
  }

  if (p === '/api/history/rate' && method === 'PATCH') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    return json(res, 200, { updated: rateHistory(body.out, body.rating) });
  }

  if (p === '/api/update/check') {
    if (!requireToken(req, res, url)) return;
    const out = await checkUpdate({ currentVersion: VERSION, url: url.searchParams.get('url') || cfg.updateUrl || '' });
    if (out.ok) {
      out.installDir = installDirOf();
      out.canAutoInstall = !!out.installDir;
      out.downloaded = updateJob.stage === 'ready' && updateJob.version === out.latest ? updateJob : null;
    }
    return json(res, 200, out);
  }

  if (p === '/api/update/status') {
    if (!requireToken(req, res, url)) return;
    const dir = installDirOf();
    return json(res, 200, { ...updateJob, installDir: dir, canAutoInstall: !!dir });
  }

  if (p === '/api/update/download' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    if (updateJob.stage === 'downloading') return json(res, 409, { error: '上一份还在下载' });
    const body = await readJson(req).catch(() => ({}));
    const target = String(body.url || '').trim();
    if (!target) return json(res, 400, { error: '缺下载地址' });
    startUpdateDownload({ url: target, version: body.version, sha256: body.sha256 });
    return json(res, 202, { ok: true, file: updateJob.file });
  }

  if (p === '/api/update/install' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const dir = installDirOf();
    if (!dir) return json(res, 400, { error: '现在跑的不是安装版（找不到安装目录），只能手动装' });
    if (updateJob.stage !== 'ready') return json(res, 400, { error: '安装包还没下好' });
    if (!fs.existsSync(updateJob.file)) return json(res, 400, { error: '安装包不在了，重新下一次' });
    const setup = updateJob.file;
    updateJob = { ...updateJob, stage: 'installing', updatedAt: new Date().toISOString() };
    /* 先回包再起安装器：安装器第一步就 taskkill 本进程，抢在前面会把响应掐断 */
    setTimeout(() => {
      try {
        /* cwd 别落在安装目录里：安装器要整棵删旧目录，cwd 在里面就删不掉 */
        const child = spawn(setup, ['/S', '/D=' + dir], { detached: true, stdio: 'ignore', cwd: path.dirname(setup) });
        child.unref();
      } catch (e) {
        updateJob = { ...updateJob, stage: 'error', error: '起安装器失败：' + e.message };
      }
    }, 1200);
    return json(res, 200, { ok: true, installDir: dir, setup });
  }

  if (p === '/api/backups' && method === 'GET') {
    return json(res, 200, { dir: BACKUP_DIR, keep: BACKUP_KEEP, items: listBackups() });
  }

  if (p === '/api/backups' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    try {
      return json(res, 200, { ok: true, backup: createBackup('manual') });
    } catch (e) {
      return json(res, 500, { error: '备份失败：' + e.message });
    }
  }

  if (p === '/api/backups/open' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch { /* ignore */ }
    execFile('explorer.exe', [BACKUP_DIR], { windowsHide: true }, () => {});
    return json(res, 200, { ok: true, path: BACKUP_DIR });
  }

  if (p === '/api/stats') return json(res, 200, stats());
  if (p === '/api/facets') return json(res, 200, facets());
  if (p === '/api/health-report') return json(res, 200, healthReport());

  if (p === '/api/duplicates') return json(res, 200, duplicateGroups());
  /* ---------- C 站（搜索 / 下载 / 补图） ---------- */
  if (p === '/api/civitai/search' && method === 'GET') {
    const q = url.searchParams;
    try {
      const out = await searchModels({
        query: q.get('q') || '',
        limit: Number(q.get('limit')) || 24,
        nsfw: q.get('nsfw') === '1',
        sort: q.get('sort') || 'Most Downloaded',
        period: q.get('period') || 'AllTime',
        baseModel: q.get('baseModel') || '',
        cursor: q.get('cursor') || '',
      });
      return json(res, 200, out);
    } catch (e) {
      return json(res, 502, { error: e.message });
    }
  }

  if (p === '/api/civitai/download' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const versionId = String(body.versionId || '').trim();
    if (!versionId) return json(res, 400, { error: '缺 versionId' });
    const subdir = String(body.subdir || '');
    const t = createDownload({
      kind: 'version',
      payload: { versionId },
      name: `C站下载 · ${body.name || versionId}`,
      subdir,
    });
    return json(res, 202, { jobId: t.id });
  }

  /* 贴 C 站模型页网址 / AIR / 版本号，直接下载 */
  if (p === '/api/civitai/download-by-url' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const text = String(body.text || body.url || body.air || '').trim();
    if (!text) return json(res, 400, { error: '先贴链接、AIR 或版本号' });
    const subdir = String(body.subdir || '');
    const t = createDownload({
      kind: 'text',
      payload: { text },
      name: 'C站链接下载',
      subdir,
    });
    return json(res, 202, { jobId: t.id });
  }

  if (p === '/api/civitai/enrich' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const id = Number(body.id);
    if (!id) return json(res, 400, { error: '缺 id' });
    try {
      const out = await enrichOne(id, { overwrite: !!body.overwrite, force: !!body.force });
      return json(res, 200, out);
    } catch (e) {
      return json(res, 502, { error: e.message });
    }
  }
  /* ---------- 图库（ComfyUI 出图目录） ---------- */
  if (p === '/api/gallery' && method === 'GET') {
    const q = url.searchParams;
    const data = listImages({
      root: q.get('root') === 'samples' ? 'samples' : 'output',
      limit: Math.min(Math.max(Number(q.get('limit')) || 60, 1), 200),
      offset: Math.max(Number(q.get('offset')) || 0, 0),
      sort: q.get('sort') === 'old' ? 'old' : 'new',
      q: q.get('q') || '',
    });
    data.items = data.items.map((it) => ({ ...it, url: `/api/localfile?path=${encodeURIComponent(it.path)}` }));
    return json(res, 200, data);
  }

  if (p === '/api/gallery/dirs' && method === 'GET') {
    const kind = url.searchParams.get('root') === 'output' ? 'output' : 'samples';
    try {
      return json(res, 200, listDirs({ root: kind }));
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (p === '/api/gallery/move' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const names = Array.isArray(body.names) ? body.names : [];
    if (!names.length) return json(res, 400, { error: '没选要移动的图' });
    try {
      const out = moveImages({
        root: body.root === 'samples' ? 'samples' : 'output',
        to: String(body.to || ''),
        names,
        target: String(body.target || ''),
      });
      if (out.moved) logEvent('gallery_move', null, 'api', `${out.moved} -> ${out.to}/${out.target}`);
      return json(res, 200, out);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (p === '/api/gallery' && method === 'DELETE') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const names = Array.isArray(body.names) ? body.names : [];
    if (!names.length) return json(res, 400, { error: '没选要删的图' });
    try {
      const out = deleteImages({ root: body.root === 'samples' ? 'samples' : 'output', names });
      return json(res, 200, out);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  /* ---------- 模型（底模 / clip / vae / checkpoint） ---------- */
  if (p === '/api/models' && method === 'GET') {
    const data = listModels();
    try { data.comfy = await comfyModelNames(); } catch { data.comfy = { unets: [], clips: [], vaes: [] }; }
    return json(res, 200, data);
  }

  if (p === '/api/models' && method === 'DELETE') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    try {
      const out = deleteModel(String(body.kind || ''), String(body.path || ''));
      logEvent('model_delete', null, 'api', `${body.kind || ''} ${body.path || ''}`);
      return json(res, 200, out);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  /* ---------- 出图 ---------- */
  if (p === '/api/workflows' && method === 'GET') {
    return json(res, 200, { items: listWorkflows() });
  }
  if (p === '/api/workflows' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    try {
      return json(res, 200, saveWorkflow({ name: body.name, workflow: body.workflow }));
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  const mWorkflow = p.match(/^\/api\/workflows\/([\w-]+)$/);
  if (mWorkflow && method === 'PATCH') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    try {
      const out = renameWorkflow(mWorkflow[1], body.name);
      if (!out) return json(res, 404, { error: '没有这个工作流' });
      return json(res, 200, out);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  if (mWorkflow && method === 'DELETE') {
    if (!requireToken(req, res, url)) return;
    return json(res, 200, { deleted: deleteWorkflow(mWorkflow[1]) });
  }

  if (p === '/api/gen/options' && method === 'GET') {
    try {
      return json(res, 200, await genOptions({ force: url.searchParams.get('force') === '1' }));
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  /* 四个槽位的候选：char / aux / outfit / style */
  if (p === '/api/gen/loras' && method === 'GET') {
    const slot = url.searchParams.get('slot') || 'char';
    try {
      return json(res, 200, slotLoras(slot, {
        q: url.searchParams.get('q') || '',
        base: url.searchParams.get('base') || '',
        limit: Number(url.searchParams.get('limit')) || 30,
      }));
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  /* ---------- 出图配方 ---------- */
  if (p === '/api/recipes' && method === 'GET') {
    const rows = db().prepare('SELECT id, name, note, payload, uses, created_at, updated_at FROM recipe ORDER BY updated_at DESC').all();
    return json(res, 200, rows.map((r) => {
      let payload = {};
      try { payload = JSON.parse(r.payload || '{}'); } catch { payload = {}; }
      return { ...r, payload };
    }));
  }
  if (p === '/api/recipes' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const name = String(body.name || '').trim();
    if (!name) return json(res, 400, { error: '缺配方名' });
    const now = new Date().toISOString();
    const r = db().prepare('INSERT INTO recipe (name, note, payload, created_at, updated_at) VALUES (?,?,?,?,?)')
      .run(name, String(body.note || ''), JSON.stringify(body.payload || {}), now, now);
    return json(res, 201, { id: Number(r.lastInsertRowid), name, payload: body.payload || {} });
  }
  const mRecipe = p.match(/^\/api\/recipes\/(\d+)$/);
  if (mRecipe && method === 'PATCH') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const id = Number(mRecipe[1]);
    const cur = db().prepare('SELECT * FROM recipe WHERE id = ?').get(id);
    if (!cur) return json(res, 404, { error: '没有这个配方' });
    const name = body.name !== undefined ? String(body.name).trim() : cur.name;
    const payload = body.payload !== undefined ? JSON.stringify(body.payload) : cur.payload;
    db().prepare('UPDATE recipe SET name = ?, payload = ?, updated_at = ? WHERE id = ?')
      .run(name || cur.name, payload, new Date().toISOString(), id);
    return json(res, 200, { id, name: name || cur.name });
  }
  if (mRecipe && method === 'DELETE') {
    if (!requireToken(req, res, url)) return;
    db().prepare('DELETE FROM recipe WHERE id = ?').run(Number(mRecipe[1]));
    return json(res, 200, { ok: true });
  }

  if (p === '/api/gen/precheck' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    try { return json(res, 200, await precheckGenerate(body)); }
    catch (e) { return json(res, 200, { ok: false, problems: [e.message || '预检失败'], warnings: [] }); }
  }

  if (p === '/api/generate' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const job = startJob('出图', (ctx) => runGenerate(ctx, body));
    return json(res, 202, { jobId: job.id });
  }

  /* ---------- 列表 / 详情 ---------- */
  if (p === '/api/loras' && method === 'GET') {
    const q = Object.fromEntries(url.searchParams.entries());
    return json(res, 200, searchLoras(q));
  }

  if (p === '/api/loras' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req);
    const list = Array.isArray(body) ? body : [body];
    const out = [];
    for (const item of list) {
      try { out.push({ ok: true, ...upsertLora(item, 'api') }); }
      catch (e) { out.push({ ok: false, error: e.message, input: item }); }
    }
    return json(res, Array.isArray(body) ? 207 : 201, Array.isArray(body) ? out : out[0]);
  }

  /* 文件已经不在的记录，一次性清掉（只删记录，不动文件） */
  if (p === '/api/loras/missing' && method === 'DELETE') {
    if (!requireToken(req, res, url)) return;
    const n = db().prepare("DELETE FROM lora WHERE status <> 'ok'").run().changes;
    logEvent('clean_missing', null, 'api', `${n} 条`);
    return json(res, 200, { deleted: n });
  }

  if (p === '/api/loras/batch' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req);
    const list = Array.isArray(body) ? body : body.items || [];
    const out = [];
    for (const item of list) {
      try { out.push({ ok: true, ...upsertLora(item, 'api') }); }
      catch (e) { out.push({ ok: false, error: e.message }); }
    }
    return json(res, 207, { count: out.length, results: out });
  }

  /* 分类目录：列/建（下载页「放到哪里」用） */
  if (p === '/api/loras/dirs' && method === 'GET') {
    const root = cfg.lorasRoot;
    const dirs = [];
    if (root && fs.existsSync(root)) {
      for (const a of fs.readdirSync(root, { withFileTypes: true })) {
        if (!a.isDirectory() || a.name.startsWith('.')) continue;
        dirs.push(a.name);
        try {
          for (const b of fs.readdirSync(path.join(root, a.name), { withFileTypes: true })) {
            if (!b.isDirectory() || b.name.startsWith('.')) continue;
            dirs.push(`${a.name}\\${b.name}`);
          }
        } catch { /* ignore */ }
      }
    }
    return json(res, 200, { dirs });
  }
  if (p === '/api/loras/dirs' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const parent = String(body.parent || '').replaceAll('/', '\\').replace(/^\\+|\\+$/g, '').trim();
    const name = String(body.name || '').replaceAll('/', '').trim();
    if (!name) return json(res, 400, { error: '名字不能为空' });
    if (/[\\/:*?"<>|]/.test(name) || name.includes('..')) {
      return json(res, 400, { error: '名字里不能有 \\ / : * ? " < > | 和 ..' });
    }
    if (parent.split('\\').some((s) => s === '.' || s === '..') || path.isAbsolute(parent)) {
      return json(res, 400, { error: '父分类不合法' });
    }
    const root = path.resolve(cfg.lorasRoot);
    const target = path.resolve(root, parent, name);
    if (!target.toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
      return json(res, 400, { error: '目标不在 LoRA 目录里' });
    }
    fs.mkdirSync(target, { recursive: true });
    const rel = path.relative(root, target).replaceAll('/', '\\');
    return json(res, 201, { path: rel });
  }

  /* 移动一支到分类目录：磁盘文件跟着走 */
  const mMove = p.match(/^\/api\/loras\/(\d+)\/move$/);
  if (mMove && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    try {
      const out = moveLora(Number(mMove[1]), body.category || body.dir || body.target);
      return json(res, 200, out);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  /* 逐条翻译：名称 + 作者描述，翻完写回库 */
  const mLoraTranslate = p.match(/^\/api\/loras\/(\d+)\/translate$/);
  if (mLoraTranslate && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const id = Number(mLoraTranslate[1]);
    const row = getLora(id);
    if (!row) return json(res, 404, { error: '没有这条记录' });
    const body = await readJson(req).catch(() => ({}));
    const patch = {};
    const nameSrc = String(row.name || '').trim();
    const han = (nameSrc.match(/[\u4e00-\u9fff]/g) || []).length;
    const cjkRatio = nameSrc ? han / nameSrc.length : 1;
    const needsNameZh = nameSrc && cjkRatio < 0.5;
    if (needsNameZh && (!row.name_zh || body.force)) {
      const zh = await translateToZh(nameSrc);
      if (zh) patch.name_zh = zh;
    }
    const descSrc = String(row.description || '').trim();
    if (descSrc && body.desc !== false && (!row.description_zh || body.force)) {
      const zh = await translateLong(descSrc, 1500);
      if (zh) patch.description_zh = zh;
    }
    if (!Object.keys(patch).length) return json(res, 200, { ...row, translated: false });
    const updated = patchLora(id, patch, 'api') || getLora(id);
    logEvent('lora_translate', id, 'api', Object.keys(patch).join(','));
    return json(res, 200, { ...updated, translated: true });
  }

  /* 逐条触发词：读取 / 保存 / 按训练元数据重新整理 */
  const mTrigOrg = p.match(/^\/api\/loras\/(\d+)\/triggers\/organize$/);
  if (mTrigOrg && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const id = Number(mTrigOrg[1]);
    const triggers = organizeTriggers(id);
    if (!triggers) return json(res, 404, { error: '没有这条记录' });
    logEvent('triggers_organize', id, 'api', String(triggers.length));
    return json(res, 200, { ...getLora(id), triggers });
  }
  const mTrig = p.match(/^\/api\/loras\/(\d+)\/triggers$/);
  if (mTrig) {
    const id = Number(mTrig[1]);
    if (method === 'GET') {
      const row = getLora(id);
      if (!row) return json(res, 404, { error: '没有这条记录' });
      return json(res, 200, { triggers: row.triggers || [] });
    }
    if (method === 'PUT') {
      if (!requireToken(req, res, url)) return;
      const body = await readJson(req);
      const triggers = setTriggers(id, body && body.triggers);
      if (!triggers) return json(res, 404, { error: '没有这条记录' });
      logEvent('triggers_save', id, 'api', String(triggers.length));
      return json(res, 200, { ...getLora(id), triggers });
    }
  }

  /* 多角色 / 多服装包：从训练集目录（meta.dataset）拆出可选的触发词 */
  const mVariant = p.match(/^\/api\/loras\/(\d+)\/variants$/);
  if (mVariant && method === 'GET') {
    const row = getLora(Number(mVariant[1]));
    if (!row) return json(res, 404, { error: '没有这条记录' });
    return json(res, 200, { variants: loraVariants(row) });
  }

  const mLora = p.match(/^\/api\/loras\/(\d+)$/);
  if (mLora) {
    const id = Number(mLora[1]);
    if (method === 'GET') {
      const row = getLora(id);
      if (!row) return json(res, 404, { error: '没有这条记录' });
      return json(res, 200, row);
    }
    if (method === 'PATCH') {
      if (!requireToken(req, res, url)) return;
      const row = patchLora(id, await readJson(req), 'api');
      if (!row) return json(res, 404, { error: '没有这条记录' });
      return json(res, 200, row);
    }
    if (method === 'DELETE') {
      if (!requireToken(req, res, url)) return;
      return json(res, 200, { deleted: deleteLora(id) });
    }
  }

  /* 给本地包手动绑一个 C 站来源：贴模型页链接或 model id 都行 */
  const mLoraCiv = p.match(/^\/api\/loras\/(\d+)\/civitai$/);
  if (mLoraCiv && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const id = Number(mLoraCiv[1]);
    const row = getLora(id);
    if (!row) return json(res, 404, { error: '没有这条记录' });
    const body = await readJson(req).catch(() => ({}));
    const raw = String(body.url || body.text || '').trim();
    if (!raw) return json(res, 400, { error: '要贴模型页链接或 model id' });
    const mModel = raw.match(/models\/(\d+)/) || raw.match(/^(\d+)$/);
    const mVer = raw.match(/modelVersionId=(\d+)/);
    if (!mModel) return json(res, 400, { error: '看不懂这个链接，里面没有 models/数字' });
    const modelId = mModel[1];
    const versionId = mVer ? mVer[1] : '';
    const sourceUrl = `https://civitai.com/models/${modelId}${versionId ? '?modelVersionId=' + versionId : ''}`;
    db().prepare('UPDATE lora SET model_id = ?, version_id = ?, source_url = ?, updated_at = ? WHERE id = ?')
      .run(modelId, versionId, sourceUrl, new Date().toISOString(), id);
    return json(res, 200, { ok: true, model_id: modelId, version_id: versionId, source_url: sourceUrl });
  }
  /* 浏览器下载的 LoRA：拷进库并入库 */
  if (p === '/api/import-external' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    try {
      const out = await importExternalFile(String(body.path || ''), String(body.subdir || 'C站下载'));
      return json(res, 200, out);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  /* 验证 C站 API Key */
  if (p === '/api/civitai/check-token' && method === 'GET') {
    try {
      const r = await checkToken();
      return json(res, 200, r);
    } catch (e) {
      return json(res, 200, { ok: false, reason: e.message });
    }
  }
  /* 网页里下载完的文件：补信息入库 */
  if (p === '/api/civitai/import-downloaded' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    try {
      const out = await importDownloadedFile({ versionId: String(body.versionId || ''), filePath: String(body.path || '') });
      return json(res, 200, out);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  /* C 站模型详情：大图 / 版本 / 描述 / 推荐权重 */
  if (p === '/api/civitai/model' && method === 'GET') {
    const id = url.searchParams.get('id') || '';
    const ver = url.searchParams.get('versionId') || '';
    try {
      const d = await getModelDetail(id, ver);
      return json(res, 200, d);
    } catch (e) {
      return json(res, 502, { error: e.message });
    }
  }
  /* 这支能出哪些人物 / 服装（整合包用） */
  const mCand = p.match(/^\/api\/loras\/(\d+)\/candidates$/);
  if (mCand) {
    const id = Number(mCand[1]);
    const row = getLora(id);
    if (!row) return json(res, 404, { error: '没有这条记录' });

    // 手动保存一份列表（没 C 站来源、也解析不出来的包）
    if (method === 'POST') {
      if (!requireToken(req, res, url)) return;
      const body = await readJson(req).catch(() => ({}));
      const pickList = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\r\n,，;；]+/))
        .map((s) => String(s).trim()).filter(Boolean).slice(0, 80);
      const characters = pickList(body.characters);
      const clothes = pickList(body.clothes);
      const conn = db();
      const fresh = conn.prepare('SELECT meta_json FROM lora WHERE id = ?').get(id);
      let meta = {};
      try { meta = fresh && fresh.meta_json ? JSON.parse(fresh.meta_json) : {}; } catch { meta = {}; }
      meta.civitai = { ...(meta.civitai || {}), candidates: characters, clothes, candidatesAt: new Date().toISOString() };
      conn.prepare('UPDATE lora SET meta_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(meta), new Date().toISOString(), id);
      return json(res, 200, { saved: true, characters, clothes });
    }

    // 贴 C 站链接 / model id，手动绑定来源
    if (method === 'POST' && /\/civitai$/.test(p)) {
      // 不会走这里（路由不同），保留占位，真正的在下面
    }

    if (method === 'GET') {
      const wantFetch = url.searchParams.get('fetch') === '1';
      const local = Array.isArray(row.candidates) ? row.candidates : [];
      const savedClothes = Array.isArray(row.meta?.civitai?.clothes) ? row.meta.civitai.clothes : [];
      if (!wantFetch) return json(res, 200, { characters: local, clothes: savedClothes, source: 'local' });
      try {
        let useRow = row;
        let guessed = null;
        // 本地下的包没有 model_id：拿名字去 C 站找一次，对上就补上来源
        if (!row.model_id && !row.source_url) {
          try {
            const base = String(row.filename || '').replace(/\.safetensors$/i, '');
            const tries = [...new Set([
              row.name || '',
              base,
              base.replace(/[_]+/g, ' '),
              base.split(/[-_]/).slice(0, 2).join(' '),
            ].map((s) => String(s).trim()).filter(Boolean))];
            for (const cand of tries) {
              guessed = await guessModelByName(cand);
              if (guessed && guessed.score >= 2) break;
              guessed = null;
            }
            if (guessed) {
              db().prepare('UPDATE lora SET model_id = ?, version_id = ?, source_url = ?, updated_at = ? WHERE id = ?')
                .run(guessed.modelId, guessed.versionId || '', guessed.url || '', new Date().toISOString(), id);
              useRow = getLora(id);
            }
          } catch { /* 找不到就算了 */ }
        }
        const r = await fetchCandidates(useRow, { force: url.searchParams.get('force') === '1' });
        // 「画哪个」那一排只放人名。C 站拉回来的 clothes 里常混着「服装」这种说明，
        // 进了候选，小白会把它当角色点。本地已存的名单（含中文名）是用户/缓存确认过的，直接信。
        const chars = uniq([...(r.characters || []).filter(isRoleName), ...local]);
        return json(res, 200, {
          characters: chars,
          triggers: r.triggers || [],
          clothes: (Array.isArray(r.clothes) && r.clothes.length ? r.clothes : savedClothes).filter(Boolean),
          source: r.source || 'civitai',
          guessed: guessed ? { modelName: guessed.modelName, url: guessed.url, score: guessed.score } : null,
          cached: !!r.cached,
          reason: r.ok ? '' : (r.reason || ''),
        });
      } catch (e) {
        return json(res, 502, { error: e.message });
      }
    }
  }
  /* 删文件（不是删记录）：只删 lorasRoot 下的那一个 .safetensors */
  const mLoraFile = p.match(/^\/api\/loras\/(\d+)\/file$/);
  if (mLoraFile && method === 'DELETE') {
    if (!requireToken(req, res, url)) return;
    const row = getLora(Number(mLoraFile[1]));
    if (!row) return json(res, 404, { error: '没有这条记录' });
    const abs = absOf(row.rel_path, cfg);
    const inside = !!abs && loraRoots(cfg).some((r) => abs.toLowerCase().startsWith(path.resolve(r).toLowerCase() + path.sep));
    if (!inside) {
      return json(res, 403, { error: '路径不在 LoRA 目录里' });
    }
    if (!/\.safetensors$/i.test(abs)) return json(res, 400, { error: '只删 .safetensors' });
    if (!fs.existsSync(abs)) return json(res, 404, { error: '文件已经不在了（记录还在）' });
    try {
      fs.unlinkSync(abs);
      db().prepare("UPDATE lora SET status = 'missing', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), row.id);
      logEvent('lora_delete_file', row.id, 'api', row.rel_path);
      return json(res, 200, { deleted: true, id: row.id, rel_path: row.rel_path });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }
  /* 触发词样张：一个 LoRA 多个触发词，各自记一张，选词的时候能看见 */
  const mTrigShot = p.match(/^\/api\/loras\/(\d+)\/trigger-shots$/);
  if (mTrigShot) {
    const id = Number(mTrigShot[1]);
    const row = getLora(id);
    if (!row) return json(res, 404, { error: '没有这条记录' });
    if (method === 'GET') {
      const out = {};
      const shots = (row.meta && row.meta.triggerShots) || {};
      for (const [trigger, v] of Object.entries(shots)) {
        if (!v || !v.file) continue;
        const abs = resolvePreviewAbs(v.file);
        if (abs) out[trigger] = `/api/localfile?path=${encodeURIComponent(abs)}`;
      }
      return json(res, 200, out);
    }
    if (method === 'POST') {
      if (!requireToken(req, res, url)) return;
      const body = await readJson(req).catch(() => ({}));
      const trigger = String(body.trigger || '').trim();
      const image = String(body.image || '').trim();
      if (!trigger || !image) return json(res, 400, { error: '要 trigger 和 image' });
      const abs = path.resolve(image);
      if (!fs.existsSync(abs)) return json(res, 404, { error: '图不存在' });
      const allowed = [cfg.gen?.outputRoot, cfg.samplesRoot, path.join(ROOT, 'data', 'previews')]
        .filter(Boolean);
      if (!allowed.some((root) => isInside(abs, root))) {
        return json(res, 403, { error: '图不在允许目录' });
      }
      const ext = ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(abs).toLowerCase())
        ? path.extname(abs).toLowerCase() : '.png';
      const hash = crypto.createHash('sha1').update(trigger).digest('hex').slice(0, 10);
      const name = `trigger-${id}-${hash}${ext}`;
      fs.copyFileSync(abs, path.join(PREVIEW_DIR, name));
      const fresh = db().prepare('SELECT meta_json FROM lora WHERE id = ?').get(id);
      let meta = {};
      try { meta = fresh && fresh.meta_json ? JSON.parse(fresh.meta_json) : {}; } catch { meta = {}; }
      meta.triggerShots = { ...(meta.triggerShots || {}) };
      meta.triggerShots[trigger] = { file: `local:${name}`, at: new Date().toISOString() };
      db().prepare('UPDATE lora SET meta_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(meta), new Date().toISOString(), id);
      return json(res, 200, {
        ok: true, trigger,
        url: `/api/localfile?path=${encodeURIComponent(path.join(PREVIEW_DIR, name))}`,
      });
    }
  }

  const mPreview = p.match(/^\/api\/loras\/(\d+)\/preview$/);
  if (mPreview) {
    const id = Number(mPreview[1]);
    const row = getLora(id);
    if (!row) return json(res, 404, { error: '没有这条记录' });
    if (method === 'GET') {
      if (!row.preview) return json(res, 404, { error: '还没有预览图' });
      if (/^https?:\/\//i.test(row.preview)) return json(res, 200, { url: row.preview });
      const abs = resolvePreviewAbs(row.preview);
      if (!abs) return json(res, 404, { error: '预览图文件找不到', preview: row.preview });
      return sendFile(res, abs, req);
    }
    if (method === 'POST') {
      if (!requireToken(req, res, url)) return;
      const ct = String(req.headers['content-type'] || '');
      let buf, ext = '.png';
      if (ct.startsWith('image/')) {
        buf = await readBody(req);
        ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[ct.split(';')[0]] || '.png';
      } else {
        const body = await readJson(req);
        if (body.url) return json(res, 200, setPreview(id, { url: String(body.url) }));
        const b64 = String(body.base64 || body.data || '').replace(/^data:[^;]+;base64,/, '');
        if (!b64) return json(res, 400, { error: '需要 image/* 原始字节，或 JSON {base64} / {url}' });
        buf = Buffer.from(b64, 'base64');
        ext = body.ext ? (String(body.ext).startsWith('.') ? body.ext : '.' + body.ext) : '.png';
      }
      const name = `${id}-${Date.now()}${ext}`;
      fs.writeFileSync(path.join(PREVIEW_DIR, name), buf);
      const out = setPreview(id, { file: `local:${name}` });
      await makeThumb(id, path.join(PREVIEW_DIR, name));
      return json(res, 200, out);
    }
    if (method === 'DELETE') {
      if (!requireToken(req, res, url)) return;
      try { fs.unlinkSync(thumbPathFor(id)); } catch {}
      return json(res, 200, setPreview(id, { file: '' }));
    }
  }

  const mThumb = p.match(/^\/api\/loras\/(\d+)\/thumb$/);
  if (mThumb && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const id = Number(mThumb[1]);
    const row = getLora(id);
    if (!row) return json(res, 404, { error: '没有这条记录' });
    const abs = resolvePreviewAbs(row.preview);
    const ok = await makeThumb(id, abs);
    return json(res, 200, { ok });
  }

  /* ---------- 媒体 ---------- */
  const mMedia = p.match(/^\/media\/(\d+)\/(full|thumb)$/);
  if (mMedia && method === 'GET') {
    const id = Number(mMedia[1]);
    const row = getLora(id);
    if (!row || !row.preview) return json(res, 404, { error: '没有预览图' });
    if (/^https?:\/\//i.test(row.preview)) { res.writeHead(302, { Location: row.preview }); return res.end(); }
    const which = mMedia[2];
    if (which === 'thumb') {
      const t = thumbPathFor(id);
      if (fs.existsSync(t)) return sendFile(res, t, req);
    }
    const abs = resolvePreviewAbs(row.preview);
    if (!abs) return json(res, 404, { error: '预览图文件找不到' });
    return sendFile(res, abs, req);
  }

  /* ---------- 任务 ---------- */
  if (p === '/api/jobs' && method === 'GET') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 1000);
    return json(res, 200, listJobs(limit));
  }
  if (p === '/api/downloads' && method === 'GET') return json(res, 200, listDownloads());
  if (p === '/api/downloads/pause-all' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    return json(res, 200, { paused: pauseAllDownloads() });
  }
  if (p === '/api/downloads/resume-all' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    return json(res, 200, { resumed: resumeAllDownloads() });
  }
  if (p === '/api/downloads/clear' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    return json(res, 200, { cleared: clearDownloadHistory() });
  }
  const mDl = p.match(/^\/api\/downloads\/([\w-]+)\/(pause|resume)$/);
  if (mDl && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const ok = mDl[2] === 'pause' ? pauseDownload(mDl[1]) : resumeDownload(mDl[1]);
    return json(res, ok ? 200 : 409, { ok });
  }
  if (p === '/api/jobs/clear-downloads' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const n = clearFinishedDownloads();
    return json(res, 200, { cleared: n });
  }

  const mJob = p.match(/^\/api\/jobs\/([a-f0-9]+)$/);
  if (mJob && method === 'GET') {
    const j = getJob(mJob[1]);
    if (!j) return json(res, 404, { error: '没有这个任务' });
    return json(res, 200, j);
  }

  const mJobCancel = p.match(/^\/api\/jobs\/([a-f0-9]+)\/cancel$/);
  if (mJobCancel && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    return json(res, 200, { cancelled: cancelJob(mJobCancel[1]) });
  }

  if (p === '/api/jobs/enrich-civitai' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req);
    let ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) {
      const limit = Math.min(Number(body.limit) || 2000, 2000);
      ids = db().prepare(`
        SELECT id FROM lora
        WHERE status = 'ok' AND (model_id <> '' OR source_url LIKE '%civitai%')
        ORDER BY CASE WHEN preview = '' THEN 0 ELSE 1 END,
                 CASE WHEN name = replace(filename,'.safetensors','') THEN 0 ELSE 1 END,
                 id
        LIMIT ?
      `).all(limit).map((r) => r.id);
    }
    const job = startJob(`Civitai 补全 · ${ids.length} 支`, async (ctx) => {
      ctx.setTotal(ids.length);
      const queue = [...ids];
      let consecutiveFail = 0;
      let imageFails = 0;
      let skipImages = body.downloadImage === false;
      let done = 0;

      const worker = async () => {
        while (queue.length) {
          if (ctx.cancelled()) return;
          const id = queue.shift();
          try {
            const r = await enrichOne(id, { overwrite: !!body.overwrite, withImage: !skipImages });
            consecutiveFail = 0;
            const changed = r.changed || [];
            if (!r.ok) {
              ctx.tick(true, `#${id} 跳过：${r.reason}`);
            } else if (r.skipped) {
              ctx.tick(true, `#${id} ${r.reason}`);
            } else {
              if (r.previewError) {
                imageFails++;
                if (imageFails >= 5 && !skipImages) {
                  skipImages = true;
                  ctx.log('图片连续挂了 5 次，后面只补文字，不再下图');
                }
              } else if (changed.includes('preview')) {
                imageFails = 0;
              }
              ctx.tick(true, `#${id} ${r.name} · ${changed.join('/') || '无变化'}${r.previewError ? `（图没下来：${r.previewError}）` : ''}`);
            }
          } catch (e) {
            consecutiveFail++;
            ctx.tick(false, `#${id} 失败：${e.message}`);
            if (consecutiveFail >= 12) {
              ctx.log('连续失败 12 次，停下来');
              return;
            }
          }
          done++;
        }
      };

      await Promise.all([worker(), worker()]);
    });
    return json(res, 202, { jobId: job.id, total: ids.length });
  }

  if (p === '/api/jobs/hash' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const job = startJob(`算 hash · ${body.scope === 'all' ? '全部' : '同大小组'}`, (ctx) =>
      hashLoras(ctx, { scope: body.scope === 'all' ? 'all' : 'same-size' }));
    return json(res, 202, { jobId: job.id });
  }

  if (p === '/api/jobs/sync-samples' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const job = startJob('同步出图台账', (ctx) => syncGenLog(ctx));
    return json(res, 202, { jobId: job.id });
  }

  if (p === '/api/jobs/fill-previews' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const job = startJob('从下载页补预览图', (ctx) => fillPreviews(ctx, {
      limit: Number(body.limit) || 100,
    }));
    return json(res, 202, { jobId: job.id });
  }

  if (p === '/api/jobs/fill-meta' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const job = startJob('补词和下载地址', (ctx) => fillMeta(ctx, {
      limit: Number(body.limit) || 100,
    }));
    return json(res, 202, { jobId: job.id });
  }

  /* 已下载的支批量补中文名（只翻 name_zh 空着的） */
  if (p === '/api/jobs/translate-zh' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const job = startJob('补中文名', async (ctx) => {
      const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 1000);
      const rows = db().prepare(`
        SELECT id, name, name_en FROM lora
        WHERE name_zh IS NULL OR name_zh = ''
        ORDER BY id DESC LIMIT ?
      `).all(limit);
      ctx.setTotal(rows.length);
      let ok = 0;
      let next = 0;
      const worker = async () => {
        while (next < rows.length) {
          if (ctx.cancelled && ctx.cancelled()) return;
          const r = rows[next++];
          const src = String(r.name || r.name_en || '').trim();
          if (src) {
            const zh = await translateToZh(src);
            if (zh && zh !== src) {
              db().prepare('UPDATE lora SET name_zh = ? WHERE id = ?').run(zh, r.id);
              ok++;
            }
          }
          ctx.tick(true, `#${r.id} ${src.slice(0, 24)}`);
        }
      };
      const n = Math.min(6, Math.max(1, rows.length));
      await Promise.all(Array.from({ length: n }, () => worker()));
      ctx.log(`翻好 ${ok}/${rows.length} 条`);
      return { done: rows.length, ok };
    });
    return json(res, 202, { jobId: job.id });
  }

  if (p === '/api/jobs/tag-kinds' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const job = startJob('标签归类', (ctx) => {
      ctx.setTotal(1);
      const r = rebuildTagKinds();
      ctx.log(`标签 ${r.total} 个，改了 ${r.changed} 个`);
      ctx.tick(true);
    });
    return json(res, 202, { jobId: job.id });
  }

  /* ---------- 样张 / prompt 反查 ---------- */
  const mLoraSamples = p.match(/^\/api\/loras\/(\d+)\/samples$/);
  if (mLoraSamples && method === 'GET') {
    const id = Number(mLoraSamples[1]);
    const limit = Math.min(Number(url.searchParams.get('limit') || 40), 200);
    return json(res, 200, { items: samplesForLora(id, limit) });
  }

  if (p === '/api/samples/lookup' && method === 'GET') {
    const sample = sampleByImagePath(url.searchParams.get('path') || '');
    return json(res, 200, sample ? { id: sample.id, rating: sample.rating, seed: sample.seed } : { id: 0, rating: 0 });
  }

  if (p === '/api/samples/by-path' && method === 'PATCH') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req);
    return json(res, 200, rateSamplesByImagePath(body.path, body.rating));
  }

  const mSampleRate = p.match(/^\/api\/samples\/(\d+)$/);
  if (mSampleRate && method === 'PATCH') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req);
    return json(res, 200, rateSample(Number(mSampleRate[1]), body.rating));
  }

  if (p === '/api/tags' && method === 'GET') {
    return json(res, 200, listTags({
      q: url.searchParams.get('q') || '',
      kind: url.searchParams.get('kind') || '',
      limit: Math.min(Number(url.searchParams.get('limit') || 200), 500),
      offset: Number(url.searchParams.get('offset') || 0),
    }));
  }

  const mSample = p.match(/^\/api\/samples\/(\d+)\/(full|thumb)$/);  if (mSample && method === 'GET') {
    const sample = sampleById(Number(mSample[1]));
    if (!sample) return json(res, 404, { error: '没有这张' });
    if (mSample[2] === 'thumb') {
      const t = await ensureSampleThumb(sample);
      if (t) return sendFile(res, t, req);
    }
    if (!fs.existsSync(sample.image_path)) return json(res, 404, { error: '原图不在了', path: sample.image_path });
    return sendFile(res, sample.image_path, req);
  }

  if (p === '/api/prompts' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const limit = Math.min(Number(url.searchParams.get('limit') || 40), 200);
    if (!q.trim()) return json(res, 200, { items: [] });
    return json(res, 200, { items: promptSearch(q, limit) });
  }

  /* ---------- 本地图片 ---------- */
  /* 远程 ComfyUI 的图没有本地文件；这里代理 /view，结果墙还是同一个 URL 结构 */
  if (p === '/api/comfy/view' && method === 'GET') {
    const base = String(cfg.comfyUrl || '').replace(/\/+$/, '');
    if (!base) return json(res, 400, { error: '还没配 ComfyUI 地址' });
    const filename = url.searchParams.get('filename') || '';
    if (!filename) return json(res, 400, { error: '缺 filename' });
    const q = new URLSearchParams({
      filename,
      subfolder: url.searchParams.get('subfolder') || '',
      type: url.searchParams.get('type') || 'output',
    });
    try {
      const r = await fetch(`${base}/view?${q.toString()}`, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) return json(res, 502, { error: 'ComfyUI 读图失败：HTTP ' + r.status });
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': r.headers.get('content-type') || 'image/png',
        'Cache-Control': 'no-store',
        'Content-Length': buf.length,
      });
      return res.end(buf);
    } catch (e) {
      return json(res, 502, { error: '连不上 ComfyUI：' + e.message });
    }
  }

  if (p === '/api/localfile' && method === 'GET') {
    // searchParams 已经解过一次码，这里不再 decodeURIComponent：文件名里真带 % 时二次解码会 500
    const target = url.searchParams.get('path') || '';
    const allowed = [cfg.gen?.outputRoot, cfg.samplesRoot, path.join(ROOT, 'data', 'previews')]
      .filter(Boolean);
    if (!allowed.some((root) => isInside(target, root))) return json(res, 403, { error: '路径不在允许范围' });
    const norm = path.resolve(target);
    if (!fs.existsSync(norm) || !fs.statSync(norm).isFile()) return json(res, 404, { error: '文件不在了' });
    return sendFile(res, norm, req, { cache: 'no-cache' });
  }

  /* ---------- 行为 ---------- */
  if (p === '/api/scan' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req).catch(() => ({}));
    const result = scanLibrary({ readMeta: body.read_meta !== false, actor: 'api' });
    return json(res, 200, result);
  }

  if (p === '/api/usage' && method === 'POST') {
    if (!requireToken(req, res, url)) return;
    const body = await readJson(req);
    const n = recordUsage(body.loras || body.lora || [], body.image || '', body.actor || 'api');
    return json(res, 200, { recorded: n });
  }

  if (p === '/api/locate' && method === 'GET') {
    const name = url.searchParams.get('name') || '';
    const rel = resolveRelPath(name);
    const index = buildDiskIndex();
    const hit = rel ? index.map.get(String(rel).toLowerCase()) : null;
    if (hit) return json(res, 200, { found: true, ...hit });
    // 文件名找不到，再按名字 / 别名 / 触发词找
    const matches = searchLoras({ q: name, limit: 8, variants: '1' }).items
      .map((x) => ({ id: x.id, name: x.name, work: x.work, rel_path: x.rel_path, trigger: x.trigger }));
    return json(res, 200, { found: false, asked: name, matches });
  }

  if (p === '/api/events' && method === 'GET') {
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 500);
    const rows = db().prepare('SELECT * FROM event ORDER BY id DESC LIMIT ?').all(limit);
    return json(res, 200, rows);
  }

  if (p === '/api/export' && method === 'GET') {
    const format = url.searchParams.get('format') || 'json';
    const rows = db().prepare('SELECT * FROM lora ORDER BY category, work, name').all();
    if (format === 'csv') {
      const cols = ['id', 'name', 'name_en', 'category', 'work', 'trigger', 'feature_words',
        'outfit_words', 'body_words', 'negative', 'weight', 'base_model', 'source_url',
        'download_url', 'rel_path', 'size_bytes', 'status', 'preview'];
      const lines = [cols.join(',')];
      for (const r of rows) lines.push(cols.map((c) => csvEscape(r[c])).join(','));
      const body = '\uFEFF' + lines.join('\r\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="lora-library.csv"',
      });
      return res.end(body);
    }
    const body = JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, loras: rows }, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lora-library.json"',
    });
    return res.end(body);
  }

  if (p === '/api/openapi.json') return json(res, 200, openapi.json());

  if (p === '/api/reveal' && method === 'POST') {    if (!requireToken(req, res, url)) return;
    const body = await readJson(req);
    const row = body.id ? getLora(Number(body.id)) : null;
    const rel = row ? row.rel_path : resolveRelPath(body.path || '');
    const abs = rel ? absOf(rel, cfg) : '';
    if (!abs || !fs.existsSync(abs)) return json(res, 404, { error: '文件不存在', path: abs });
    execFile('explorer.exe', ['/select,', abs], { windowsHide: true }, () => {});
    return json(res, 200, { ok: true, path: abs });
  }

  if (p === '/api/openapi.json') return json(res, 200, openapi.json());

  if (p.startsWith('/api/')) return json(res, 404, { error: '没有这个接口：' + p });

  // 静态
  return serveStatic(res, url.pathname);
}

/* ------------------------------ OpenAPI ------------------------------ */

const openapi = {
  json: () => ({
    openapi: '3.0.0',
    info: { title: 'LoRA 库开放接口', version: VERSION, description: '本地 LoRA 库管理器的录入/查询接口' },
    servers: [{ url: `http://${HOST}:${PORT}` }],
    components: {
      securitySchemes: { ApiToken: { type: 'apiKey', in: 'header', name: 'X-API-Token' } },
    },
    paths: {
      '/api/loras': {
        get: { summary: '搜索 / 列表', parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'work', in: 'query', schema: { type: 'string' } },
          { name: 'tag', in: 'query', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['name', 'recent', 'size', 'used', 'work'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 60 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ] },
        post: {
          summary: '录入 / 更新（按文件路径去重，会自动读 safetensors 元数据）',
          security: [{ ApiToken: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '相对 loras 根或绝对路径，也可只给文件名' },
              name: { type: 'string' }, category: { type: 'string' }, work: { type: 'string' },
              trigger: { type: 'string' }, feature_words: { type: 'string' },
              outfit_words: { type: 'string' }, body_words: { type: 'string' },
              negative: { type: 'string' }, weight: { type: 'number' },
              source_url: { type: 'string' }, download_url: { type: 'string' },
              model_id: { type: 'string' }, version_id: { type: 'string' },
              note: { type: 'string' }, preview: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          } } } },
        },
      },
      '/api/loras/{id}': {
        get: { summary: '详情（含标签、使用记录、训练信息）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }] },
        patch: { summary: '改字段', security: [{ ApiToken: [] }] },
        delete: { summary: '删记录（不删文件）', security: [{ ApiToken: [] }] },
      },
      '/api/loras/{id}/preview': {
        post: { summary: '上传预览图：原始 image/* 字节，或 JSON {base64} / {url}', security: [{ ApiToken: [] }] },
        get: { summary: '取预览图' },
        delete: { summary: '清空预览图', security: [{ ApiToken: [] }] },
      },
      '/api/scan': { post: { summary: '扫描磁盘新增 / 变更 / 改名 / 丢失', security: [{ ApiToken: [] }] } },
      '/api/gen/options': { get: { summary: '出图：可用模型 / 默认配置（GET 不走 token）' } },
      '/api/gen/loras': {
        get: {
          summary: '出图：四类槽位候选',
          parameters: [
            { name: 'slot', in: 'query', schema: { type: 'string', enum: ['char', 'aux', 'outfit', 'style'] } },
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'base', in: 'query', schema: { type: 'string', enum: ['anima', 'sdxl'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 30 } },
          ],
        },
      },
      '/api/generate': {
        post: {
          summary: '出图（异步任务，轮询 /api/jobs/{id}）',
          security: [{ ApiToken: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: {
              type: 'object',
              properties: {
                model: { type: 'string', description: 'unet:xxx 或 checkpoint:xxx' },
                clip: { type: 'string' }, vae: { type: 'string' }, clipType: { type: 'string' },
                char: { type: 'object' }, aux: { type: 'array', items: { type: 'object' } },
                outfit: { type: 'object' }, style: { type: 'object' },
                scene: { type: 'string' }, negative: { type: 'string' },
                keepOriginalClothes: { type: 'boolean' },
                size: { type: 'string' }, steps: { type: 'integer' }, cfg: { type: 'number' },
                seed: { type: 'integer' }, count: { type: 'integer' },
                twoPass: { type: 'object', description: '第二段图生图：enable / model / style / strength' },
              },
            } } },
          },
        },
      },
      '/api/usage': { post: { summary: '记一次使用（出图台账）', security: [{ ApiToken: [] }] } },
      '/api/locate': { get: { summary: '按文件名查这支在不在', parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' } }] } },
      '/api/stats': { get: { summary: '统计' } },
      '/api/facets': { get: { summary: '分类 / 作品 / 标签聚合' } },
      '/api/export': { get: { summary: '导出 json 或 csv', parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv'] } }] } },
    },
  }),
};

/* ------------------------------ 启动 ------------------------------ */

/* ---------------- 自动更新 ---------------- */

/* 自测时（沙箱里 %TEMP% 写不进去）可以用 LORA_UPDATE_DIR 指到别处 */
const UPDATE_DIR = process.env.LORA_UPDATE_DIR
  ? path.resolve(process.env.LORA_UPDATE_DIR)
  : path.join(os.tmpdir(), 'lora-vault-update');
let updateJob = {
  stage: 'idle', // idle | downloading | ready | installing | error
  percent: 0,
  version: '',
  file: '',
  size: 0,
  sha256: '',
  error: '',
  updatedAt: '',
};

/** 安装版才认得出目录：<安装目录>\resources\node.exe，且同级有 LoraLibrary.exe */
function installDirOf() {
  const resDir = path.dirname(process.execPath);
  if (path.basename(resDir).toLowerCase() !== 'resources') return '';
  const dir = path.dirname(resDir);
  try {
    if (!fs.statSync(path.join(dir, 'LoraLibrary.exe')).isFile()) return '';
  } catch { return ''; }
  return dir;
}

function startUpdateDownload({ url, version, sha256 }) {
  fs.mkdirSync(UPDATE_DIR, { recursive: true });
  const safe = String(version || 'update').replace(/[^\w.-]/g, '_');
  const file = path.join(UPDATE_DIR, `LoRA-Vault-${safe}-setup.exe`);
  updateJob = {
    stage: 'downloading', percent: 0, version: String(version || ''), file,
    size: 0, sha256: String(sha256 || '').toLowerCase(), error: '', updatedAt: new Date().toISOString(),
  };
  downloadUpdate({
    url,
    file,
    sha256: updateJob.sha256,
    onProgress: (got, total) => {
      if (got) updateJob.gotBytes = got;
      if (total) {
        updateJob.size = total;
        updateJob.percent = Math.min(99, Math.round((got / total) * 100));
      }
    },
  }).then((r) => {
    updateJob = { ...updateJob, stage: 'ready', percent: 100, size: r.size, sha256: r.sha256, updatedAt: new Date().toISOString() };
    console.log('更新包就绪：' + r.file);
  }).catch((e) => {
    updateJob = { ...updateJob, stage: 'error', percent: 0, error: e.message, updatedAt: new Date().toISOString() };
    console.error('更新包下载失败：' + e.message);
  });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    console.error('[error]', e);
    if (!res.headersSent) json(res, 500, { error: e.message });
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`LoRA 库已启动  http://${HOST}:${PORT}`);
  console.log(`数据目录       ${DATA_DIR}`);
  console.log(`LoRA 根        ${loraRoots(cfg).join('；') || '(未配置)'}`);
  if (cfg.scanOnStart) {
    const t = Date.now();
    try {
      /* 空库（首次启动 / 数据目录换过）必须读头部，否则 1000 支全是空词；已有记录就不重读，省时间 */
      let hasRows = 0;
      try { hasRows = db().prepare('SELECT COUNT(*) AS c FROM lora').get().c || 0; } catch { hasRows = 0; }
      const r = scanLibrary({ readMeta: hasRows === 0, actor: 'boot' });
      console.log(`启动扫描完成 ${JSON.stringify(r)} 用时 ${Date.now() - t}ms`);
    } catch (e) { console.log('启动扫描失败:', e.message); }
  }
  try { console.log('版本族', JSON.stringify(recomputeFamilies())); } catch (e) { console.log('版本族失败:', e.message); }
  try {
    const pending = db().prepare("SELECT COUNT(*) AS c FROM tag WHERE kind = ''").get().c;
    if (pending) console.log('标签归类', JSON.stringify(rebuildTagKinds()));
  } catch (e) { console.log('标签归类失败:', e.message); }
  try { initDownloads(); } catch (e) { console.log('下载队列恢复失败:', e.message); }
  try { startGenLogWatcher(); } catch (e) { console.log('台账监听没起来:', e.message); }
  try {
    startLoraWatcher((r) => {
      sseBroadcast({ type: 'loras-changed', ...r, at: new Date().toISOString() });
    });
  } catch (e) { console.log('目录监听没起来:', e.message); }
});

process.on('SIGINT', () => { console.log('\n关闭'); server.close(() => process.exit(0)); });
