import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { db } from './db.mjs';
import { listModels, comfyModelNames } from './models.mjs';
import { resolveRelPath, importComfyLoras } from './loras.mjs';
import { trainedWordList } from './safetensors.mjs';
import { comfyNameOf } from './roots.mjs';
import { syncGenLog } from './samples.mjs';
import { addHistory } from './history.mjs';

/* ============================================================================
   出图引擎（直接连 ComfyUI，不依赖外面的 gen.mjs）

   设计给「不想调参数」的人用：
     · 模型只选一个（整包 checkpoint 或分离式底模）
     · LoRA 分四个槽：角色 / 辅助 / 服装 / 画风
     · 词由库里的触发词、特征词、服装词自动拼
     · 可选两段式：第一段出图，第二段换模型 + 换画风 LoRA 图生图
   ========================================================================== */

/* 通用负面：从旧版搬过来的，一直用这套 */
export const DEFAULT_NEG = [
  'lowres', 'worst quality', 'bad anatomy', 'bad hands', 'extra fingers',
  'fused fingers', 'missing fingers', 'deformed limbs', 'extra limbs',
  'extra person', 'watermark', 'text', 'signature', 'censored',
  'mosaic censoring', 'bar censor', 'blurry', 'futanari', '(girl with penis:1.8)',
].join(', ');

const DEFAULT_SIZE = '832x1216';
const MAX_COUNT = 8;
const DENOISE_LEVEL = { light: 0.45, mid: 0.6, strong: 0.75 };

/* LoRA 槽位：给小白看的四个抽屉 */
const SLOT = {
  char: {
    label: '角色',
    where: "l.category IN ('角色','AI娘','自己的')",
    weight: 0.9,
    max: 1,
  },
  aux: {
    label: '辅助',
    where: `l.category NOT IN ('角色','AI娘','自己的','画风','归档','训练-mh13')
      AND l.category NOT LIKE '%服装%'`,
    weight: 0.7,
    max: 8,
  },
  outfit: {
    label: '服装',
    where: "l.category LIKE '%服装%'",
    weight: 0.75,
    max: 1,
  },
  style: {
    label: '画风',
    where: "l.category LIKE '%画风%'",
    weight: 0.8,
    max: 1,
  },
};

/* 服装词：勾了「不要角色原装衣服」时，从特征词里剔掉这些 */
const CLOTHES_RE = /(dress|skirt|shirt|jacket|coat|gloves?|leotard|thighhighs?|pantyhose|pants|shorts|boots?|shoes?|hat|ribbon|choker|uniform|armor|cape|cloak|sleeves?|necktie|apron|corset|stockings|socks|belt|clothing|swimsuit|bikini|underwear|bra\b|panties|scarf|neckerchief|bowtie|\bbow\b|headband|hairband|veil|jewelry|necklace|earrings?|bracelet)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ 槽位检索 ------------------------------ */

const loraCache = new Map();
function loraRow(relPath) {
  const key = String(relPath || '').replaceAll('/', '\\').toLowerCase();
  if (!key) return null;
  if (loraCache.has(key)) return loraCache.get(key);
  const conn = db();
  const row = conn.prepare(`
    SELECT id, name, trigger, feature_words, outfit_words, body_words, negative,
           weight, rel_path, base_model, category, preview
    FROM lora WHERE lower(rel_path) = ? OR lower(replace(rel_path, '/', '\\')) = ?
    LIMIT 1
  `).get(key, key);
  loraCache.set(key, row || null);
  if (loraCache.size > 4000) loraCache.clear();
  return row || null;
}

function trainedWordsOf(metaJson) {
  try {
    const m = JSON.parse(metaJson || '{}');
    return m.civitai ? trainedWordList(m.civitai.trainedWords) : [];
  } catch { return []; }
}

/** 给前端用的四类槽位检索：热门优先，空搜索也给东西看 */
export function slotLoras(slot, { q = '', base = '', limit = 30 } = {}) {
  const def = SLOT[slot];
  if (!def) throw new Error('不认识的槽位：' + slot);
  const where = [`(${def.where})`, "l.status IN ('ok','comfy')", 'l.is_variant = 0'];
  const params = [];

  const kw = String(q || '').trim();
  for (const w of kw.split(/\s+/).filter(Boolean)) {
    const like = `%${w}%`;
    where.push(`(l.name LIKE ? OR l.name_en LIKE ? OR l.name_zh LIKE ? OR l.trigger LIKE ? OR l.aliases LIKE ?
      OR l.rel_path LIKE ?)`);
    params.push(like, like, like, like, like, like);
  }

  /* 选了什么底模就只列这个底模的支；没有就返回空，不拿通用支凑数 */
  if (base === 'anima') where.push("lower(l.base_model) LIKE '%anima%'");
  if (base === 'krea') where.push("lower(l.base_model) LIKE '%krea%'");
  if (base === 'sdxl') {
    where.push(`(lower(l.base_model) LIKE '%sdxl%' OR lower(l.base_model) LIKE '%illustrious%'
      OR lower(l.base_model) LIKE '%pony%' OR lower(l.base_model) LIKE '%noob%' OR lower(l.base_model) LIKE '%wai%')`);
  }

  const sqlWhere = where.join(' AND ');
  const conn = db();
  const total = conn.prepare(`SELECT COUNT(*) c FROM lora l WHERE ${sqlWhere}`).get(...params).c;
  const rows = conn.prepare(`
    SELECT l.id, l.name, l.name_zh, l.trigger, l.feature_words, l.outfit_words, l.rel_path,
           l.base_model, l.category, l.preview, l.weight, l.meta_json,
           COALESCE((SELECT runs FROM usage u WHERE u.lora_id = l.id), 0) AS runs
    FROM lora l
    WHERE ${sqlWhere}
    ORDER BY runs DESC, l.name COLLATE NOCASE ASC
    LIMIT ?
  `).all(...params, Math.min(Math.max(Number(limit) || 30, 1), 100));

  return {
    slot, label: def.label, total, defaultWeight: def.weight,
    items: rows.map((r) => ({
      id: r.id, name: r.name, name_zh: r.name_zh || '', trigger: r.trigger,
      feature_words: r.feature_words, outfit_words: r.outfit_words,
      rel_path: r.rel_path, base_model: r.base_model, category: r.category,
      preview: r.preview, weight: r.weight, runs: r.runs,
      trained_words: trainedWordsOf(r.meta_json),
    })),
  };
}

/* ------------------------------ 模型 ------------------------------ */

export function modelFamily(name) {
  const s = String(name || '').toLowerCase();
  if (/anima|qwen|krea/.test(s)) return 'anima';
  if (/wan2|wan_|wan\./i.test(s)) return 'wan';
  if (/sdxl|noob|illustrious|wai|pony/.test(s)) return 'sdxl';
  return '';
}

