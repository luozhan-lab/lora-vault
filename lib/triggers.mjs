import { db } from './db.mjs';
import { classifyOne, isNameLike, trainedWordList } from './safetensors.mjs';

/* 逐条触发词：角色 / 特征 / 服装 / 身体 / 其他 */
export const TRIGGER_KINDS = ['character', 'feature', 'outfit', 'body', 'other'];
export const TRIGGER_KIND_LABELS = {
  character: '角色', feature: '特征', outfit: '服装', body: '身体', other: '其他',
};
const KIND_SET = new Set(TRIGGER_KINDS);

/* 这些不是触发词，只是训练/质量标签；别把 adult / 3d 当成角色名 */
const NOT_NAME = new Set([
  'adult', 'nsfw', 'explicit', 'safe', '3d', 'realistic', 'photorealistic', 'anime', 'cartoon',
  'style', 'art', 'male', 'female', '1girl', '1boy', '2girls', '2boys', 'solo', 'multiple girls', 'multiple boys',
  'hetero', 'yuri', 'lesbian', 'couple',
  'western', 'monochrome', 'greyscale', 'sketch', 'lineart', 'character sheet', 'transparent background',
]);
/* 包 / 饰品 / 图案这类，不能因为短就判成角色名 */
const OBJECT_RE = /\b(bag|backpack|pocket|pouch|case|box|bottle|cup|randoseru|plush|doll|toy|keychain|strap|buckle|zipper|button|charm|print|pattern|badge|emblem|logo|symbol|pin|patch|sticker|ornament|jewelry|necklace|earring|bracelet|ring|tiara|crown|hairpin|hairclip|capelet|microdress)\b/i;
const OUTFIT_OBJECT_RE = /\b(bag|backpack|pocket|pouch|case|randoseru|strap|buckle|zipper|button|jewelry|necklace|earring|bracelet|ring|tiara|crown|hairpin|hairclip|capelet|microdress)\b/i;
/* 性行为 / 拟声 / 构图词也不是角色名 */
const NON_NAME_RE = /\b(sex|erection|penis|testicles|cum|cumming|oral|fellatio|deepthroat|gangbang|threesome|spitroast|irrumatio|penetration|group sex|spread legs|head grab|rough sex|epic sex|speed lines|vibration lines|focus lines|speech bubbles|comic-style|sweat|steam|smell|after sex|head back|facing away|arched back|bent knees|limp|doggystyle|mating press|legs up|folded pose|barefoot|foreground|background|cut-in|splitscreen|vaginal|anal|blowjob|x-ray|multiple penises|small penis|normal penis|long penis|huge penis|main clothes|masterpiece|best quality|illustration|hd|portrait|female child|gag|dildo|plug|vibrator|thank you|promts?|character\/anime|face\/head|点赞|请为|letterboxed|weapon|sword|polearm|from behind|open mouth)\b/i;
const FEATURE_EXTRA_RE = /\b(bob cut|haircut|hime cut|horns?)\b/i;
const OUTFIT_EXTRA_RE = /\b(outfit\d*|clothes|clothing|cosplay|footwear|chest ?scarf|legwear|headwear|neckwear|armwear)\b/i;

/* 逗号、中文逗号、换行、‖、|、分号、两边带空格的 + 都当分隔符；
   括号里的逗号不拆（(aponia, nun, def clothe) 是一个整体） */
