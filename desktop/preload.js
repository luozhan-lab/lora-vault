'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  /* 开发版（--dev）时主进程会带 --loradev 参数；前端据此显示「开发」徽标 */
  isDev: process.argv.includes('--loradev'),
  info: () => ipcRenderer.invoke('app:info'),
  openDataDir: () => ipcRenderer.invoke('app:open-data'),
  openLoraDir: () => ipcRenderer.invoke('app:open-loras'),
  openDir: (kind) => ipcRenderer.invoke('app:open-dir', kind),
  openApi: () => ipcRenderer.invoke('app:open-api'),
  openLog: () => ipcRenderer.invoke('app:open-log'),
  about: () => ipcRenderer.invoke('app:about'),
  pickFolder: (opts) => ipcRenderer.invoke('app:pick-folder', opts || {}),
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:is-max'),
  onWinState: (cb) => ipcRenderer.on('win:state', (_e, max) => cb(max)),
  zoom: (delta) => ipcRenderer.send('view:zoom', delta),
  zoomReset: () => ipcRenderer.send('view:zoom-reset'),
  reload: () => ipcRenderer.send('view:reload'),
  devtools: () => ipcRenderer.invoke('view:devtools'),
  logPath: () => ipcRenderer.invoke('app:log'),
  onBackendDown: (cb) => ipcRenderer.on('backend-down', (_e, code) => cb(code)),
  onCivitaiDownload: (cb) => ipcRenderer.on('civitai:downloaded', (_e, data) => cb(data)),
  onExternalDownload: (cb) => ipcRenderer.on('external-download', (_e, data) => cb(data)),
});
