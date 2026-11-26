'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');

/* 开发版：同一个 exe 加 --dev（或设 LORA_DEV=1）。
   正式版：调试端口不开、数据在 %APPDATA%\LoRA-Vault、端口 8787。
   开发版：userData 另开一份（%APPDATA%\LoRA-Vault-Dev）、端口 8789、自动开 CDP 9222。 */
/* 发行版标记：桌面壳 package.json 里 channel=release 时，--dev / LORA_DEV 一律无效。
   公开包不能带着「开发版全放开」的开关出门，否则等于把内部入口交给用户。 */
const IS_RELEASE = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw).channel === 'release';
  } catch { return false; }
})();
const DEV = !IS_RELEASE && (process.argv.includes('--dev') || process.env.LORA_DEV === '1');

/* 路径全英文：数据目录统一放 %APPDATA%\LoRA-Vault（开发版 LoRA-Vault-Dev）。
   老用户的数据在 %APPDATA%\LoRA 库，第一次启动复制过去；复制失败才回退老目录，别把库弄丢。 */
const USERDATA_DIR = path.join(app.getPath('appData'), 'LoRA-Vault');
const LEGACY_USERDATA = path.join(app.getPath('appData'), 'LoRA 库');
const DEV_USERDATA = path.join(app.getPath('appData'), 'LoRA-Vault-Dev');
try {
  if (DEV) {
    /* 开发版老数据在「洛栈（开发）」，路径改英文后新目录是空壳时补迁一次 */
    const legacyDev = path.join(app.getPath('appData'), '洛栈（开发）');
    const devDb = path.join(DEV_USERDATA, 'data', 'lora.db');
    if (!fs.existsSync(devDb) && fs.existsSync(path.join(legacyDev, 'data', 'lora.db'))) {
      try { fs.cpSync(legacyDev, DEV_USERDATA, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    fs.mkdirSync(DEV_USERDATA, { recursive: true });
    app.setPath('userData', DEV_USERDATA);
  } else {
    let migrated = fs.existsSync(USERDATA_DIR);
    if (!migrated && fs.existsSync(LEGACY_USERDATA)) {
      try {
        fs.cpSync(LEGACY_USERDATA, USERDATA_DIR, { recursive: true });
        migrated = true;
      } catch { migrated = false; }
    }
    if (!migrated && fs.existsSync(USERDATA_DIR)) migrated = true;
    const dir = migrated ? USERDATA_DIR : LEGACY_USERDATA;
    fs.mkdirSync(dir, { recursive: true });
    app.setPath('userData', dir);
  }
} catch { /* ignore */ }

/* 开发版默认开调试端口（CDP / DevTools 用），可用 --remote-debugging-port=xxxx 覆盖 */
if (DEV && !app.commandLine.hasSwitch('remote-debugging-port')) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

// Cloudflare 会拦 Electron 的 UA，装成普通 Chrome
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
app.userAgentFallback = BROWSER_UA;
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

const HOST = '127.0.0.1';
const PORT = DEV ? 8789 : 8787;
const APP_TITLE = DEV ? '洛栈 · 开发' : '洛栈 · LoRA-Vault';
const DEV_TAG = DEV ? '\n模式：开发版（--dev）' : '';

let win = null;
let backend = null;
let ownsBackend = false;
let backendRoot = null;
let logStream = null;

/* ---------------------------- 路径 ---------------------------- */

function firstExisting(list) {
  for (const p of list) {
    if (!p) continue;
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}

function resolveBackendRoot() {
  const candidates = [];
  // 1) 环境变量
  candidates.push(process.env.LORA_BACKEND);
  // 2) exe 旁边的 backend.json   {"root":"D:\\...\\lora-library"}
  try {
    const exeDir = path.dirname(app.getPath('exe'));
    const cfgFile = path.join(exeDir, 'backend.json');
    if (fs.existsSync(cfgFile)) {
      const raw = fs.readFileSync(cfgFile, 'utf8').replace(/^\uFEFF/, '');
      const cfg = JSON.parse(raw);
      // root 可以是相对的（安装包用 backend），相对 exe 所在目录
      if (cfg.root) candidates.push(path.resolve(exeDir, cfg.root));
    }
    candidates.push(path.join(exeDir, 'backend'));
    candidates.push(path.join(exeDir, '..'));
    candidates.push(path.join(process.resourcesPath || '', 'backend'));
  } catch { /* ignore */ }
  // 3) 打包目录 / 开发目录
  candidates.push(path.join(__dirname, 'backend'));
  candidates.push(path.join(__dirname, '..'));
  candidates.push(path.join(__dirname, '..', '..'));
  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (fs.existsSync(path.join(dir, 'server.mjs'))) return path.resolve(dir);
    } catch { /* ignore */ }
  }
  return null;
}

function resolveNode(root) {
  const candidates = [
    process.env.LORA_NODE,
    path.join(root || '', 'node.exe'),
    path.join(process.resourcesPath || '', 'node.exe'),
    'C:\\Program Files\\nodejs\\node.exe',
    'node',
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (c === 'node') return c;
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return 'node';
}

/* 数据目录：
   - 开发/老用户：后端目录下已经有 data/lora.db 或 config.json，继续用，不搬库；
   - 公开安装：后端在 resources/backend（Program Files 可能只读），数据放 %APPDATA%/LoraLibrary/data。 */
function dataDir() {
  const legacy = backendRoot ? path.join(backendRoot, 'data') : '';
  try {
    if (legacy && (fs.existsSync(path.join(legacy, 'lora.db')) || fs.existsSync(path.join(legacy, 'config.json')))) {
      return legacy;
    }
  } catch { /* ignore */ }
  return path.join(app.getPath('userData'), 'data');
}

function logFile() {
  try {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'desktop.log');
  } catch {
    return path.join(app.getPath('userData'), 'desktop.log');
  }
}

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  try {
    if (!logStream) logStream = fs.createWriteStream(logFile(), { flags: 'a' });
    logStream.write(msg + '\n');
  } catch { /* ignore */ }
}

/* ---------------------------- 后端 ---------------------------- */

function ping() {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: '/api/health', timeout: 1200 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { if (body.length < 4096) body += d; });
      res.on('end', () => {
        /* 端口上可能是别的东西（200 但不是一个洛栈后端）：只认 /api/health 的 JSON */
        try {
          const j = JSON.parse(body);
          resolve(!!j && j.ok === true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function waitForBackend(timeoutMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      if (await ping()) return resolve(true);
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(tick, 400);
    };
    tick();
  });
}

async function ensureBackend() {
  if (await ping()) {
    log('已有后端在跑，直接用');
    ownsBackend = false;
    return true;
  }

  backendRoot = resolveBackendRoot();
  if (!backendRoot) {
    log('找不到 server.mjs');
    return false;
  }

  const node = resolveNode(backendRoot);
  log(`启动后端: ${node} server.mjs  cwd=${backendRoot}`);

  backend = spawn(node, ['server.mjs', ...(DEV ? ['--port', String(PORT)] : [])], {
    cwd: backendRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LORA_APP: '1', LORA_LIBRARY_DATA: dataDir() },
  });
  ownsBackend = true;

  backend.stdout.on('data', (d) => log('[out] ' + String(d).trimEnd()));
  backend.stderr.on('data', (d) => log('[err] ' + String(d).trimEnd()));
  backend.on('exit', (code) => {
    log('后端退出 code=' + code);
    backend = null;
    if (code && win && !win.isDestroyed()) {
      win.webContents.send('backend-down', code);
    }
  });

  return waitForBackend(45000);
}

function stopBackend() {
  if (backend && ownsBackend) {
    log('关闭后端');
    try { backend.kill(); } catch { /* ignore */ }
    backend = null;
  }
}

/* ---------------------------- 窗口 ---------------------------- */

const stateFile = () => path.join(app.getPath('userData'), 'window.json');

function loadBounds() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch { /* ignore */ }
  return { width: 1460, height: 940 };
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify(b), 'utf8');
  } catch { /* ignore */ }
}

