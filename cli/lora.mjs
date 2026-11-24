#!/usr/bin/env node
/**
 * 命令行：给桌面端 AI 用，也可以人工敲。
 *
 *   node cli/lora.mjs add --file "角色\原神\genshin-3014738.safetensors" \
 *       --name "可莉" --trigger "klee (genshin impact)" \
 *       --feature "blonde hair, red eyes, twintails" \
 *       --outfit "red coat, white dress" \
 *       --url "https://civitai.com/models/xxx" --preview "D:\某个图.png"
 *
 *   node cli/lora.mjs find 可莉
 *   node cli/lora.mjs show 12
 *   node cli/lora.mjs stats
 *   node cli/lora.mjs scan
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, PREVIEW_DIR } from '../lib/config.mjs';
import { db } from '../lib/db.mjs';
import {
  upsertLora, getLora, searchLoras, stats, resolveRelPath,
} from '../lib/loras.mjs';
import { scanLibrary } from '../lib/scan-service.mjs';
import { makeThumb } from '../lib/media.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const cfg = loadConfig();

function opt(name, fallback = '') {
  const i = argv.indexOf('--' + name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}

function paint(s, code) { return process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s; }

async function add() {
  const file = opt('file', opt('path', opt('filename', '')));
  if (!file) { console.error('缺 --file'); process.exit(1); }
  const input = {
    rel_path: file,
    name: opt('name'),
    name_en: opt('name-en'),
    category: opt('category'),
    work: opt('work'),
    trigger: opt('trigger'),
    feature_words: opt('feature'),
    outfit_words: opt('outfit'),
    body_words: opt('body'),
    negative: opt('negative'),
    note: opt('note'),
    source_url: opt('url'),
    download_url: opt('download'),
    model_id: opt('model-id'),
    version_id: opt('version-id'),
    weight: opt('weight'),
  };
  for (const k of Object.keys(input)) if (!input[k]) delete input[k];
  const res = upsertLora(input, 'cli');
  console.log(res.created ? '新增' : '更新', `id=${res.id}`, res.rel_path);

  const previewSrc = opt('preview');
  if (previewSrc && fs.existsSync(previewSrc)) {
    const ext = path.extname(previewSrc) || '.png';
    const name = `${res.id}-${Date.now()}${ext}`;
    fs.copyFileSync(previewSrc, path.join(PREVIEW_DIR, name));
    db().prepare('UPDATE lora SET preview = ? WHERE id = ?').run(`local:${name}`, res.id);
    const ok = await makeThumb(res.id, path.join(PREVIEW_DIR, name));
    console.log('预览图已挂', ok ? '（含缩略图）' : '（缩略图失败，用原图）');
  }
  if (opt('tags')) {
    const tags = opt('tags').split(',').map((t) => ({ tag: t.trim().toLowerCase(), count: 0 })).filter((t) => t.tag);
    db().prepare('UPDATE lora SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), res.id);
    const sel = db().prepare('SELECT id FROM tag WHERE name = ?');
    const insT = db().prepare('INSERT INTO tag (name) VALUES (?) ON CONFLICT(name) DO NOTHING');
    const insL = db().prepare('INSERT OR REPLACE INTO lora_tag (lora_id, tag_id, count) VALUES (?,?,?)');
    for (const t of tags) { insT.run(t.tag); const r = sel.get(t.tag); if (r) insL.run(res.id, r.id, 0); }
  }
  const row = getLora(res.id);
  console.log('触发词:', row.trigger || '(空)');
  console.log('文件:', row.rel_path);
}

function find() {
  const q = argv.slice(1).join(' ').trim();
  const { items, total } = searchLoras({ q, limit: 40 });
  console.log(`命中 ${total}`);
  for (const it of items) {
    const mark = it.preview ? '▣' : '□';
    console.log(`${mark} ${String(it.id).padStart(4)}  ${paint(it.name || it.rel_path, 36)}  [${it.category}/${it.work}]  ${it.trigger || ''}`);
  }
}

function show() {
  const id = Number(argv[1]);
  const row = getLora(id);
  if (!row) { console.error('没有 id=' + id); process.exit(1); }
  console.log(JSON.stringify(row, null, 2));
}

function printStats() {
  const s = stats();
  console.log(`总计 ${s.total} 支  ${(s.bytes / 1024 / 1024 / 1024).toFixed(1)} GB`);
  console.log(`有预览 ${s.withPreview} / 有触发词 ${s.withTrigger} / 有来源 ${s.withSource} / 有标签 ${s.withTags} / 丢失 ${s.missing}`);
  console.log('分类：', s.byCategory.map((x) => `${x.category} ${x.c}`).join('  |  '));
  console.log('作品前 10：', s.byWork.slice(0, 10).map((x) => `${x.work} ${x.c}`).join('  |  '));
}

function scan() {
  const r = scanLibrary({ readMeta: true, actor: 'cli' });
  console.log(JSON.stringify(r, null, 2));
}

function locate() {
  const q = argv.slice(1).join(' ');
  console.log(resolveRelPath(q));
}

const table = {
  add, find, show, stats: printStats, scan, locate,
};

if (!cmd || !table[cmd]) {
  console.log(`用法:
  node cli/lora.mjs add --file "相对路径或文件名" [--name 名字] [--trigger 触发词] [--feature 特征词] [--outfit 服装词] [--url 下载页] [--weight 0.85] [--preview 图片路径]
  node cli/lora.mjs find 关键词
  node cli/lora.mjs show <id>
  node cli/lora.mjs stats
  node cli/lora.mjs scan
  node cli/lora.mjs locate 文件名`);
  process.exit(cmd ? 1 : 0);
}

await table[cmd]();
