/**
 * 公开版发布包：
 *   1. 生成 dist/public（后端 + 桌面壳，不含 data）
 *   2. 用 LORA_PUBLIC=1 把可运行目录装到 dist/release/LoraLibrary
 *   3. 放首次启动说明 / 隐私说明
 *   4. 可选代码签名（LORA_SIGN_PFX 等），最后压成 zip
 *
 * 用法：
 *   node desktop/build/release-public.mjs
 *
 * 可选：
 *   LORA_SIGN_PFX / LORA_SIGN_PASSWORD / LORA_SIGNTOOL / LORA_SIGN_TIMESTAMP
 *   LORA_SKIP_ZIP=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const releaseRoot = path.join(root, 'dist', 'release');
const appDir = path.join(releaseRoot, 'LoraLibrary');
/* 版本号只认根 package.json；桌面壳那份一起同步过去（app.getVersion() 读的是它） */
const version = (() => {
  const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
  const v = readJson(path.join(root, 'package.json')).version;
  const desktopPkg = path.join(root, 'desktop', 'package.json');
  const pkg = readJson(desktopPkg);
  if (pkg.version !== v) {
    pkg.version = v;
    fs.writeFileSync(desktopPkg, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`桌面壳版本同步为 ${v}`);
  }
  return String(v || '1.0.0');
})();

const run = (file, args, env = {}) => execFileSync(file, args, {
  cwd: root, stdio: 'inherit', env: { ...process.env, ...env },
});

console.log('1/5 生成 dist/public…');
run(process.execPath, [path.join(root, 'scripts', 'prepare-public.mjs')]);

console.log('2/5 清理 dist/release…');
fs.rmSync(releaseRoot, { recursive: true, force: true });
fs.mkdirSync(releaseRoot, { recursive: true });

console.log('3/5 组装可运行目录…');
run(process.execPath, [path.join(root, 'desktop', 'build', 'install.mjs')], {
  LORA_PUBLIC: '1',
  LORA_INSTALL_DIR: appDir,
  LORA_SKIP_SHORTCUT: '1',
});

if (!fs.existsSync(path.join(appDir, 'LoraLibrary.exe'))) {
  console.error('组装失败：没有 LoraLibrary.exe');
  process.exit(1);
}

console.log('4/5 放说明文件…');
const readme = `# 洛栈 · LoRA-Vault 公开版 ${version}

本软件包含成人内容相关功能，仅限 18 岁及以上用户使用。所有人物与场景均为虚构。

## 第一次启动

1. 解压整个 \`LoraLibrary\` 文件夹到可写目录。
2. 双击 \`LoraLibrary.exe\`。
3. 首次启动直接进向导（不再弹 18+）：
   - 自动找 ComfyUI / 模型 / LoRA
   - 找不到就手动设置路径
   - 保存后读 LoRA 触发词
4. 默认进入 **洛栈**：默认页是库，不是出图。出图是附带功能，点顶栏「出图」或左侧「创作」。
   创作页默认是 **正常模式**，只出正常图；要出成人内容，去 **设置 → 0 内容模式** 打开开关，先过一遍免责协议，成人词池才放开。专家页不受这个开关限制。
   选角色后，再选或随机「体型 / 场景 / 动作 / 服装 / 表情」；不选就随机，另有 1/4 张和「随机全部」。快速风格只负责填好这几项，不锁死。
   挂角色时体型用角色 LoRA 原设，不再叠加体型词；道具是独立开关，默认不带。
5. 洛栈有分类 / 作品 / 标签 / 排序 / 预览筛选 / 其它版本；详情能改字段、移动分类、删除记录、换预览、直接「用它出图」；记录能按 prompt 反查。
6. 库右上「下载」：贴 C站链接 / AIR / 版本号，一行一个可批量；也能直接搜 C站。下载队列能暂停 / 继续 / 清记录，下载即自动入库，并拉取触发词、特征词、底模、预览图、下载页、作者描述。
7. 设置第一次可点「自动检测」，找 ComfyUI / 模型 / LoRA；C站 API Key 也在设置里。
8. 创作页「高级参数」：模型、LoRA、场景/服装/动作、正面/负面词、尺寸、张数、步数、CFG、seed、两段式。
9. 出图后有结果历史、单字段重抽（换场景/服装/动作）、保留/丢弃/再出；设置里有体检和接口。
10. 体检里能直接补词和地址、补预览图、C站补全、补中文名、同步台账、清丢失、算 hash、标签归类；同 hash 重复组有明细，可点进详情，也可一键删重复记录（只删记录，不删文件）。
11. 出图时提示条显示进度，旁边能取消；取消会停掉 ComfyUI 当前那张。出图前有预检，模型 / LoRA / 词不对会先拦下。
12. 出图前确认 ComfyUI 已启动；设置里可以点「测试连接」看延迟、模型数、LoRA 数。
13. 旧版 2026-11-24 下线；本包只有新版界面。

## 许可

本软件保留所有权利，仅限个人在自己设备上使用；不得再分发、修改或商用。
完整条款见 \`LICENSE.txt\`。本软件含成人内容相关功能，仅限 18 岁及以上用户使用。

## 依赖

- ComfyUI（本地或局域网/远程地址）。
- 软件自带 \`resources\\node.exe\`，不用另装 Node。

## 数据放在哪

数据库、配置、预览图、日志都写在当前 Windows 用户的 AppData 下，
不在安装目录里；安装目录可以只读。

菜单「文件 → 打开数据目录」可以直接打开。

卸载：删除 \`LoraLibrary\` 文件夹，再删除 AppData 下的洛栈数据目录（%APPDATA%\LoRA-Vault）。
删除数据目录会丢掉洛栈记录、配置、预览和出图台账。

## 签名 / SmartScreen

当前构建如果没有配置代码签名证书，Windows 可能提示「未知发布者」。
正式发布建议用：

\`\`\`
$env:LORA_SIGN_PFX='C:\\path\\cert.pfx'
$env:LORA_SIGN_PASSWORD='...'
node desktop/build/release-public.mjs
\`\`\`

没有证书时不要勾选「已签名」；SmartScreen 提示属于预期。

## 隐私

本地运行，不上传任何数据，不做遥测。
只有你主动使用 ComfyUI 或 Civitai 搜索/下载时才会发网络请求。
详见 \`PRIVACY.md\`。

## 已知边界

- 远程 ComfyUI 的输出图通过本地后端 \`/api/comfy/view\` 代理。
- 远程 LoRA 只有名字；触发词需要手补。
- 视频 / 非图片模型默认隐藏；勾选后才显示。
`;
fs.writeFileSync(path.join(appDir, 'README-PUBLIC.md'), readme, 'utf8');

