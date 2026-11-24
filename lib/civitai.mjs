import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fetch as uFetch, ProxyAgent } from 'undici';
import { db, logEvent } from './db.mjs';
import { translateToZh, translateLong } from './translate.mjs';
import { getLora, patchLora, upsertLora, setPreview } from './loras.mjs';
import { readSafetensorsMeta, parseTagFrequency, classifyTags, trainedWordList } from './safetensors.mjs';
import { ensureTriggers } from './triggers.mjs';
import { PREVIEW_DIR, loadConfig } from './config.mjs';
import { absOf } from './roots.mjs';
import { makeThumb, resolvePreviewAbs } from './media.mjs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const UA = 'lora-library/1.0 (local desktop app)';
const MIN_GAP = 1200;
let lastAt = 0;

/* ---------------------- 代理 ----------------------
 * 这台机器的浏览器走 127.0.0.1 的本地代理，Node 的 fetch 默认不认系统代理，
 * 直连 civitai 会超时。这里读注册表，有就挂上 ProxyAgent。
 */
let _dispatcher;
let _dispatcherReady = false;

export function detectProxy() {
  const env = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY;
  if (env) return env;
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync('reg', [
      'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
    ], { encoding: 'utf8', windowsHide: true });
    const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(out);
    const m = out.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i);
    if (!enabled || !m) return '';
    let server = m[1].trim();
    if (server.includes('=')) {
      const map = Object.fromEntries(server.split(';').map((s) => s.split('=')));
      server = map.https || map.http || Object.values(map)[0] || '';
    }
    if (!server) return '';
    if (!/^https?:\/\//i.test(server)) server = 'http://' + server;
    return server;
  } catch {
    return '';
  }
}

function dispatcher() {
  if (_dispatcherReady) return _dispatcher;
  _dispatcherReady = true;
  const p = detectProxy();
  if (p) {
    try {
      _dispatcher = new ProxyAgent(p);
      console.log('[civitai] 走代理', p);
    } catch {
      _dispatcher = undefined;
    }
  }
  return _dispatcher;
}

function civitaiAuth() {
  try {
    const cfg = loadConfig();
    return String(cfg.civitaiToken || process.env.CIVITAI_TOKEN || '').trim();
  } catch { return ''; }
}

