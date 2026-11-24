import { db } from './db.mjs';
import { classifyOne, isPose } from './safetensors.mjs';

/**
 * ④ 标签结构化：25533 个散标签归成几类，能当词库用。
 *   角色 / 服装 / 动作 / 身体 / 场景 / 画风质量 / 其他
 */

const QUALITY = [
  'masterpiece', 'best quality', 'high quality', 'highres', 'absurdres', 'ultra detailed',
  'detailed', '8k', '4k', 'sharp focus', 'professional', 'award winning', 'official art',
  'bad quality', 'worst quality', 'lowres', 'blurry', 'jpeg artifacts', 'bad anatomy',
  'censored', 'uncensored', 'text', 'watermark', 'signature', 'logo', 'username',
];

const STYLE = [
  'oil painting', 'watercolor', 'sketch', 'lineart', 'monochrome', 'greyscale', 'sepia',
  'photorealistic', 'realistic', 'semi-realistic', '3d', 'anime style', 'manga', 'comic',
  'impasto', 'cel shading', 'flat color', 'pixel art', 'ukiyo-e', 'art nouveau', 'cinematic',
  'film grain', 'depth of field', 'bokeh', 'vignette', 'lens flare', 'chromatic aberration',
];

const SCENE = [
  'indoors', 'outdoors', 'bedroom', 'bed', 'room', 'classroom', 'bathroom', 'kitchen',
  'beach', 'ocean', 'sea', 'forest', 'grass', 'sky', 'cloud', 'night', 'day', 'sunset',
  'sunrise', 'rain', 'snow', 'window', 'door', 'wall', 'floor', 'street', 'alley',
  'onsen', 'bath', 'pool', 'garden', 'shrine', 'temple', 'castle', 'ruins', 'stage',
  'background', 'scenery', 'landscape', 'city', 'neon', 'lighting', 'sunlight', 'moonlight',
];

const FRANCHISE = [
  'genshin impact', 'honkai', 'star rail', 'zenless zone zero', 'zzz', 'blue archive',
  'azur lane', 'nikke', 'arknights', 'wuthering waves', 'brown dust', 're:zero',
  'overlord', 'frieren', 'slime', 'konosuba', 'pretty cure', 'precure', 'kanojo saimin',
];

const ACTION = [
  'sitting', 'standing', 'lying', 'kneeling', 'squatting', 'walking', 'running', 'jumping',
  'leaning', 'crouching', 'bending', 'spread legs', 'legs up', 'arms up', 'arms behind back',
  'looking at viewer', 'looking away', 'looking back', 'looking up', 'looking down',
  'holding', 'hugging', 'kissing', 'grabbing', 'groping', 'straddling', 'riding',
  'missionary', 'doggystyle', 'cowgirl', 'fellatio', 'handjob', 'paizuri', 'cum',
  'undressing', 'dressing', 'on back', 'on side', 'on stomach', 'from behind', 'from above',
  'from below', 'selfie', 'posing', 'crossed legs', 'crossed arms', 'knees together',
];

function hasWord(tag, list) {
  const words = new Set(tag.split(/[\s\-_()·,]+/).filter(Boolean));
  return list.some((w) => (w.includes(' ') ? tag.includes(w) : words.has(w)));
}

export function classifyTagKind(tag) {
  const t = String(tag || '').toLowerCase().trim();
  if (!t) return '其他';
  if (t.startsWith('bad ') || t.startsWith('worst ')) return '画风质量';
  if (hasWord(t, QUALITY) || hasWord(t, STYLE)) return '画风质量';
  if (hasWord(t, FRANCHISE)) return '角色';
  if (hasWord(t, SCENE)) return '场景';
  if (hasWord(t, ACTION) || isPose(t)) return '动作';
  const k = classifyOne(t);
  if (k === 'outfit') return '服装';
  if (k === 'body') return '身体';
  if (k === 'feature') return '角色';
  return '其他';
}

/** 重算所有标签的类目 */
export function rebuildTagKinds() {
  const conn = db();
  const rows = conn.prepare('SELECT id, name, kind FROM tag').all();
  const upd = conn.prepare('UPDATE tag SET kind = ? WHERE id = ?');
  let changed = 0;
  conn.exec('BEGIN');
  try {
    for (const r of rows) {
      const kind = classifyTagKind(r.name);
      if (kind !== r.kind) { upd.run(kind, r.id); changed++; }
    }
    conn.exec('COMMIT');
  } catch (e) { try { conn.exec('ROLLBACK'); } catch {} throw e; }
  return { total: rows.length, changed };
}

/* 词表检索：脏词（括号/引号/问叹/冒号/逗号/单字）挡掉，按被多少支 LoRA 用过排序 */
const TAG_JUNK = `(length(t.name) > 1 AND t.name NOT GLOB '*[()?!":,]*')`;

export function listTags({ q = '', kind = '', limit = 200, offset = 0 } = {}) {
  const conn = db();
  const where = [TAG_JUNK];
  const params = [];
  if (q) { where.push('t.name LIKE ?'); params.push(`%${q}%`); }
  if (kind) { where.push('t.kind = ?'); params.push(kind); }
  const clause = 'WHERE ' + where.join(' AND ');
  const rows = conn.prepare(`
    SELECT t.name, t.kind, COUNT(DISTINCT lt.lora_id) AS count
    FROM lora_tag lt JOIN tag t ON t.id = lt.tag_id
    ${clause}
    GROUP BY t.id ORDER BY count DESC, length(t.name), t.name LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Math.max(0, Number(offset) || 0));
  const total = conn.prepare(`
    SELECT COUNT(*) AS c FROM (
      SELECT t.id FROM lora_tag lt JOIN tag t ON t.id = lt.tag_id
      ${clause} GROUP BY t.id
    )
  `).get(...params).c;
  const kinds = conn.prepare(`
    SELECT kind, COUNT(*) AS n FROM tag WHERE kind <> '' GROUP BY kind ORDER BY n DESC
  `).all();
  return { items: rows, kinds, total };
}
