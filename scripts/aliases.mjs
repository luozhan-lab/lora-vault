/**
 * ① 别名：把「口语叫法 / 错字 / 昵称」挂到已有的支上，search 和 locate 都能命中。
 */
import { db } from '../lib/db.mjs';

// 键 = 库里名字里包含这段；值 = 额外叫法
const MAP = {
  '卡芙卡': ['卡夫卡', 'kafka'],
  '康娜卡姆依': ['康纳', '康娜', '龙女仆', 'kanna'],
  '纳西妲': ['草神', '纳西达', 'nahida'],
  '雷电将军': ['雷神', '影', 'raiden'],
  '芙宁娜': ['水神', 'furina'],
  '玛薇卡': ['火神', 'mavuika'],
  '钟离': ['岩王帝君', '钟离'],
  '温迪': ['风神', 'venti'],
  '甘雨': ['椰羊', 'ganyu'],
  '胡桃': ['往生堂', 'hutao'],
  '派蒙': ['应急食品', 'paimon'],
  '神里绫华': ['绫华', '白鹭公主'],
  '八重神子': ['八重', '神子', 'yae'],
  '刻晴': ['玉衡星', 'keqing'],
  '荧': ['女主', '莹'],
  '空': ['男主'],
  '菲谢尔': ['皇女', 'fischl'],
  '珊瑚宫心海': ['心海', 'kokomi'],
  '宵宫': ['烟花', 'yoimiya'],
  '九条裟罗': ['裟罗'],
  '迪希雅': ['迪希亚', 'dehya'],
  '罗莎莉亚': ['罗莎利亚'],
  '卡齐娜': ['卡齐纳'],
  '千织': ['千枝', 'chiori'],
  '今汐': ['今夕', 'jinhsi'],
  '布洛妮娅': ['板鸭', 'bronya'],
  '花火': ['火花', 'sparkle'],
  '流萤': ['firefly'],
  '三月七': ['三七', 'march7th'],
  '阮梅': ['阮·梅', 'ruanmei'],
  '银狼': ['silverwolf'],
  '希儿': ['seele'],
  '符玄': ['fuxuan'],
  '藿藿': ['霍霍', 'huohuo'],
  '灵砂': ['灵沙'],
  '黄泉': ['acheron'],
  '知更鸟': ['robin'],
  '星见雅': ['雅', 'miyabi'],
  '艾莲·乔': ['艾莲乔', '鲨鱼', 'ellen'],
  '妮可·德玛拉': ['妮可', 'nicole'],
  '安比·德玛拉': ['安比', 'anby'],
  '柏妮思·怀特': ['柏妮丝', 'burnice'],
  '凯撒·金': ['凯撒', 'caesar'],
  '露西亚娜·德·蒙特菲奥': ['露西', 'lucy'],
  '派派·韦尔': ['派派', 'piper'],
  '格莉丝·霍华德': ['格莉丝', 'grace'],
  '月城柳': ['柳', 'yanagi'],
  '猫又': ['猫宫', 'nekomiya'],
  '苍角': ['soukaku'],
  '伊芙琳·舒瓦利耶': ['伊芙琳', 'evelyn'],
  '柚叶': ['yuzuha'],
  '青衣': ['qingyi'],
  '朱鸢': ['zhuyuan'],
  '简·杜': ['简杜', 'jane'],
  '铃与维斯': ['铃', 'belle'],
  '蚀影': ['eclipse'],
  '汐': ['小汐', 'xi'],
  '涂山红红': ['红红', '狐妖'],
  '涂山苏苏': ['苏苏'],
  '涂山容容': ['容容'],
  '涂山雅雅': ['雅雅'],
  '梅花十一': ['梅花十一'],
  '梅花十三': ['梅花十三'],
  '黄小燕': ['黄晓烟', 'hxy'],
  '桃夭': ['桃夭'],
};

const d = db();
const rows = d.prepare('SELECT id, name, aliases FROM lora').all();
const upd = d.prepare('UPDATE lora SET aliases = ?, updated_at = ? WHERE id = ?');
const now = new Date().toISOString();

let hit = 0;
d.exec('BEGIN');
try {
  for (const r of rows) {
    const extra = new Set(String(r.aliases || '').split(',').map((s) => s.trim()).filter(Boolean));
    for (const [key, list] of Object.entries(MAP)) {
      if (!String(r.name).includes(key)) continue;
      for (const a of list) if (a !== r.name) extra.add(a);
    }
    const next = [...extra].join(', ');
    if (next && next !== r.aliases) { upd.run(next, now, r.id); hit++; }
  }
  d.exec('COMMIT');
} catch (e) { try { d.exec('ROLLBACK'); } catch {} throw e; }

console.log(`挂上别名 ${hit} 支`);
for (const q of ['卡夫卡', '草神', '鲨鱼']) {
  const list = d.prepare('SELECT id, name, aliases FROM lora WHERE aliases LIKE ? LIMIT 3').all(`%${q}%`);
  console.log(q, '->', list.map((x) => x.name).join(' / ') || '(无)');
}
