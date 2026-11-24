#!/usr/bin/env node
/**
 * 改版本号：根 package.json + desktop/package.json 一起改。
 *   node scripts/bump-version.mjs 1.1.0
 *
 * 只写这两个文件；index.html 的 ?v= 由 release.mjs 每次发版时自动换。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const next = String(process.argv[2] || '').trim().replace(/^v/i, '');
if (!/^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(next)) {
  console.error('给一个版本号，例如：node scripts/bump-version.mjs 1.1.0');
  process.exit(1);
}

for (const rel of ['package.json', path.join('desktop', 'package.json')]) {
  const file = path.join(root, rel);
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const old = pkg.version;
  pkg.version = next;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`${rel}: ${old} → ${next}`);
}
console.log('\n下一步：node scripts/release.mjs --url <安装包的下载地址> --notes "这次改了什么"');
