/**
 * 英文名 → 中文名。先走 Google 非官方接口，失败再走 MyMemory。
 * 只给「中文名」框用，翻译失败返回空字符串，不抛给下载流程。
 */
function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      if (t.unref) t.unref();
    }),
  ]);
}

export async function translateToZh(text) {  const s = String(text || '').trim().slice(0, 300);
  if (!s) return '';
  /* 已经是中文就别翻，省一次请求（也避免走 MyMemory 等 6 秒超时） */
  const han = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  if (han / s.length > 0.5) return '';
  const providers = [
    async () => {
      const u = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' + encodeURIComponent(s);
      const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const arr = await r.json();
      return (Array.isArray(arr) && Array.isArray(arr[0]) ? arr[0] : [])
        .map((x) => (Array.isArray(x) ? x[0] : '')).join('').trim();
    },
    async () => {
      const u = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(s) + '&langpair=en|zh-CN';
      const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      return String((d.responseData && d.responseData.translatedText) || '').trim();
    },
  ];
  for (const fn of providers) {
    try {
      const zh = await withTimeout(fn(), 5000);
      if (zh) return zh === s ? '' : zh;
    } catch { /* try next */ }
  }
  return '';
}

/** 长描述分段翻：只翻前 max 字，失败段落保留原文，用户以后自己删 */
export async function translateLong(text, max = 1200) {
  const s = String(text || '').replace(/\r/g, '').trim();
  if (!s) return '';
  const clipped = s.slice(0, max);
  const chunks = [];
  for (const para of clipped.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    for (let i = 0; i < p.length; i += 280) chunks.push(p.slice(i, i + 280));
  }
  const out = [];
  for (const c of chunks) {
    const t = c.trim();
    if (!t) continue;
    const zh = await translateToZh(t);
    out.push(zh || t);
  }
  return out.join('\n\n').trim();
}
