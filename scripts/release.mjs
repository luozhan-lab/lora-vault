#!/usr/bin/env node
/**
 * 一键发版：换 ?v= → 打发布包 → 打安装包 → 算 sha256 → 写 dist/latest.json（更新清单）
 *
 *   node scripts/release.mjs --url https://example.com/LoRA-Vault-1.1.0-setup.exe --notes "改了什么"
 *
 * 参数：
 *   --url        安装包最终落地的下载地址（放进清单，客户端拿它下载）。可以后填，先发清单也行
 *   --github     仓库 owner/repo：自动按 GitHub Release 固定直链算清单 URL（附件放 releases/latest/download 下）
 *   --notes      更新说明，会原样进清单，客户端「更新」面板会显示
 *   --notes-file 更新说明从 UTF-8 文件读（**中文建议用这个**：老 PowerShell 传参会把中文转成 GBK）
 *   --skip-build 不发包，只按现有 dist 里的东西重算清单
 *
 * 产物：
 *   dist/release/LoRA-Vault-<版本>-win64.zip
 *   dist/installer/LoRA-Vault-<版本>-setup.exe
 *   dist/latest.json        ← 这个和 setup.exe 一起传上去；设置页「更新清单地址」填它的 URL
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? String(argv[i + 1] ?? '') : '';
};
const has = (name) => argv.includes('--' + name);

const urlArg = arg('url').trim();
const github = arg('github').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
const notesFile = arg('notes-file').trim();
const notes = notesFile
  ? fs.readFileSync(path.resolve(root, notesFile), 'utf8').replace(/^\uFEFF/, '').trim()
  : arg('notes').trim();
const skipBuild = has('skip-build');

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8').replace(/^\uFEFF/, '')).version;
if (!version) {
  console.error('package.json 里没有 version');
  process.exit(1);
}

/* 1. 换 index.html 的 ?v=（每次发版都得换，不然客户端吃缓存；--skip-build 时别动，那次只是重算清单） */
const stamp = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
})();
const indexPath = path.join(root, 'public', 'v2', 'index.html');
if (skipBuild) {
  console.log('1/4 跳过 ?v=（--skip-build）');
} else {
  let html = fs.readFileSync(indexPath, 'utf8');
  const before = (html.match(/app\.(js|css)\?v=[\w]+/g) || []).join(',');
  html = html.replace(/(app\.js\?v=)[\w]+/g, `$1${stamp}`).replace(/(app\.css\?v=)[\w]+/g, `$1${stamp}`);
  fs.writeFileSync(indexPath, html, 'utf8');
  const after = (html.match(/app\.(js|css)\?v=[\w]+/g) || []).join(',');
  console.log(`1/4 ?v= ${before || '(无)'} → ${after}`);
}

/* 2+3. 打包 */
if (skipBuild) {
  console.log('2/4 跳过打包（--skip-build）');
} else {
  console.log('2/4 打发布包…');
  execFileSync(process.execPath, [path.join(root, 'desktop', 'build', 'release-public.mjs')], { cwd: root, stdio: 'inherit' });
  console.log('3/4 打安装包…');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-installer.mjs')], { cwd: root, stdio: 'inherit' });
}

const zip = path.join(root, 'dist', 'release', `LoRA-Vault-${version}-win64.zip`);
const setup = path.join(root, 'dist', 'installer', `LoRA-Vault-${version}-setup.exe`);
for (const f of [zip, setup]) {
  if (!fs.existsSync(f)) {
    console.error('少产物：' + f);
    process.exit(1);
  }
}

/* 4. 清单 */
const manifestFile = path.join(root, 'dist', 'latest.json');
const buf = fs.readFileSync(setup);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
const setupName = path.basename(setup);
const manifestName = 'latest.json';
/* GitHub Release 的固定直链：/releases/latest/download/<附件名>，永远指最新那个正式版 */
const ghAsset = (name) => (github ? `https://github.com/${github}/releases/latest/download/${encodeURIComponent(name)}` : '');
const url = urlArg || ghAsset(setupName) || setupName;
const manifest = {
  version,
  publishedAt: new Date().toISOString(),
  url,
  sha256,
  size: buf.length,
  notes,
};
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
console.log('4/4 写好清单');
console.log('\n产物：');
console.log(`  ${zip}  ${mb(fs.statSync(zip).size)}`);
console.log(`  ${setup}  ${mb(fs.statSync(setup).size)}`);
console.log(`  ${manifestFile}`);
console.log(`  sha256(安装包) = ${sha256}`);
if (!urlArg && !github) {
  console.log('\n⚠️ 清单里的 url 是占位文件名，传完安装包记得改成真实地址：');
  console.log('   node scripts/release.mjs --skip-build --url https://…/LoRA-Vault-' + version + '-setup.exe --notes-file …');
}
if (github) {
  const tag = 'v' + version;
  console.log(`\nGitHub（${github}）发布：`);
  console.log(`  1) 网页建 Release：https://github.com/${github}/releases/new?tag=${tag}&title=${tag}`);
  console.log('     附件传两个，名字一个字都别改：');
  console.log(`       ${setupName}`);
  console.log(`       ${manifestName}`);
  console.log('     别勾 "pre-release"（勾了 latest 就不指它）');
  console.log(`  2) 设置页「更新清单地址」填：${ghAsset(manifestName) || '(先给 --github owner/repo)'}`);
  console.log('  3) 老用户开软件自动查 → 「下载并更新」→「重启并安装」');
} else {
  console.log('\n接下来：');
  console.log('  1) 把 dist/installer 里的 setup.exe 和 dist/latest.json 传到同一个地方（静态站 / GitHub Release 附件都行）');
  console.log('  2) 设置页「更新清单地址」填 latest.json 的 URL；想让新装的用户默认就有，改 lib/config.mjs 的 DEFAULTS.updateUrl');
  console.log('  3) 老用户开软件会自动查一次，进设置 → 更新 → 「下载并更新」→「重启并安装」');
};
