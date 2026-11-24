import { scanLibrary } from '../lib/scan-service.mjs';
import { buildDiskIndex, invalidateIndex } from '../lib/loras.mjs';
import { db } from '../lib/db.mjs';

const args = process.argv.slice(2);
const readMeta = !args.includes('--no-meta');

invalidateIndex();
buildDiskIndex({ force: true });
const t = Date.now();
const r = scanLibrary({ readMeta, actor: 'cli-scan' });
console.log(JSON.stringify(r, null, 2));
console.log(`用时 ${Date.now() - t}ms`);

const s = db().prepare(`SELECT category, COUNT(*) c FROM lora GROUP BY category ORDER BY c DESC`).all();
console.log(s.map((x) => `${x.category}: ${x.c}`).join('\n'));
