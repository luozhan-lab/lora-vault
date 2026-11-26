/**
 * 分类树：内置 7 个顶层，用户可以自己建/删/改名，子分类随便加。
 * 每次启动由 ensureCategories() 保证表里有内置分类（只在第一次播种，用户删了不会复活）。
 * LoRA 通过 category_id 挂在任意一层；category_path 存「角色/原神」这种可读路径，方便筛选和显示。
 */
import { db } from './db.mjs';

/* 内置顶层分类：装完就有的那套 */
export const DEFAULT_CATEGORIES = ['角色', '服装', '画风', '动作', '场景', '辅助', '其他'];

/* 老库里的字符串分类 → 新顶层分类 */
const LEGACY_MAP = {
  '角色': '角色',
  '服装': '服装',
  '画风': '画风',
  '动作': '动作',
  '场景': '场景',
  '辅助': '辅助',
  '辅助Lora': '辅助',
  '辅助LoRA': '辅助',
  '辅助lora': '辅助',
  '自己的': '其他',
  'AI娘': '角色',
  '归档': '其他',
  '未分类': '其他',
};

const now = () => new Date().toISOString();

function metaGet(key) {
  try {
    const row = db().prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
    return row ? String(row.value) : '';
  } catch { return ''; }
}

function metaSet(key, value) {
  db().prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

function rowById(id) {
  return db().prepare('SELECT * FROM category WHERE id = ?').get(id) || null;
}

/* 路径数组 → 分类（不存在就建）；顶层必须能对应到已有分类名 */
export function ensurePath(parts, { create = true } = {}) {
  const segs = (Array.isArray(parts) ? parts : String(parts || '').split('/'))
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!segs.length) return null;
  let parentId = null;
  for (let i = 0; i < segs.length; i += 1) {
    const name = segs[i];
    let row = db().prepare('SELECT * FROM category WHERE COALESCE(parent_id, 0) = COALESCE(?, 0) AND name = ?')
      .get(parentId, name);
    if (!row) {
      if (!create) return null;
      const sort = (db().prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM category WHERE COALESCE(parent_id, 0) = COALESCE(?, 0)')
        .get(parentId) || {}).n || 1;
      const info = db().prepare('INSERT INTO category (name, parent_id, sort, builtin, created_at) VALUES (?,?,?,0,?)')
        .run(name, parentId, sort, now());
      row = rowById(Number(info.lastInsertRowid));
    }
    parentId = row.id;
  }
  return parentId;
}

export function categoryPath(id) {
  if (!id) return '';
  const names = [];
  let cur = rowById(id);
  let guard = 0;
  while (cur && guard < 20) {
    names.unshift(cur.name);
    cur = cur.parent_id ? rowById(cur.parent_id) : null;
    guard += 1;
  }
  return names.join('/');
}

export function categoryTree() {
  const rows = db().prepare('SELECT * FROM category ORDER BY COALESCE(parent_id, 0), sort, id').all();
  const counts = new Map(
    db().prepare('SELECT category_id, COUNT(*) c FROM lora WHERE category_id IS NOT NULL AND is_variant = 0 GROUP BY category_id').all()
      .map((r) => [r.category_id, r.c]),
  );
  const byParent = new Map();
  for (const r of rows) {
    const key = r.parent_id || 0;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(r);
  }
  const build = (parentId) => (byParent.get(parentId) || []).map((r) => {
    const children = build(r.id);
    const self = counts.get(r.id) || 0;
    const total = children.reduce((s, c) => s + c.total, 0) + self;
    return {
      id: r.id,
      name: r.name,
      parent_id: r.parent_id,
      builtin: !!r.builtin,
      count: self,
      total,
      path: categoryPath(r.id),
      children,
    };
  });
  return build(0);
}

/* 一棵子树里的所有分类 id（含自己） */
export function descendants(id) {
  const out = [Number(id)];
  const stack = [Number(id)];
  while (stack.length) {
    const cur = stack.pop();
    for (const r of db().prepare('SELECT id FROM category WHERE parent_id = ?').all(cur)) {
      out.push(r.id);
      stack.push(r.id);
    }
  }
  return out;
}

export function createCategory({ name, parentId = null } = {}) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('分类名不能空');
  if (clean.includes('/')) throw new Error('分类名里不能带斜杠');
  if (clean.length > 40) throw new Error('分类名太长');
  const pid = parentId ? Number(parentId) : null;
  if (pid && !rowById(pid)) throw new Error('上级分类不存在');
  const dup = db().prepare('SELECT id FROM category WHERE COALESCE(parent_id, 0) = COALESCE(?, 0) AND name = ?').get(pid, clean);
  if (dup) throw new Error('同一层已经有这个分类了');
  const sort = (db().prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM category WHERE COALESCE(parent_id, 0) = COALESCE(?, 0)').get(pid) || {}).n || 1;
  const info = db().prepare('INSERT INTO category (name, parent_id, sort, builtin, created_at) VALUES (?,?,?,0,?)')
    .run(clean, pid, sort, now());
  return rowById(Number(info.lastInsertRowid));
}

