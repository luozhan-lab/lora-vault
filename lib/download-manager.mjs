import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, loadConfig } from './config.mjs';
import { downloadVersion, downloadByText } from './civitai.mjs';

const FILE = path.join(ROOT, 'data', 'downloads.json');
const tasks = new Map();
let active = 0;
const waiters = [];
const now = () => new Date().toISOString();

function save() {
  try {
    const arr = [...tasks.values()];
    const open = arr.filter((t) => ['queued', 'running', 'paused'].includes(t.status));
    const done = arr.filter((t) => !['queued', 'running', 'paused'].includes(t.status)).slice(-200);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify([...open, ...done], null, 2));
  } catch { /* ignore */ }
}

function limit() {
  const n = Number(loadConfig().downloadConcurrency);
  return Math.max(1, Math.min(8, Number.isFinite(n) ? n : 2));
}

function acquire() {
  if (active < limit()) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function release() {
  const next = waiters.shift();
  if (next) next();
  else active = Math.max(0, active - 1);
}

function publicTask(t) {
  return {
    id: t.id, name: t.name, status: t.status,
    bytes: t.bytes || 0, totalBytes: t.totalBytes || 0,
    subdir: t.subdir || '', error: t.error || '',
    outputs: t.outputs || [], log: t.log || [],
    createdAt: t.createdAt, updatedAt: t.updatedAt, finishedAt: t.finishedAt || null,
  };
}

export function listDownloads() {
  const rank = { running: 0, queued: 1, paused: 2 };
  return [...tasks.values()]
    .sort((a, b) => {
      const ra = rank[a.status] ?? 3;
      const rb = rank[b.status] ?? 3;
      if (ra !== rb) return ra - rb;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    })
    .map(publicTask);
}

export function createDownload({ kind, payload, name, subdir }) {
  const id = 'dl-' + crypto.randomBytes(4).toString('hex');
  const t = {
    id, kind, payload, name: name || '下载', subdir: subdir || '',
    status: 'queued', bytes: 0, totalBytes: 0, error: '', outputs: [], log: [],
    createdAt: now(), updatedAt: now(), finishedAt: null, pauseRequested: false,
  };
  tasks.set(id, t);
  save();
  void runTask(t);
  return t;
}

async function runTask(t) {
  if (!t || !['queued', 'running'].includes(t.status)) return;
  if (t.pauseRequested) {
    t.status = 'paused';
    t.updatedAt = now();
    save();
    return;
  }
  await acquire();
  if (t.pauseRequested) {
    t.status = 'paused';
    release();
    t.updatedAt = now();
    save();
    return;
  }
  t.status = 'running';
  t.error = '';
  t.updatedAt = now();
  save();
  try {
    const opts = {
      subdir: t.subdir,
      shouldPause: () => t.pauseRequested,
      onProgress: (got, total) => {
        t.bytes = got;
        if (total) t.totalBytes = total;
        t.updatedAt = now();
      },
      onLog: (m) => {
        t.log.push(String(m));
        if (t.log.length > 100) t.log.shift();
      },
    };
    const r = t.kind === 'version'
      ? await downloadVersion(t.payload.versionId, opts)
      : await downloadByText(t.payload.text, opts);
    t.status = 'done';
    t.outputs = [r];
    t.bytes = t.totalBytes || t.bytes;
    t.finishedAt = now();
  } catch (e) {
    if (t.pauseRequested || e.code === 'DL_PAUSED') {
      t.status = 'paused';
    } else {
      t.status = 'error';
      t.error = e.message || String(e);
      t.finishedAt = now();
    }
  } finally {
    t.pauseRequested = false;
    release();
    t.updatedAt = now();
    save();
  }
}

export function pauseDownload(id) {
  const t = tasks.get(id);
  if (!t) return false;
  if (t.status === 'queued') {
    t.pauseRequested = true;
    t.status = 'paused';
    t.updatedAt = now();
    save();
    return true;
  }
  if (t.status === 'running') {
    t.pauseRequested = true;
    t.updatedAt = now();
    save();
    return true;
  }
  return false;
}

export function resumeDownload(id) {
  const t = tasks.get(id);
  if (!t || t.status !== 'paused') return false;
  t.pauseRequested = false;
  t.status = 'queued';
  t.updatedAt = now();
  save();
  void runTask(t);
  return true;
}

export function pauseAllDownloads() {
  let n = 0;
  for (const t of tasks.values()) {
    if (t.status === 'running' || t.status === 'queued') {
      if (pauseDownload(t.id)) n++;
    }
  }
  return n;
}

export function resumeAllDownloads() {
  let n = 0;
  for (const t of tasks.values()) {
    if (t.status === 'paused' && resumeDownload(t.id)) n++;
  }
  return n;
}

export function clearDownloadHistory() {
  let n = 0;
  for (const [id, t] of tasks) {
    if (t.status === 'done' || t.status === 'error') {
      tasks.delete(id);
      n++;
    }
  }
  save();
  return n;
}

export function initDownloads() {
  try {
    if (!fs.existsSync(FILE)) return;
    const arr = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const t of arr) {
      if (!t || !t.id) continue;
      t.pauseRequested = false;
      t.log = Array.isArray(t.log) ? t.log : [];
      tasks.set(t.id, t);
      if (t.status === 'running' || t.status === 'queued') {
        t.status = 'queued';
        void runTask(t);
      }
    }
  } catch { /* ignore */ }
}
