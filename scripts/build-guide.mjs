#!/usr/bin/env node
/**
 * 文档 md → 片段 html（给 app 里 fetch 用）
 *   node scripts/build-guide.mjs
 *   docs/新手教学.md    → public/v2/guide.html
 *   docs/新手教学.en.md → public/v2/guide.en.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

function render(srcFile) {
  const lines = fs.readFileSync(srcFile, 'utf8').split(/\r?\n/);
  const html = [];
  let para = [];
  const flush = () => {
    if (!para.length) return;
    html.push(`  <p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      html.push(`  <pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      html.push(`  <h${level}>${inline(h[2].trim())}</h${level}>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      html.push('  <hr>');
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`    <li>${inline(lines[i].replace(/^\s*[-*]\s+/, '').trim())}</li>`);
        i++;
      }
      i--;
      html.push('  <ul>', ...items, '  </ul>');
      continue;
    }
    /* 表格：| a | b |  +  |---|---| */
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:-]+\|/.test(lines[i + 1])) {
      flush();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      i--;
      html.push(
        '  <table class="guide-table">',
        `    <thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`,
        '    <tbody>',
        ...rows.map((r) => `      <tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`),
        '    </tbody>',
        '  </table>',
      );
      continue;
    }
    /* 有序列表：1. 2. 3. */
    if (/^\s*\d+\.\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`    <li>${inline(lines[i].replace(/^\s*\d+\.\s+/, '').trim())}</li>`);
        i++;
      }
      i--;
      html.push('  <ol>', ...items, '  </ol>');
      continue;
    }
    if (/^\s*$/.test(line)) { flush(); continue; }
    para.push(line.trim());
  }
  flush();
  return html.join('\n') + '\n';
}

const jobs = [
  ['docs/新手教学.md', 'public/v2/guide.html'],
  ['docs/新手教学.en.md', 'public/v2/guide.en.html'],
  ['docs/使用说明.md', 'public/v2/manual.html'],
  ['docs/使用说明.en.md', 'public/v2/manual.en.html'],
];
for (const [src, out] of jobs) {
  const srcPath = path.join(root, src);
  const outPath = path.join(root, out);
  if (!fs.existsSync(srcPath)) { console.error('缺源文件：' + src); process.exitCode = 1; continue; }
  fs.writeFileSync(outPath, render(srcPath), 'utf8');
  console.log(`写出 ${out}（${(fs.statSync(outPath).size / 1024).toFixed(1)} KB）`);
}
