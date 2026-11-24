import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './config.mjs';

/* 老手导入的自定义工作流：只存 API 格式 JSON，命名后长期保留 */
const FILE = path.join(DATA_DIR, 'workflows.json');

function readList() {
  try {
    const arr = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeList(list) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    throw new Error('工作流保存失败：' + e.message);
  }
}

function nodeCount(workflow) {
  return Object.values(workflow || {}).filter((n) => n && typeof n === 'object' && n.class_type).length;
}

function validate(workflow) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) throw new Error('工作流必须是 API JSON 对象');
  if (!nodeCount(workflow)) throw new Error('工作流里没有节点（要 ComfyUI 的 Save (API) JSON）');
}

export function listWorkflows() {
  return readList().map((w) => ({
    id: w.id,
    name: w.name,
    createdAt: w.createdAt,
    nodes: nodeCount(w.workflow),
    workflow: w.workflow,
  }));
}

export function saveWorkflow({ name, workflow }) {
  validate(workflow);
  const cleanName = String(name || '').trim().slice(0, 80);
  if (!cleanName) throw new Error('给工作流起个名字');
  const list = readList();
  const item = {
    id: crypto.randomUUID(),
    name: cleanName,
    workflow,
    createdAt: new Date().toISOString(),
  };
  list.unshift(item);
  writeList(list.slice(0, 100));
  return { id: item.id, name: item.name, createdAt: item.createdAt, nodes: nodeCount(item.workflow) };
}

export function renameWorkflow(id, name) {
  const cleanName = String(name || '').trim().slice(0, 80);
  if (!cleanName) throw new Error('名字不能空');
  const list = readList();
  const item = list.find((w) => w.id === id);
  if (!item) return null;
  item.name = cleanName;
  writeList(list);
  return { id: item.id, name: item.name, nodes: nodeCount(item.workflow) };
}

export function deleteWorkflow(id) {
  const list = readList();
  const next = list.filter((w) => w.id !== id);
  if (next.length === list.length) return false;
  writeList(next);
  return true;
}