/* ---------------------- C 站网页下载落地 ---------------------- */

function lorasRootFromConfig() {
  try {
    const p = path.join(dataDir(), 'config.json');
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
    return String(cfg.lorasRoot || '');
  } catch { return ''; }
}

function uniqueSavePath(dir, name) {
  let target = path.join(dir, name);
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  for (let i = 1; i < 500; i++) {
    target = path.join(dir, `${base}-${i}${ext}`);
    if (!fs.existsSync(target)) return target;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

function hookBrowserDownloads() {
  const dirs = [app.getPath('downloads')];
  const seen = new Set();
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      fs.watch(dir, { persistent: false }, (_ev, name) => {
        if (!name || !/\.safetensors$/i.test(String(name))) return;
        const full = path.join(dir, String(name));
        setTimeout(() => {
          try {
            if (!fs.existsSync(full)) return;
            const st = fs.statSync(full);
            if (st.size < 1024) return;
            if (seen.has(full + ':' + st.mtimeMs)) return;
            seen.add(full + ':' + st.mtimeMs);
            if (win && !win.isDestroyed()) {
              win.webContents.send('external-download', { file: full });
            }
          } catch { /* ignore */ }
        }, 2500);
      });
    } catch { /* ignore */ }
  }
}

function hookCivitaiDownloads() {
  session.defaultSession.on('will-download', (event, item) => {
    const url = String(item.getURL() || '');
    if (!/civitai\.com/i.test(url)) return;
    const root = lorasRootFromConfig();
    if (!root) return;
    let dir;
    try {
      dir = path.join(root, 'C站下载');
      fs.mkdirSync(dir, { recursive: true });
    } catch { return; }

    const name = path.basename(item.getFilename() || 'civitai-download.safetensors');
    try { item.setSavePath(uniqueSavePath(dir, name)); } catch { /* ignore */ }

    item.once('done', (_e, state) => {
      const file = item.getSavePath();
      const m = url.match(/\/download\/models\/(\d+)/) || url.match(/modelVersionId=(\d+)/);
      const versionId = m ? m[1] : '';
      if (win && !win.isDestroyed()) {
        win.webContents.send('civitai:downloaded', {
          ok: state === 'completed',
          file,
          versionId,
          url,
        });
      }
    });
  });
}
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  try { contents.setUserAgent(BROWSER_UA); } catch { /* ignore */ }
  // Turnstile 会看 navigator.userAgentData，Electron 默认没有，这里补成 Chrome 的品牌列表
  try {
    contents.debugger.attach('1.3');
    contents.debugger.sendCommand('Emulation.setUserAgentOverride', {
      userAgent: BROWSER_UA,
      acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
      platform: 'Win32',
      userAgentMetadata: {
        brands: [
          { brand: 'Not?A_Brand', version: '99' },
          { brand: 'Google Chrome', version: '126' },
          { brand: 'Chromium', version: '126' },
        ],
        fullVersion: '126.0.0.0',
        platform: 'Windows',
        platformVersion: '10.0.0',
        architecture: 'x86',
        model: '',
        mobile: false,
        bitness: '64',
        wow64: false,
      },
    }).catch(() => {});
  } catch { /* ignore */ }
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});