const SPLIT_RE = /\s*(?:,|，|\n|\r|‖|\||;|；|\s\+\s)\s*/;
function splitTopLevel(value) {
  const text = String(value || '');
  const out = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    const delim = depth === 0 && (c === ',' || c === '，' || c === '、' || c === '\n' || c === '\r'
      || c === '‖' || c === '|' || c === ';' || c === '；');
    const plus = depth === 0 && c === '+' && /\s/.test(text[i - 1] || '') && /\s/.test(text[i + 1] || '');
    if (delim || plus) {
      out.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

function safeJson(s) {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

function kindOf(text, allowName = true) {
  const t = String(text || '').trim();
  if (!t) return '';
  const key = t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (/点赞|请为|求点赞/.test(t)) return 'other';
  if (/^[([{<]/.test(t)) return 'other';
  if (FEATURE_EXTRA_RE.test(key)) return 'feature';
  if (OUTFIT_EXTRA_RE.test(key)) return 'outfit';
  if (NON_NAME_RE.test(key)) return 'other';
  if (OBJECT_RE.test(key)) return OUTFIT_OBJECT_RE.test(key) ? 'outfit' : 'other';
  /* minato_aqua_(1st_costume) 这种「名字_(版本)」是角色，不是服装 */
  if (allowName && /^[a-z0-9][a-z0-9_-]*_?\([^)]*\)$/i.test(t) && !OBJECT_RE.test(key)) return 'character';
  const base = classifyOne(t);
  if (base === 'noise') return allowName && isNameLike(t) ? 'character' : '';
  if (base === 'other') {
    if (NOT_NAME.has(key.toLowerCase()) || /^\d/.test(t)) return 'other';
    return allowName && isNameLike(t) ? 'character' : 'other';
  }
  return base;
}

function isStrongName(text) {
  const t = String(text || '').trim();
  if (!t || t.startsWith('(') || t.startsWith('[') || t.startsWith('{')) return false;
  if (!/\([^)]*\)/.test(t)) return false;
  const key = t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (NON_NAME_RE.test(key) || OBJECT_RE.test(key)) return false;
  const inner = (t.match(/\(([^)]*)\)/) || [])[1] || '';
  if (/^(object|clothes?|clothing|costume|outfit|version|v\d)/i.test(inner.trim())) return false;
  return true;
}

/**
 * 从 C 站 trainedWords（优先）或 trigger 整串里拆逐条词。
 * 只做启发式归类，拿不准的留在 other；不覆盖原 trigger 字段。
 */
export function splitTriggerEntries(row) {
  const out = [];
  const seen = new Set();
  const meta = safeJson(row && row.meta_json);
  const trained = trainedWordList(meta && meta.civitai && meta.civitai.trainedWords);
  const chunks = [...trained];
  /* trigger 里常单独存了真正的角色名（trainedWords 只有特征/服装）；补在后面，已有词会去重 */
  if (row && String(row.trigger || '').trim()) chunks.push(String(row.trigger));
  const roleCategory = !row.category || ['角色', '自己的', '其他', '未分类'].includes(String(row.category));
  for (const chunk of chunks) {
    let nameBudget = roleCategory ? 8 : 0;
    for (const part of splitTopLevel(chunk)) {
      const text = part.replace(/^[\s,;，；]+|[\s,;，；]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!text) continue;
      const allowName = roleCategory && (nameBudget > 0 || isStrongName(text));
      const kind = kindOf(text, allowName);
      if (!kind) continue;
      if (kind === 'feature' || kind === 'outfit' || kind === 'body') nameBudget = 0;
      else if (kind === 'character' && nameBudget > 0) nameBudget--;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        text,
        kind,
        label: '',
        weight: null,
        sort: out.length,
        enabled: 1,
      });
    }
  }
  return out;
}

export function getTriggers(loraId) {
  return db().prepare(`
    SELECT id, text, kind, label, weight, sort, enabled
    FROM lora_trigger WHERE lora_id = ? ORDER BY sort ASC, id ASC
  `).all(Number(loraId));
}

/** 逐条词分类完，顺手补空的服装/特征/身体列，别让旧字段一直空着 */
function syncTriggerColumns(loraId) {
  const id = Number(loraId);
  const conn = db();
  const row = conn.prepare('SELECT feature_words, outfit_words, body_words FROM lora WHERE id = ?').get(id);
  if (!row) return;
  const rows = getTriggers(id).filter((t) => t.enabled);
  const pick = (kind, max) => rows.filter((t) => t.kind === kind).map((t) => t.text).filter(Boolean).slice(0, max).join(', ');
  const sets = [];
  const vals = [];
  if (!String(row.feature_words || '').trim()) {
    const v = pick('feature', 24);
    if (v) { sets.push('feature_words = ?'); vals.push(v); }
  }
  if (!String(row.outfit_words || '').trim()) {
    const v = pick('outfit', 24);
    if (v) { sets.push('outfit_words = ?'); vals.push(v); }
  }
  if (!String(row.body_words || '').trim()) {
    const v = pick('body', 12);
    if (v) { sets.push('body_words = ?'); vals.push(v); }
  }
  if (!sets.length) return;
  vals.push(new Date().toISOString(), id);
  conn.prepare(`UPDATE lora SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals);
}

/** 保存逐条触发词；空数组表示用户主动清空，之后不再自动补 */
export function setTriggers(loraId, list) {
  const conn = db();
  const id = Number(loraId);
  const row = conn.prepare('SELECT id FROM lora WHERE id = ?').get(id);
  if (!row) return null;

  const clean = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list.slice(0, 2000) : []) {
    const text = String(item && item.text !== undefined ? item.text : item || '')
      .replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = KIND_SET.has(String(item && item.kind || '')) ? String(item.kind) : 'other';
    const enabled = item && (item.enabled === 0 || item.enabled === false) ? 0 : 1;
    const weight = item && Number.isFinite(Number(item.weight)) ? Number(item.weight) : null;
    clean.push({
      text,
      kind,
      label: String(item && item.label || '').trim().slice(0, 200),
      weight,
      sort: clean.length,
      enabled,
    });
  }

  conn.exec('BEGIN');
  try {
    conn.prepare('DELETE FROM lora_trigger WHERE lora_id = ?').run(id);
    const ins = conn.prepare(`
      INSERT INTO lora_trigger (lora_id, text, kind, label, weight, sort, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of clean) ins.run(id, t.text, t.kind, t.label, t.weight, t.sort, t.enabled);
    conn.prepare('UPDATE lora SET triggers_synced = 1, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
    conn.exec('COMMIT');
  } catch (e) {
    try { conn.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
  syncTriggerColumns(id);
  return getTriggers(id);
}

/** 按 meta.trainedWords / trigger 重新拆一遍，会覆盖当前逐条列表 */
export function organizeTriggers(loraId) {
  const conn = db();
  const id = Number(loraId);
  const row = conn.prepare('SELECT id, trigger, meta_json, category FROM lora WHERE id = ?').get(id);
  if (!row) return null;
  return setTriggers(id, splitTriggerEntries(row));
}

/** 新扫描进来的记录：只补一次，不覆盖用户后来改过的 */
export function ensureTriggers(loraId) {
  const id = Number(loraId);
  const row = db().prepare('SELECT id, trigger, meta_json, category, triggers_synced FROM lora WHERE id = ?').get(id);
  if (!row || row.triggers_synced) return getTriggers(id);
  return setTriggers(id, splitTriggerEntries(row));
}

/** 启动时把旧库还没有逐条触发词的记录补上 */
export function backfillTriggers() {
  const conn = db();
  const rows = conn.prepare('SELECT id, trigger, meta_json, category FROM lora WHERE triggers_synced = 0').all();
  if (!rows.length) return 0;
  conn.exec('BEGIN');
  try {
    const del = conn.prepare('DELETE FROM lora_trigger WHERE lora_id = ?');
    const ins = conn.prepare(`
      INSERT INTO lora_trigger (lora_id, text, kind, label, weight, sort, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const mark = conn.prepare('UPDATE lora SET triggers_synced = 1 WHERE id = ?');
    for (const row of rows) {
      del.run(row.id);
      for (const t of splitTriggerEntries(row)) ins.run(row.id, t.text, t.kind, t.label, t.weight, t.sort, t.enabled);
      mark.run(row.id);
    }
    conn.exec('COMMIT');
  } catch (e) {
    try { conn.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
  for (const row of rows) {
    try { syncTriggerColumns(row.id); } catch { /* 补列失败不影响回填 */ }
  }
  return rows.length;
}
