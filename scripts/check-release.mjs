/**
 * 发版前固定检查：把「用户拿到手会碰到什么」全过一遍再传。
 *   node scripts/check-release.mjs
 * 全过 exit 0，有一条不对 exit 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const setup = path.join(root, 'dist', 'installer', `LoRA-Vault-${ver}-setup.exe`);
const zipFile = path.join(root, 'dist', 'release', `LoRA-Vault-${ver}-win64.zip`);
const latest = path.join(root, 'dist', 'latest.json');
const appExe = path.join(root, 'dist', 'release', 'LoraLibrary', 'LoraLibrary.exe');
const installerSrc = path.join(root, 'scripts', 'build-installer.mjs');

const rows = [];
const add = (name, ok, detail = '') => rows.push({ name, ok, detail });

add('根版本号', /^\d+\.\d+\.\d+$/.test(ver), ver);
add('安装包存在', fs.existsSync(setup), path.basename(setup));
add('绿色包存在', fs.existsSync(zipFile), path.basename(zipFile));

/* zip 内容检查 */
if (fs.existsSync(zipFile)) {
  const { database } = await import('node:sqlite').then((m) => ({ database: m })).catch(() => ({ database: null }));
  /* 用 PowerShell 的 ZipFile 读条目，跟之前脚本一致 */
  const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z=[System.IO.Compression.ZipFile]::OpenRead('${zipFile.replace(/'/g, "''")}')
$out = @()
foreach ($e in $z.Entries) { $out += $e.FullName }
$z.Dispose()
$out -join "\`n"
`;
  let names = '';
  try {
    names = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  } catch { names = ''; }
  const list = names.split(/\r?\n/).filter(Boolean);
  add('zip 条目数', list.length > 100, String(list.length));
  add('zip 里没有备份文件', !list.some((n) => /\.(bak|orig|tmp)(-|$)/i.test(n)));
  add('zip 里没有 undici docs/types', !list.some((n) => /undici\\(docs|types)\\/i.test(n)));
  add('zip 里没有 backend.json', !list.some((n) => /backend\.json$/i.test(n)));

  const readZipJson = (entry) => {
    const ps2 = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z=[System.IO.Compression.ZipFile]::OpenRead('${zipFile.replace(/'/g, "''")}')
$e=$z.Entries | Where-Object { $_.FullName -eq '${entry}' } | Select-Object -First 1
if ($e) { $r=New-Object System.IO.StreamReader($e.Open()); $r.ReadToEnd(); $r.Close() }
$z.Dispose()
`;
    try { return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', ps2], { encoding: 'utf8' })); } catch { return null; }
  };
  const appPkg = readZipJson('LoraLibrary\\resources\\app\\package.json');
  const backPkg = readZipJson('LoraLibrary\\resources\\backend\\package.json');
  add('包内 app 版本', appPkg && appPkg.version === ver, appPkg ? appPkg.version : '读不到');
  add('包内后端版本', backPkg && backPkg.version === ver, backPkg ? backPkg.version : '读不到');
  add('公开包 channel=release', appPkg && appPkg.channel === 'release', appPkg ? String(appPkg.channel) : '读不到');
}

/* exe 版本信息 */
if (fs.existsSync(appExe)) {
  let v = '';
  try {
    v = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Item '${appExe.replace(/'/g, "''")}').VersionInfo.FileVersion`], { encoding: 'utf8' }).trim();
  } catch { v = ''; }
  add('app exe 版本信息', v === ver, v || '读不到');
}

/* 安装器外壳版本信息 */
if (fs.existsSync(setup)) {
  let v = '';
  try {
    v = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Item '${setup.replace(/'/g, "''")}').VersionInfo.FileVersion`], { encoding: 'utf8' }).trim();
  } catch { v = ''; }
  add('安装器外壳版本信息', v === ver, v || '读不到');
}

/* 安装器不建开发版快捷方式 */
if (fs.existsSync(installerSrc)) {
  const src = fs.readFileSync(installerSrc, 'utf8');
  const devMenuLines = src.split(/\r?\n/).filter((l) => l.includes('洛栈（开发）'));
  add('安装器不创建开发版快捷方式', devMenuLines.every((l) => /\bdel\b/.test(l)), devMenuLines.length ? `${devMenuLines.length} 处引用（只允许卸载清理）` : '无引用');
  add('安装器用复制而不是移动', !/Directory\.Move\(inner, dest\)/.test(src));
}

/* 更新清单 */
if (fs.existsSync(latest)) {
  const j = JSON.parse(fs.readFileSync(latest, 'utf8'));
  add('清单版本', j.version === ver, String(j.version));
  add('清单 url 是绝对地址', /^https?:\/\//i.test(String(j.url || '')), String(j.url || ''));
  add('清单 url 带当前版本', String(j.url || '').includes(ver), String(j.url || ''));
  const setupSha = fs.existsSync(setup) ? (execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-FileHash '${setup.replace(/'/g, "''")}' -Algorithm SHA256).Hash`], { encoding: 'utf8' }).trim().toLowerCase()) : '';
  add('清单 sha 与安装包一致', setupSha && j.sha256 === setupSha, `${String(j.sha256 || '').slice(0, 12)} vs ${setupSha.slice(0, 12)}`);
  const size = fs.existsSync(setup) ? fs.statSync(setup).size : 0;
  add('清单 size 与安装包一致', j.size === size, `${j.size} vs ${size}`);
}

let bad = 0;
for (const r of rows) {
  if (!r.ok) bad += 1;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
}
console.log(`\n${rows.length - bad} passed, ${bad} failed（版本 ${ver}）`);
if (bad) process.exitCode = 1;