export function renameCategory(id, name) {
  const row = rowById(Number(id));
  if (!row) throw new Error('分类不存在');
  const clean = String(name || '').trim();
  if (!clean) throw new Error('分类名不能空');
  if (clean.includes('/')) throw new Error('分类名里不能带斜杠');
  const dup = db().prepare('SELECT id FROM category WHERE COALESCE(parent_id, 0) = COALESCE(?, 0) AND name = ? AND id <> ?')
    .get(row.parent_id, clean, row.id);
  if (dup) throw new Error('同一层已经有这个分类了');
  db().prepare('UPDATE category SET name = ? WHERE id = ?').run(clean, row.id);
  refreshPaths();
  return rowById(row.id);
}

/* 删除分类：子分类一起删，里面的 LoRA 退回未分类 */
export function deleteCategory(id) {
  const row = rowById(Number(id));
  if (!row) throw new Error('分类不存在');
  const ids = descendants(row.id);
  const affected = db().prepare(`SELECT COUNT(*) c FROM lora WHERE category_id IN (${ids.map(() => '?').join(',')})`).get(...ids).c;
  db().prepare(`UPDATE lora SET category_id = NULL, category_path = '', updated_at = ? WHERE category_id IN (${ids.map(() => '?').join(',')})`)
    .run(now(), ...ids);
  db().prepare('DELETE FROM category WHERE id = ?').run(row.id);
  return { removed: ids.length, unassigned: affected };
}

/* 把一支 LoRA 挂到某个分类（同时写回旧的 category / work 两个字段，兼容旧接口和导出） */
export function setLoraCategory(loraId, categoryId) {
  const row = categoryId ? rowById(Number(categoryId)) : null;
  const full = row ? categoryPath(row.id) : '';
  const segs = full ? full.split('/') : [];
  const top = segs[0] || '';
  const work = segs.length > 1 ? segs[1] : '';
  db().prepare('UPDATE lora SET category_id = ?, category_path = ?, category = ?, work = ?, updated_at = ? WHERE id = ?')
    .run(row ? row.id : null, full, top, work, now(), Number(loraId));
  return { id: Number(loraId), category_id: row ? row.id : null, category_path: full };
}

/* 第一次启动播种：7 个顶层 + 把老库的「分类 + 作品」迁成树 */
export function ensureCategories() {
  const seeded = metaGet('categories_seeded');
  if (seeded) return { seeded: true };
  const tx = () => {
    for (const name of DEFAULT_CATEGORIES) {
      ensurePath([name]);
    }
    /* 内置顶层打个标（用户还是能改名/删；只是知道它原本就有） */
    db().prepare(`UPDATE category SET builtin = 1 WHERE parent_id IS NULL AND name IN (${DEFAULT_CATEGORIES.map(() => '?').join(',')})`)
      .run(...DEFAULT_CATEGORIES);
    const pairs = db().prepare("SELECT DISTINCT category, work FROM lora WHERE category <> ''").all();
    for (const p of pairs) {
      const top = LEGACY_MAP[p.category] || '其他';
      const work = String(p.work || '').trim();
      const parts = work && work !== top ? [top, work] : [top];
      const id = ensurePath(parts);
      if (!id) continue;
      const rows = db().prepare('SELECT id FROM lora WHERE category = ? AND work = ?').all(p.category, p.work);
      for (const r of rows) setLoraCategory(r.id, id);
    }
    /* 还是空分类的（category 为空的）挂「其他」 */
    const orphan = db().prepare("SELECT id FROM lora WHERE category_id IS NULL").all();
    const other = ensurePath(['其他']);
    for (const r of orphan) setLoraCategory(r.id, other);
    metaSet('categories_seeded', now());
  };
  const conn = db();
  conn.exec('BEGIN');
  try { tx(); conn.exec('COMMIT'); } catch (e) { conn.exec('ROLLBACK'); throw e; }
  return { seeded: false };
}

/* 改名/移动后重算所有 lora 的 category_path 与旧字段 */
export function refreshPaths() {
  const rows = db().prepare('SELECT id, category_id FROM lora WHERE category_id IS NOT NULL').all();
  const conn = db();
  conn.exec('BEGIN');
  try {
    const upd = conn.prepare('UPDATE lora SET category_path = ?, category = ?, work = ? WHERE id = ?');
    for (const r of rows) {
      const full = categoryPath(r.category_id);
      const segs = full ? full.split('/') : [];
      upd.run(full, segs[0] || '', segs[1] || '', r.id);
    }
    conn.exec('COMMIT');
  } catch (e) { conn.exec('ROLLBACK'); throw e; }
  return rows.length;
}

/* 按名字找分类（给扫描/导入用） */
export function categoryByName(top, work) {
  const parts = [top, work].filter(Boolean);
  const id = ensurePath(parts);
  return id ? rowById(id) : null;
}

export function defaultTopForLegacy(name) {
  return LEGACY_MAP[String(name || '')] || '其他';
}
