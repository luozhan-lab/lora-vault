import { db } from '../lib/db.mjs';

const d = db();
const before = d.prepare("SELECT COUNT(*) AS c FROM lora WHERE source_url LIKE '%.0%'").get().c;
console.log('source_url 带 .0 的', before);

d.exec('BEGIN');
try {
  d.prepare("UPDATE lora SET source_url = REPLACE(source_url, '.0?', '?')").run();
  d.prepare("UPDATE lora SET source_url = REPLACE(source_url, '.0', '')").run();
  d.prepare("UPDATE lora SET download_url = REPLACE(download_url, '.0?', '?')").run();
  d.prepare("UPDATE lora SET download_url = REPLACE(download_url, '.0', '')").run();
  d.exec('COMMIT');
} catch (e) {
  try { d.exec('ROLLBACK'); } catch {}
  throw e;
}
const after = d.prepare("SELECT COUNT(*) AS c FROM lora WHERE source_url LIKE '%.0%'").get().c;
console.log('清理后', after);
console.log(d.prepare('SELECT id, model_id, version_id, source_url FROM lora WHERE id = 1111').get());
console.log(d.prepare("SELECT COUNT(*) AS c FROM lora WHERE source_url LIKE '%models/%'").get());
