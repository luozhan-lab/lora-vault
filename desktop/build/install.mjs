/**
 * 装到用户目录：%LOCALAPPDATA%\Programs\LoraLibrary
 * 后端仍然跑工作区里那份（data 也在那儿），exe 旁边写 backend.json 指过去。
 *
 * 注意：不能装在工作区里 —— 工作区目录有一条 Everyone 拒绝删除子项的 ACL，
 * Chromium 启动时会删自己的临时文件，撞上就崩（EXCEPTION_BREAKPOINT）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(appDir, '..');
const PUBLIC = process.env.LORA_PUBLIC === '1';
const publicBackend = path.join(projectRoot, 'dist', 'public', 'backend');
if (PUBLIC && !fs.existsSync(path.join(publicBackend, 'server.mjs'))) {
  console.error('缺 dist/public/backend，先跑 node scripts/prepare-public.mjs');
  process.exit(1);
}
const electronDist = [
  path.join(appDir, 'runtime'),
  path.join(appDir, 'node_modules', 'electron', 'dist'),
].find((p) => fs.existsSync(path.join(p, 'electron.exe')));

if (!electronDist) {
  console.error('缺 electron 运行时（desktop/runtime）');
  process.exit(1);
}

const customRoot = process.env.LORA_INSTALL_DIR ? path.resolve(process.env.LORA_INSTALL_DIR) : '';
const installRoot = customRoot || path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'LoraLibrary');
const skipShortcut = process.env.LORA_SKIP_SHORTCUT === '1' || !!customRoot;

console.log('安装到', installRoot);

if (!customRoot && !installRoot.startsWith(path.join(os.homedir(), 'AppData'))) {
  console.error('安装路径不对，停');
  process.exit(1);
}
if (customRoot && path.basename(installRoot) !== 'LoraLibrary') {
  console.error('自定义安装目录必须以 LoraLibrary 结尾，避免误删');
  process.exit(1);
}

console.log('1/5 复制运行时…');
fs.rmSync(installRoot, { recursive: true, force: true });
fs.mkdirSync(installRoot, { recursive: true });
fs.cpSync(electronDist, installRoot, { recursive: true });

console.log('2/5 改名 exe…');
const exePath = path.join(installRoot, 'LoraLibrary.exe');
fs.renameSync(path.join(installRoot, 'electron.exe'), exePath);

console.log('3/5 放界面…');
const resApp = path.join(installRoot, 'resources', 'app');
fs.mkdirSync(resApp, { recursive: true });
for (const f of ['main.js', 'preload.js']) fs.copyFileSync(path.join(appDir, f), path.join(resApp, f));
fs.cpSync(path.join(appDir, 'assets'), path.join(resApp, 'assets'), { recursive: true });
fs.writeFileSync(path.join(resApp, 'package.json'), JSON.stringify({
  name: 'lora-library',
  productName: '洛栈 LoRA-Vault',
  version: '1.0.0',
  main: 'main.js',
}, null, 2), 'utf8');
const defApp = path.join(installRoot, 'resources', 'default_app.asar');
if (fs.existsSync(defApp)) fs.rmSync(defApp);

console.log('4/5 指后端…');
if (PUBLIC) {
  const resBackend = path.join(installRoot, 'resources', 'backend');
  fs.cpSync(publicBackend, resBackend, { recursive: true, force: true });
  // 公开版用户机器上不一定装了 Node；安装器自己就是 Node 22+，把它一起带上。
  try {
    fs.copyFileSync(process.execPath, path.join(installRoot, 'resources', 'node.exe'));
    console.log('   内置 node.exe -> resources/node.exe');
  } catch (e) {
    console.log('   内置 node.exe 失败（用户需自己装 Node 22+）:', e.message);
  }
  console.log('   公开发布包后端 -> resources/backend（数据走 %APPDATA%）');
} else {
  fs.writeFileSync(path.join(installRoot, 'backend.json'), JSON.stringify({ root: projectRoot }, null, 2), 'utf8');
}

// exe 的图标和版本信息（装不上 rcedit 就跳过，不影响用）
try {
  const require = (await import('node:module')).createRequire(import.meta.url);
  const mod = require('rcedit');
  const rcedit = mod.rcedit || mod.default || mod;
  await rcedit(exePath, {
    icon: path.join(resApp, 'assets', 'icon.ico'),
    'file-version': '1.0.0',
    'product-version': '1.0.0',
    'version-string': {
      CompanyName: 'local',
      FileDescription: '洛栈 LoRA-Vault — 本地 LoRA 管理器',
      ProductName: '洛栈 LoRA-Vault',
      OriginalFilename: 'LoraLibrary.exe',
      InternalName: 'LoraLibrary',
    },
  });
  console.log('   图标/版本信息已写进 exe');
} catch (e) {
  console.log('   跳过 rcedit:', e.message);
}

/* 可选代码签名：没配证书就跳过，公开包至少不会误报「已签名」。
   环境变量：
     LORA_SIGN_PFX       .pfx 证书路径
     LORA_SIGN_PASSWORD  证书密码
     LORA_SIGNTOOL       signtool.exe 路径（默认从 PATH 找）
     LORA_SIGN_TIMESTAMP 时间戳服务器（可选）
*/
async function signExe(file) {
  const pfx = process.env.LORA_SIGN_PFX || '';
  if (!pfx) {
    console.log('   未配 LORA_SIGN_PFX，跳过代码签名（SmartScreen 可能提示未知发布者）');
    return;
  }
  const signTool = process.env.LORA_SIGNTOOL || 'signtool.exe';
  const pwd = process.env.LORA_SIGN_PASSWORD || '';
  const ts = process.env.LORA_SIGN_TIMESTAMP || 'http://timestamp.digicert.com';
  const args = ['sign', '/fd', 'SHA256', '/f', pfx];
  if (pwd) args.push('/p', pwd);
  args.push('/tr', ts, '/td', 'SHA256', file);
  try {
    execFileSync(signTool, args, { stdio: 'inherit' });
    console.log('   已签名：' + file);
  } catch (e) {
    console.error('   代码签名失败：' + e.message);
    process.exitCode = 1;
  }
}
await signExe(exePath);