function netFetch(url, opts = {}) {
  const token = civitaiAuth();
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  return uFetch(url, { ...opts, headers, dispatcher: dispatcher() });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* 全局节流：多个 worker 共用一条「上一次请求时间」，避免同时打 Civitai */
let gate = Promise.resolve();
function gateWait() {
  const p = gate.then(async () => {
    const wait = MIN_GAP - (Date.now() - lastAt);
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
  });
  gate = p.catch(() => {});
  return p;
}

async function politeFetch(url, { retries = 2, timeout = 25000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    await gateWait();
    let res;
    try {
      res = await netFetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      if (attempt >= retries) throw new Error('请求失败: ' + e.message);
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= retries) throw new Error('HTTP ' + res.status);
      await sleep(6000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
}

export function extractModelId(text) {
  const m = String(text || '').match(/models\/(\d+)/);
  return m ? m[1] : '';
}

export function extractVersionId(text) {
  const m = String(text || '').match(/modelVersionId=(\d+)/);
  return m ? m[1] : '';
}

/** 只有 versionId 的链接（models/?modelVersionId=...）反查 modelId */
export async function resolveModelIdFromVersion(versionId) {
  const v = await fetchModelVersion(versionId);
  return v && v.modelId ? String(v.modelId) : '';
}

async function fetchModelVersion(versionId) {
  const id = String(versionId || '').replace(/\D+/g, '');
  if (!id) return null;
  return politeFetch(`https://civitai.com/api/v1/model-versions/${id}`);
}

function pickImage(version) {  const imgs = (version.images || []).filter((i) => i && i.url && !/\.mp4(\?|$)/i.test(i.url));
  if (!imgs.length) return null;
  const good = imgs.find((i) => (i.width || 0) >= 512) || imgs[0];
  return good;
}

async function downloadImage(url, id) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(2500);
    try {
      const res = await netFetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error('图片 HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2048) throw new Error('图片太小');
      const ct = String(res.headers.get('content-type') || '');
      const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg';
      const name = `${id}-civitai${ext}`;
      fs.mkdirSync(PREVIEW_DIR, { recursive: true });
      fs.writeFileSync(path.join(PREVIEW_DIR, name), buf);
      return name;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('图片下载失败');
}

/** Civitai 上没这支（400/404），记一笔，以后不再白跑 */
function markNotFound(loraId, modelId, message) {
  const conn = db();
  const row = conn.prepare('SELECT meta_json FROM lora WHERE id = ?').get(loraId);
  let meta = {};
  try { meta = row && row.meta_json ? JSON.parse(row.meta_json) : {}; } catch { meta = {}; }
  meta.civitai = { ...(meta.civitai || {}), modelId: String(modelId), notFound: true, error: message, fetchedAt: new Date().toISOString() };
  conn.prepare('UPDATE lora SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), loraId);
}

/**
 * 用 Civitai 补一支。只补空字段，overwrite=true 才覆盖。
 */
export async function enrichOne(loraId, { overwrite = false, withImage = true, force = false, forceImage = false } = {}) {
  const row = getLora(loraId);
  if (!row) return { ok: false, skipped: true, reason: '没有这条记录', changed: [] };

  // 之前补过、图也下来了 → 不重复打 Civitai；force = 缺词 / 缺地址时再来一遍
  const prev = (row.meta && row.meta.civitai) || {};
  if (!force && !overwrite && prev.fetchedAt && (row.preview || prev.notFound)) {
    return { ok: true, skipped: true, reason: prev.notFound ? '之前查过，Civitai 没有' : '之前补过', changed: [] };
  }

  // 老库里 model_id 是浮点字符串，会带 ".0"，去掉
  let modelId = String(row.model_id || extractModelId(row.source_url))
    .replace(/\.0+$/, '');
  // 本地下的支没有来源：按名字去 C 站猜一次（点「补C站信息」时用）
  if (!modelId && !row.version_id) {
    try {
      const guessed = await guessModelByName(row.name);
      if (guessed && guessed.modelId) modelId = guessed.modelId;
    } catch { /* ignore */ }
  }
  if (!modelId) {
    const versionId = String(row.version_id || '').replace(/\.0+$/, '');
    if (!versionId) return { ok: false, skipped: true, reason: '没有 model_id', changed: [] };
    try {
      const v = await fetchModelVersion(versionId);
      const words = trainedWordList(v.trainedWords);
      const files = (v.files || []).filter((f) => /\.safetensors$/i.test(String(f.name || '')));
      const file = files.find((f) => f.primary) || files[0];
      const downloadUrl = file && file.downloadUrl ? file.downloadUrl : '';
      const realModelId = String(v.modelId || (v.model && v.model.id) || '').replace(/\.0+$/, '');
      const sourceUrl = realModelId
        ? `https://civitai.com/models/${realModelId}?modelVersionId=${v.id}`
        : '';
      let desc = '';
      if (realModelId) {
        try {
          const d = await getModelDetail(realModelId, v.id);
          desc = d && d.description ? d.description : '';
        } catch { /* ignore */ }
      }
      const conn = db();
      const fresh = conn.prepare('SELECT meta_json FROM lora WHERE id = ?').get(loraId);
      let meta = {};
      try { meta = fresh && fresh.meta_json ? JSON.parse(fresh.meta_json) : {}; } catch { meta = {}; }
      meta.civitai = { ...(meta.civitai || {}), versionId, trainedWords: words, description: desc || meta.civitai?.description || '', fetchedAt: new Date().toISOString() };
      const now = new Date().toISOString();
      conn.prepare(`
        UPDATE lora SET meta_json = ?,
          download_url = CASE WHEN download_url IS NULL OR download_url = '' THEN ? ELSE download_url END,
          source_url = CASE WHEN source_url IS NULL OR source_url = '' THEN ? ELSE source_url END,
          model_id = CASE WHEN model_id IS NULL OR model_id = '' THEN ? ELSE model_id END,
          description = CASE WHEN description IS NULL OR description = '' THEN ? ELSE description END,
          updated_at = ?
        WHERE id = ?`).run(JSON.stringify(meta), downloadUrl, sourceUrl, realModelId, desc, now, loraId);
      if (desc) {
        const dz = await translateLong(desc, 1200);
        if (dz) conn.prepare('UPDATE lora SET description_zh = ? WHERE id = ?').run(dz, loraId);
      }
      const changed = [];
      if (words.length) changed.push('trainedWords');
      if (downloadUrl) changed.push('downloadUrl');
      if (sourceUrl) changed.push('sourceUrl');
      if (desc) changed.push('description');
      if (!changed.length) return { ok: false, skipped: true, reason: 'C站这个版本没有触发词/下载地址/描述', changed: [] };
      return { ok: true, changed, name: row.name };
    } catch (e) {
      return { ok: false, skipped: true, reason: e.message, changed: [] };
    }
  }

  let data;
  try {
    data = await politeFetch(`https://civitai.com/api/v1/models/${modelId}`);
  } catch (e) {
    if (/HTTP (400|403|404|410)/.test(e.message)) {
      markNotFound(loraId, modelId, e.message);
      return { ok: false, skipped: true, reason: `${e.message}（Civitai 上没有这支）`, changed: [] };
    }
    throw e;
  }
  const versions = Array.isArray(data.modelVersions) ? data.modelVersions : [];
  const version = versions.find((v) => String(v.id) === String(row.version_id)) || versions[0] || {};

  const patch = {};
  const changed = [];
  const genericName = row.name === String(row.filename || '').replace(/\.safetensors$/i, '');
  const modelName = String(data.name || '').trim();

  if (modelName && (overwrite || genericName) && modelName !== row.name) {
    patch.name = modelName;
    changed.push('name');
  }
  if (modelName && !row.name_en) {
    patch.name_en = modelName;
    changed.push('name_en');
  }

  const trained = trainedWordList(version.trainedWords);
  if (trained.length && (overwrite || !row.trigger)) {
    patch.trigger = trained.join(', ');
    changed.push('trigger');
  }

  if (version.baseModel && (overwrite || !row.base_model)) {
    patch.base_model = String(version.baseModel);
    changed.push('base_model');
  }

  if (data.description && (overwrite || !row.description)) {
    patch.description = String(data.description);
    changed.push('description');
  }

  const url = `https://civitai.com/models/${modelId}${version.id ? '?modelVersionId=' + version.id : ''}`;
  if (url && (overwrite || !row.source_url)) { patch.source_url = url; changed.push('source_url'); }
  if (version.downloadUrl && (overwrite || !row.download_url)) {
    patch.download_url = String(version.downloadUrl);
    changed.push('download_url');
  }
  if (!row.model_id) patch.model_id = String(data.id || modelId);
  if (!row.version_id && version.id) patch.version_id = String(version.id);

  if (!row.note) {
    const creator = data.creator && data.creator.username ? data.creator.username : '';
    const bits = [creator && 'by ' + creator, version.name].filter(Boolean).join(' · ');
    if (bits) { patch.note = bits; changed.push('note'); }
  }

  // 预览图
  let previewError = '';
  if (withImage && (forceImage || overwrite || !row.preview)) {
    const img = pickImage(version);
    if (img) {
      try {
        await sleep(250);
        const name = await downloadImage(img.url, loraId);
        patch.preview = `local:${name}`;
        changed.push('preview');
        await makeThumb(loraId, path.join(PREVIEW_DIR, name));
      } catch (e) {
        // 图挂了不影响其它字段，但把原因带回去
        previewError = e.message;
      }
    } else {
      previewError = '这个版本没有可用图';
    }
  }

  if (Object.keys(patch).length) patchLora(loraId, patch, 'civitai');

  // 附带信息塞进 meta_json，不动 display 字段
  const conn = db();
  const fresh = conn.prepare('SELECT meta_json FROM lora WHERE id = ?').get(loraId);
  let meta = {};
  try { meta = fresh && fresh.meta_json ? JSON.parse(fresh.meta_json) : {}; } catch { meta = {}; }
  const prevCiv = { ...(meta.civitai || {}) };
  delete prevCiv.notFound;
  delete prevCiv.error;
  meta.civitai = {
    // 保留手动名单 / 解析出来的 candidates、clothes 等，别因为补一次来源就清掉
    ...prevCiv,
    modelId: String(data.id || modelId),
    versionId: version.id ? String(version.id) : '',
    versionName: version.name || '',
    trainedWords: trained,
    creator: data.creator && data.creator.username ? data.creator.username : '',
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 30) : [],
    nsfw: !!data.nsfw,
    type: data.type || '',
    publishedAt: version.publishedAt || data.publishedAt || '',
    stats: data.stats || null,
    fetchedAt: new Date().toISOString(),
  };
  conn.prepare('UPDATE lora SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), loraId);

  return { ok: true, changed, name: patch.name || row.name, previewError };
}

/* ---------------------------- 批量补预览图 ---------------------------- */

/**
 * 给「没有预览图」的支，从 Civitai 下载页补一张。
 * 没来源的会先按名字猜一次（猜中写回来源再抓图）；猜不到就跳过。
 * 只补空字段，不覆盖已经有的图和词。
 */
export async function fillPreviews(ctx, { limit = 100 } = {}) {
  const conn = db();
  const capped = Math.min(Math.max(Number(limit) || 100, 1), 2000);
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const candidates = conn.prepare(`
    SELECT l.id, l.name, l.filename, l.rel_path, l.model_id, l.version_id,
           l.source_url, l.download_url, l.preview, l.category
    FROM lora l
    WHERE l.status = 'ok'
      AND NOT EXISTS (
        SELECT 1 FROM event e WHERE e.lora_id = l.id AND e.action = 'auto-preview-try' AND e.at > ?
      )
  `).all(cutoff);

  // 字段空 + 字段有但文件已经丢的，都算没图
  const rows = candidates.filter((r) => {
    if (!r.preview) return true;
    if (/^https?:\/\//i.test(r.preview)) return false;
    return !resolvePreviewAbs(r.preview);
  }).sort((a, b) => {
    const ra = a.category === '角色' ? 0 : 1;
    const rb = b.category === '角色' ? 0 : 1;
    return ra - rb || a.id - b.id;
  }).slice(0, capped);

  ctx.setTotal(rows.length);
  ctx.log(`待补 ${rows.length} 支（最多 ${capped} 支）`);

  let filled = 0;
  let guessed = 0;
  let noSource = 0;
  let failed = 0;

  for (const row of rows) {
    if (ctx.cancelled()) break;
    const id = row.id;
    const label = row.name || path.basename(String(row.filename || ''), '.safetensors');
    try {
      let modelId = String(row.model_id || extractModelId(row.source_url))
        .replace(/\.0+$/, '');
      const versionId = String(row.version_id || extractVersionId(row.source_url)).replace(/\.0+$/, '');
      let guessedHit = false;

      if (!modelId && versionId) {
        try {
          const v = await fetchModelVersion(versionId);
          if (v && v.modelId) {
            modelId = String(v.modelId);
            patchLora(id, {
              model_id: modelId,
              version_id: versionId,
              source_url: `https://civitai.com/models/${modelId}?modelVersionId=${versionId}`,
            }, 'auto-preview');
            guessedHit = true;
          }
        } catch { /* 反查失败，下面按名字猜 */ }
      }

      if (!modelId) {
        const base = String(row.filename || '').replace(/\.safetensors$/i, '');
        const tries = [...new Set([
          row.name,
          base,
          base.replace(/_+/g, ' '),
          base.split(/[-_]/).slice(0, 2).join(' '),
        ].map((s) => String(s || '').trim()).filter(Boolean))];
        for (const cand of tries) {
          const hit = await guessModelByName(cand);
          if (hit && hit.score >= 2) {
            modelId = hit.modelId;
            patchLora(id, {
              model_id: hit.modelId,
              version_id: hit.versionId,
              source_url: hit.url,
            }, 'auto-preview');
            guessed++;
            guessedHit = true;
            break;
          }
        }
      }

      if (!modelId) {
        noSource++;
        ctx.tick(false, `#${id} ${label}：没有 Civitai 来源，跳过`);
        continue;
      }

      const r = await enrichOne(id, {
        overwrite: false,
        withImage: true,
        force: !!row.preview,
        forceImage: !!row.preview,
      });
      if (r.changed && r.changed.includes('preview')) {
        filled++;
        ctx.tick(true, `#${id} ${label}：补上了${guessedHit ? '（来源是猜的）' : ''}`);
      } else if (r.previewError) {
        failed++;
        ctx.tick(false, `#${id} ${label}：图没下来（${r.previewError}）`);
      } else if (r.skipped) {
        ctx.tick(true, `#${id} ${label}：${r.reason || '跳过'}`);
      } else {
        failed++;
        ctx.tick(false, `#${id} ${label}：${r.reason || '没找到图'}`);
      }
    } catch (e) {
      failed++;
      ctx.tick(false, `#${id} ${label}：${e.message}`);
    } finally {
      // 记一笔，7 天内不重复试同一支；否则补不上的支会一直占着前 100 个位置
      try { logEvent('auto-preview-try', id, 'job', label); } catch { /* ignore */ }
    }
  }

  ctx.log(`补上 ${filled} 支，猜来源 ${guessed} 支，失败 ${failed} 支，没来源 ${noSource} 支`);
  return { total: rows.length, filled, guessed, failed, noSource };
}

/* ---------------------------- 批量补词 / 下载地址 ---------------------------- */

/**
 * 给「缺触发词 / 特征词 / 服装词 / 下载地址」的支补字段。
 * 先用库里的训练标签补词（不联网），再拿 Civitai 的官方触发词和下载地址补；
 * 没来源的按名字猜一次。只补空字段，不覆盖手填的，不下载图片。
 */
export async function fillMeta(ctx, { limit = 100 } = {}) {
  const cfg = loadConfig();
  const conn = db();
  const capped = Math.min(Math.max(Number(limit) || 100, 1), 2000);
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const rows = conn.prepare(`
    SELECT l.id, l.name, l.filename, l.rel_path, l.trigger, l.feature_words, l.outfit_words,
           l.body_words, l.download_url, l.source_url, l.model_id, l.version_id
    FROM lora l
    WHERE l.status = 'ok' AND (
      l.trigger = '' OR l.feature_words = '' OR l.outfit_words = '' OR
      l.download_url = '' OR l.source_url = ''
    )
    AND NOT EXISTS (
      SELECT 1 FROM event e WHERE e.lora_id = l.id AND e.action = 'auto-meta-try' AND e.at > ?
    )
    ORDER BY CASE WHEN l.model_id <> '' OR l.source_url LIKE '%civitai%' THEN 0 ELSE 1 END, l.id
    LIMIT ?
  `).all(cutoff, capped);

  ctx.setTotal(rows.length);
  ctx.log(`待补 ${rows.length} 支（最多 ${capped} 支）`);

  let tagFilled = 0;
  let fileFilled = 0;
  let civitaiFilled = 0;
  let guessed = 0;
  let failed = 0;
  let noSource = 0;

  for (const row of rows) {
    if (ctx.cancelled()) break;
    const id = row.id;
    const label = row.name || path.basename(String(row.filename || ''), '.safetensors');
    let patched = false;
    try {
      // 1. 库里的训练标签
      let tags = conn.prepare(`
        SELECT t.name AS tag, lt.count AS count
        FROM lora_tag lt JOIN tag t ON t.id = lt.tag_id
        WHERE lt.lora_id = ? ORDER BY lt.count DESC
      `).all(id);
      let readFromFile = false;
      if (!tags.length) {
        readFromFile = true;
        try {
          const abs = absOf(row.rel_path, cfg);
          if (abs && fs.existsSync(abs)) {
            const meta = readSafetensorsMeta(abs);
            const freq = parseTagFrequency(meta);
            if (freq.length) tags = freq;
          }
        } catch { /* 文件读不到就算了 */ }
      }
      if (tags.length) {
        const cls = classifyTags(tags);
        const patch = {};
        if (!row.trigger && cls.trigger) patch.trigger = cls.trigger;
        if (!row.feature_words && cls.feature) patch.feature_words = cls.feature;
        if (!row.outfit_words && cls.outfit) patch.outfit_words = cls.outfit;
        if (!row.body_words && cls.body) patch.body_words = cls.body;
        if (Object.keys(patch).length) {
          patchLora(id, patch, 'auto-meta');
          patched = true;
          if (readFromFile) fileFilled++;
          else tagFilled++;
        }
      }

      // 2. 没来源的按名字猜一次
      let modelId = String(row.model_id || extractModelId(row.source_url))
        .replace(/\.0+$/, '');
      const versionId = String(row.version_id || extractVersionId(row.source_url)).replace(/\.0+$/, '');
      if (!modelId && versionId) {
        try {
          const v = await fetchModelVersion(versionId);
          if (v && v.modelId) {
            modelId = String(v.modelId);
            patchLora(id, {
              model_id: modelId,
              version_id: versionId,
              source_url: `https://civitai.com/models/${modelId}?modelVersionId=${versionId}`,
            }, 'auto-meta');
            patched = true;
          }
        } catch { /* 反查失败，下面按名字猜 */ }
      }

      if (!modelId) {
        const base = String(row.filename || '').replace(/\.safetensors$/i, '');
        const tries = [...new Set([
          row.name,
          base,
          base.replace(/_+/g, ' '),
          base.split(/[-_]/).slice(0, 2).join(' '),
        ].map((s) => String(s || '').trim()).filter(Boolean))];
        for (const cand of tries) {
          const hit = await guessModelByName(cand);
          if (hit && hit.score >= 2) {
            modelId = hit.modelId;
            patchLora(id, {
              model_id: hit.modelId,
              version_id: hit.versionId,
              source_url: hit.url,
            }, 'auto-meta');
            guessed++;
            patched = true;
            break;
          }
        }
      }
      if (!modelId) {
        noSource++;
        ctx.tick(true, `#${id} ${label}：标签补了${patched ? '' : '，'}没来源，C站跳过`);
        continue;
      }

      // 3. Civitai：补官方触发词 / 下载地址 / 来源
      const fresh = conn.prepare('SELECT trigger, download_url, source_url FROM lora WHERE id = ?').get(id);
      if (fresh.trigger && fresh.download_url && fresh.source_url) {
        ctx.tick(true, `#${id} ${label}：词和地址已经齐了`);
        continue;
      }
      const r = await enrichOne(id, { overwrite: false, withImage: false, force: true });
      const added = (r.changed || []).filter((k) =>
        ['trigger', 'download_url', 'source_url', 'name', 'name_en', 'base_model'].includes(k));
      if (added.length) {
        civitaiFilled++;
        ctx.tick(true, `#${id} ${label}：C站补了 ${added.join('/')}`);
      } else if (r.skipped) {
        ctx.tick(true, `#${id} ${label}：${r.reason || '跳过'}`);
      } else {
        ctx.tick(true, `#${id} ${label}：C站没有新字段`);
      }
    } catch (e) {
      failed++;
      ctx.tick(false, `#${id} ${label}：${e.message}`);
    } finally {
      try { logEvent('auto-meta-try', id, 'job', label); } catch { /* ignore */ }
    }
  }

  ctx.log(`标签补 ${tagFilled} 支，读文件补 ${fileFilled} 支，C站补 ${civitaiFilled} 支，猜来源 ${guessed} 支，失败 ${failed} 支，没来源 ${noSource} 支`);
  return { total: rows.length, tagFilled, fileFilled, civitaiFilled, guessed, failed, noSource };
}

/* ============================ C 站搜索 / 下载 ============================ */

function summarizeModel(m) {
  const versions = Array.isArray(m.modelVersions) ? m.modelVersions : [];
  const v = versions[0] || {};
  const img = pickImage(v);
  const files = (v.files || []).filter((f) => /\.safetensors$/i.test(String(f.name || '')));
  const primary = files.find((f) => f.primary) || files[0] || null;
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    nsfw: !!m.nsfw,
    creator: m.creator ? m.creator.username : '',
    stats: m.stats || {},
    tags: Array.isArray(m.tags) ? m.tags.slice(0, 10) : [],
    version: {
      id: v.id || 0,
      name: v.name || '',
      baseModel: v.baseModel || '',
      trainedWords: trainedWordList(v.trainedWords),
    },
    image: img ? img.url : '',
    file: primary ? { name: primary.name, sizeKB: primary.sizeKB || 0, url: primary.downloadUrl } : null,
    pageUrl: `https://civitai.com/models/${m.id}${v.id ? '?modelVersionId=' + v.id : ''}`,
  };
}

export async function searchModels({ query = '', limit = 24, nsfw = false, sort = 'Most Downloaded', period = 'AllTime', baseModel = '', cursor = '' } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(Math.min(Math.max(Number(limit) || 24, 1), 50)));
  qs.set('types', 'LORA');
  if (query) qs.set('query', String(query));
  if (nsfw) qs.set('nsfw', 'true');
  if (sort) qs.set('sort', String(sort));
  if (period) qs.set('period', String(period));
  if (baseModel) qs.append('baseModels', String(baseModel));
  if (cursor) qs.set('cursor', String(cursor));
  const data = await politeFetch('https://civitai.com/api/v1/models?' + qs.toString());
  return {
    items: (data.items || []).map(summarizeModel),
    nextCursor: (data.metadata && data.metadata.nextCursor) || '',
  };
}

function safeFileName(name) {
  return String(name || 'model.safetensors').replace(/[\\/:*?"<>|]/g, '_').slice(0, 150);
}

function uniquePath(dir, filename) {
  let target = path.join(dir, filename);
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  for (let i = 1; i < 500; i++) {
    target = path.join(dir, `${base}-${i}${ext}`);
    if (!fs.existsSync(target)) return target;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

export async function downloadVersion(versionId, { subdir = '', onProgress, onLog, weight, shouldPause } = {}) {
  const log = (s) => { if (onLog) onLog(String(s)); };
  const data = await politeFetch(`https://civitai.com/api/v1/model-versions/${versionId}`);
  const files = (data.files || []).filter((f) => /\.safetensors$/i.test(String(f.name || '')));
  const file = files.find((f) => f.primary) || files[0];
  if (!file) throw new Error('这个版本没有 .safetensors 文件');
  if (!file.downloadUrl) throw new Error('这个版本没有下载地址');

  const cfg = loadConfig();
  const root = cfg.lorasRoot;
  if (!root || !fs.existsSync(root)) throw new Error('LoRA 目录不存在，先去设置里配');
  const cleanSub = String(subdir || '')
    .replaceAll('/', '\\')
    .replace(/^\\+|\\+$/g, '')
    .replace(/[:*?"<>|]/g, '')
    .trim();
  if (cleanSub.split('\\').some((s) => !s || s === '.' || s === '..')) {
    throw new Error('目标分类路径不合法');
  }
  const targetSub = cleanSub || '未分类';
  log(`放到：${targetSub}`);
  const dir = path.resolve(root, targetSub);
  if (!dir.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)) {
    throw new Error('目标不在 LoRA 目录里');
  }
  fs.mkdirSync(dir, { recursive: true });

  const filename = safeFileName(file.name);
  const target = uniquePath(dir, filename);
  const part = target + '.part';
  let startAt = 0;
  try { startAt = fs.statSync(part).size; } catch { startAt = 0; }
  log(`下载 ${filename}（${Math.round((file.sizeKB || 0) / 1024)} MB）${startAt ? `，从 ${Math.round(startAt / 1048576)} MB 续` : ''}`);

  const headers = { 'User-Agent': UA };
  if (startAt > 0) headers.Range = `bytes=${startAt}-`;
  const res = await netFetch(file.downloadUrl, {
    headers,
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('C站要求登录才能下载：去设置里填「C站 API Key」（civitai.com → 账号设置 → API Keys）');
  }
  if (!res.ok && res.status !== 416) throw new Error('下载失败 HTTP ' + res.status);

  if (res.status === 416 && startAt > 0) {
    // 断点已经和文件一样大，直接收尾
    fs.renameSync(part, target);
  } else {
    const append = startAt > 0 && res.status === 206;
    if (!append) startAt = 0;
    const length = Number(res.headers.get('content-length') || 0);
    const total = length ? startAt + length : (file.sizeKB ? file.sizeKB * 1024 : 0);
    let got = 0;
    let lastPct = -1;
    const meter = new Transform({
      transform(chunk, _enc, cb) {
        if (shouldPause && shouldPause()) {
          const e = new Error('paused');
          e.code = 'DL_PAUSED';
          cb(e);
          return;
        }
        got += chunk.length;
        if (onProgress) onProgress(startAt + got, total);
        if (total) {
          const pct = Math.floor(((startAt + got) / total) * 100);
          if (pct >= lastPct + 10) { lastPct = pct; log(`  ${pct}%`); }
        }
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body), meter, fs.createWriteStream(part, { flags: append ? 'a' : 'w' }));
    fs.renameSync(part, target);
  }

  const rel = path.relative(root, target);
  const version = data;
  const model = version.model || {};
  const modelId = String(version.modelId || model.id || '').replace(/\.0+$/, '');
  const sourceUrl = modelId
    ? `https://civitai.com/models/${modelId}?modelVersionId=${version.id}`
    : '';
  // 页面信息：描述、标签、推荐权重
  let detail = null;
  if (modelId) {
    try { detail = await getModelDetail(modelId, version.id); } catch { detail = null; }
  }
  const recWeight = Number.isFinite(Number(weight)) && Number(weight) > 0
    ? Number(weight)
    : (detail && detail.recommendedWeight ? detail.recommendedWeight : 0.85);
  const pageTags = detail && Array.isArray(detail.tags) ? detail.tags : [];
  // 版本接口的 model 里没有 creator，得从模型详情兜底，否则作者信息空着
  const creatorName = (model.creator && model.creator.username)
    || (detail && detail.creator) || '';
  const trainedWords = trainedWordList(version.trainedWords);

  let inserted = null;
  let importError = '';
  try {
    inserted = upsertLora({
      rel_path: rel,
      name: String(model.name || path.basename(target, '.safetensors')),
      description: detail && detail.description ? detail.description : '',
      trigger: trainedWords.join(', '),
      feature_words: pageTags.join(', '),
      base_model: version.baseModel || '',
      source_url: sourceUrl,
      download_url: file.downloadUrl || '',
      model_id: modelId,
      version_id: version.id ? String(version.id) : '',
      weight: recWeight,
      note: [creatorName ? 'by ' + creatorName : '', version.name || ''].filter(Boolean).join(' · '),
      read_meta: true,
    }, 'civitai-download');
  } catch (e) {
    importError = e.message;
    log('入库失败：' + e.message);
  }

  // 下载完后台翻中文名，不挡下载任务结束（批量下载不会一个个卡在翻译上）
  if (inserted && inserted.id) {
    const loraId = inserted.id;
    const zhSource = model.name || path.basename(target, '.safetensors');
    void (async () => {
      try {
        const cur = db().prepare('SELECT name_zh FROM lora WHERE id = ?').get(loraId);
        if (!cur || cur.name_zh) return;
        const zh = await translateToZh(zhSource);
        if (!zh) return;
        db().prepare('UPDATE lora SET name_zh = ? WHERE id = ?').run(zh, loraId);
        log('中文名：' + zh);
        const cur2 = db().prepare('SELECT description_zh FROM lora WHERE id = ?').get(loraId);
        if (cur2 && !cur2.description_zh && detail && detail.description) {
          const dz = await translateLong(detail.description, 1200);
          if (dz) {
            db().prepare('UPDATE lora SET description_zh = ? WHERE id = ?').run(dz, loraId);
            log('描述已翻中文');
          }
        }
      } catch { /* ignore */ }
    })();
  }

  // 页面信息落到 meta.civitai，抽屉里能看到
  if (inserted && inserted.id) {
    try {
      const conn = db();
      const fresh = conn.prepare('SELECT meta_json FROM lora WHERE id = ?').get(inserted.id);
      let meta = {};
      try { meta = fresh && fresh.meta_json ? JSON.parse(fresh.meta_json) : {}; } catch { meta = {}; }
      meta.civitai = {
        ...(meta.civitai || {}),
        modelId: modelId,
        versionId: String(version.id || ''),
        versionName: version.name || '',
        creator: creatorName,
        tags: pageTags.slice(0, 30),
        trainedWords,
        description: detail ? detail.description : '',
        recommendedWeight: recWeight,
        downloadUrl: file.downloadUrl || '',
        pageUrl: sourceUrl,
        fetchedAt: new Date().toISOString(),
      };
      conn.prepare('UPDATE lora SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), inserted.id);
    } catch (e) { log('Civitai 页面信息没写进库：' + (e && e.message ? e.message : String(e))); }
  }

  // 预览图
  let previewError = '';
  if (inserted && inserted.id) {
    const img = pickImage(version);
    if (img) {
      try {
        await sleep(300);
        const name = await downloadImage(img.url, inserted.id);
        setPreview(inserted.id, { file: `local:${name}` });
        await makeThumb(inserted.id, path.join(PREVIEW_DIR, name));
      } catch (e) {
        previewError = e.message;
        log('预览图没下来：' + e.message);
      }
    }
  }

  return {
    ok: true,
    file: target,
    rel_path: rel,
    id: inserted ? inserted.id : null,
    importError,
    previewError,
    size: fs.statSync(target).size,
  };
}

/** 从「C 站模型页网址 / AIR / 纯版本号」里解析出 modelId / versionId */
export function parseCivitaiLink(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const mVer = s.match(/modelVersionId=(\d+)/i);
  if (mVer) return { versionId: mVer[1] };
  const mAir = s.match(/(?:civitai:)(\d+)@(\d+)/i) || s.match(/^(\d+)@(\d+)$/);
  if (mAir) return { modelId: mAir[1], versionId: mAir[2] };
  const mDl = s.match(/\/api\/download\/models\/(\d+)/i);
  if (mDl) return { versionId: mDl[1] };
  if (/^\d+$/.test(s)) return { versionId: s };
  const mModel = s.match(/civitai\.com\/models\/(\d+)/i);
  if (mModel) return { modelId: mModel[1] };
  return null;
}

/** 只贴了模型页（没版本号）时，拿第一个版本 */
async function firstVersionId(modelId) {
  const data = await politeFetch(`https://civitai.com/api/v1/models/${String(modelId).replace(/\D+/g, '')}`);
  const v = (Array.isArray(data.modelVersions) ? data.modelVersions : [])[0];
  if (!v || !v.id) throw new Error('这个模型没有可下载版本');
  return String(v.id);
}

/** 贴链接 / AIR 直接下载，返回和 downloadVersion 一样 */
export async function downloadByText(text, opts = {}) {
  const parsed = parseCivitaiLink(text);
  if (!parsed) throw new Error('看不懂这个链接，要 C站模型页网址 / civitai:model@version / 版本号');
  let versionId = parsed.versionId;
  if (!versionId && parsed.modelId) versionId = await firstVersionId(parsed.modelId);
  if (!versionId) throw new Error('没找到版本号');
  return downloadVersion(versionId, opts);
}

/* ============================ 从 C 站解析「能出的人物 / 服装」 ============================ */

function htmlToLines(html) {
  let s = String(html || '');
  s = s.replace(/<\s*br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '\n• ');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  return s.split(/\r?\n/).map((x) => x.trim()).filter((x) => x.length > 0);
}

function splitList(text) {
  return String(text || '')
    .split(/[,，、;；/|]+/)
    .map((s) => s.replace(/^[-*•·\d.、)\s]+/, '').replace(/[。.]$/, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 60);
}

const STOP_NAME = /^(角色|人物|服装|衣服|外观|目录|合集|链接|模型|版本|提示|说明|下载|示例|预览|简介|介绍|内容|注意|使用|方法|characters?|outfits?|costumes?|clothes|clothing|download|links?|models?|notes?|nsfw|sdxl|pony|illustrious|anima|sd1\.5|v\d+(\.\d+)?)$/i;

function uniqNames(arr) {
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function looksLikeName(s) {
  const v = String(s || '').trim();
  if (v.length < 2 || v.length > 24) return false;
  if (STOP_NAME.test(v)) return false;
  // 作品名不是人物
  if (/(honkai|impact|star\s?rail|genshin|zenless|blue\s?archive|arknights|azur\s?lane|fate|granblue|nikke|nier)/i.test(v)) return false;
  if (/https?:/i.test(v)) return false;
  if (/^\d+$/.test(v)) return false;
  if (/[<>{}]/.test(v)) return false;
  return true;
}

/* 整合包描述基本是「一人一行」：中文-英文、名字：说明。
   只看这种行，别去猜标题，标题里全是作品名。 */
function parseDescription(lines) {
  const chars = [];
  const clothes = [];
  let mode = null;
  for (const rawLine of lines) {
    const line = String(rawLine || '').replace(/^[•\-*·\d.)\s]+/, '').trim();
    if (!line) continue;
    if (line.length <= 40) {
      if (/^(characters?|角色|人物|可选角色|人物列表)\s*$/i.test(line)) { mode = 'chars'; continue; }
      if (/^(outfits?|costumes?|服装|衣服|外观)\s*$/i.test(line)) { mode = 'clothes'; continue; }
    }
    const inline = line.match(/^(characters?|角色|人物|characters?\s+included|outfits?|服装|衣服)\s*[:：]\s*(.+)$/i);
    if (inline) {
      const isChar = /角色|人物|character/i.test(inline[1]);
      (isChar ? chars : clothes).push(...splitList(inline[2]));
      mode = null;
      continue;
    }
    const m = line.match(/^([^：:\-–—]{2,24})\s*[-–—:：]/);
    if (m) {
      const name = m[1].trim();
      if (!looksLikeName(name)) continue;
      if (mode === 'clothes') clothes.push(name);
      else chars.push(name);
    }
  }
  return { characters: uniqNames(chars), clothes: uniqNames(clothes) };
}
/** 从 C 站拉「这支能出哪些人物 / 服装」，顺手缓存进 meta_json */
export async function fetchCandidates(row, { force = false } = {}) {
  const modelId = String(row.model_id || '').replace(/\.0+$/, '')
    || extractModelId(row.source_url);
  if (!modelId) return { ok: false, reason: '这条没有 C 站来源：可以在下面「手动名单」填人物，或把 C站模型页链接贴进去' };
  const prev = (row.meta && row.meta.civitai) || {};
  if (!force && Array.isArray(prev.candidates) && prev.candidates.length) {
    return { ok: true, cached: true, characters: prev.candidates, clothes: prev.clothes || [], source: 'civitai-cache' };
  }

  const data = await politeFetch(`https://civitai.com/api/v1/models/${modelId}`);
  const versions = Array.isArray(data.modelVersions) ? data.modelVersions : [];
  const version = versions.find((v) => String(v.id) === String(row.version_id)) || versions[0] || {};

  const lines = htmlToLines(data.description || '');
  const parsed = parseDescription(lines);
  let characters = parsed.characters.filter(looksLikeName).slice(0, 60);
  let clothes = parsed.clothes.filter(looksLikeName).slice(0, 30);

  // ★ 一个角色一个触法词的包：只有「带作品括号」或和描述里人名对得上的训练词才算，
  //   不然 1girl / black gloves 这种通用词也会被当成人物
  const parseNames = new Set(characters.map((c) => c.toLowerCase()));
  const twAll = trainedWordList(version.trainedWords);
  const triggers = uniqNames(twAll
    .flatMap((w) => String(w || '').split(/[,，、\n]+/))
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 80)
    .filter((w) => /\([^)]*\)/.test(w) || parseNames.has(w.toLowerCase())))
    .slice(0, 80);
  characters = uniqNames([...characters, ...triggers]).slice(0, 80);

  // 描述里没写清楚的，用训练词兜底（整合包的训练词一般就是人名）
  if (characters.length < 2 && twAll.length) {
    const tw = twAll
      .map((w) => String(w).replace(/\(.*?\)/g, '').trim())
      .filter((w) => looksLikeName(w) && !/^\d/.test(w));
    characters = uniqNames([...characters, ...tw]).slice(0, 60);
  }

  // 缓存进 meta_json
  try {
    const conn = db();
    const fresh = conn.prepare('SELECT meta_json FROM lora WHERE id = ?').get(row.id);
    let meta = {};
    try { meta = fresh && fresh.meta_json ? JSON.parse(fresh.meta_json) : {}; } catch { meta = {}; }
    meta.civitai = { ...(meta.civitai || {}), candidates: characters, clothes, triggers, candidatesAt: new Date().toISOString() };
    conn.prepare('UPDATE lora SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), row.id);
  } catch { /* ignore */ }

  return { ok: true, characters, clothes, triggers, source: 'civitai', modelName: data.name || '' };
}

/* 本地下的包没有 model_id：拿名字去 C 站找一次，对上就补上 */
export async function guessModelByName(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  const data = await politeFetch('https://civitai.com/api/v1/models?' + new URLSearchParams({
    types: 'LORA', query: q, limit: '6',
  }).toString());
  const items = Array.isArray(data.items) ? data.items : [];
  const norm = (s) => String(s || '').toLowerCase().replace(/[\s_\-\[\]()（）]+/g, '');
  const want = norm(q);
  let best = null;
  for (const m of items) {
    if (m.type !== 'LORA') continue;
    const v = (m.modelVersions || [])[0] || {};
    const score = norm(m.name) === want ? 3
      : (norm(m.name).includes(want) || want.includes(norm(m.name)) ? 2 : 1);
    if (!best || score > best.score) best = { score, model: m, version: v };
  }
  if (!best || best.model.type !== 'LORA') return null;
  return {
    modelId: String(best.model.id),
    versionId: best.version.id ? String(best.version.id) : '',
    modelName: best.model.name || '',
    score: best.score,
    url: `https://civitai.com/models/${best.model.id}${best.version.id ? '?modelVersionId=' + best.version.id : ''}`,
  };
}

/* 模型详情：给界面看的大图 + 版本 + 描述 + 推荐权重 */
function parseWeight(text) {
  const s = String(text || '');
  const m = s.match(/(?:weight|weights|strength|权重|强度)[^\d]{0,12}(0?\.\d+|[01](?:\.\d+)?)/i);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 && v <= 2 ? Number(v.toFixed(2)) : null;
}

export async function getModelDetail(modelId, versionId = '') {
  const id = String(modelId || '').replace(/\D+/g, '');
  if (!id) throw new Error('缺 model id');
  const data = await politeFetch(`https://civitai.com/api/v1/models/${id}`);
  const versions = Array.isArray(data.modelVersions) ? data.modelVersions : [];
  const weight = parseWeight(data.description);
  const images = [];
  for (const v of versions) {
    for (const im of v.images || []) {
      if (!im || !im.url || /\.mp4(\?|$)/i.test(im.url)) continue;
      if (!images.includes(im.url)) images.push(im.url);
      if (images.length >= 12) break;
    }
    if (images.length >= 12) break;
  }
  const plain = htmlToLines(data.description || '').join('\n').slice(0, 4000);
  return {
    id: String(data.id),
    name: data.name || '',
    type: data.type || '',
    nsfw: !!data.nsfw,
    creator: data.creator ? data.creator.username : '',
    stats: data.stats || {},
    tags: Array.isArray(data.tags) ? data.tags : [],
    description: plain,
    images,
    recommendedWeight: weight,
    versionId: String(versionId || ''),
    versions: versions.map((v) => {
      const files = (v.files || []).filter((f) => /\.safetensors$/i.test(String(f.name || '')));
      const primary = files.find((f) => f.primary) || files[0] || null;
      return {
        id: String(v.id),
        name: v.name || '',
        baseModel: v.baseModel || '',
        trainedWords: trainedWordList(v.trainedWords),
        publishedAt: v.publishedAt || '',
        stats: v.stats || {},
        file: primary ? { name: primary.name, sizeKB: primary.sizeKB || 0, downloadUrl: primary.downloadUrl || '' } : null,
      };
    }),
  };
}

/* 网页里直接下载完的文件（存在 lorasRoot 下）：按版本号补全信息、入库、拉预览 */
export async function importDownloadedFile({ versionId, filePath }) {
  const cfg = loadConfig();
  const root = cfg.lorasRoot;
  if (!root || !fs.existsSync(root)) throw new Error('LoRA 目录不存在');
  const abs = path.resolve(String(filePath || ''));
  const rootAbs = path.resolve(root);
  const absLower = abs.toLowerCase();
  const rootLower = rootAbs.toLowerCase();
  if (absLower !== rootLower && !absLower.startsWith(rootLower + path.sep)) throw new Error('文件不在 LoRA 目录里');
  if (!fs.existsSync(abs)) throw new Error('找不到文件：' + abs);
  if (!/\.safetensors$/i.test(abs)) throw new Error('不是 .safetensors');

  let version = null;
  let model = null;
  let detail = null;
  if (versionId) {
    try {
      version = await politeFetch(`https://civitai.com/api/v1/model-versions/${versionId}`);
      model = version.model || {};
      if (model.id) {
        try { detail = await getModelDetail(model.id, version.id); } catch { detail = null; }
      }
    } catch { version = null; }
  }

  const rel = path.relative(rootAbs, abs);
  const recWeight = detail && detail.recommendedWeight ? detail.recommendedWeight : 0.85;
  const tags = detail && Array.isArray(detail.tags) ? detail.tags : [];
  const trainedWords = version ? trainedWordList(version.trainedWords) : [];
  const sourceUrl = model && model.id
    ? `https://civitai.com/models/${model.id}${version.id ? '?modelVersionId=' + version.id : ''}`
    : '';

  const inserted = upsertLora({
    rel_path: rel,
    ...(model && model.name ? { name: String(model.name) } : {}),
    ...(trainedWords.length ? { trigger: trainedWords.join(', ') } : {}),
    ...(tags.length ? { feature_words: tags.join(', ') } : {}),
    ...(version && version.baseModel ? { base_model: version.baseModel } : {}),
    ...(detail && detail.description ? { description: String(detail.description) } : {}),
    ...(sourceUrl ? { source_url: sourceUrl } : {}),
    ...(model && model.id ? { model_id: String(model.id) } : {}),
    ...(version && version.id ? { version_id: String(version.id) } : {}),
    weight: recWeight,
    read_meta: true,
  }, 'civitai-webdownload');

  // 页面信息 + 预览图
  let previewError = '';
  if (inserted && inserted.id) {
    try {
      const conn = db();
      const fresh = conn.prepare('SELECT meta_json FROM lora WHERE id = ?').get(inserted.id);
      let meta = {};
      try { meta = fresh && fresh.meta_json ? JSON.parse(fresh.meta_json) : {}; } catch { meta = {}; }
      meta.civitai = {
        ...(meta.civitai || {}),
        modelId: model && model.id ? String(model.id) : '',
        versionId: version ? String(version.id) : String(versionId || ''),
        creator: model && model.creator && model.creator.username ? model.creator.username : '',
        tags: tags.slice(0, 30),
        trainedWords,
        description: detail ? detail.description : '',
        recommendedWeight: recWeight,
        pageUrl: sourceUrl,
        source: 'webview',
        fetchedAt: new Date().toISOString(),
      };
      conn.prepare('UPDATE lora SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), inserted.id);
    } catch { /* ignore */ }
    const img = detail && detail.images && detail.images.length ? detail.images[0] : '';
    if (img) {
      try {
        const name = await downloadImage(img, inserted.id);
        setPreview(inserted.id, { file: `local:${name}` });
        await makeThumb(inserted.id, path.join(PREVIEW_DIR, name));
      } catch (e) { previewError = e.message; }
    }
  }
  return { ok: true, id: inserted.id, rel_path: rel, previewError };
}

/* 验证 API Key 能不能下载：拿一个已知版本发 HEAD，看返回 401/403 */
export async function checkToken() {
  const token = civitaiAuth();
  if (!token) return { ok: false, reason: '还没填 KEY' };
  try {
    const res = await netFetch('https://civitai.com/api/download/models/1646189', {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(25000),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'KEY 无效或没权限' };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, reason: '网络不通：' + e.message };
  }
}

/* 外部浏览器下载的 .safetensors：拷进 lorasRoot 并入库（不吃登录态，也不吃 KEY） */
export async function importExternalFile(filePath, subdir = 'C站下载') {
  const cfg = loadConfig();
  const root = cfg.lorasRoot;
  if (!root || !fs.existsSync(root)) throw new Error('LoRA 目录不存在');
  const src = path.resolve(String(filePath || ''));
  if (!fs.existsSync(src)) throw new Error('找不到文件：' + src);
  if (!/\.safetensors$/i.test(src)) throw new Error('不是 .safetensors 文件');
  const cleanSub = String(subdir || '')
    .replaceAll('/', '\\')
    .replace(/^\\+|\\+$/g, '')
    .replace(/[:*?"<>|]/g, '')
    .trim();
  if (cleanSub && cleanSub.split('\\').some((s) => !s || s === '.' || s === '..')) {
    throw new Error('目标分类路径不合法');
  }
  const rootAbs = path.resolve(root);
  const dir = path.resolve(rootAbs, cleanSub);
  if (dir !== rootAbs && !dir.toLowerCase().startsWith(rootAbs.toLowerCase() + path.sep)) {
    throw new Error('目标不在 LoRA 目录里');
  }
  fs.mkdirSync(dir, { recursive: true });
  const name = path.basename(src);
  let target = path.join(dir, name);
  if (fs.existsSync(target)) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    for (let i = 1; i < 500; i++) {
      target = path.join(dir, `${base}-${i}${ext}`);
      if (!fs.existsSync(target)) break;
    }
  }
  fs.copyFileSync(src, target);
  const rel = path.relative(root, target);
  const inserted = upsertLora({ rel_path: rel, read_meta: true }, 'browser-download');

  // 触发词本来就在文件头里（read_meta 已读）；C站的标签/权重/预览靠名字去对一次
  let enriched = null;
  if (inserted && inserted.id) {
    try {
      const row = db().prepare('SELECT name, trigger FROM lora WHERE id = ?').get(inserted.id) || {};
      const base = path.basename(src, '.safetensors');
      const tries = [...new Set([
        row.name, base, base.replace(/[_]+/g, ' '),
        String(row.trigger || '').split(',')[0].trim(),
      ].map((s) => String(s || '').trim()).filter(Boolean))];
      let guess = null;
      for (const q of tries) {
        guess = await guessModelByName(q);
        if (guess && guess.score >= 2) break;
        guess = null;
      }
      if (guess) {
        const detail = await getModelDetail(guess.modelId, guess.versionId);
        const ver = (detail.versions || []).find((v) => v.id === String(guess.versionId)) || (detail.versions || [])[0] || null;
        const tags = Array.isArray(detail.tags) ? detail.tags : [];
        const weight = detail.recommendedWeight || 0.85;
        const trainedWords = ver ? trainedWordList(ver.trainedWords) : [];
        const pageUrl = `https://civitai.com/models/${guess.modelId}${ver && ver.id ? '?modelVersionId=' + ver.id : ''}`;
        const conn = db();
        conn.prepare(`UPDATE lora SET model_id = ?, version_id = ?, source_url = ?, base_model = ?,
          description = COALESCE(NULLIF(description,''), ?),
          trigger = COALESCE(NULLIF(trigger,''), ?), feature_words = COALESCE(NULLIF(feature_words,''), ?),
          weight = ?, triggers_synced = 0, updated_at = ? WHERE id = ?`).run(
          String(guess.modelId),
          ver ? String(ver.id) : '',
          pageUrl,
          ver ? (ver.baseModel || '') : '',
          detail.description || '',
          ver && ver.trainedWords && ver.trainedWords.length ? trainedWordList(ver.trainedWords).join(', ') : '',
          tags.length ? tags.join(', ') : '',
          weight,
          new Date().toISOString(),
          inserted.id,
        );
        const fresh = conn.prepare('SELECT meta_json FROM lora WHERE id = ?').get(inserted.id);
        let meta = {};
        try { meta = fresh && fresh.meta_json ? JSON.parse(fresh.meta_json) : {}; } catch { meta = {}; }
        meta.civitai = {
          ...(meta.civitai || {}),
          modelId: String(guess.modelId),
          versionId: ver ? String(ver.id) : '',
          versionName: ver ? (ver.name || '') : '',
          tags: tags.slice(0, 30),
          trainedWords,
          description: detail.description || '',
          recommendedWeight: weight,
          pageUrl,
          source: 'browser-download-guess',
          fetchedAt: new Date().toISOString(),
        };
        conn.prepare('UPDATE lora SET meta_json = ? WHERE id = ?').run(JSON.stringify(meta), inserted.id);
        const img = detail.images && detail.images.length ? detail.images[0] : '';
        if (img) {
          try {
            const imgName = await downloadImage(img, inserted.id);
            setPreview(inserted.id, { file: `local:${imgName}` });
            await makeThumb(inserted.id, path.join(PREVIEW_DIR, imgName));
          } catch { /* 图失败不影响入库 */ }
        }
        try { ensureTriggers(inserted.id); } catch { /* 触发词整理失败不影响入库 */ }
        enriched = { modelName: detail.name, version: ver ? ver.name : '', weight };
      }
    } catch { /* 对不上就留着让用户贴链接补 */ }
  }
  return { ok: true, id: inserted.id, rel_path: rel, file: target, enriched };
}