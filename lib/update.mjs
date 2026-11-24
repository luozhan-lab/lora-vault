/**
 * 检查更新：读一份清单 JSON
 *   { "version": "1.1.0", "url": "https://…/LoRA-Vault-1.1.0-setup.exe", "sha256": "…", "size": 1234, "notes": "改了什么" }
 * 清单地址可以是 http(s)，也可以是本地文件路径（方便自测）。
 * 默认只检查和给下载地址；「自动更新」由 server.mjs 调下面两个函数（downloadUpdate / sha256File）下载并交给安装器。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { once } from 'node:events';

export function parseVersion(v) {
  return String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((x) => Number(x) || 0);
}

export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const ax = x[i] || 0;
    const by = y[i] || 0;
    if (ax > by) return 1;
    if (ax < by) return -1;
  }
  return 0;
}

async function readManifest(target) {
  if (/^https?:\/\//i.test(target)) {
    const r = await fetch(target, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('清单请求失败 HTTP ' + r.status);
    const text = await r.text();
    if (text.length > 1024 * 1024) throw new Error('清单太大');
    return JSON.parse(text);
  }
  const file = path.resolve(target.replace(/^file:\/\//i, ''));
  const st = fs.statSync(file);
  if (!st.isFile()) throw new Error('不是文件：' + file);
  if (st.size > 1024 * 1024) throw new Error('清单文件太大');
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

export async function checkUpdate({ currentVersion = '', url = '' } = {}) {
  const target = String(url || '').trim();
  if (!target) return { ok: false, error: '还没填更新清单地址', current: currentVersion };
  try {
    const m = await readManifest(target);
    const latest = String(m.version || '').trim();
    if (!latest) return { ok: false, error: '清单里没有 version 字段', current: currentVersion };
    return {
      ok: true,
      current: currentVersion,
      latest,
      hasUpdate: compareVersions(latest, currentVersion) > 0,
      url: String(m.url || '').trim(),
      sha256: String(m.sha256 || '').trim().toLowerCase(),
      size: Number(m.size) || 0,
      notes: String(m.notes || '').slice(0, 2000),
      publishedAt: String(m.publishedAt || ''),
      source: target,
    };
  } catch (e) {
    return { ok: false, error: '检查更新失败：' + e.message, current: currentVersion };
  }
}

/* ---------------- 自动更新：下载安装包 ---------------- */

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (chunk) => h.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

/**
 * 把安装包下到本地。url 支持 http(s) 和本地文件路径（本地路径便于自测）。
 * onProgress(gotBytes, totalBytes)；sha256 给了就校验，不匹配直接删文件并抛错。
 */
export async function downloadUpdate({ url, file, sha256 = '', onProgress = null } = {}) {
  const target = String(url || '').trim();
  if (!target) throw new Error('缺下载地址');
  if (!file) throw new Error('缺保存路径');
  const expect = String(sha256 || '').trim().toLowerCase();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.part';

  const report = (got, total) => {
    try { onProgress?.(got, total); } catch { /* ignore */ }
  };

  try {
    if (/^https?:\/\//i.test(target)) {
      const r = await fetch(target, { signal: AbortSignal.timeout(60 * 60 * 1000) });
      if (!r.ok || !r.body) throw new Error('下载失败 HTTP ' + r.status);
      const total = Number(r.headers.get('content-length') || 0);
      const out = fs.createWriteStream(tmp);
      const reader = r.body.getReader();
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (!out.write(Buffer.from(value))) await once(out, 'drain');
        report(got, total);
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    } else {
      const src = path.resolve(target.replace(/^file:\/\//i, ''));
      const st = await fsp.stat(src);
      if (!st.isFile()) throw new Error('不是文件：' + src);
      await fsp.copyFile(src, tmp);
      report(st.size, st.size);
    }

    const size = fs.statSync(tmp).size;
    if (!size) throw new Error('下下来的文件是空的');
    /* 只认 exe：给成 zip 的话静默安装会变成"打开压缩包"，看着像成功其实没装 */
    const head = Buffer.alloc(2);
    const fd = fs.openSync(tmp, 'r');
    try { fs.readSync(fd, head, 0, 2, 0); } finally { fs.closeSync(fd); }
    if (head[0] !== 0x4d || head[1] !== 0x5a) throw new Error('下载下来的不是 exe（清单里可能给的是 zip），只能手动装');
    let digest = '';
    if (expect) {
      digest = await sha256File(tmp);
      if (digest !== expect) throw new Error(`校验不过：sha256 ${digest.slice(0, 12)}… ≠ 清单里的 ${expect.slice(0, 12)}…`);
    }
    fs.rmSync(file, { force: true });
    fs.renameSync(tmp, file);
    return { file, size, sha256: digest || (await sha256File(file)) };
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    throw e;
  }
}

