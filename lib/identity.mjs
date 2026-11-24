/* 特征词清洗
 *
 * 库里存的特征词是从 safetensors 文件头（ss_tag_frequency）里分出来的训练标签，
 * 不是「这个角色长什么样」。里面混着表情、构图、质量、体型和一坨不认识的东西。
 * 直接拼进正面，脸就会漂：闭眼和睁眼同时写，眼睛不知道听谁的。
 *
 * 这里只做一件事：把标签按类拆开，出图只拿「身份」那一段，并且给它们压一档权重。
 * 不认识的词进 other，也不进正面 —— 宁可少写，也不乱写。
 */

const RULES = [
  // 表情 / 眼神 / 嘴 —— 一律不进正面，交给「表情」那栏管
  ['expression', /(smil|grin|laugh|cry|tears?\b|weep|blush|open mouth|closed mouth|parted lips|teeth|fang|tongue|lick|kiss|angry|sad|surpris|shy|embarrass|expression|eyes? closed|closed eyes|half[- ]closed|narrowed|wide[- ]eyed|looking (at|away|back|down|up|to the|over)|eye contact|wink|smug|pout|drool|ahegao|orgasm|heavy breathing|^shadow over eyes$)/i],
  // 构图 / 机位 / 背景 / 光照叙述 —— 交给取景和场景那几栏
  ['composition', /(^(upper|lower|full)[ _]body$|close[- ]?up|portrait|cowboy shot|from (above|below|behind|side|front|back)|dutch angle|^pov$|first[- ]person|depth of field|blurry background|simple background|white background|^outdoors$|^indoors$|^scenery$|^background$|out of frame|foreground|silhouette|wide shot|medium shot|^head ?out of frame$|^cropped)/i],
  // 质量 / 画风 / 水印 —— 这些写进正面只会更用力，不会更对
  ['quality', /(masterpiece|best quality|high ?res|absurdres|ultra[- ]?detail|^detailed$|realistic|photorealistic|^[48]k$|official art|concept art|^sketch$|^lineart$|monochrome|greyscale|watermark|^signature$|artist name|^1girl$|^1boy$|^solo$|^multiple|^censored$|^comic$|^anime style$)/i],
  // 身体 / 体型 / 露骨 —— 体型有专门那栏，挂一起会打架
  ['body', /(breasts?|cleavage|nipples?|areola|thighs?|^waist$|hips?\b|navel|^stomach$|^abs$|muscular|chubby|slim|skinny|curvy|^petite$|^loli$|mature female|^milf$|pregnant|pubic|pussy|penis|^cum$|semen|^nude$|naked|^ass$|^butt$|^legs$|^collarbone$)/i],
];

const IDENTITY_RE = /(hair|bangs|sidelock|twintail|ponytail|braid|ahoge|fringe|pupil|eyes?\b|eyelash|eyebrow|skin|freckle|^mole|scar|tattoo|marking|horn|^tail\b|wing|halo|\bears?\b|^fang$|^teeth$|ornament|hairband|hair ?tie|ribbon|flower|jewel|gem|earring|necklace|choker|^collar$|glove|stocking|^socks?$|boot|shoe|^hat$|^cap$|headwear|veil|crown|tiara|mask|glasses|^robe$|cloak|scarf|^belt$|bracelet|^ring$|^nail$|^tan\b|pale skin|dark skin|two[- ]tone)/i;

/* 「这个人的身份」必须有个落脚点：头发 / 眼睛 / 皮肤 / 耳朵 / 饰品 / 纹身里至少占一样。
   只写了「smile, looking at viewer」这种，等于没有特征词。 */
const ANCHOR_RE = /(hair|bangs|sidelock|twintail|ponytail|braid|pupil|eyes?\b|skin|ear|tail|horn|wing|halo|tattoo|mole|scar|freckle|marking|ornament|ribbon|necklace|choker|glove)/i;

export function splitWords(featureWords) {
  const buckets = { identity: [], expression: [], composition: [], quality: [], body: [], other: [] };
  const raw = String(featureWords || '')
    .split(/[,，;；]/)
    .map((w) => w.trim().replace(/^\(|\)$/g, '').replace(/:\d+(\.\d+)?$/, '').trim())
    .filter(Boolean);

  const seen = new Set();
  for (const word of raw) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // 下划线标签（pointy_ears）里 \b 对不上，判类时先换成空格；存回去还是原词
    const probe = word.toLowerCase().replace(/_/g, ' ');

    let hit = null;
    for (const [name, re] of RULES) {
      if (re.test(probe)) { hit = name; break; }
    }
    if (hit) { buckets[hit].push(word); continue; }
    if (IDENTITY_RE.test(probe)) { buckets.identity.push(word); continue; }
    buckets.other.push(word);
  }
  return buckets;
}

export function identityPrompt(featureWords, { weight = 0.8 } = {}) {
  const { identity } = splitWords(featureWords);
  return identity.map((w) => `(${w}:${weight})`).join(', ');
}

/**
 * 给界面用的一句话预检。
 * clean=false 的时候前端别拦着出图，就在「谁」下面提醒一句。
 */
export function identityReport(featureWords) {
  const buckets = splitWords(featureWords);
  const total = Object.values(buckets).reduce((n, list) => n + list.length, 0);
  const clean = buckets.identity.length;
  const anchored = buckets.identity.some((w) => ANCHOR_RE.test(w.replace(/_/g, ' ')));
  const noise = total - clean;

  let level = 'ok';
  let note = '';
  if (!total) {
    level = 'none';
    note = '这支没有特征词，只靠触发词出图，样子可能不正。';
  } else if (!anchored || clean < 2) {
    level = 'weak';
    note = `这支的身份词太少（${clean} 条），其余 ${noise} 条是表情、构图、质量那类，出图可能不像。`;
  } else if (noise > clean * 2) {
    level = 'noisy';
    note = `这支的标签里只有 ${clean} 条讲长相，另外 ${noise} 条是表情、构图、质量，已经滤掉，出图前先看一眼。`;
  }
  return {
    level,
    note,
    identity: buckets.identity,
    dropped: {
      expression: buckets.expression,
      composition: buckets.composition,
      quality: buckets.quality,
      body: buckets.body,
      other: buckets.other,
    },
    counts: { total, clean, noise },
  };
}

/* 冲突的表情词：闭眼 + 睁眼同时出现时，一个都不留（本来就该交给「表情」那栏） */
export const CONFLICT_GROUPS = [
  ['closed eyes', 'half-closed eyes', 'narrowed eyes', 'open eyes'],
  ['smile', 'sad', 'angry', 'crying'],
];
