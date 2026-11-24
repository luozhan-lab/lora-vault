/**
 * 极简 Markdown → HTML（只覆盖开发日志用到的语法）
 * 用法：node scripts/md2html.mjs <输入.md> <输出.html> "<标题>"
 */
import fs from 'node:fs';

const [input, output, title = '文档'] = process.argv.slice(2);
if (!input || !output) {
  console.error('用法: node md2html.mjs in.md out.html [title]');
  process.exit(1);
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function inline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/);
const out = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];

  // 代码块
  if (/^```/.test(line)) {
    const buf = [];
    i++;
    while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
    i++;
    out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
    continue;
  }

  // 表格
  if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || '')) {
    const head = line.split('|').slice(1, -1).map((c) => c.trim());
    i += 2;
    const rows = [];
    while (i < lines.length && /^\|/.test(lines[i])) {
      rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
      i++;
    }
    out.push('<table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>'
      + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
      + '</tbody></table>');
    continue;
  }

  const h = line.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    const lvl = h[1].length;
    out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
    i++;
    continue;
  }

  if (/^---+\s*$/.test(line)) { out.push('<hr/>'); i++; continue; }

  // 列表
  if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
    const ordered = /^\s*\d+\.\s+/.test(line);
    const items = [];
    while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
      items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      i++;
    }
    const tag = ordered ? 'ol' : 'ul';
    out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join('') + `</${tag}>`);
    continue;
  }

  if (/^>\s?/.test(line)) {
    out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
    i++;
    continue;
  }

  if (!line.trim()) { i++; continue; }

  // 段落：连续非空行合并
  const buf = [line];
  i++;
  while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\||>|---)/.test(lines[i])) {
    buf.push(lines[i]);
    i++;
  }
  out.push(`<p>${inline(buf.join(' '))}</p>`);
}

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
  :root { --fg:#1f2328; --muted:#59636e; --line:#d8dee4; --bg:#ffffff; --soft:#f6f8fa; --accent:#0969da; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.75 "Segoe UI","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif; }
  main { max-width: 920px; margin: 0 auto; padding: 48px 28px 96px; }
  h1 { font-size:30px; margin:0 0 8px; letter-spacing:.01em; }
  h2 { font-size:21px; margin:44px 0 12px; padding-bottom:8px; border-bottom:1px solid var(--line); }
  h3 { font-size:17px; margin:30px 0 10px; }
  h4 { font-size:15px; margin:22px 0 8px; }
  p { margin:10px 0; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  code { background:var(--soft); border:1px solid var(--line); border-radius:5px;
    padding:1px 5px; font-family:"Cascadia Code",Consolas,monospace; font-size:12.5px; }
  pre { background:var(--soft); border:1px solid var(--line); border-radius:10px;
    padding:14px 16px; overflow:auto; margin:14px 0; }
  pre code { background:none; border:0; padding:0; font-size:12.5px; line-height:1.7; }
  table { border-collapse:collapse; width:100%; margin:16px 0; font-size:13.5px; }
  th, td { border:1px solid var(--line); padding:8px 11px; text-align:left; vertical-align:top; }
  th { background:var(--soft); font-weight:600; }
  tr:nth-child(even) td { background:#fcfdfe; }
  ul, ol { margin:10px 0; padding-left:24px; }
  li { margin:4px 0; }
  hr { border:0; border-top:1px solid var(--line); margin:36px 0; }
  blockquote { margin:14px 0; padding:10px 16px; background:var(--soft);
    border-left:3px solid var(--line); color:var(--muted); }
  strong { font-weight:600; }
  @media print { main { padding:0; max-width:none; } pre, table { page-break-inside: avoid; } }
</style></head>
<body><main>
${out.join('\n')}
</main></body></html>`;

fs.writeFileSync(output, html, 'utf8');
console.log('写出', output, (html.length / 1024).toFixed(0) + ' KB');