const privacy = `# 隐私说明

- 软件在本机运行。洛栈数据、配置、预览图、日志存在本机 AppData 下的数据目录。
- 软件不做遥测，不上传使用记录。
- 只有你主动使用以下功能时才会发网络请求：
  - 连接 ComfyUI（本地或你填写的远程地址）
  - Civitai 搜索、预览、下载（使用你填写的 API Key）
  - 打开外部网页
- Civitai API Key 保存在本机配置文件中，不会发给第三方。
- 日志只用于本机排错，不会自动上传。
`;
fs.writeFileSync(path.join(appDir, 'PRIVACY.md'), privacy, 'utf8');

fs.writeFileSync(path.join(appDir, 'VERSION.txt'), `洛栈 · LoRA-Vault ${version}\n`, 'utf8');
try { fs.copyFileSync(path.join(root, 'LICENSE'), path.join(appDir, 'LICENSE.txt')); } catch { /* ignore */ }
fs.writeFileSync(path.join(appDir, '首次启动.txt'), [
  '洛栈 · LoRA-Vault · 首次启动',
  '',
  '1. 双击 LoraLibrary.exe',
  '2. 默认是正常模式；要出成人内容，去 设置 → 0 内容模式 打开开关（先过免责协议）',
  '3. 默认进入洛栈；出图在顶栏「出图」/左侧「创作」；六项可选可随机',
  '4. 库右上「下载」：贴链接/AIR/版本号，一行一个可批量；也能搜 C站。队列支持暂停/继续/清记录，下载后自动入库并拉触发词、底模、预览、下载页、作者信息',
  '5. 第一次没配好，点「自动检测」找 ComfyUI / 模型 / LoRA；设置里可以「启动 ComfyUI」',
  '6. 设置 → 测试连接，可看延迟、模型数、LoRA 数和输出目录',
  '7. 高级参数（模型、LoRA、场景/服装/动作、词、尺寸、张数、步数、CFG、seed、两段式）在新版创作页',
  '8. 结果历史、保留/丢弃/再出、单字段重抽、体检、接口都在新版',
  '9. 详情可移动分类/删除记录/换预览；体检有重复组明细，也能补词/地址/预览、一键删重复记录',
  '',
  '数据目录：菜单「文件 → 打开数据目录」',
  '完整说明：README-PUBLIC.md',
].join('\r\n'), 'utf8');

if (process.env.LORA_SKIP_ZIP === '1') {
  console.log('5/5 跳过压缩（LORA_SKIP_ZIP=1）');
} else {
  console.log('5/5 压缩 zip…');
  const zip = path.join(releaseRoot, `LoRA-Vault-${version}-win64.zip`);
  const psQuote = (s) => s.replaceAll("'", "''");
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `Compress-Archive -Path '${psQuote(appDir)}' -DestinationPath '${psQuote(zip)}' -Force`,
    ], { stdio: 'inherit' });
    console.log('   ' + zip);
  } catch (e) {
    console.error('压缩失败：' + e.message);
    console.error('目录已生成，可手动压缩：' + appDir);
    process.exitCode = 1;
  }
}

console.log('\n发布目录：' + appDir);
console.log('说明：README-PUBLIC.md / PRIVACY.md / LICENSE.txt / 首次启动.txt');