function createWindow() {
  const b = loadBounds();
  win = new BrowserWindow({
    width: b.width,
    height: b.height,
    x: Number.isFinite(b.x) ? b.x : undefined,
    y: Number.isFinite(b.y) ? b.y : undefined,
    minWidth: 1080,
    minHeight: 720,
    title: APP_TITLE,
    frame: false,
    backgroundColor: '#07090f',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false,
      additionalArguments: DEV ? ['--loradev'] : [],
    },
  });

  win.once('ready-to-show', () => { win.show(); });
  win.on('maximize', () => { if (!win.isDestroyed()) win.webContents.send('win:state', true); });
  win.on('unmaximize', () => { if (!win.isDestroyed()) win.webContents.send('win:state', false); });
  win.on('close', saveBounds);
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://${HOST}:${PORT}`)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  const splash = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#07090f;color:#eef2fb;
      font:14px/1.6 "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",system-ui;
      display:grid;place-items:center;-webkit-user-select:none;overflow:hidden}
    body::before{content:"";position:fixed;inset:-20%;pointer-events:none;
      background:
        radial-gradient(52% 46% at 28% 18%,rgba(96,124,255,.20),transparent 62%),
        radial-gradient(48% 44% at 78% 10%,rgba(183,135,255,.15),transparent 60%),
        radial-gradient(60% 50% at 50% 110%,rgba(58,96,200,.12),transparent 62%);
      filter:blur(12px)}
    .box{position:relative;text-align:center;animation:in .55s cubic-bezier(.2,.8,.2,1) both}
    .logo{width:72px;height:72px;border-radius:22px;margin:0 auto 20px;
      background:
        linear-gradient(145deg,rgba(255,255,255,.34),transparent 46%),
        linear-gradient(135deg,#7a8cff 0%,#9d7bff 52%,#c084fc 100%);
      display:grid;place-items:center;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -10px 22px rgba(60,30,120,.28),0 18px 48px rgba(108,92,255,.42)}
    .logo svg{width:38px;height:38px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.28))}
    .t{font-size:18px;font-weight:700;letter-spacing:.02em;
      background:linear-gradient(90deg,#f4f7ff 0%,#c3d2ff 55%,#e0cbff 100%);
      -webkit-background-clip:text;background-clip:text;color:transparent}
    .k{font-size:9px;font-weight:600;letter-spacing:.26em;color:#6f7b96;
      text-transform:uppercase;margin:3px 0 18px}
    .s{font-size:12px;color:#8b97b1}
    .bar{width:228px;height:4px;border-radius:999px;background:rgba(255,255,255,.07);
      margin:18px auto 0;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.45)}
    .bar i{display:block;width:42%;height:100%;border-radius:999px;
      background:linear-gradient(90deg,#5b7cff,#a06bff);
      box-shadow:0 0 14px rgba(126,162,255,.55);
      animation:mv 1.15s infinite cubic-bezier(.55,.1,.45,.9)}
    @keyframes mv{0%{transform:translateX(-110%)}100%{transform:translateX(345%)}}
    @keyframes in{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:none}}
  </style></head><body><div class="box">
    <div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="m3 12.2 9 4.5 9-4.5"/><path d="m3 16.7 9 4.5 9-4.5"/>
    </svg></div>
    <div class="t">洛栈 · LoRA-Vault</div>
    <div class="k">Model Library</div>
    <div class="s">正在启动本地服务…</div>
    <div class="bar"><i></i></div>
  </div></body></html>`;

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splash));
  return win;
}

/* ---------------------------- 菜单 ---------------------------- */

function openPath(p) {
  if (!p) return;
  try { fs.mkdirSync(p, { recursive: true }); } catch { /* ignore */ }
  shell.openPath(p);
}

/* 菜单里的目录别写死：从后端 data/config.json 读，别人换了盘也能打开对的地方 */
function cfgPath(key) {
  try {
    const file = path.join(dataDir(), 'config.json');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (key === 'lorasRoot') return cfg.lorasRoot || '';
    if (key === 'samplesRoot') return cfg.samplesRoot || '';
    if (key === 'outputRoot') return (cfg.gen && cfg.gen.outputRoot) || '';
  } catch { /* ignore */ }
  return '';
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '打开数据目录', click: () => openPath(dataDir()) },
        { label: '打开 LoRA 目录', click: () => openPath(cfgPath('lorasRoot') || dataDir()) },
        { label: '打开出图目录', click: () => openPath(cfgPath('outputRoot') || dataDir()) },
        { label: '打开预览图目录', click: () => openPath(cfgPath('samplesRoot') || dataDir()) },
        { type: 'separator' },
        { label: '重新加载', accelerator: 'F5', click: () => win && win.reload() },
        { type: 'separator' },
        { label: '退出', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: '查看',
      submenu: [
        { label: '放大', accelerator: 'CmdOrCtrl+=', click: () => zoom(0.1) },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => zoom(-0.1) },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', click: () => win && win.webContents.setZoomFactor(1) },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '接口文档', click: () => openPath(path.join(backendRoot || '', 'docs', 'API.md')) },
        { label: '打开日志', click: () => openPath(logFile()) },
        {
          label: '关于',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: '关于',
            message: '洛栈 · LoRA-Vault ' + app.getVersion() + (DEV ? ' · 开发版' : ''),
            detail: `后端目录：${backendRoot || '(未找到)'}\n地址：http://${HOST}:${PORT}\nElectron ${process.versions.electron} · Node ${process.versions.node}\n许可：保留所有权利（LICENSE.txt）${DEV_TAG}`,
            buttons: ['好'],
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function zoom(delta) {
  if (!win) return;
  const z = Math.min(2.5, Math.max(0.6, win.webContents.getZoomFactor() + delta));
  win.webContents.setZoomFactor(z);
}

/* ---------------------------- IPC ---------------------------- */

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  backend: backendRoot,
  port: PORT,
  dev: DEV,
  debugPort: DEV ? 9222 : 0,
  node: process.versions.node,
  electron: process.versions.electron,
}));
ipcMain.handle('app:open-data', () => openPath(dataDir()));
ipcMain.handle('app:open-loras', () => openPath('D:\\AI资产库\\loras'));
ipcMain.handle('app:log', () => logFile());
/* 设置页选文件夹 */
ipcMain.handle('app:pick-folder', async (_e, opts = {}) => {
  try {
    const r = await dialog.showOpenDialog(win, {
      title: String(opts.title || '选择文件夹'),
      defaultPath: opts.defaultPath ? String(opts.defaultPath) : undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled || !r.filePaths.length ? '' : r.filePaths[0];
  } catch { return ''; }
});
ipcMain.handle('app:open-dir', (_e, kind) => {
  const map = {
    data: () => dataDir(),
    loras: () => cfgPath('lorasRoot') || 'D:\\AI资产库\\loras',
    output: () => cfgPath('outputRoot') || dataDir(),
    samples: () => cfgPath('samplesRoot') || dataDir(),
  };
  openPath((map[kind] || map.data)());
  return true;
});
ipcMain.handle('app:open-api', () => openPath(path.join(backendRoot || '', 'docs', 'API.md')));
ipcMain.handle('app:open-log', () => openPath(logFile()));
ipcMain.handle('app:about', () => dialog.showMessageBox(win, {
  type: 'info',
  title: '关于',
  message: '洛栈 · LoRA-Vault ' + app.getVersion() + (DEV ? ' · 开发版' : ''),
  detail: `后端目录：${backendRoot || '(未找到)'}\n地址：http://${HOST}:${PORT}\nElectron ${process.versions.electron} · Node ${process.versions.node}\n许可：保留所有权利（LICENSE.txt）${DEV_TAG}`,
  buttons: ['好'],
}));
ipcMain.on('win:minimize', () => { if (win) win.minimize(); });
ipcMain.on('win:maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
});
ipcMain.on('win:close', () => { if (win) win.close(); });
ipcMain.handle('win:is-max', () => !!(win && win.isMaximized()));
ipcMain.on('view:zoom', (_e, delta) => zoom(Number(delta) || 0));
ipcMain.on('view:zoom-reset', () => { if (win) win.webContents.setZoomFactor(1); });
ipcMain.on('view:reload', () => { if (win) win.reload(); });
ipcMain.handle('view:devtools', () => { if (win) win.webContents.toggleDevTools(); return true; });

/* ---------------------------- 启动 ---------------------------- */

/* 开发版不参与单实例锁：正式版照旧拿锁，开发版和正式版可以同时开
   （Electron 的锁不是按 userData 区分的，见过开发版一开就把正式版顶掉的坑） */
const gotLock = DEV ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    createWindow();
    hookCivitaiDownloads();
    hookBrowserDownloads();
    const ok = await ensureBackend();
    if (!ok) {
      const tail = (() => {
        try {
          const s = fs.readFileSync(logFile(), 'utf8').split('\n').slice(-12).join('\n');
          return s;
        } catch { return '(无日志)'; }
      })();
      dialog.showMessageBox(win, {
        type: 'error',
        title: '启动失败',
        message: '本地服务没起来',
        detail: `后端目录：${backendRoot || '(没找到 server.mjs)'}\n\n最后几行日志：\n${tail}`,
        buttons: ['打开日志', '退出'],
      }).then((r) => { if (r.response === 0) openPath(logFile()); app.quit(); });
      return;
    }
    Menu.setApplicationMenu(null);
    if (win && !win.isDestroyed()) win.loadURL(`http://${HOST}:${PORT}/`);
  });

  app.on('window-all-closed', () => { stopBackend(); app.quit(); });
  app.on('before-quit', stopBackend);
}
