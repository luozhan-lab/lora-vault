/**
 * 生成公开发布包（不含任何个人数据）。
 *
 * 输出：
 *   dist/public/backend/   server.mjs + lib + public + node_modules（可直接跑）
 *   dist/public/desktop/   Electron 的 main.js / preload.js / assets
 *   dist/public/README-PUBLIC.md
 *
 * 打包后执行：
 *   $env:LORA_PUBLIC='1'; node desktop/build/install.mjs
 * 安装器会把 backend 放进 resources\backend；桌面端数据写 %APPDATA%\LoRA 库\data。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'dist', 'public');
const backend = path.join(out, 'backend');
const desktopOut = path.join(out, 'desktop');

const copy = (from, to, options = {}) => {
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true, force: true, ...options });
};

console.log('1/4 清理 dist/public…');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(backend, { recursive: true });
fs.mkdirSync(desktopOut, { recursive: true });

console.log('2/4 复制后端（不含 data）…');
for (const f of ['server.mjs', 'package.json', 'package-lock.json']) {
  copy(path.join(root, f), path.join(backend, f));
}
for (const d of ['lib', 'public']) {
  copy(path.join(root, d), path.join(backend, d));
}
copy(path.join(root, 'LICENSE'), path.join(backend, 'LICENSE'));
copy(path.join(root, 'node_modules'), path.join(backend, 'node_modules'), {
  filter: (src) => !/[\\/](\.cache|\.bin)([\\/]|$)/.test(src),
});

console.log('3/4 复制桌面壳…');
for (const f of ['main.js', 'preload.js', 'package.json']) {
  copy(path.join(root, 'desktop', f), path.join(desktopOut, f));
}
copy(path.join(root, 'desktop', 'assets'), path.join(desktopOut, 'assets'));

console.log('4/4 写说明并检查…');
const readme = `# LoRA 库 · 公开发布包

这是已经清掉个人数据的发布包。

## 目录
- \`backend/\`：本地 Node 后端（server.mjs + public + node_modules）。
- \`desktop/\`：Electron 外壳（main.js / preload.js / assets）。

## 安装
在项目根目录执行：

\`\`\`powershell
$env:LORA_PUBLIC='1'
node desktop/build/install.mjs
\`\`\`

安装器会把 \`dist/public/backend\` 放到安装目录的 \`resources/backend\`。
桌面端启动后端时会传 \`LORA_LIBRARY_DATA\`，数据库、配置、预览图都写到：

\`%APPDATA%\\LoRA 库\\data\`

所以不要往 \`resources/backend\` 里写 data；公开安装目录可能只读。

## 数据不包含
- 个人 \`lora.db\`
- \`config.json\`（含 token / 个人路径）
- 预览图、thumbnails、出图台账
- 任何个人盘符路径 / 个人库目录配置

第一次启动会走向导：自动找 ComfyUI、模型、LoRA，找不到再手动选。路径不写死。

## 依赖
- Node.js >= 22.5（Electron 外壳会找系统 node，或把 node.exe 放到后端目录/electron resources）。
- ComfyUI 本机地址默认 \`http://127.0.0.1:8188\`。
`;
fs.writeFileSync(path.join(out, 'README-PUBLIC.md'), readme, 'utf8');

/* ---------- 检查 ---------- */
const banned = [
  { name: '个人 data 目录', p: path.join(backend, 'data') },
  { name: '个人 lora.db', p: path.join(backend, 'data', 'lora.db') },
  { name: '个人 config.json', p: path.join(backend, 'data', 'config.json') },
];
for (const b of banned) {
  if (fs.existsSync(b.p)) {
    console.error('发布包里有', b.name, '：' + b.p);
    process.exit(1);
  }
}

const personal = /C:\\Users\\16500|D:\\AI资产库|D:\\Comfy-Desktop\\studio/i;
const scan = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'data') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { scan(p); continue; }
    if (!/\.(mjs|js|cjs|json|html|css|md|txt|yaml|yml)$/i.test(ent.name)) continue;
    let s = '';
    try { s = fs.readFileSync(p, 'utf8'); } catch { continue; }
    if (personal.test(s)) {
      console.error('发布包里发现个人路径：' + p);
      process.exit(1);
    }
  }
};
scan(backend);
scan(desktopOut);

const size = (dir) => {
  let n = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) n += size(p);
    else { try { n += fs.statSync(p).size; } catch { /* ignore */ } }
  }
  return n;
};
console.log(`\n完成：${out}`);
console.log(`后端约 ${(size(backend) / 1024 / 1024).toFixed(1)} MB，桌面壳约 ${(size(desktopOut) / 1024 / 1024).toFixed(1)} MB`);
console.log('个人数据检查通过。');
