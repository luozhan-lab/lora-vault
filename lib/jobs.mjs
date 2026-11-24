import crypto from 'node:crypto';

const jobs = new Map();
const MAX_JOB_LOG = 300;

/**
 * 跑一个后台任务。fn(ctx) 里用 ctx.setTotal / tick / log / cancelled。
 * 任务只活在内存里：进程重启就没了，够用。
 */
export function startJob(name, fn) {
  const id = crypto.randomBytes(6).toString('hex');
  const job = {
    id,
    name,
    status: 'running',
    total: 0,
    done: 0,
    ok: 0,
    fail: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    log: [],
    error: '',
    cancelRequested: false,
    child: null,   // 外部脚本引擎跑起来的子进程，取消时直接掐掉
    bytes: 0,
    totalBytes: 0,
    outputs: [],
  };
  jobs.set(id, job);

  const ctx = {
    setTotal(n) { job.total = Number(n) || 0; },
    progress(bytes, totalBytes) {
      job.bytes = Number(bytes) || 0;
      if (totalBytes) job.totalBytes = Number(totalBytes) || 0;
    },
    tick(ok = true, msg = '') {
      job.done++;
      ok ? job.ok++ : job.fail++;
      if (msg) ctx.log(msg);
    },
    log(msg) {
      job.log.push(String(msg));
      if (job.log.length > MAX_JOB_LOG) job.log.shift();
    },
    cancelled() { return job.cancelRequested; },
    job,
  };

  Promise.resolve()
    .then(() => fn(ctx))
    .then(() => { job.status = job.cancelRequested ? 'cancelled' : 'done'; })
    .catch((e) => {
      if (job.cancelRequested) {
        job.status = 'cancelled';
        job.log.push('已取消');
      } else {
        job.status = 'error';
        job.error = e && e.message ? e.message : String(e);
        job.log.push('错误: ' + job.error);
      }
    })
    .finally(() => { job.finishedAt = new Date().toISOString(); });

  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs(limit = 20) {
  return [...jobs.values()]
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, limit)
    .map((j) => ({
      id: j.id, name: j.name, status: j.status, total: j.total, done: j.done,
      ok: j.ok, fail: j.fail, startedAt: j.startedAt, finishedAt: j.finishedAt,
      error: j.error, cancelRequested: j.cancelRequested,
      bytes: j.bytes || 0, totalBytes: j.totalBytes || 0, outputs: j.outputs || [],
    }));
}

export function cancelJob(id) {
  const j = jobs.get(id);
  if (!j || j.status !== 'running') return false;
  j.cancelRequested = true;
  j.log.push('收到取消请求…');
  // 光立个 flag，正在跑的这张还会一直等到超时；子进程在就直接掐掉
  if (j.child) {
    try { j.child.kill(); j.log.push('已停掉当前这张（ComfyUI 里可能还会跑完）'); } catch { /* ignore */ }
  }
  return true;
}

export function isRunning(id) {
  const j = jobs.get(id);
  return !!j && j.status === 'running';
}

/** 清掉已经结束的下载任务（下载页「清空历史」） */
export function clearFinishedDownloads() {
  let n = 0;
  for (const [id, j] of jobs) {
    const isDownload = String(j.name || '').startsWith('C站下载')
      || String(j.name || '').startsWith('C站链接下载');
    if (isDownload && j.status !== 'running') {
      jobs.delete(id);
      n++;
    }
  }
  return n;
}
