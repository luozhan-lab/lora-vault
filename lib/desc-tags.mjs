/**
 * 解析 C站页面描述里的「词表区」。
 * 很多作者会在描述里用 `**Appearance**: 1girl, large breasts, red eyes…`、
 * `**Default outfit**: black jacket, pleated skirt…` 这种格式补触发词、特征词、服装词，
 * 这里把它们拆出来，方便下载/补信息时直接填进信息页。
 */
import { classifyOne, kindByWordbank, isNameLike } from './safetensors.mjs';

/* label 里出现这些词，就按这个类型强制归（比大词典猜得准） */
const LABEL_RULES = [
  { re: /trigger|触发/i, kind: 'trigger' },
  { re: /weight|权重/i, kind: 'weight' },
  { re: /outfit|clothes|clothing|costume|uniform|dress|服装|套装|衣着|服饰/i, kind: 'outfit' },
  { re: /appearance|feature|characters?|look|外观|特征|长相|饰品/i, kind: 'feature' },
  { re: /body|体型|身材/i, kind: 'body' },
];

/* `**Label** : words`、`- Label: words`、`Label：words` 都认（中文 label 也认） */
const LINE_RE = /^[-*•\u2022\s]*\*{0,2}([A-Za-z\u4e00-\u9fff][\w\s&/'’().+\u4e00-\u9fff-]{0,40}?)\*{0,2}\s*[:：]\s*(.*)$/;

function kindForLabel(label) {
  const s = String(label || '').trim();
  for (const r of LABEL_RULES) if (r.re.test(s)) return r.kind;
  return '';
}

export function cleanWord(s) {
  return String(s || '')
    .replace(/\*\*/g, '')
    .replace(/^[-•\u2022\s]+/, '')
    .replace(/[.。;；]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @returns {{ trigger: string, feature: string, outfit: string, body: string,
 *             weight: number|null, labels: Array<{label:string,kind:string,words:string[]}> }}
 */
export function parseDescriptionTags(text) {
  const lines = String(text || '').split(/\r?\n/);
  const blocks = [];
  let cur = null;
  /* 标签行后面空一行、词表写在下一行的格式（Appearance:\n\nwords…）：按 label 类型开个空块等它 */
  let pending = 0;
  for (const line of lines) {
    const m = line.match(LINE_RE);
    if (m) {
      const label = cleanWord(m[1]);
      const body = m[2] || '';
      if (label.length <= 40) {
        if (body.trim()) {
          cur = { label, kind: kindForLabel(label), words: body };
          blocks.push(cur);
          pending = 0;
          continue;
        }
        const kind = kindForLabel(label);
        if (kind) {
          cur = { label, kind, words: '' };
          blocks.push(cur);
          pending = 4;
          continue;
        }
      }
    }
    if (cur && pending) {
      if (line.trim()) {
        cur.words += (cur.words ? ' ' : '') + line.trim();
        pending -= 1;
        if (pending <= 0) { cur = null; }
      }
      continue;
    }
    /* 续行：属于上一个 label 的词串继续往下写 */
    if (cur && line.trim() && !/^[-*•\u2022]\s*$/.test(line.trim()) && line.trim().length > 2) {
      cur.words += ' ' + line.trim();
    } else if (!line.trim()) {
      cur = null;
    }
  }

  const trigger = [];
  const feature = [];
  const outfit = [];
  const body = [];
  const labels = [];
  let weight = null;

  for (const b of blocks) {
    const raw = b.words
      .split(',')
      .map(cleanWord)
      .filter((w) => w && w.length <= 80);
    if (!raw.length) continue;
    const words = [];
    for (const w of raw) {
      if (b.kind === 'weight') {
        const n = Number(String(w).replace(/[^\d.]/g, ''));
        if (Number.isFinite(n) && n > 0 && n < 5) weight = n;
        continue;
      }
      if (b.kind === 'trigger') { trigger.push(w); continue; }
      if (b.kind === 'outfit') {
        if (classifyOne(w) === 'noise') continue;
        outfit.push(w); words.push(w); continue;
      }
      if (b.kind === 'feature') {
        /* label 说是外观，但「large breasts」这种身体词归身体、角色名归触发词、1girl 这种噪声直接丢 */
        const k = classifyOne(w);
        if (k === 'noise') continue;
        if (k === 'body') body.push(w);
        else if (kindByWordbank(w) === 'character') trigger.push(w);
        else if (k === 'other' && raw.indexOf(w) <= 1 && isNameLike(w)) trigger.push(w);
        else feature.push(w);
        words.push(w);
        continue;
      }
      if (b.kind === 'body') { body.push(w); words.push(w); continue; }
      /* 没在 label 里认出来的（作者自起的套装名、状态名），按词逐个分类 */
      const k = classifyOne(w);
      if (k === 'outfit') { outfit.push(w); words.push(w); }
      else if (k === 'feature') { feature.push(w); words.push(w); }
      else if (k === 'body') { body.push(w); words.push(w); }
    }
    if (words.length) labels.push({ label: b.label, kind: b.kind || 'auto', words });
  }

  const uniq = (arr) => [...new Set(arr.map((x) => x.toLowerCase()))];
  /* 去掉被「更长短语覆盖」的重复项（大小写不敏感） */
  const dedupe = (arr) => {
    const seen = new Set();
    const out = [];
    for (const w of arr) {
      const k = w.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(w);
    }
    return out;
  };

  return {
    trigger: dedupe(trigger).join(', '),
    feature: dedupe(feature).join(', '),
    outfit: dedupe(outfit).join(', '),
    body: dedupe(body).join(', '),
    weight,
    labels,
    _uniq: uniq,
  };
}
