import fs from 'node:fs';
import { db, logEvent } from './db.mjs';
import { loraRoots } from './roots.mjs';
import { buildDiskIndex, invalidateIndex, upsertLora, recomputeFamilies } from './loras.mjs';

/**
 * 全量扫描磁盘：新增的入库、变动的刷新、消失的标 missing、改名的按文件名接回。
 */
export function scanLibrary({ readMeta = false, actor = 'scan' } = {}) {
  /* 还没配 LoRA 目录时不要扫：空根会把整库误标 missing。 */
  const roots = loraRoots().filter((r) => { try { return fs.existsSync(r); } catch { return false; } });
  if (!roots.length) {
    const total = db().prepare('SELECT COUNT(*) c FROM lora').get().c;
    return { total, added: 0, changed: 0, moved: 0, ok: 0, missing: 0, meta: 0, diskFiles: 0, variants: 0, skipped: 'no-loras-root' };
  }
  invalidateIndex();
  const index = buildDiskIndex({ force: true });
  const conn = db();
  const rows = conn.prepare('SELECT id, rel_path, mtime, size_bytes, status, meta_json, trigger FROM lora').all();
  const byRel = new Map(rows.map((r) => [r.rel_path.toLowerCase(), r]));
  const byBase = new Map();
  for (const r of rows) {
    const b = r.rel_path.split(/[\\/]/).pop().toLowerCase();
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(r);
  }

  const diskSet = new Set(index.list.map((r) => r.rel_path.toLowerCase()));
  let added = 0, changed = 0, moved = 0, ok = 0, missing = 0, metaRefreshed = 0;

  for (const rec of index.list) {
    const key = rec.rel_path.toLowerCase();
    const ex = byRel.get(key);
    if (!ex) {
      try {
        upsertLora({ rel_path: rec.rel_path, read_meta: readMeta }, actor);
        added++;
      } catch (e) {
        console.error('[scan] 新增失败 ' + rec.rel_path + '：' + e.message);
      }
      continue;
    }
    if (ex.mtime !== rec.mtime || ex.size_bytes !== rec.size_bytes) {
      conn.prepare('UPDATE lora SET mtime = ?, size_bytes = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(rec.mtime, rec.size_bytes, 'ok', new Date().toISOString(), ex.id);
      if (readMeta) {
        try { upsertLora({ rel_path: rec.rel_path, read_meta: true }, actor); }
        catch (e) { console.error('[scan] 刷新失败 ' + rec.rel_path + '：' + e.message); }
      }
      changed++;
      continue;
    }
    if (ex.status !== 'ok') {
      conn.prepare("UPDATE lora SET status = 'ok' WHERE id = ?").run(ex.id);
    }
    // 启动扫描为了快不读头部。用户之后再点「扫描磁盘」时这些记录 mtime / size 没变，
    // 以前会直接跳过，新加进来的支就永远没触发词 / 特征词。meta 空或触发词空就补读一次。
    // 已经带 civitai 页面信息的别再重读头部，避免把补来的作者/描述冲掉。
    const hasCivitai = /"civitai"\s*:/.test(String(ex.meta_json || ''));
    if (readMeta && !hasCivitai && (!ex.meta_json || ex.meta_json === '{}' || ex.meta_json === 'null' || !ex.trigger)) {
      try {
        upsertLora({ rel_path: rec.rel_path, read_meta: true }, actor);
        metaRefreshed++;
      } catch (e) {
        console.error('[scan] 补元数据失败 ' + rec.rel_path + '：' + e.message);
      }
    }
    ok++;
  }

  // 没在磁盘上的：先看是不是只是换了目录
  for (const r of rows) {
    if (diskSet.has(r.rel_path.toLowerCase())) continue;
    /* ComfyUI-only 的记录本地没有文件，不是丢失，别标 missing。 */
    if (r.status === 'comfy') continue;
    const base = r.rel_path.split(/[\\/]/).pop().toLowerCase();
    const candidates = (byBase.get(base) || []).filter((c) => c.id !== r.id);
    const onDisk = index.map.get(base);
    if (onDisk && !byRel.has(onDisk.rel_path.toLowerCase())) {
      try {
        conn.prepare('UPDATE lora SET rel_path = ?, filename = ?, category = ?, work = ?, status = ?, updated_at = ? WHERE id = ?')
          .run(onDisk.rel_path, onDisk.filename, onDisk.category, onDisk.work, 'ok', new Date().toISOString(), r.id);
        byRel.set(onDisk.rel_path.toLowerCase(), r);
        moved++;
        continue;
      } catch { /* 撞唯一键，落到 missing */ }
    }
    if (r.status !== 'missing') {
      conn.prepare("UPDATE lora SET status = 'missing', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), r.id);
      missing++;
    }
  }

  const total = conn.prepare('SELECT COUNT(*) c FROM lora').get().c;
  const fam = recomputeFamilies();
  const result = { total, added, changed, moved, ok, missing, meta: metaRefreshed, diskFiles: index.list.length, variants: fam.variants };
  logEvent('scan', null, actor, JSON.stringify(result));
  return result;
}

let watchers = [];
let watchTimer = null;
let retryTimer = null;
let watching = false;

/**
 * 盯着所有 LoRA 目录：外部下载 / 删除 / 改名，1.5 秒内自动扫一轮。
 * 这样用户不用重启软件、也不用点「扫描磁盘」。
 */
export function startLoraWatcher(onChange, { debounceMs = 1500 } = {}) {
  const roots = loraRoots().filter((r) => { try { return fs.existsSync(r); } catch { return false; } });
  if (!roots.length) return null;
  if (watchers.length) return watchers;

  const fire = () => {
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      if (watching) { fire(); return; }
      watching = true;
      try {
        const r = scanLibrary({ readMeta: true, actor: 'watch' });
        if (onChange) onChange(r);
      } catch (e) {
        console.error('[watch] 自动扫描失败：' + e.message);
        // 数据库被别的进程占用（桌面端/命令行同时在跑）时等 2 秒再试
        if (!retryTimer) {
          retryTimer = setTimeout(() => { retryTimer = null; fire(); }, 2000);
          if (retryTimer.unref) retryTimer.unref();
        }
      } finally {
        watching = false;
      }
    }, debounceMs);
  };

  for (const root of roots) {
    try {
      const w = fs.watch(root, { recursive: true }, (_event, filename) => {
        if (filename && !/\.safetensors$/i.test(String(filename))) return;
        fire();
      });
      if (w.on) w.on('error', (e) => console.error('[watch] ' + e.message));
      watchers.push(w);
      console.log('[watch] 正在盯 LoRA 目录：' + root);
    } catch (e) {
      console.error('[watch] 目录监听没起来 ' + root + '：' + e.message);
    }
  }
  return watchers.length ? watchers : null;
}

export function stopLoraWatcher() {
  clearTimeout(watchTimer);
  clearTimeout(retryTimer);
  watchTimer = null;
  retryTimer = null;
  for (const w of watchers) {
    try { w.close(); } catch { /* ignore */ }
  }
  watchers = [];
}
