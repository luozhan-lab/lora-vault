#!/usr/bin/env node
/**
 * 机器翻译后处理：data/wordbank-zh.json
 *   1) 繁体 → 简体（Google 有时返回 zh-TW，比如 long sleeves → 長袖）
 *   2) 丢掉没翻成功的（结果等于英文原文、或整条是 ASCII、或空）
 *
 *   node scripts/normalize-zh.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'wordbank-zh.json');
const dry = process.argv.includes('--dry');

/* 只收常见字，够用就行；遇到新的繁体能再往里加 */
const T2S = {
  長: '长', 個: '个', 這: '这', 們: '们', 對: '对', 於: '于', 後: '后', 髮: '发', 發: '发',
  裡: '里', 裡: '里', 說: '说', 麼: '么', 開: '开', 關: '关', 與: '与', 為: '为', 從: '从',
  來: '来', 時: '时', 見: '见', 現: '现', 實: '实', 際: '际', 樣: '样', 體: '体', 頭: '头',
  種: '种', 邊: '边', 過: '过', 還: '还', 點: '点', 會: '会', 電: '电', 動: '动', 話: '话',
  語: '语', 車: '车', 門: '门', 問: '问', 間: '间', 學: '学', 園: '园', 場: '场', 業: '业',
  區: '区', 國: '国', 圖: '图', 書: '书', 筆: '笔', 紙: '纸', 網: '网', 顏: '颜', 臉: '脸',
  嘴: '嘴', 齒: '齿', 腳: '脚', 陰: '阴', 陽: '阳', 內: '内', 褲: '裤', 襪: '袜', 襯: '衬',
  飾: '饰', 辮: '辫', 捲: '卷', 雙: '双', 單: '单', 兩: '两', 幾: '几', 條: '条', 張: '张',
  隻: '只', 歲: '岁', 號: '号', 稱: '称', 簡: '简', 複: '复', 雜: '杂', 壞: '坏', 醜: '丑',
  髒: '脏', 濕: '湿', 燈: '灯', 貓: '猫', 鳥: '鸟', 魚: '鱼', 龍: '龙', 風: '风', 雲: '云',
  鏡: '镜', 淚: '泪', 紅: '红', 綠: '绿', 藍: '蓝', 黃: '黄', 銀: '银', 鋼: '钢', 鐵: '铁',
  捲: '卷', 鬥: '斗', 戰: '战', 騎: '骑', 術: '术', 讀: '读', 寫: '写', 練: '练', 習: '习',
  帶: '带', 總: '总', 結: '结', 織: '织', 線: '线', 繩: '绳', 綁: '绑', 繞: '绕', 纏: '缠',
  舉: '举', 樓: '楼', 樹: '树', 葉: '叶', 花: '花', 草: '草', 鳥: '鸟', 飛: '飞', 過: '过',
  運: '运', 遠: '远', 進: '进', 達: '达', 還: '还', 邊: '边', 連: '连', 選: '选', 運: '运',
  裡: '里', 準: '准', 盡: '尽', 屬: '属', 屬: '属', 願: '愿', 類: '类', 顯: '显', 頭: '头',
  風: '风', 飯: '饭', 飲: '饮', 酒: '酒', 奶: '奶', 糖: '糖', 麵: '面', 雞: '鸡', 蛋: '蛋',
  麵: '面', 麵: '面', 麵: '面', 麵: '面',
};

const map = (s) => s.replace(/[\u4e00-\u9fff]/g, (c) => T2S[c] || c);

const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
let changed = 0;
let dropped = 0;
const out = {};
for (const [word, zhRaw] of Object.entries(raw)) {
  const zh = map(String(zhRaw || '').trim());
  if (!zh) { dropped++; continue; }
  /* 没翻出来的：等于原文，或整条 ASCII */
  if (zh.toLowerCase() === word.toLowerCase() || !/[\u4e00-\u9fff]/.test(zh)) { dropped++; continue; }
  if (zh !== zhRaw) changed++;
  out[word] = zh;
}

console.log(`原有 ${Object.keys(raw).length} 条 → 保留 ${Object.keys(out).length}（繁转简 ${changed}，丢弃 ${dropped}）`);
if (!dry) {
  fs.writeFileSync(file, JSON.stringify(out, null, 0), 'utf8');
  console.log('写回', file);
}
