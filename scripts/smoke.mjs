/**
 * 冒烟：一条命令跑完全部回归。
 *   npm run smoke
 * 自己起一个 dev 后端（8899，数据用 tmp/devdata 副本），依次跑接口和界面测试，最后关后端。
 * 任何一组失败就让整体失败。
 */
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const env = { ...process.env, LORA_LIBRARY_DATA: path.join(root, 'tmp', 'devdata', 'data') };
const BASE = 'http://127.0.0.1:8899';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(1500) });
      if (r.ok) return true;
    } catch { /* retry */ }
    await sleep(400);
  }
  return false;
}

/* 需要 8899 的测试 */
const API_TESTS = [
  ['分类 API', 'tmp/cat-test.mjs'],
  ['下载归类', 'tmp/cat-download-test.mjs'],
  ['批量改分类 API', 'tmp/bulk-test.mjs'],
  ['恢复默认分类 API', 'tmp/restore-test.mjs'],
  ['描述词表解析', 'tmp/desc-test.mjs'],
  ['词性分类', 'tmp/classify-test.mjs'],
  ['下载参数（空 subdir）', 'tmp/subdir-test.mjs'],
  ['C 站搜索链路', 'tmp/civitai-e2e.mjs'],
];

/* 需要无头浏览器（脚本自己拉 Edge） */
const UI_TESTS = [
  ['十层布局', 'tmp/layers-layout-test.cjs'],
  ['分类树界面', 'tmp/cat-ui-test2.cjs'],
  ['批量选择界面', 'tmp/bulk-ui.cjs'],
  ['导入向导', 'tmp/wizard-ui.cjs'],
  ['恢复默认界面', 'tmp/restore-ui.cjs'],
  ['淫纹位置/图案', 'tmp/tattoo-test.cjs'],
  ['九页巡检', 'tmp/gallery-test/regress.cjs'],
];

let server = null;
const results = [];
const run = (label, file) => {
  const fp = path.join(root, file);
  if (!fs.existsSync(fp)) { results.push([label, 'skip', '文件不存在']); return; }
  try {
    execFileSync(process.execPath, [fp], { cwd: root, stdio: 'pipe', timeout: 240000, env });
    results.push([label, 'ok', '']);
  } catch (e) {
    const out = String(e.stderr || e.stdout || e.message || '').split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
    results.push([label, 'fail', out.slice(0, 300)]);
  }
};

const started = Date.now();
console.log('起 dev 后端（8899）…');
server = spawn(process.execPath, ['server.mjs', '--port', '8899'], { cwd: root, env, stdio: 'ignore' });
const healthy = await waitHealthy();
if (!healthy) {
  console.error('后端没起来，放弃');
  try { server.kill(); } catch { /* ignore */ }
  process.exit(1);
}
await sleep(800);

for (const [label, file] of API_TESTS) run(label, file);
for (const [label, file] of UI_TESTS) run(label, file);

try { server.kill(); } catch { /* ignore */ }

const bad = results.filter((r) => r[1] === 'fail').length;
console.log('\n=== 冒烟结果 ===');
for (const [label, st, detail] of results) {
  console.log(`${st === 'ok' ? 'ok  ' : st === 'skip' ? 'skip' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
}
console.log(`\n${results.length - bad} 组通过，${bad} 组失败，用时 ${((Date.now() - started) / 1000).toFixed(0)} 秒`);
if (bad) process.exitCode = 1;