if (skipShortcut) {
  console.log('5/5 跳过桌面快捷方式（打包/自定义目录）');
} else {
console.log('5/5 桌面快捷方式…');
const desktop = path.join(os.homedir(), 'Desktop');
const lnk = path.join(desktop, '洛栈.lnk');
// 用 exe 自带的图标：icon.ico 是 PNG 压缩的，个别机器做快捷方式图标会显示成白纸
const icoPath = exePath;
if (fs.existsSync(desktop)) {
  const ps = [
    '$ws = New-Object -ComObject WScript.Shell',
    `$s = $ws.CreateShortcut('${lnk.replaceAll("'", "''")}')`,
    `$s.TargetPath = '${exePath.replaceAll("'", "''")}'`,
    `$s.WorkingDirectory = '${installRoot.replaceAll("'", "''")}'`,
    `$s.IconLocation = '${icoPath.replaceAll("'", "''")},0'`,
    "$s.Description = '洛栈 LoRA-Vault — 本地 LoRA 管理器'",
    '$s.Save()',
  ].join('; ');
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', ps]); console.log('  快捷方式:', lnk); }
  catch (e) { console.log('  快捷方式失败:', e.message); }
  /* 开发版：同一个 exe 带 --dev（独立数据 + 调试端口 9222） */
  const devLnk = path.join(desktop, '洛栈（开发）.lnk');
  const psDev = [
    '$ws = New-Object -ComObject WScript.Shell',
    `$s = $ws.CreateShortcut('${devLnk.replaceAll("'", "''")}')`,
    `$s.TargetPath = '${exePath.replaceAll("'", "''")}'`,
    `$s.Arguments = '--dev'`,
    `$s.WorkingDirectory = '${installRoot.replaceAll("'", "''")}'`,
    `$s.IconLocation = '${icoPath.replaceAll("'", "''")},0'`,
    "$s.Description = '洛栈 开发版 — 独立数据 + 调试端口 9222'",
    '$s.Save()',
  ].join('; ');
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', psDev]); console.log('  开发版快捷方式:', devLnk); }
  catch (e) { console.log('  开发版快捷方式失败:', e.message); }
}
}

console.log('\n完成:', exePath);
