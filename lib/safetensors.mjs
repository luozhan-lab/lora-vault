import fs from 'node:fs';

const MAX_HEADER = 120 * 1024 * 1024;

/**
 * 读取 safetensors 头部的 __metadata__（训练软件写进去的 ss_* 字段）。
 * 文件损坏 / 不是 safetensors 时返回 null。
 */
export function readSafetensorsMeta(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const lenBuf = Buffer.alloc(8);
    fs.readSync(fd, lenBuf, 0, 8, 0);
    const n = Number(lenBuf.readBigUInt64LE(0));
    if (!Number.isFinite(n) || n <= 0 || n > MAX_HEADER) return null;
    const buf = Buffer.alloc(n);
    let read = 0;
    while (read < n) {
      const r = fs.readSync(fd, buf, read, n - read, 8 + read);
      if (!r) break;
      read += r;
    }
    const header = JSON.parse(buf.subarray(0, read).toString('utf8'));
    return header.__metadata__ || null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

/** Civitai 的 trainedWords 有时是数组，有时是一整串用 || 分组的字符串。统一成数组。 */
export function trainedWordList(value) {
  const raw = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
  const out = [];
  for (const item of raw) {
    for (const part of String(item || '').split(/\s*\|\|\s*/)) {
      const s = part.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * ss_tag_frequency 是 {"目录名": {"tag": count}}，合并所有目录。
 * 返回 [{ tag, count }] 按 count 降序。
 */
export function parseTagFrequency(meta) {
  if (!meta) return [];
  const raw = meta.ss_tag_frequency;
  if (!raw) return [];
  let obj;
  try {
    obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  const total = new Map();
  for (const dir of Object.values(obj || {})) {
    if (!dir || typeof dir !== 'object') continue;
    for (const [tag, count] of Object.entries(dir)) {
      const t = String(tag).trim().toLowerCase();
      if (!t) continue;
      total.set(t, (total.get(t) || 0) + Number(count || 0));
    }
  }
  return [...total.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function metaSummary(meta) {
  if (!meta) return {};
  const pick = (k) => (meta[k] === undefined || meta[k] === 'None' ? '' : String(meta[k]));
  const title = pick('modelspec.title') || pick('ss_output_name');
  const date = pick('modelspec.date');
  return {
    title,
    work_title: pick('ss_output_name'),
    base_model: pick('ss_base_model_version'),
    architecture: pick('modelspec.architecture'),
    trained_at: date,
    epochs: pick('ss_epoch'),
    steps: pick('ss_steps'),
    dim: pick('ss_network_dim'),
    alpha: pick('ss_network_alpha'),
    lr: pick('ss_learning_rate'),
    resolution: pick('modelspec.resolution'),
    images: pick('ss_num_train_images'),
    dataset: (() => {
      const d = pick('ss_dataset_dirs');
      if (!d) return '';
      try {
        const o = JSON.parse(d);
        const names = Object.keys(o);
        return names.length ? names.join(' / ') : '';
      } catch { return ''; }
    })(),
  };
}

/* 词性分类：把训练标签拆成 特征 / 服装 / 身体。
   主词典是 lib/wordbank.json（20,000 条，带 cat），手工那几张表只做兜底。 */

/* wordbank 的 cat → 我们的三类 */
const WORD_CAT_KIND = {
  clothes: 'outfit',
  body: 'body',
  hair: 'feature',
  eyes: 'feature',
  subject: 'feature',
  props: 'prop',
};

let _wordbank = null;
function wordbank() {
  if (_wordbank !== null) return _wordbank;
  try {
    const raw = fs.readFileSync(new URL('./wordbank.json', import.meta.url), 'utf8');
    const list = JSON.parse(raw);
    const map = new Map();
    for (const it of list) {
      const w = String(it.word || '').trim().toLowerCase();
      if (w && it.cat) map.set(w, it.cat);
    }
    _wordbank = map;
  } catch {
    _wordbank = false;
  }
  return _wordbank;
}

/* 大词典查一个词（先整词，再按分词逐段），返回 outfit / body / feature / prop / '' */
function kindByWordbank(tag) {
  const wb = wordbank();
  if (!wb) return '';
  const t = tag.toLowerCase();
  const direct = wb.get(t);
  if (direct) return WORD_CAT_KIND[direct] || '';
  const words = t.split(/[\s\-_,()·]+/).filter(Boolean);
  if (words.length > 1) {
    for (const w of words) {
      const c = wb.get(w);
      if (c && WORD_CAT_KIND[c]) return WORD_CAT_KIND[c];
    }
  }
  return '';
}

const OUTFIT_WORDS = [
  'dress', 'skirt', 'shirt', 'blouse', 'sweater', 'cardigan', 'jacket', 'coat', 'cloak', 'cape',
  'uniform', 'kimono', 'yukata', 'swimsuit', 'bikini', 'leotard', 'bodysuit', 'romper', 'sailor',
  'bra', 'panties', 'underwear', 'lingerie', 'thighhighs', 'stockings', 'pantyhose', 'socks',
  'boots', 'shoes', 'sandals', 'heels', 'sneakers', 'loafers', 'gloves', 'hat', 'cap', 'beret',
  'hood', 'veil', 'scarf', 'muffler', 'necktie', 'bowtie', 'bow', 'ribbon', 'choker', 'collar',
  'belt', 'suspenders', 'harness', 'armor', 'gauntlets', 'apron', 'maid', 'nurse', 'serafuku',
  'garter', 'corset', 'veil', 'shawl', 'wings', 'tailcoat', 'tunic', 'robe', 'vest', 'shorts',
  'pants', 'jeans', 'outfit', 'costume', 'school uniform', 'hairband', 'headdress', 'earrings',
  'necklace', 'bracelet', 'ring', 'tiara', 'crown', 'headwear', 'eyepatch', 'goggles', 'glasses',
  'mask', 'sleeves', 'frills', 'layered', 'strapless', 'off-shoulder', 'backless', 'plunging',
  'cutout', 'lace', 'patches', 'distressed', 'torn', 'wet clothes',
];

const FEATURE_WORDS = [
  'hair', 'bangs', 'sidelocks', 'ahoge', 'braid', 'ponytail', 'twintails', 'bun', 'eyes', 'pupils',
  'eyebrows', 'eyelashes', 'ears', 'elf', 'horn', 'tail', 'wings', 'fangs', 'teeth', 'tongue',
  'skin', 'tan', 'freckles', 'mole', 'scar', 'tattoo', 'makeup', 'blush', 'headphones', 'antenna',
  'ears', 'fur', 'scales', 'halo', 'gem', 'markings', 'stripes',
];

const BODY_WORDS = [
  'breasts', 'chest', 'cleavage', 'nipples', 'hips', 'thighs', 'waist', 'navel', 'stomach',
  'ass', 'butt', 'buttocks', 'abs', 'collarbone', 'small breasts', 'large breasts',
  'medium breasts', 'flat chest', 'wide hips', 'slim', 'muscular', 'chubby',
];

const POSE_PREFIXES = [
  'standing', 'sitting', 'lying', 'walking', 'running', 'kneeling', 'squatting', 'leaning',
  'looking', 'pointing', 'hands', 'arms', 'holding', 'chair', 'on bed', 'crouching',
];

const NOISE = new Set([
  '1girl', '1boy', '2girls', '2boys', 'solo', 'female', 'male', 'multiple girls', 'multiple boys',
  'simple background', 'white background', 'black background', 'gradient background', 'transparent background',
  'looking at viewer', 'upper body', 'full body', 'cowboy shot', 'portrait', 'close-up', 'from above',
  'from below', 'from side', 'from behind', 'standing', 'sitting', 'lying', 'walking', 'smile',
  'closed mouth', 'open mouth', 'safe', 'masterpiece', 'best quality', 'highres', 'absurdres',
  'newest', 'commentary', 'english commentary', 'translated', 'censored', 'uncensored', 'signature',
  'watermark', 'artist name', 'web address', 'outdoors', 'indoors', 'day', 'night', 'sky', 'cloud',
  'scenery', 'blurry', 'depth of field', 'official art', 'game cg', 'screenshot', '3d', 'anime style',
  'realistic', 'photorealistic', 'monochrome', 'greyscale', 'sketch', 'lineart', 'character sheet',
  /* 概念支训练集里常见的元标签：不是长相也不是衣服，进特征框会被拼进出图词 */
  'concept', 'nsfw', 'slider', 'opacity', 'tutorial', 'text focus', 'multiple views',
]);

function matchLexicon(tag, lexicon) {
  const words = new Set(tag.split(/[\s\-_()·,]+/).filter(Boolean));
  for (const w of lexicon) {
    if (w.includes(' ')) {
      if (tag === w || tag.startsWith(w + ' ') || tag.endsWith(' ' + w) || tag.includes(' ' + w + ' ')) return true;
    } else if (words.has(w)) {
      return true;
    }
  }
  return false;
}

export function isPose(tag) {
  const words = tag.split(/[\s\-_()·,]+/).filter(Boolean);
  if (words.some((w) => POSE_PREFIXES.includes(w))) return true;
  return false;
}

function splitWords(s) {
  return String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

/**
 * 从标签频次里推出：触发词候选 / 特征词 / 服装词 / 身体词 / 通用标签。
 */
export function classifyTags(tags) {
  if (!tags.length) {
    return { trigger: '', feature: '', outfit: '', body: '', common: [] };
  }
  const max = tags[0].count || 1;
  const triggerCandidates = [];
  const feature = [];
  const outfit = [];
  const body = [];
  const common = [];

  for (const { tag, count } of tags) {
    const ratio = count / max;
    const wordCount = tag.split(' ').length;
    const kind = classifyOne(tag);
    // 触发词 = 名字，不是「出现得也很多的长相词」。
    // 只按频次判会把 blonde hair / red eyes 一起塞进 trigger，必须再确认它不像特征/服装/身体词。
    const isName = ratio >= 0.9 && wordCount <= 6 && !NOISE.has(tag) && kind === 'other';
    if (isName) { triggerCandidates.push(tag); continue; }
    if (kind === 'noise' || kind === 'prop') continue;
    if (kind === 'outfit') outfit.push(tag);
    else if (kind === 'body') body.push(tag);
    else if (kind === 'feature') feature.push(tag);
    else common.push(tag);
  }

  return {
    trigger: triggerCandidates.slice(0, 5).join(', '),
    feature: feature.slice(0, 30).join(', '),
    outfit: outfit.slice(0, 30).join(', '),
    body: body.slice(0, 15).join(', '),
    common: common.slice(0, 40),
  };
}

export function splitWordsSafe(s) {
  return splitWords(s);
}

/** 单个标签归到哪一类：outfit / body / feature / prop / noise / other */
export function classifyOne(tag) {
  const t = String(tag || '').trim().toLowerCase();
  if (!t) return 'noise';
  if (NOISE.has(t) || isPose(t)) return 'noise';
  const wbKind = kindByWordbank(t);
  if (wbKind) return wbKind;
  if (matchLexicon(t, OUTFIT_WORDS)) return 'outfit';
  if (matchLexicon(t, BODY_WORDS)) return 'body';
  if (matchLexicon(t, FEATURE_WORDS)) return 'feature';
  return 'other';
}

/** 像不像一个角色名 / 触发词：短、不含词表里的特征服装词 */
export function isNameLike(tag) {
  const t = String(tag || '').trim().toLowerCase();
  if (!t || t.length > 60) return false;
  if (NOISE.has(t)) return false;
  if (t.split(/\s+/).filter(Boolean).length > 5) return false;
  return classifyOne(t) === 'other';
}

/**
 * 老库有的 trigger 字段其实是一整串标签，中间用 ‖ 分成「特征 ‖ 服装」。
 * 干净的（≤6 项、无 ‖）原样返回，脏的拆成 trigger / feature / outfit。
 */
export function splitTriggerDump(text) {
  const raw = String(text || '').trim();
  if (!raw) return { trigger: '', feature: '', outfit: '' };
  const parts = raw.split('‖');
  const left = parts[0] || '';
  const right = parts[1] || '';
  const items = left.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1 && items.length <= 6) return { trigger: raw, feature: '', outfit: '' };

  const trig = [];
  const feat = [];
  const outfit = [];
  let phase = 'trigger';
  for (const it of items) {
    if (phase === 'trigger' && isNameLike(it) && trig.length < 3) { trig.push(it); continue; }
    phase = 'rest';
    const kind = classifyOne(it);
    if (kind === 'outfit') outfit.push(it);
    else if (kind === 'feature' || kind === 'body') feat.push(it);
  }
  for (const it of right.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!it) continue;
    classifyOne(it) === 'outfit' ? outfit.push(it) : feat.push(it);
  }
  return { trigger: trig.join(', '), feature: feat.join(', '), outfit: outfit.join(', ') };
}