export function comfyIsRemote(cfg = loadConfig()) {
  try {
    const host = new URL(String(cfg.comfyUrl || 'http://127.0.0.1:8188')).hostname.toLowerCase();
    return !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host);
  } catch { return false; }
}

async function comfyOnline(cfg) {
  const base = String(cfg.comfyUrl || '').replace(/\/+$/, '');
  if (!base) return false;
  try {
    const r = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch { return false; }
}

let _optCache = null;
let _optAt = 0;

/** 模型 + 默认配置：前端一次拿全 */
export async function genOptions({ force = false } = {}) {
  const cfg = loadConfig();
  const now = Date.now();
  if (!force && _optCache && now - _optAt < 20000) return _optCache;

  const online = await comfyOnline(cfg);
  let comfy = { unets: [], clips: [], vaes: [], checkpoints: [], loras: [] };
  if (online) {
    try { comfy = await comfyModelNames(); } catch { /* 用磁盘列表兜底 */ }
    /* ComfyUI 认得、但本地 loras 目录没扫到的支：先建「只有名字」的记录，
       出图页至少能选到；触发词可以之后在库里补。 */
    try { if (comfy.loras?.length) importComfyLoras(comfy.loras); } catch (e) { console.error('[comfy] 导入 LoRA 名字失败：' + e.message); }
  }
  const disk = listModels();
  const diskNames = (kind) => (disk.models[kind] || []).map((m) => m.rel || m.name);
  const merge = (...lists) => {
    const seen = new Set();
    const out = [];
    for (const raw of lists.flat()) {
      const s = String(raw || '').trim();
      if (!s) continue;
      const k = s.replaceAll('/', '\\').toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  };

  const checkpoints = merge(comfy.checkpoints, diskNames('checkpoint'));
  const unets = merge(comfy.unets, diskNames('unet'));
  const clips = merge(comfy.clips, diskNames('clip'));
  const vaes = merge(comfy.vaes, diskNames('vae'));

  const def = cfg.gen || {};
  _optCache = {
    online,
    remote: comfyIsRemote(cfg),
    comfyUrl: cfg.comfyUrl || '',
    checkpoints,
    unets,
    clips,
    vaes,
    defaults: {
      unet: def.unet || '',
      clip: def.clip || '',
      vae: def.vae || '',
      checkpoint: def.checkpoint || '',
      clipType: def.clipType || 'stable_diffusion',
      sampler: def.sampler || 'euler',
      scheduler: def.scheduler || 'normal',
      outputRoot: def.outputRoot || '',
    },
    counts: {
      checkpoints: checkpoints.length,
      unets: unets.length,
      clips: clips.length,
      vaes: vaes.length,
    },
  };
  _optAt = now;
  return _optCache;
}

/** 名字可能带子目录 / 反斜杠，按 ComfyUI 的列表找最像的那个 */
function matchName(list, wanted) {
  const norm = (s) => String(s || '').replaceAll('/', '\\').toLowerCase();
  const w = norm(wanted);
  const base = norm(path.basename(String(wanted).replaceAll('\\', '/')));
  const arr = (list || []).filter(Boolean);
  return arr.find((x) => norm(x) === w)
    || arr.find((x) => norm(x).endsWith('\\' + w))
    || arr.find((x) => norm(path.basename(String(x).replaceAll('\\', '/'))) === base)
    || null;
}

/* ------------------------------ 词 ------------------------------ */

function splitTags(text) {
  return String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function joinTags(...lists) {
  const out = [];
  const seen = new Set();
  for (const raw of lists.flat()) {
    for (const t of splitTags(raw)) {
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out.join(', ');
}

function negKey(w) {
  return String(w).toLowerCase().replace(/[()]/g, '').split(':')[0].trim();
}

/** 正负冲突清理：同名正面优先；穿衣/裸体、双人/单人互补词也清掉 */
export function cleanNegative(negative, positive) {
  const pos = new Set(splitTags(positive).map(negKey));
  const posText = splitTags(positive).map(negKey).join(', ');
  const posOutfit = /(dress|shirt|skirt|uniform|clothes|outfit|swimsuit|bikini|lingerie|underwear|bra\b|panties|pants|shorts|stockings|boots|shoes|socks)/.test(posText);
  const posNude = /(nude|naked|topless|bottomless)/.test(posText);
  const posTwo = /(1boy|2boys|2girls|yuri|lesbian|hetero|couple|sex|penetration|fellatio|paizuri|handjob|footjob|cunnilingus|doggy style|cowgirl position|missionary|creampie|facial|oral cumshot|deepthroat|group sex)/.test(posText);
  return splitTags(negative).filter((w) => {
    const k = negKey(w);
    if (pos.has(k)) return false;
    /* 正面穿着衣服时不要顺手删掉 nude / topless 这类负面：
       安全模式要靠它们压住裸体，删了等于没写。 */
    if (posNude && /clothed|clothes|dressed|clothing/.test(k)) return false;
    if (posNude && /nude|naked/.test(k)) return false;
    if (/(futanari|girl with penis)/.test(posText) && /(futanari|girl with penis|futa|intersex|disembodied penis)/.test(k)) return false;
    if (posTwo && /^(solo|1girl only|multiple girls)$/.test(k)) return false;
    return true;
  }).join(', ');
}

const dropClothes = (s) => splitTags(s)
  .filter((w) => !CLOTHES_RE.test(w) || /hair\s*(ribbon|bow|band)|headband/i.test(w))
  .join(', ');

function looksLikeGenderTag(text) {
  return /(^|[,(\s])(1girl|1boy|1other|2girls|2boys|multiple girls|multiple boys|female|male|solo)([,\s)]|$)/i.test(text);
}

/* 双人 / 性行为词：命中就不该再补 solo，也不该压 extra person */
const TWO_PERSON_RE = /(^|[,(\s])(1boy|2boys|2girls|yuri|lesbian|male|hetero|couple|sex|penetration|fellatio|paizuri|handjob|footjob|fingering|cunnilingus|doggy style|cowgirl position|girl on top|missionary|side-by-side|creampie|facial|oral cumshot|deepthroat|scissors position|group sex)([,\s)]|$)/i;

const hasTag = (text, re) => re.test(String(text || ''));

/** 一支 LoRA 该带哪些词：用户传了就用用户的，没传才用库里的默认（默认只带一个触发词，别把整串都塞进去） */
function wordsOf(item, row, slot) {
  const trig = item && typeof item.trigger === 'string' ? item.trigger.trim() : '';
  if (trig) return trig;
  if (!row) return '';
  if (slot === 'char') return splitTags(row.trigger)[0] || '';
  if (slot === 'outfit') {
    return splitTags(row.trigger)[0] || splitTags(row.outfit_words).slice(0, 3).join(', ');
  }
  return row.trigger || '';
}

export function charFeatureWords(item, row, keepOriginalClothes) {
  const fromItem = item && typeof item.feature === 'string' ? item.feature.trim() : '';
  const words = fromItem || (row ? splitTags(row.feature_words).slice(0, 8).join(', ') : '');
  if (!words) return '';
  // 默认把角色特征里的服装剥掉：衣服交给服装槽 / 服装 LoRA，别让原装和新衣服打架
  return keepOriginalClothes === true ? words : dropClothes(words);
}

/**
 * 拼正面词。
 * stage：1 或 2。第二段把画风换成第二段的画风支，其余内容不漂。
 */
function buildPrompt(p, stage = 1) {
  const head = [];
  const rawScene = String(p.scene || '');
  const yuri = /(^|[,(\s])(2girls|yuri|lesbian)([,\s)]|$)/i.test(rawScene);
  const futa = /(^|[,(\s])futanari([,\s)]|$)/i.test(rawScene);
  let sceneText = rawScene;
  /* 双女 / 扶她：把 hetero 词里的 1boy 去掉，否则正面同时在说「一男一女」和「两个女生」。 */
  if (yuri) {
    sceneText = sceneText
      .replace(/(^|,\s*)1boy(?=,|$)/gi, '')
      .replace(/(^|,\s*)hetero(?=,|$)/gi, '')
      .replace(/(^|,\s*)1girl(?=,|$)/gi, '')
      .replace(/(^|,\s*)solo(?=,|$)/gi, '');
  } else if (futa) {
    sceneText = sceneText
      .replace(/(^|,\s*)1boy(?=,|$)/gi, '')
      .replace(/(^|,\s*)hetero(?=,|$)/gi, '');
  }
  const twoPerson = TWO_PERSON_RE.test(sceneText.replace(/after\s+sex/gi, 'afterglow'));
  if (twoPerson) {
    if (yuri) {
      if (!hasTag(sceneText, /(^|[,(\s])2girls([,\s)]|$)/i)) head.push('2girls');
      if (!hasTag(sceneText, /(^|[,(\s])(yuri|lesbian)([,\s)]|$)/i)) head.push('yuri');
    } else if (futa) {
      /* 扶她只有一个人，不要再补 1boy/hetero */
      if (!hasTag(sceneText, /(^|[,(\s])1girl([,\s)]|$)/i)) head.push('1girl');
      if (!hasTag(sceneText, /(^|[,(\s])solo([,\s)]|$)/i)) head.push('solo');
    } else {
      // 少了 1boy / hetero，模型会把「骑乘 / 后入」画成单人摆姿势
      if (!hasTag(sceneText, /(^|[,(\s])(1boy|2boys)([,\s)]|$)/i)) head.push('1boy');
      if (!hasTag(sceneText, /(^|[,(\s])(1girl|2girls)([,\s)]|$)/i)) head.push('1girl');
      if (!hasTag(sceneText, /(^|[,(\s])hetero([,\s)]|$)/i)) head.push('hetero');
    }
    // 双人性爱：光有体位词不够，补插入点；双女没有阴茎，别硬补
    if (!yuri && !futa
      && /(cowgirl|missionary|doggy|sex|penetration|standing sex|side-by-side|girl on top|threesome|group sex)/i.test(sceneText)
      && !hasTag(sceneText, /(^|[,(\s])penetration([,\s)]|$)/i)) head.push('penetration');
    if (!yuri
      && /(cowgirl|missionary|doggy|sex|penetration|fellatio|paizuri|handjob|footjob|girl on top|threesome|group sex)/i.test(sceneText)
      && !hasTag(sceneText, /(^|[,(\s])penis([,\s)]|$)/i)) head.push('penis');
  } else if (!looksLikeGenderTag(sceneText)) {
    head.push('1girl, solo');
  }

  const charRow = p.char ? loraRow(p.char.path) : null;
  const tags = [];
  if (p.char) {
    tags.push(wordsOf(p.char, charRow, 'char'));
    tags.push(charFeatureWords(p.char, charRow, p.keepOriginalClothes));
    /* 原装：把角色自己的服装词带上，不然只靠脸和头发，下半身容易裸奔 */
    const charOutfit = (typeof p.char.outfit === 'string' && p.char.outfit.trim())
      || (charRow && charRow.outfit_words)
      || '';
    if (p.keepOriginalClothes && String(charOutfit).trim()) tags.push(String(charOutfit).trim());
  }
  /* 套原装 / 全裸时，服装 LoRA 的触发词会把衣服穿回去；这里也兜一层。 */
  const nudeScene = /(^|[,(\s])(completely nude|nude|naked)([,\s)]|$)/i.test(sceneText);
  if (p.outfit && !p.keepOriginalClothes && !nudeScene) tags.push(wordsOf(p.outfit, loraRow(p.outfit.path), 'outfit'));
  for (const a of p.aux || []) tags.push(wordsOf(a, loraRow(a.path), 'aux'));

  if (stage === 1) {
    if (p.style) tags.push(wordsOf(p.style, loraRow(p.style.path), 'style'));
    if (sceneText) tags.push(sceneText);
  } else {
    // 第二段：第一段的画风词不带了，换成第二段画风 + 第二段补充描述
    if (p.twoPass?.style) tags.push(wordsOf(p.twoPass.style, loraRow(p.twoPass.style.path), 'style'));
    if (sceneText) tags.push(sceneText);
    if (p.twoPass?.scene) tags.push(p.twoPass.scene);
  }

  return joinTags(head.join(', '), tags.join(', '));
}

function buildNegative(p) {
  const charRow = p.char ? loraRow(p.char.path) : null;
  // 双人场景里 extra person 会把第二个人压掉，只留一个
  const twoPerson = TWO_PERSON_RE.test(String(p.scene || '').replace(/after\s+sex/gi, 'afterglow'));
  const stripExtra = (s) => String(s || '').replace(/(^|,\s*)extra person(?=,|$)/i, '');
  const base = twoPerson ? stripExtra(DEFAULT_NEG) : DEFAULT_NEG;
  const userNeg = twoPerson ? stripExtra(p.negative) : (p.negative || '');
  const charNeg = twoPerson ? stripExtra(charRow?.negative) : (charRow?.negative || '');
  const negOf = (item) => (item ? stripExtra(loraRow(item.path)?.negative || '') : '');
  const outfitNeg = negOf(p.outfit);
  const auxNeg = (p.aux || []).map(negOf).filter(Boolean).join(', ');
  const styleNeg = negOf(p.style);
  const merged = joinTags(base, charNeg, outfitNeg, auxNeg, styleNeg, userNeg);
  return cleanNegative(merged, buildPrompt(p, 1));
}

/* ------------------------------ ComfyUI 通信 ------------------------------ */

function comfyBase(cfg) {
  return String(cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/+$/, '');
}

async function comfyJson(base, urlPath, { method = 'GET', body, timeout = 30000 } = {}) {
  const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const r = await fetch(base + urlPath, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await r.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    if (parsed && parsed.error) msg += '：' + (parsed.error.message || JSON.stringify(parsed.error)).slice(0, 400);
    else if (typeof parsed === 'string') msg += '：' + parsed.slice(0, 400);
    // 节点报错更具体，比如种子/模型名不存在
    if (parsed && parsed.node_errors) {
      const first = Object.values(parsed.node_errors)[0];
      if (first && first.errors && first.errors[0]) msg += `（节点 ${first.class_type || ''}：${first.errors[0].message || ''}）`;
    }
    throw new Error(msg);
  }
  return parsed;
}

async function objectInfoList(base, node, field) {
  try {
    const j = await comfyJson(base, `/object_info/${node}`, { timeout: 8000 });
    const list = j?.[node]?.input?.required?.[field]?.[0];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

/* ------------------------------ 工作流 ------------------------------ */

function buildWorkflow(s, prefix) {
  const wf = {};
  let nid = 1;
  const add = (class_type, inputs) => { const id = String(nid++); wf[id] = { class_type, inputs }; return id; };

  let modelRef, clipRef, vaeRef;
  if (s.model.kind === 'checkpoint') {
    const n = add('CheckpointLoaderSimple', { ckpt_name: s.model.name });
    modelRef = [n, 0]; clipRef = [n, 1]; vaeRef = [n, 2];
  } else {
    const un = add('UNETLoader', { unet_name: s.model.name, weight_dtype: 'default' });
    const cl = add('CLIPLoader', { clip_name: s.clip, type: s.clipType || 'stable_diffusion' });
    const va = add('VAELoader', { vae_name: s.vae });
    modelRef = [un, 0]; clipRef = [cl, 0]; vaeRef = [va, 0];
  }

  for (const l of s.loras) {
    const n = add('LoraLoader', {
      lora_name: l.name,
      strength_model: l.weight,
      strength_clip: l.weight,
      model: modelRef,
      clip: clipRef,
    });
    modelRef = [n, 0]; clipRef = [n, 1];
  }

  /* v-pred 底模：采样参数化切到 v_prediction，否则出纯色/条纹 */
  if (s.vpred) {
    const ms = add('ModelSamplingDiscrete', { model: modelRef, sampling: 'v_prediction', zsnr: false });
    modelRef = [ms, 0];
  }

  const pos = add('CLIPTextEncode', { text: s.prompt, clip: clipRef });
  const neg = add('CLIPTextEncode', { text: s.negative, clip: clipRef });

  let latentRef;
  if (s.initImage) {
    const img = add('LoadImage', { image: s.initImage });
    const enc = add('VAEEncode', { pixels: [img, 0], vae: vaeRef });
    latentRef = [enc, 0];
  } else {
    const lat = add('EmptyLatentImage', { width: s.width, height: s.height, batch_size: 1 });
    latentRef = [lat, 0];
  }

  const ks = add('KSampler', {
    seed: s.seed,
    steps: s.steps,
    cfg: s.cfg,
    sampler_name: s.sampler,
    scheduler: s.scheduler,
    denoise: s.denoise,
    model: modelRef,
    positive: [pos, 0],
    negative: [neg, 0],
    latent_image: latentRef,
  });
  const dec = add('VAEDecode', { samples: [ks, 0], vae: vaeRef });
  add('SaveImage', { images: [dec, 0], filename_prefix: prefix });
  return wf;
}

function firstImage(history) {
  const outs = history.outputs || {};
  for (const nodeId of Object.keys(outs)) {
    const imgs = outs[nodeId].images;
    if (Array.isArray(imgs) && imgs.length) {
      return imgs.find((i) => i.type === 'output' || !i.type) || imgs[0];
    }
  }
  return null;
}

async function submitAndWait(base, wf, ctx) {
  const submitted = await comfyJson(base, '/prompt', {
    method: 'POST',
    body: { prompt: wf, client_id: 'lora-library' },
    timeout: 30000,
  });
  const promptId = submitted?.prompt_id;
  if (!promptId) throw new Error('提交失败：ComfyUI 没给任务号');

  const t0 = Date.now();
  for (let i = 0; i < 1200; i++) {   // 最多等 10 分钟
    if (ctx.cancelled()) {
      await comfyJson(base, '/interrupt', { method: 'POST', body: {} }).catch(() => {});
      throw new Error('已取消');
    }
    await sleep(500);
    const h = await comfyJson(base, `/history/${promptId}`, { timeout: 15000 });
    const hist = h && h[promptId];
    if (!hist) continue;
    const st = hist.status || {};
    if (st.status_str === 'error' || st.completed === false) {
      const detail = JSON.stringify(st.messages || st).slice(0, 800);
      throw new Error('出图失败：' + detail);
    }
    const img = firstImage(hist);
    if (!img) throw new Error('ComfyUI 跑完了但没找到输出图');
    return { img, promptId, elapsed: (Date.now() - t0) / 1000 };
  }
  throw new Error('等超时了（10 分钟没出结果）—— 去 ComfyUI 看看是不是卡在加载模型');
}

/* ------------------------------ 文件 & 台账 ------------------------------ */

function outputPath(cfg, img) {
  const root = cfg.gen?.outputRoot || '';
  if (!root) return null;
  return img.subfolder ? path.join(root, img.subfolder, img.filename) : path.join(root, img.filename);
}

async function readOutputImage(base, cfg, img) {
  const local = outputPath(cfg, img);
  if (local && fs.existsSync(local)) return { buf: fs.readFileSync(local), local };
  const q = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=output`;
  const r = await fetch(base + q, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('读不到第一段出的图（HTTP ' + r.status + '）');
  const buf = Buffer.from(await r.arrayBuffer());
  if (local) {
    try { fs.mkdirSync(path.dirname(local), { recursive: true }); fs.writeFileSync(local, buf); } catch { /* ignore */ }
  }
  return { buf, local };
}

async function uploadInputImage(base, buf, name) {
  const fd = new FormData();
  fd.append('image', new Blob([buf], { type: 'image/png' }), name);
  fd.append('overwrite', 'true');
  fd.append('type', 'input');
  const r = await fetch(base + '/upload/image', { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) });
  const text = await r.text();
  if (!r.ok) throw new Error('图生图上传失败：' + text.slice(0, 300));
  let j = {};
  try { j = JSON.parse(text); } catch { throw new Error('上传返回看不懂：' + text.slice(0, 200)); }
  if (!j.name) throw new Error('上传没拿到文件名');
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

function appendGenLog(cfg, rec) {
  if (!cfg.genLogPath) return;
  try {
    fs.mkdirSync(path.dirname(cfg.genLogPath), { recursive: true });
    fs.appendFileSync(cfg.genLogPath, JSON.stringify(rec) + '\n', 'utf8');
  } catch (e) {
    console.error('[gen-log] 写台账失败：' + e.message);
  }
}

/* ------------------------------ 入参整理 ------------------------------ */

function parseModel(value, fallbackClip, fallbackVae, fallbackType) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const i = raw.indexOf(':');
  const kind = i > 0 ? raw.slice(0, i).toLowerCase() : 'unet';
  const name = i > 0 ? raw.slice(i + 1) : raw;
  if (kind === 'checkpoint' || kind === 'ckpt') return { kind: 'checkpoint', name };
  return { kind: 'unet', name, clip: fallbackClip, vae: fallbackVae, clipType: fallbackType };
}

function normalizeLora(item) {
  if (!item) return null;
  const rel = item.path || item.rel_path;
  if (!rel) return null;
  const w = Number(item.weight);
  const out = {
    path: String(rel),
    weight: Number.isFinite(w) ? Math.min(Math.max(w, 0), 2) : null,
  };
  // 空字符串 = 用户明确不要这组词；undefined = 用库里的
  if (typeof item.trigger === 'string') out.trigger = item.trigger.trim();
  if (typeof item.feature === 'string') out.feature = item.feature.trim();
  if (typeof item.outfit === 'string') out.outfit = item.outfit.trim();
  return out;
}

function normalizePayload(input) {
  const cfg = loadConfig();
  const def = cfg.gen || {};
  const size = String(input.size || DEFAULT_SIZE).toLowerCase();
  const m = size.match(/^(\d+)\s*x\s*(\d+)$/);
  if (!m) throw new Error('尺寸格式不对，要 832x1216 这样');
  const width = Number(m[1]);
  const height = Number(m[2]);

  const clip = String(input.clip || def.clip || '').trim();
  const vae = String(input.vae || def.vae || '').trim();
  let clipType = String(input.clipType || def.clipType || 'stable_diffusion').trim();
  /* Krea2 底模默认要 krea2 类型；用户手动指定了别的类型就尊重，不强行覆盖 */
  if (/krea/i.test(String(input.model || '')) && /^(|stable_diffusion)$/i.test(clipType)) clipType = 'krea2';

  const model = parseModel(input.model, clip, vae, clipType);
  if (!model) throw new Error('还没选模型');
  /* v-pred 底模（NoobAI-XL-VPred 这类）要按 v_prediction 采样，否则出来是纯色/条纹 */
  const sampPref = String(input.modelSampling || 'auto').toLowerCase();
  const vpred = sampPref === 'v_prediction'
    || (sampPref !== 'eps' && /v[-_ ]?pred/i.test(String(input.model || '')));
  if (model.kind === 'unet' && (!model.clip || !model.vae)) {
    throw new Error('分离式出图要文本编码器和 VAE —— 去设置里选一下，或在出图面板的高级里填');
  }

  const char = normalizeLora(input.char);
  const outfit = normalizeLora(input.outfit);
  const style = normalizeLora(input.style);
  const aux = (Array.isArray(input.aux) ? input.aux : []).map(normalizeLora).filter(Boolean).slice(0, SLOT.aux.max);

  const count = Math.min(Math.max(Number(input.count) || 1, 1), MAX_COUNT);
  const steps = Math.min(Math.max(Number(input.steps) || 28, 1), 80);
  const cfgScale = Math.min(Math.max(Number(input.cfg) || 4, 1), 20);
  const seedInput = Number(input.seed);
  const seed = Number.isFinite(seedInput) && seedInput >= 0 ? Math.floor(seedInput) : -1;
  const sampler = String(input.sampler || def.sampler || 'euler');
  const scheduler = String(input.scheduler || def.scheduler || 'normal');
  let workflow = null;
  if (input.workflow !== undefined && input.workflow !== null) {
    if (typeof input.workflow !== 'object' || Array.isArray(input.workflow)) throw new Error('工作流必须是 API JSON 对象');
    const nodes = Object.values(input.workflow).filter((n) => n && typeof n === 'object' && n.class_type);
    if (!nodes.length) throw new Error('工作流里没有可用节点（要 ComfyUI 的 Save (API) JSON）');
    workflow = input.workflow;
  }

  let twoPass = null;
  const tp = input.twoPass || {};
  if (tp.enable) {
    const tpModel = parseModel(tp.model, clip, vae, clipType);
    const tpStyle = normalizeLora(tp.style);
    const strength = DENOISE_LEVEL[tp.strength] ? tp.strength : 'mid';
    twoPass = {
      model: tpModel,
      style: tpStyle,
      denoise: DENOISE_LEVEL[strength],
      scene: String(tp.scene || '').trim(),
      steps: Math.min(Math.max(Number(tp.steps) || steps, 1), 80),
      cfg: Math.min(Math.max(Number(tp.cfg) || cfgScale, 1), 20),
    };
  }

  return {
    model,
    clip, vae, clipType, vpred,
    char, outfit, style, aux,
    scene: String(input.scene || '').trim(),
    negative: String(input.negative || '').trim(),
    keepOriginalClothes: input.keepOriginalClothes === true,
    width, height, size: `${width}x${height}`,
    steps, cfg: cfgScale, seed, count, sampler, scheduler,
    workflow,
    variants: Array.isArray(input.variants) ? input.variants : [],
    twoPass,
  };
}

/* ------------------------------ 自定义工作流 ------------------------------ */

const WF_TOKEN_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

function workflowTokens(p, seed) {
  return {
    prompt: String(p.scene || ''),
    negative: String(p.negative || ''),
    seed: String(seed),
    steps: String(p.steps),
    cfg: String(p.cfg),
    width: String(p.width),
    height: String(p.height),
    sampler: p.sampler || '',
    scheduler: p.scheduler || '',
    model: p.model ? String(p.model.name || '') : '',
    clip: String(p.clip || ''),
    vae: String(p.vae || ''),
  };
}

export function fillCustomWorkflow(wf, p, seed) {
  const tokens = workflowTokens(p, seed);
  const walk = (v) => {
    if (typeof v === 'string') {
      const exact = v.trim().match(/^\{\{\s*([a-zA-Z_]+)\s*\}\}$/);
      if (exact && tokens[exact[1]] !== undefined) {
        const raw = tokens[exact[1]];
        return /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
      }
      return v.replace(WF_TOKEN_RE, (m, k) => (tokens[k] !== undefined ? tokens[k] : m));
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(JSON.parse(JSON.stringify(wf)));
}

export function unknownWorkflowTokens(wf) {
  const text = JSON.stringify(wf || {});
  const known = new Set(['prompt', 'negative', 'seed', 'steps', 'cfg', 'width', 'height', 'sampler', 'scheduler', 'model', 'clip', 'vae']);
  const unknown = new Set();
  for (const m of text.matchAll(WF_TOKEN_RE)) {
    if (!known.has(m[1])) unknown.add(m[1]);
  }
  return [...unknown];
}



export async function runGenerate(ctx, payload) {
  const cfg = loadConfig();
  const base = comfyBase(cfg);
  const p = normalizePayload(payload || {});
  const twoPass = p.twoPass;
  loraCache.clear();

  const variants = Array.isArray(p.variants) ? p.variants.filter((v) => v && v.extra) : [];
  const runCount = variants.length ? variants.length : p.count;
  ctx.setTotal(runCount * (twoPass ? 2 : 1));
  ctx.log(`模型：${p.model.name}${twoPass ? ' → ' + (twoPass.model?.name || p.model.name) : ''}`);

  try {
    await comfyJson(base, '/system_stats', { timeout: 5000 });
  } catch (e) {
    throw new Error(`出图服务没开（${base}）—— 先打开 Comfy Desktop，回来再点一次出图。${e.message}`);
  }

  // ComfyUI 认识的名字：模型 / LoRA 都得对得上
  const [ckpts, unets, clips, vaes, loras] = await Promise.all([
    objectInfoList(base, 'CheckpointLoaderSimple', 'ckpt_name'),
    objectInfoList(base, 'UNETLoader', 'unet_name'),
    objectInfoList(base, 'CLIPLoader', 'clip_name'),
    objectInfoList(base, 'VAELoader', 'vae_name'),
    objectInfoList(base, 'LoraLoader', 'lora_name'),
  ]);

  const fixModel = (model) => {
    if (!model) return null;
    const list = model.kind === 'checkpoint' ? ckpts : unets;
    if (!list.length) return model;   // 拿不到列表就不硬卡
    const hit = matchName(list, model.name);
    if (!hit) {
      const kindName = model.kind === 'checkpoint' ? '整包模型' : '底模';
      throw new Error(`ComfyUI 不认识这个${kindName}：${model.name} —— 去「模型」里看看它是不是没放进 ComfyUI 的模型目录`);
    }
    if (model.kind === 'unet') {
      let clip = model.clip, vae = model.vae;
      if (clips.length) {
        const c = matchName(clips, clip);
        if (!c) throw new Error(`ComfyUI 不认识这个文本编码器：${clip} —— 去设置里换一个`);
        clip = c;
      }
      if (vaes.length) {
        const v = matchName(vaes, vae);
        if (!v) throw new Error(`ComfyUI 不认识这个 VAE：${vae} —— 去设置里换一个`);
        vae = v;
      }
      return { ...model, name: hit, clip, vae };
    }
    return { ...model, name: hit };
  };
  const m1 = fixModel(p.model);
  const m2 = twoPass ? fixModel(twoPass.model || p.model) : null;

  const fixLora = (item) => {
    if (!item) return null;
    const wanted = comfyNameOf(item.path);
    if (!loras.length) return { ...item, name: wanted.replaceAll('/', '\\') };
    const hit = matchName(loras, wanted);
    if (!hit) {
      throw new Error(`ComfyUI 不认识这支 LoRA：${wanted} —— 可能它不在 ComfyUI 的 loras 目录里`);
    }
    return { ...item, name: hit };
  };
  const char = fixLora(p.char);
  const outfit = fixLora(p.outfit);
  const style = fixLora(p.style);
  const aux = p.aux.map(fixLora).filter(Boolean);
  const tpStyle = twoPass ? fixLora(twoPass.style) : null;

  const lorasOf = (stage) => {
    const list = [];
    if (char) list.push(char);
    for (const a of aux) list.push(a);
    if (outfit) list.push(outfit);
    if (stage === 1 && style) list.push(style);
    if (stage === 2 && tpStyle) list.push(tpStyle);
    return list.map((l) => {
      const row = loraRow(l.path);
      return { ...l, name: l.name, weight: l.weight ?? row?.weight ?? 0.85 };
    });
  };

  const charName = p.char ? (loraRow(p.char.path)?.name || path.basename(p.char.path, '.safetensors')) : '';
  const outputs = [];
  ctx.job.outputs = outputs;

  const baseSeed = p.seed >= 0 ? p.seed : Math.floor(Math.random() * 2 ** 32);
  const stamp = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const safeName = String(charName || '无角色').replace(/[\\/:*?"<>|]/g, '-').trim() || '无角色';
  const prefixBase = `${safeName}-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;

  for (let i = 0; i < runCount; i++) {
    if (ctx.cancelled()) return;
    const variant = variants[i] || null;
    const p2 = variant ? { ...p, scene: joinTags(p.scene, variant.extra) } : p;
    const seed = (baseSeed + i) >>> 0;
    const prefix = `${prefixBase}-${i + 1}`;
    let elapsed = 0;
    let finalImg;

    // ---------- 第一段 ----------
    const prompt1 = buildPrompt(p2, 1);
    if (!String(prompt1).trim()) throw new Error('没拼出词来：选个角色、写一句想画什么，或者挂一支辅助 LoRA');
    const wf1 = p.workflow
      ? fillCustomWorkflow(p.workflow, p2, seed)
      : buildWorkflow({
        model: m1, clip: m1.clip || p.clip, vae: m1.vae || p.vae, clipType: p.clipType,
        loras: lorasOf(1), prompt: prompt1, negative: buildNegative(p2),
        seed, steps: p.steps, cfg: p.cfg, sampler: p.sampler, scheduler: p.scheduler,
        width: p.width, height: p.height, denoise: 1,
      }, prefix);

    ctx.log(`第 ${i + 1}/${runCount} 张 · 第一段出图…`);
    const first = await submitAndWait(base, wf1, ctx);
    elapsed += first.elapsed;
    finalImg = first.img;
    ctx.tick(true, `第 ${i + 1} 张出了（${first.elapsed.toFixed(1)}s）`);

    // ---------- 第二段：图生图转画风 ----------
    let pass2Error = '';
    if (twoPass && !p.workflow) {
      if (ctx.cancelled()) return;
      try {
        ctx.log(`第 ${i + 1} 张 · 第二段：换 ${(m2 || m1).name} 转画风…`);
        const { buf } = await readOutputImage(base, cfg, first.img);
        const initName = await uploadInputImage(base, buf, `lora-lib-${Date.now()}-${i}.png`);
        const prompt2 = buildPrompt(p2, 2);
        const wf2 = buildWorkflow({
          model: m2 || m1, clip: (m2 || m1).clip || p.clip, vae: (m2 || m1).vae || p.vae, clipType: p.clipType,
          loras: lorasOf(2), prompt: prompt2, negative: buildNegative(p2),
          seed: (seed + 1) >>> 0, steps: twoPass.steps, cfg: twoPass.cfg,
          sampler: p.sampler, scheduler: p.scheduler,
          width: p.width, height: p.height, denoise: twoPass.denoise,
          initImage: initName,
        }, `${prefix}-2`);
        const second = await submitAndWait(base, wf2, ctx);
        elapsed += second.elapsed;
        finalImg = second.img;
        ctx.tick(true, `第 ${i + 1} 张转完画风（${second.elapsed.toFixed(1)}s）`);
      } catch (e) {
        pass2Error = e.message || '第二段失败';
        finalImg = first.img;
        ctx.log(`第 ${i + 1} 张 · 第二段失败，保留第一段：${pass2Error}`);
      }
    }

    const outPath = outputPath(cfg, finalImg);
    if (outPath && !fs.existsSync(outPath)) {
      // 目录对不上就从 ComfyUI 拉一份，别让结果墙空着
      try {
        const { buf } = await readOutputImage(base, cfg, finalImg);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, buf);
      } catch { /* 图还在 ComfyUI output 里，至少能靠 /view 看 */ }
    }

    const loraRecords = [...lorasOf(1), ...(twoPass && !pass2Error ? lorasOf(2) : [])]
      .map((l) => `${l.path.replaceAll('/', '\\')}:${l.weight}`);
    const uniqLora = [...new Set(loraRecords)];

    const rec = {
      t: new Date().toISOString(),
      by: 'app',
      file: outPath || '',
      kind: '作品',
      chars: charName,
      note: twoPass ? (pass2Error ? '出图 · 两段转画风（第二段失败，保留第一段）' : '出图 · 两段转画风') : '出图',
      ...(m1.kind === 'checkpoint' ? { checkpoint: m1.name } : { unet: m1.name }),
      ...(m1.kind === 'unet' ? { clip: p.clip, vae: p.vae, clip_type: p.clipType } : {}),
      lora: uniqLora,
      steps: p.steps, cfg: p.cfg, size: p.size, seed,
      sampler: p.sampler, scheduler: p.scheduler,
      prompt: p.workflow ? String(p2.scene || '') : buildPrompt(p2, 1),
      negative: p.workflow ? String(p2.negative || '') : buildNegative(p2),
      elapsed_s: Number(elapsed.toFixed(1)),
      ...(twoPass ? {
        pass2: {
          model: (m2 || m1).name, checkpoint: (m2 || m1).kind === 'checkpoint' ? (m2 || m1).name : undefined,
          unet: (m2 || m1).kind === 'unet' ? (m2 || m1).name : undefined,
          loras: lorasOf(2).map((l) => ({ name: l.path, weight: l.weight })),
          denoise: twoPass.denoise,
          prompt: buildPrompt(p2, 2),
          ...(pass2Error ? { error: pass2Error } : {}),
        },
      } : {}),
    };
    appendGenLog(cfg, rec);

    outputs.push({
      out: outPath || '',
      file: finalImg.filename,
      subfolder: finalImg.subfolder || '',
      seed,
      elapsed_s: Number(elapsed.toFixed(1)),
      twoPass: !!twoPass,
      pass2: rec.pass2 || null,
      prompt: rec.prompt,
      negative: rec.negative,
      loras: uniqLora,
    });
    // 出图历史落库：界面会再写一次（带完整 spec），这里兜 API/CLI 直接出图的情况
    try {
      addHistory([{
        at: rec.t,
        out: outPath || ('comfy:' + finalImg.filename + '|' + (finalImg.subfolder || '')),
        file: finalImg.filename,
        subfolder: finalImg.subfolder || '',
        seed,
        prompt: rec.prompt,
        negative: rec.negative,
        loras: uniqLora,
        elapsed_s: Number(elapsed.toFixed(1)),
        spec: { source: 'engine' },
      }]);
    } catch { /* 历史写失败不影响出图 */ }
    ctx.log(`第 ${i + 1} 张完成：${outPath || finalImg.filename}`);
  }

  try { syncGenLog(null, { quiet: true }); } catch { /* 台账监听会补 */ }
}

/** 出图前预检：服务、底模、LoRA、词、出图目录，一次把能拦的先拦下来 */
export async function precheckGenerate(payload) {
  const cfg = loadConfig();
  const base = comfyBase(cfg);
  const problems = [];
  const warnings = [];
  const p = normalizePayload(payload || {});
  const variants = Array.isArray(p.variants) ? p.variants.filter((v) => v && v.extra) : [];
  const runCount = variants.length ? variants.length : p.count;
  const totalTasks = runCount * (p.twoPass ? 2 : 1);

  try {
    await comfyJson(base, '/system_stats', { timeout: 4000 });
  } catch {
    return {
      ok: false,
      comfyUrl: base,
      problems: [`出图服务没开（${base}）—— 先打开 Comfy Desktop，或点「启动 ComfyUI」`],
      warnings,
      count: runCount,
      totalTasks,
    };
  }

  const [ckpts, unets, clips, vaes, loras] = await Promise.all([
    objectInfoList(base, 'CheckpointLoaderSimple', 'ckpt_name'),
    objectInfoList(base, 'UNETLoader', 'unet_name'),
    objectInfoList(base, 'CLIPLoader', 'clip_name'),
    objectInfoList(base, 'VAELoader', 'vae_name'),
    objectInfoList(base, 'LoraLoader', 'lora_name'),
  ]);

  const checkModel = (model, label) => {
    if (!model) return;
    const list = model.kind === 'checkpoint' ? ckpts : unets;
    if (list.length && !matchName(list, model.name)) {
      problems.push(`${label} ComfyUI 里没有：${model.name}`);
    }
    if (model.kind === 'unet') {
      if (clips.length && !matchName(clips, model.clip)) problems.push(`文本编码器没有：${model.clip}`);
      if (vaes.length && !matchName(vaes, model.vae)) problems.push(`VAE 没有：${model.vae}`);
    }
  };
  checkModel(p.model, '底模');
  if (p.twoPass) checkModel(p.twoPass.model || p.model, '第二段底模');

  const checkLora = (item, label) => {
    if (!item) return;
    if (!loras.length) return;
    const wanted = comfyNameOf(item.path);
    if (!matchName(loras, wanted)) problems.push(`${label} LoRA 不在 ComfyUI 里：${wanted}`);
  };
  checkLora(p.char, '角色');
  checkLora(p.outfit, '服装');
  checkLora(p.style, '画风');
  for (const a of p.aux) checkLora(a, '辅助');
  if (p.twoPass) checkLora(p.twoPass.style, '第二段画风');

  // —— 语义冲突（从旧版预检搬过来的几条）——
  const fam = (s) => modelFamily(String(s || ''));
  const modelFam = fam(p.model && p.model.name);
  const fitName = String((p.model && p.model.name) || '');
  if (fitName) {
    if (fam(fitName) === 'wan') {
      if (!/umt5/i.test(String(p.clip || ''))) problems.push('Wan 模型要配 umt5 clip（当前 clip：' + (p.clip || '空') + '）');
      if (!/wan/i.test(String(p.vae || ''))) problems.push('Wan 模型要配 wan vae（当前 vae：' + (p.vae || '空') + '）');
    } else if (fam(fitName) === 'anima') {
      if (p.clip && !/qwen/i.test(String(p.clip))) problems.push('Anima 模型要配 qwen clip（当前 clip：' + p.clip + '）');
      if (p.vae && !/qwen/i.test(String(p.vae))) problems.push('Anima 模型要配 qwen vae（当前 vae：' + p.vae + '）');
    }
    if (/wan|hunyuan|video|svd|i2v/i.test(fitName)) warnings.push('这个模型像视频模型，出图可能失败：' + fitName);
  }
  const loraBase = (item) => {
    if (!item) return '';
    if (item.base) return String(item.base);
    try { const row = loraRow(item.path); return row && row.base_model ? String(row.base_model) : ''; } catch { return ''; }
  };
  const checkFam = (item, label, baseFam) => {
    if (!item) return;
    const f = fam(loraBase(item) || item.path);
    if (baseFam && f && f !== baseFam) {
      warnings.push(`${label} LoRA 是 ${f} 底模，和底模 ${baseFam} 可能不兼容：${item.path}`);
    }
  };
  checkFam(p.char, '角色', modelFam);
  checkFam(p.outfit, '服装', modelFam);
  checkFam(p.style, '画风', modelFam);
  for (const a of p.aux) checkFam(a, '辅助', modelFam);
  if (p.twoPass) {
    const tpName = String((p.twoPass.model || p.model || {}).name || '');
    if (/wan|hunyuan|video|svd|i2v/i.test(tpName)) problems.push('第二段模型像视频模型，转画风可能失败：' + tpName);
    checkFam(p.twoPass.style, '第二段画风', fam(tpName));
  }

  const ADULT_WORDS = ['nsfw', 'sex', 'nude', 'naked', 'penis', 'pussy', 'cum', 'creampie', 'paizuri', 'fellatio', 'ahegao', 'masturbation', 'orgasm', 'spread legs', 'doggystyle', 'cowgirl position', 'sex from behind'];
  /* 只扫正面：默认负面里本来就写着 (girl with penis:1.8) 这种防串味的词，
     连负面一起扫会把「防它们出现」误报成「你想画它们」。 */
  const allText = String(p.scene || '').toLowerCase();
  const adultHit = ADULT_WORDS.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(allText));
  if (!payload.r18 && adultHit.length) {
    warnings.push(`R18 没开，但正面词里有：${adultHit.slice(0, 4).join(' / ')} —— 出图时可能被清掉`);
  }
  const nudeHit = /completely nude|\bnude\b|\bnaked\b|nudity/.test(allText);
  const clothHit = /shirt|skirt|dress|sweater|uniform|stockings|pantyhose|lingerie|jeans|shorts|coat|jacket|robe|kimono/.test(allText);
  if (nudeHit && clothHit) warnings.push('裸体词和服装词同时出现，服装可能不生效');
  if (p.keepOriginalClothes && p.outfit) warnings.push('勾了「角色原装」又挂了服装 LoRA，服装支不会生效');
  /* 原装但库里没写服装词：衣服会全靠模型猜，提前提醒，别等出图才发现光着 */
  if (p.char && p.keepOriginalClothes) {
    const row = loraRow(p.char.path);
    const feature = (typeof p.char.feature === 'string' && p.char.feature.trim()) || (row && row.feature_words) || '';
    const outfit = (typeof p.char.outfit === 'string' && p.char.outfit.trim()) || (row && row.outfit_words) || '';
    if (!String(outfit).trim() && !CLOTHES_RE.test(String(feature))) {
      warnings.push('这支角色库里的服装词是空的，「原装」只会有头发和脸，衣服靠模型猜；不稳就选个服装支');
    }
  }
  /* 没有触发词的支：挂上等于白挂 */
  const noTrigger = (item) => {
    if (!item) return false;
    if (typeof item.trigger === 'string' && item.trigger.trim()) return false;
    const row = loraRow(item.path);
    return !(row && String(row.trigger || '').trim());
  };
  if (noTrigger(p.outfit)) warnings.push('这支服装支没有触发词，挂上可能看不出效果');
  for (const a of p.aux || []) {
    if (!noTrigger(a)) continue;
    /* 滑块类本来就没触发词，靠权重起作用，别误报 */
    const row = loraRow(a.path);
    const nm = `${row && row.name || ''} ${row && row.rel_path || a.path}`.toLowerCase();
    if (/slider|滑块/.test(nm)) continue;
    warnings.push('有辅助支没有触发词，挂上可能看不出效果');
  }

  let finalPrompt = '';
  let finalNegative = '';
  try {
    finalPrompt = buildPrompt(p, 1);
    finalNegative = buildNegative(p);
    if (!String(finalPrompt).trim()) problems.push('没拼出词：选个角色、写一句想画什么，或者挂一支辅助 LoRA');
  } catch (e) {
    problems.push('拼词出错：' + e.message);
  }

  const outRoot = (cfg.gen && cfg.gen.outputRoot) || '';
  if (!outRoot) warnings.push('没配出图目录：图只会留在 ComfyUI 的 output 里');
  else {
    try { if (!fs.existsSync(outRoot)) warnings.push('出图目录不存在：' + outRoot); } catch { /* ignore */ }
  }
  if (runCount > 1) warnings.push(`这次要出 ${runCount} 张（${totalTasks} 个阶段），别急着关`);
  if (p.twoPass) warnings.push('两段式会多跑一遍，时间大概翻倍');

  if (p.workflow) {
    const unknown = unknownWorkflowTokens(p.workflow);
    if (unknown.length) problems.push('工作流里有不认识的占位符：' + unknown.map((t) => '{{' + t + '}}').join(' '));
    const nodeCount = Object.values(p.workflow).filter((n) => n && typeof n === 'object' && n.class_type).length;
    warnings.push(`使用自定义工作流（${nodeCount} 个节点）：模型/LoRA 槽只用于替换占位符，不会被自动挂载`);
  }

  return {
    ok: problems.length === 0,
    comfyUrl: base,
    problems,
    warnings,
    count: runCount,
    totalTasks,
    prompt: finalPrompt,
    negative: finalNegative,
  };
}

/** 出图前瞧一眼 ComfyUI 起没起、默认模型在不在 */
export async function genReadiness() {
  const cfg = loadConfig();
  const base = comfyBase(cfg);
  const online = await comfyOnline(cfg);
  const def = cfg.gen || {};
  return {
    online,
    comfyUrl: base,
    defaults: { unet: def.unet || '', clip: def.clip || '', vae: def.vae || '' },
  };
}
