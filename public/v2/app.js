/* LoRA 库 · 新版主流程
   只做三件事：选角色+风格出图、看图库、改设置。
   旧版 2026-11-24 下线，文件备份在 backup/classic-20261124/。 */
const DEFAULT_NEG = 'lowres, worst quality, blurry, jpeg artifacts, bad anatomy, bad proportions, bad hands, extra fingers, fused fingers, missing fingers, deformed limbs, extra limbs, extra person, watermark, text, signature, censored, mosaic censoring, bar censor, futanari, (girl with penis:1.8)';

const SEMANTIC = {
  scene: [
    ['教室', 'classroom'], ['卧室', 'bedroom'], ['浴室', 'bathroom'], ['泳池', 'swimming pool'],
    ['海边', 'beach'], ['街道', 'street'], ['公园', 'park'], ['咖啡厅', 'cafe'],
    ['图书馆', 'library'], ['神社', 'shrine'], ['城堡', 'castle'], ['废墟', 'ruins'],
    ['雪地', 'snowy field'], ['雨中', 'rain'], ['夜晚街道', 'night street'], ['森林', 'forest'],
    ['天台', 'rooftop'], ['车内', 'car interior'], ['健身房', 'gym'], ['办公室', 'office'],
    ['庭院', 'garden'], ['河边', 'riverside'], ['便利店', 'convenience store'], ['电影院', 'cinema'],
    ['博物馆', 'museum'], ['学校走廊', 'school hallway'], ['音乐教室', 'music room'],
    ['美术教室', 'art room'], ['花田', 'flower field'], ['露营地', 'campsite'], ['宿舍', 'dorm room'],
    ['巴士', 'bus interior'], ['天台夜景', 'rooftop night'], ['神社夜晚', 'shrine night'],
    ['夜晚客厅', 'living room night'], ['泳池夜晚', 'pool night'], ['电梯', 'elevator'],
    ['停车场', 'parking garage'], ['帐篷', 'tent'], ['图书馆夜晚', 'library night'],
    ['浴场', 'public bath'], ['演出后台', 'backstage'],
  ],
  outfit: [
    ['校服', 'school uniform'], ['水手服', 'sailor uniform'], ['泳装', 'swimsuit'], ['睡衣', 'pajamas'],
    ['女仆装', 'maid outfit'], ['旗袍', 'cheongsam'], ['婚纱', 'wedding dress'], ['制服', 'uniform'],
    ['运动服', 'gym clothes'], ['和服', 'kimono'], ['兔女郎', 'bunny suit'], ['黑丝', 'black pantyhose'],
    ['白丝', 'white pantyhose'], ['内衣', 'lingerie'], ['半脱', 'undressed'], ['裸体', 'nude'],
    ['吊带连衣裙', 'sundress'], ['连帽衫', 'hoodie'], ['大衣', 'coat'], ['学校泳装', 'school swimsuit'],
    ['运动内衣', 'sports bra'], ['瑜伽裤', 'leggings'], ['演出服', 'stage costume'],
    ['开裆内衣', 'crotchless lingerie'], ['乳胶', 'latex'], ['渔网', 'fishnet'], ['浴衣', 'yukata'],
    ['围裙', 'apron'], ['风衣', 'trench coat'], ['湿衣', 'wet clothes'],
  ],
  action: [
    ['坐着', 'sitting'], ['站着', 'standing'], ['躺着', 'lying down'], ['趴着', 'on stomach'],
    ['回头看', 'looking back'], ['自拍', 'selfie'], ['梳头', 'brushing hair'], ['吃东西', 'eating'],
    ['看书', 'reading'], ['伸手', 'reaching out'], ['拥抱', 'hug'], ['接吻', 'kiss'],
    ['摸胸', 'breast grab'], ['自慰', 'masturbation'], ['后入', 'doggystyle'], ['骑乘', 'cowgirl'],
    ['走路', 'walking'], ['伸懒腰', 'stretching'], ['托腮', 'hand on cheek'], ['撩头发', 'hand in hair'],
    ['跪坐', 'kneeling'], ['弯腰', 'bent over'], ['蹲下', 'squatting'], ['抬腿', 'leg lift'],
    ['趴跪', 'on all fours'], ['张嘴喘', 'moaning'], ['看手机', 'holding phone'],
    ['撑伞', 'holding umbrella'], ['祈祷', 'praying'], ['弹钢琴', 'playing piano'],
    ['画画', 'painting'], ['抱书', 'holding books'], ['看天', 'looking at sky'],
    ['正常位', 'missionary'], ['反向骑乘', 'reverse cowgirl'], ['侧入', 'spooning'],
    ['口交', 'fellatio'], ['乳交', 'paizuri'], ['手交', 'handjob'], ['足交', 'footjob'],
  ],
};

const TRIGGER_KIND_LABELS = {
  character: '角色', feature: '特征', outfit: '服装', body: '身体', other: '其他',
};
const TRIGGER_KIND_ORDER = ['character', 'feature', 'outfit', 'body', 'other'];

const BODY_TYPES = [
  {
    label: '幼女', adult: false,
    tag: '(loli:1.2), (small face:1.1), (large eyes:1.1), (round face:1.05), (round cheeks:1.15), (thick thighs:1.1), (childlike face:1.05), flat chest, flat belly, (slim waist:1.2), narrow shoulders, narrow hips, (small frame:1.15)',
    neg: 'large breasts, huge breasts, medium breasts, cleavage, wide hips, mature female, mature face, sharp eyes, narrow eyes, long face, wrinkles, tall, adult proportions, baggy clothes, multiple heads, extra heads, multiple views, extra eyes, gaunt face, skinny, (chubby:1.4), (plump:1.3), belly, pregnant, fat, crop top, midriff'
  },
  {
    label: '萝莉', adult: false,
    tag: '(short body:1.2), (loli:1.25), (small face:1.15), (large eyes:1.15), round cheeks, (childlike face:1.05), flat chest, narrow shoulders, slim waist, narrow hips, slender legs, small frame',
    neg: 'large breasts, huge breasts, medium breasts, cleavage, wide hips, mature female, mature face, sharp eyes, narrow eyes, long face, wrinkles, tall, adult proportions, baggy clothes, multiple views, extra eyes, long legs'
  },
  {
    label: '少女', adult: false,
    tag: '(small face:1.05), (large eyes:1.05), (childlike face:0.95), small breasts, narrow shoulders, slim waist, slight hips, long slender legs, slender frame',
    neg: 'large breasts, huge breasts, medium breasts, cleavage, wide hips, mature female, mature face, sharp eyes, long face, wrinkles, tall, baggy clothes'
  },
  {
    label: '女青年', adult: true,
    tag: 'medium breasts, narrow waist, wide hips, long legs, average build',
    neg: 'huge breasts, gigantic breasts, small breasts, flat chest, mature face, wrinkles, baggy clothes'
  },
  {
    label: '成女', adult: true,
    tag: 'large breasts, narrow waist, wide hips, thick thighs, tall, (mature female:1.1), mature face, sharp eyes',
    neg: 'childlike face, round face, baby face, small breasts, flat chest, huge breasts, gigantic breasts, baggy clothes'
  },
];
/* 幼女和萝莉分开：幼女靠 child/petite + 短腿小骨架，萝莉靠 5 头身；负面压多头/重影，避免出多双眼睛 */
/* 成人模式可用的体型：幼女 / 萝莉 不进成人池。对外分发的口径，跟正常模式分开——
   正常模式 5 档全给，成人池只剩 少女 / 女青年 / 成女。 */
const ADULT_OK_BODY_LABELS = new Set(['少女', '女青年', '成女']);
/* 儿童体型的预设角色：成人模式不出现（按 id 标，别靠名字猜） */
const PRESET_KID = new Set(['cute-loli']);
/* 开发版（--dev）：所有限制放开，方便自己调。正式版 / 网页版一律按正式口径走 */
const isDevBuild = () => !!(window.desktop && window.desktop.isDev);

/* 预设角色：不挂 LoRA，纯词出人，给还没下角色支的人先试手 */
const PRESET_CHARS = [
  { id: 'silver-red', name: '银发红瞳', tag: '1girl', feature: 'long silver hair, straight hair, red eyes, pale skin, slender body', outfit: 'white dress, black ribbon' },
  { id: 'black-long', name: '黑长直', tag: '1girl', feature: 'long black hair, straight hair, black eyes, pale skin, slender body', outfit: 'white blouse, black pleated skirt' },
  { id: 'blonde-twin', name: '金发双马尾', tag: '1girl', feature: 'long blonde hair, twintails, blue eyes, hair ribbon, slender body', outfit: 'casual clothes, white shirt, skirt' },
  { id: 'pink-twin', name: '粉发双马尾', tag: '1girl', feature: 'pink hair, twintails, pink eyes, hair ornament, slender body', outfit: 'sailor uniform, pleated skirt' },
  { id: 'elf', name: '精灵', tag: '1girl', feature: 'pointy ears, long blonde hair, green eyes, elf, slender body', outfit: 'green dress' },
  { id: 'sporty', name: '短发运动系', tag: '1girl', feature: 'short hair, brown hair, ponytail, athletic, toned body', outfit: 'sports bra, track pants, sneakers' },
  { id: 'mature', name: '成熟御姐', tag: '1girl', feature: 'long wavy hair, dark brown hair, mature face, medium breasts, tall', outfit: 'office lady, pencil skirt, black pantyhose' },
  { id: 'cute-loli', name: '可爱萝莉', tag: '1girl', feature: 'small face, large eyes, flat chest, petite, small body', outfit: 'pink dress, white thighhighs' },
  { id: 'dark-tomboy', name: '黑皮假小子', tag: '1girl', feature: 'dark skin, tomboy, short hair, black hair, athletic, toned body, abs', outfit: 'tank top, shorts, sneakers' },
  { id: 'catgirl', name: '猫娘', tag: '1girl', feature: 'cat ears, cat tail, nekomimi, long hair, amber eyes, fangs', outfit: 'white shirt, pleated skirt, thighhighs' },
  { id: 'maid', name: '女仆', tag: '1girl', feature: 'brown hair, bob cut, maid headdress, headband', outfit: 'maid outfit, white apron, black dress, white thighhighs' },
  { id: 'miko', name: '巫女', tag: '1girl', feature: 'long black hair, hime cut, red eyes', outfit: 'miko outfit, white haori, red hakama' },
  { id: 'nun', name: '修女', tag: '1girl', feature: 'long black hair, veil, cross necklace', outfit: 'nun habit, black and white robe' },
  { id: 'nurse', name: '护士', tag: '1girl', feature: 'long hair, nurse cap, gentle eyes', outfit: 'nurse outfit, white dress, nurse cap, white pantyhose' },
  { id: 'secretary', name: '秘书', tag: '1girl', feature: 'brown hair, glasses, serious expression', outfit: 'office lady, white blouse, pencil skirt, black pantyhose' },
  { id: 'vampire', name: '吸血鬼', tag: '1girl', feature: 'red eyes, fangs, pale skin, long black hair', outfit: 'black dress, cape' },
  { id: 'angel', name: '天使', tag: '1girl', feature: 'blue eyes, blonde hair, halo, angel wings', outfit: 'white dress, feathered wings' },
  { id: 'succubus', name: '魅魔', tag: '1girl', feature: 'purple hair, demon horns, demon tail, red eyes', outfit: 'black leotard, thighhighs' },
  { id: 'dragon', name: '龙娘', tag: '1girl', feature: 'dragon horns, dragon tail, scales, red eyes', outfit: 'black dress' },
  { id: 'ninja', name: '忍者', tag: '1girl', feature: 'black hair, ponytail, mask around neck', outfit: 'ninja outfit, black bodysuit, fishnet' },
  { id: 'knight', name: '骑士', tag: '1girl', feature: 'blonde hair, blue eyes, determined', outfit: 'armor, breastplate, gauntlets' },
  { id: 'military', name: '军装', tag: '1girl', feature: 'black hair, military uniform', outfit: 'military uniform, peaked cap, black boots' },
  { id: 'cyber', name: '赛博朋克', tag: '1girl', feature: 'short hair, cyberpunk, mechanical arm, neon accents', outfit: 'cyberpunk outfit, techwear, sneakers' },
  { id: 'swimsuit', name: '泳装少女', tag: '1girl', feature: 'long hair, blue eyes, wet skin', outfit: 'bikini, swimsuit' },
  { id: 'gym', name: '体操服', tag: '1girl', feature: 'short hair, slim body', outfit: 'gym uniform, bloomers, white socks' },
  { id: 'gothic', name: '哥特萝莉', tag: '1girl', feature: 'black hair, twintails, gothic lolita, small body', outfit: 'gothic dress, lace, black thighhighs' },
  { id: 'yukata', name: '和风浴衣', tag: '1girl', feature: 'long black hair, hair ornament, calm expression', outfit: 'yukata, obi, sandals' },
  { id: 'cheongsam', name: '旗袍御姐', tag: '1girl', feature: 'long black hair, mature face, medium breasts, tall', outfit: 'cheongsam, high heels, black pantyhose' },
  { id: 'foxgirl', name: '狐娘', tag: '1girl', feature: 'fox ears, fox tail, amber eyes, long hair', outfit: 'white kimono, red obi' },
  { id: 'bunnygirl', name: '兔娘', tag: '1girl', feature: 'rabbit ears, white hair, red eyes', outfit: 'bunny suit, black pantyhose, high heels' },
  { id: 'wolfgirl', name: '狼娘', tag: '1girl', feature: 'wolf ears, wolf tail, grey hair, yellow eyes', outfit: 'white shirt, shorts' },
];

const OUTFIT_LABELS = {
  'school uniform': '校服', 'sailor uniform': '水手服', 'knit sweater': '针织衫',
  'white t-shirt': '白T恤', 'dress': '连衣裙', 'casual clothes': '便服',
  'pajamas': '睡衣', 'camisole': '吊带', 'swimsuit': '泳装', 'bikini': '比基尼',
  'sun shirt': '防晒衫', 'kimono': '和服', 'cheongsam': '旗袍', 'wedding dress': '婚纱',
  'maid outfit': '女仆装', 'gym clothes': '运动服', 'office lady': '职业装',
  'bath towel': '浴巾', 'black pantyhose': '黑丝', 'white pantyhose': '白丝',
  'lingerie': '内衣', 'underwear only': '只穿内衣', 'completely nude': '裸体', 'open shirt': '敞开衬衫',
  'bunny suit': '兔女郎', 'undressed': '半脱', 'wet clothes': '湿衣',
  'micro bikini': '微型比基尼', 'crotchless lingerie': '开裆内衣', 'fishnet': '渔网',
  'latex': '乳胶', 'collar': '项圈', 'trench coat': '风衣', 'garter belt': '吊袜带',
  'yukata': '浴衣', 'apron': '围裙',
  'sundress': '吊带连衣裙', 'hoodie': '连帽衫', 'coat': '大衣', 'school swimsuit': '学校泳装',
  'sports bra': '运动内衣', 'leggings': '瑜伽裤', 'stage costume': '演出服',
  'uniform': '制服', 'nude': '裸身', 'shorts': '短裤', 'jeans': '牛仔裤',
  'off-shoulder sweater': '露肩毛衣', 'backless sweater': '露背毛衣', 'plaid skirt': '格子裙',
  'pleated skirt': '百褶裙', 'turtleneck': '高领毛衣', 'tank top': '背心', 'hanfu': '汉服',
  'gothic lolita': '哥特萝莉', 'miko outfit': '巫女服', 'nurse outfit': '护士服',
  'bathrobe': '浴袍', 'sweater vest': '毛衣背心', 'cardigan': '开衫',
  'blouse': '衬衫', 'evening gown': '晚礼服', 'corset': '束腰', 'bustier': '抹胸胸衣',
  'crop top': '露脐上衣', 'denim skirt': '牛仔裙', 'overalls': '背带裤', 'sweater dress': '毛衣裙',
  'camisole dress': '吊带裙', 'cheerleader outfit': '啦啦队服', 'kunoichi outfit': '女忍服',
  'armor': '盔甲', 'pajama shirt': '睡衣上衣', 'swim skirt': '泳裙',
  'pinafore dress': '背带裙', 'raincoat': '雨衣', 'bomber jacket': '棒球服', 'puffer jacket': '羽绒服',
  'jersey': '球衣', 'tennis outfit': '网球服', 'baseball uniform': '棒球制服', 'track suit': '运动套装',
  'polo shirt': 'Polo衫', 'gothic dress': '哥特裙', 'princess dress': '公主裙', 'detective coat': '侦探大衣',
  'cape': '披风', 'poncho': '斗篷', 'denim jacket': '牛仔外套', 'leather jacket': '皮夹克',
  'lace bodysuit': '蕾丝连体衣', 'bdsm harness': '捆绑带', 'wet shirt': '湿衬衫', 'maid lingerie': '女仆内衣',
  'bondage outfit': '束缚衣', 'see-through dress': '透明纱裙', 'micro skirt': '超短裙', 'latex bodysuit': '乳胶连体衣',
  'plunge bra': '深V内衣', 'pasties': '乳贴',
  'string bikini': '细绳比基尼', 'sling bikini': '吊带比基尼', 'side-tie bikini': '系带比基尼',
  'micro shorts': '超短热裤', 'crotchless panties': '开裆内裤', 'thong': '丁字裤', 'g-string': 'G弦裤',
  'c-string': 'C字裤', 'lace babydoll': '蕾丝娃娃裙', 'teddy lingerie': '连体内衣', 'chemise': '睡裙内衣',
  'cupless bra': '无罩杯胸衣', 'cage bra': '笼式胸衣', 'open bra': '敞开胸衣', 'fishnet bodysuit': '渔网连体衣',
  'sheer leotard': '透明连体衣', 'crotchless bodysuit': '开裆连体衣', 'leotard': '连体紧身衣',
  'shibari': '绳缚', 'armbinder': '束缚手套', 'apron only': '只穿围裙', 'latex dress': '乳胶裙',
  'pvc outfit': 'PVC服', 'belly dancer outfit': '肚皮舞服', 'micro dress': '超短连衣裙',
  'wet t-shirt': '湿T恤', 'open-crotch pantyhose': '开裆丝袜', 'bunny girl': '兔女郎（经典）',
  /* 成套 JK 那种：上衣 + 百褶裙 + 丝袜 + 小皮鞋，一次选好 */
  'jk uniform, pleated skirt, white thighhighs, loafers': 'JK制服套装（百褶裙·白丝袜·小皮鞋）',
  'black school uniform, pleated skirt, black thighhighs, loafers': '黑色JK套装（百褶裙·黑丝袜·小皮鞋）',
  'sailor uniform, pleated skirt, white thighhighs, loafers': '水手服JK套装（百褶裙·白丝袜·小皮鞋）',
  'plaid skirt, cardigan, white thighhighs, loafers': '毛衣格子裙套装（白丝袜·小皮鞋）',
  'office lady, pencil skirt, black pantyhose, high heels': 'OL套装（包臀裙·黑丝·高跟）',
  /* 高跟成套 */
  'evening gown, black pantyhose, high heels': '晚礼服高跟套装（黑丝·高跟）',
  'cheongsam, black pantyhose, high heels': '旗袍高跟套装（黑丝·高跟）',
  'maid outfit, white thighhighs, high heels': '女仆装高跟套装（白丝·高跟）',
  'nurse outfit, white pantyhose, high heels': '护士服高跟套装（白丝·高跟）',
  'bunny suit, black pantyhose, high heels': '兔女郎高跟套装（黑丝·高跟）',
  'latex dress, black pantyhose, high heels': '乳胶裙高跟套装（黑丝·高跟）',

  'maid outfit, white apron, black dress, white thighhighs': '女仆全套',
  'nurse outfit, white dress, nurse cap, white pantyhose': '护士全套',
  'flight attendant uniform, pencil skirt, black pantyhose, scarf': '空姐全套',
  'police uniform, short skirt, black pantyhose, boots': '女警全套',
  'office lady, white blouse, pencil skirt, black pantyhose': '秘书全套',
  'idol costume, frilled skirt, white thighhighs, boots': '偶像全套',
  'cheerleader outfit, pleated skirt, white socks, sneakers': '啦啦队全套',
  'gym uniform, bloomers, white socks, sneakers': '体操服全套',
  'tennis outfit, pleated skirt, white socks, sneakers': '网球全套',
  'baseball uniform, knee socks, cleats': '棒球全套',
  'armor, breastplate, gauntlets, greaves': '骑士铠甲',
  'military uniform, peaked cap, black boots, gloves': '军装全套',
  'ninja outfit, black bodysuit, fishnet, tabi': '忍者全套',
  'cyberpunk outfit, techwear, neon accents, sneakers': '赛博全套',
  'yukata, obi, sandals, hair ornament': '浴衣全套',
  'kimono, obi, tabi, sandals': '和服全套',
  'cheongsam, black pantyhose, high heels, hair ornament': '旗袍全套',
  'wedding dress, veil, white thighhighs, gloves': '婚纱全套',
  'evening gown, black pantyhose, high heels, earrings': '晚礼服全套',
  'gothic lolita, frilled dress, black thighhighs, mary janes': '哥特萝莉全套',
  'miko outfit, white haori, red hakama, tabi': '巫女全套',
  'bunny suit, black pantyhose, high heels, bunny ears': '兔女郎全套',
  'latex dress, black pantyhose, high heels, gloves': '乳胶全套',
  'leather jacket, black pants, boots, motorcycle': '机车全套',
  'pajamas, white socks, slippers': '睡衣全套',
  'one-piece swimsuit, sandals': '泳装全套',
  'bikini, straw hat, sandals': '比基尼全套',
  'school swimsuit, swim cap, sandals': '学校泳装全套',
  'shibari, red rope, bound arms': '绳缚全套',
  'bondage outfit, straps, harness, cuffs': '束缚全套',
  'lace babydoll, thighhighs, garter belt': '情趣蕾丝全套',
  'crotchless bodysuit, thighhighs': '开裆连体全套',
  'wet clothes, wet shirt, see-through': '湿身全套',
  'casual clothes, cardigan, skirt, loafers': '居家便服全套',
  'track suit, sneakers': '运动休闲全套',
  'sailor uniform, pleated skirt, white socks, loafers': '水手服全套',
  'school uniform, pleated skirt, black knee socks, loafers': '校服全套',
  'hanfu, hair ornament, flats': '汉服全套',
  'princess dress, tiara, gloves': '公主裙全套',
  'bodycon dress, high heels, earrings': '包臀裙全套',
  'black jk uniform, pleated skirt, black thighhighs, loafers': '黑色JK套装（百褶裙·黑丝·小皮鞋）',
  'winter school uniform, duffle coat, plaid skirt, black knee socks, loafers': '冬季校服套装（呢子大衣·格裙·黑袜）',
  'teacher outfit, blazer, pencil skirt, black pantyhose, glasses': '教师套装（西装·包臀裙·黑丝·眼镜）',
  'white coat, blouse, pencil skirt, black pantyhose': '白大褂套装（衬衫·包臀裙·黑丝）',
  'waitress outfit, apron, white blouse, black skirt, black pantyhose': '女服务生套装（围裙·衬衫·黑裙）',
  'race queen outfit, bikini, boots, gloves, jacket on shoulders': '赛车女郎套装（比基尼·长靴·外套）',
  'volleyball uniform, jersey, shorts, knee pads, sneakers': '排球套装（球衣·短裤·护膝）',
  'basketball jersey, shorts, sneakers': '篮球套装（球衣·短裤·球鞋）',
  'soccer uniform, jersey, shorts, long socks, cleats': '足球套装（球衣·长袜·钉鞋）',
  'golf outfit, polo shirt, pleated skirt, cap, sneakers': '高尔夫套装（Polo·百褶裙·球帽）',
  'equestrian outfit, riding jacket, jodhpurs, boots, helmet': '马术套装（骑装·马裤·长靴）',
  'ballet outfit, leotard, tutu, tights, ballet shoes': '芭蕾套装（连体衣·纱裙·芭蕾鞋）',
  'gymnastics leotard, tights, sneakers': '体操套装（连体衣·打底袜·运动鞋）',
  'nun outfit, habit, cross necklace, black pantyhose': '修女套装（头巾·长袍·十字架）',
  'witch outfit, witch hat, cape, black dress, striped thighhighs': '魔女套装（尖帽·斗篷·条纹袜）',
  'fairy outfit, wings, white dress, flower crown': '精灵套装（翅膀·白裙·花冠）',
  'vampire outfit, black dress, cape, choker': '吸血鬼套装（黑裙·斗篷·颈圈）',
  'office suit, white shirt, black trousers, tie, loafers': '西装裤装（白衬衫·领带·乐福鞋）',
  'casual suit, blazer, jeans, sneakers': '休闲西装（西装外套·牛仔裤·球鞋）',
  'loungewear, oversized sweater, shorts, slippers': '居家套装（大毛衣·短裤·拖鞋）',
  'raincoat, yellow raincoat, rain boots': '雨衣套装（黄雨衣·雨靴）',
  'winter coat, turtleneck, plaid skirt, black tights, boots': '冬季大衣套装（高领·格裙·黑裤袜）',
  'detective outfit, trench coat, shirt, tie, trousers': '侦探套装（风衣·衬衫·领带）',
  'scientist outfit, lab coat, glasses, pencil skirt': '科学家套装（白大褂·眼镜·包臀裙）',
  'bartender outfit, vest, white shirt, black pants, bowtie': '酒保套装（马甲·衬衫·领结）',
  'cowgirl outfit, cowboy hat, plaid shirt, denim shorts, boots': '西部牛仔套装（牛仔帽·格子衫·短裤）',
  'pirate outfit, tricorn hat, coat, boots': '海盗套装（三角帽·大衣·长靴）',
  'maid lingerie, white apron, black lingerie, white thighhighs': '情趣女仆套装（围裙·黑内衣·白丝）',
  'body stocking, sheer, garter belt, high heels': '连体丝袜套装（透视·吊袜带·高跟）',
  'santa outfit, red dress, white trim, santa hat, black boots': '圣诞套装（红裙·白边·圣诞帽）',
  'cheongsam, fur shawl, black pantyhose, high heels': '旗袍披肩套装（毛披肩·黑丝·高跟）',
  'kimono, haori, obi, geta': '和服羽织套装（羽织·腰带·木屐）',
  'yukata, obi, hair flower, sandals': '浴衣发饰套装（腰带·发花·凉鞋）',
};

/* 额外服装：不绑场景，任何场景下都能选（露骨的那些在 ADULT_OUTFITS 里，正常模式会滤掉） */
const EXTRA_OUTFITS = [
  'maid outfit, white apron, black dress, white thighhighs', 'nurse outfit, white dress, nurse cap, white pantyhose', 'flight attendant uniform, pencil skirt, black pantyhose, scarf', 'police uniform, short skirt, black pantyhose, boots', 'office lady, white blouse, pencil skirt, black pantyhose', 'idol costume, frilled skirt, white thighhighs, boots', 'cheerleader outfit, pleated skirt, white socks, sneakers', 'gym uniform, bloomers, white socks, sneakers', 'tennis outfit, pleated skirt, white socks, sneakers', 'baseball uniform, knee socks, cleats', 'armor, breastplate, gauntlets, greaves', 'military uniform, peaked cap, black boots, gloves', 'ninja outfit, black bodysuit, fishnet, tabi', 'cyberpunk outfit, techwear, neon accents, sneakers', 'yukata, obi, sandals, hair ornament', 'kimono, obi, tabi, sandals', 'cheongsam, black pantyhose, high heels, hair ornament', 'wedding dress, veil, white thighhighs, gloves', 'evening gown, black pantyhose, high heels, earrings', 'gothic lolita, frilled dress, black thighhighs, mary janes', 'miko outfit, white haori, red hakama, tabi', 'bunny suit, black pantyhose, high heels, bunny ears', 'latex dress, black pantyhose, high heels, gloves', 'leather jacket, black pants, boots, motorcycle', 'pajamas, white socks, slippers', 'one-piece swimsuit, sandals', 'bikini, straw hat, sandals', 'school swimsuit, swim cap, sandals', 'shibari, red rope, bound arms', 'bondage outfit, straps, harness, cuffs', 'lace babydoll, thighhighs, garter belt', 'crotchless bodysuit, thighhighs', 'wet clothes, wet shirt, see-through', 'casual clothes, cardigan, skirt, loafers', 'track suit, sneakers', 'sailor uniform, pleated skirt, white socks, loafers', 'school uniform, pleated skirt, black knee socks, loafers', 'hanfu, hair ornament, flats', 'princess dress, tiara, gloves', 'bodycon dress, high heels, earrings',
  'pinafore dress', 'raincoat', 'bomber jacket', 'puffer jacket', 'jersey', 'tennis outfit',
  'baseball uniform', 'track suit', 'polo shirt', 'gothic dress', 'princess dress', 'detective coat',
  'cape', 'poncho', 'denim jacket', 'leather jacket',
  'lace bodysuit', 'bdsm harness', 'wet shirt', 'maid lingerie', 'bondage outfit', 'see-through dress',
  'micro skirt', 'latex bodysuit', 'plunge bra', 'pasties',
  /* 加：更露骨的（全在 ADULT_OUTFITS 里） */
  'string bikini', 'sling bikini', 'side-tie bikini', 'micro shorts', 'crotchless panties',
  'thong', 'g-string', 'c-string', 'lace babydoll', 'teddy lingerie', 'chemise',
  'cupless bra', 'cage bra', 'open bra', 'fishnet bodysuit', 'sheer leotard', 'crotchless bodysuit',
  'leotard', 'shibari', 'armbinder', 'apron only', 'latex dress', 'pvc outfit',
  'belly dancer outfit', 'micro dress', 'wet t-shirt', 'open-crotch pantyhose', 'bunny girl',
  /* 成套（JK / 毛衣格子裙 / 体操服 / OL） */
  'jk uniform, pleated skirt, white thighhighs, loafers',
  'black school uniform, pleated skirt, black thighhighs, loafers',
  'sailor uniform, pleated skirt, white thighhighs, loafers',
  'plaid skirt, cardigan, white thighhighs, loafers',
  'office lady, pencil skirt, black pantyhose, high heels',
  'evening gown, black pantyhose, high heels',
  'cheongsam, black pantyhose, high heels',
  'maid outfit, white thighhighs, high heels',
  'nurse outfit, white pantyhose, high heels',
  'bunny suit, black pantyhose, high heels',
  'latex dress, black pantyhose, high heels',
]
const OUTFIT_THEME_SETS = [
  ['maid outfit, white apron, black dress, white thighhighs', '女仆全套'],
  ['nurse outfit, white dress, nurse cap, white pantyhose', '护士全套'],
  ['flight attendant uniform, pencil skirt, black pantyhose, scarf', '空姐全套'],
  ['police uniform, short skirt, black pantyhose, boots', '女警全套'],
  ['office lady, white blouse, pencil skirt, black pantyhose', '秘书全套'],
  ['idol costume, frilled skirt, white thighhighs, boots', '偶像全套'],
  ['cheerleader outfit, pleated skirt, white socks, sneakers', '啦啦队全套'],
  ['gym uniform, bloomers, white socks, sneakers', '体操服全套'],
  ['tennis outfit, pleated skirt, white socks, sneakers', '网球全套'],
  ['baseball uniform, knee socks, cleats', '棒球全套'],
  ['armor, breastplate, gauntlets, greaves', '骑士铠甲'],
  ['military uniform, peaked cap, black boots, gloves', '军装全套'],
  ['ninja outfit, black bodysuit, fishnet, tabi', '忍者全套'],
  ['cyberpunk outfit, techwear, neon accents, sneakers', '赛博全套'],
  ['yukata, obi, sandals, hair ornament', '浴衣全套'],
  ['kimono, obi, tabi, sandals', '和服全套'],
  ['cheongsam, black pantyhose, high heels, hair ornament', '旗袍全套'],
  ['wedding dress, veil, white thighhighs, gloves', '婚纱全套'],
  ['evening gown, black pantyhose, high heels, earrings', '晚礼服全套'],
  ['gothic lolita, frilled dress, black thighhighs, mary janes', '哥特萝莉全套'],
  ['miko outfit, white haori, red hakama, tabi', '巫女全套'],
  ['bunny suit, black pantyhose, high heels, bunny ears', '兔女郎全套'],
  ['latex dress, black pantyhose, high heels, gloves', '乳胶全套'],
  ['leather jacket, black pants, boots, motorcycle', '机车全套'],
  ['pajamas, white socks, slippers', '睡衣全套'],
  ['one-piece swimsuit, sandals', '泳装全套'],
  ['bikini, straw hat, sandals', '比基尼全套'],
  ['school swimsuit, swim cap, sandals', '学校泳装全套'],
  ['shibari, red rope, bound arms', '绳缚全套'],
  ['bondage outfit, straps, harness, cuffs', '束缚全套'],
  ['lace babydoll, thighhighs, garter belt', '情趣蕾丝全套'],
  ['crotchless bodysuit, thighhighs', '开裆连体全套'],
  ['wet clothes, wet shirt, see-through', '湿身全套'],
  ['casual clothes, cardigan, skirt, loafers', '居家便服全套'],
  ['track suit, sneakers', '运动休闲全套'],
  ['sailor uniform, pleated skirt, white socks, loafers', '水手服全套'],
  ['school uniform, pleated skirt, black knee socks, loafers', '校服全套'],
  ['hanfu, hair ornament, flats', '汉服全套'],
  ['princess dress, tiara, gloves', '公主裙全套'],
  ['bodycon dress, high heels, earrings', '包臀裙全套'],
  ['black jk uniform, pleated skirt, black thighhighs, loafers', '黑色JK套装'],
  ['winter school uniform, duffle coat, plaid skirt, black knee socks, loafers', '冬季校服套装'],
  ['teacher outfit, blazer, pencil skirt, black pantyhose, glasses', '教师套装'],
  ['white coat, blouse, pencil skirt, black pantyhose', '白大褂套装'],
  ['waitress outfit, apron, white blouse, black skirt, black pantyhose', '女服务生套装'],
  ['race queen outfit, bikini, boots, gloves, jacket on shoulders', '赛车女郎套装'],
  ['volleyball uniform, jersey, shorts, knee pads, sneakers', '排球套装'],
  ['basketball jersey, shorts, sneakers', '篮球套装'],
  ['soccer uniform, jersey, shorts, long socks, cleats', '足球套装'],
  ['golf outfit, polo shirt, pleated skirt, cap, sneakers', '高尔夫套装'],
  ['equestrian outfit, riding jacket, jodhpurs, boots, helmet', '马术套装'],
  ['ballet outfit, leotard, tutu, tights, ballet shoes', '芭蕾套装'],
  ['gymnastics leotard, tights, sneakers', '体操套装'],
  ['nun outfit, habit, cross necklace, black pantyhose', '修女套装'],
  ['witch outfit, witch hat, cape, black dress, striped thighhighs', '魔女套装'],
  ['fairy outfit, wings, white dress, flower crown', '精灵套装'],
  ['vampire outfit, black dress, cape, choker', '吸血鬼套装'],
  ['office suit, white shirt, black trousers, tie, loafers', '西装裤装'],
  ['casual suit, blazer, jeans, sneakers', '休闲西装'],
  ['loungewear, oversized sweater, shorts, slippers', '居家套装'],
  ['raincoat, yellow raincoat, rain boots', '雨衣套装'],
  ['winter coat, turtleneck, plaid skirt, black tights, boots', '冬季大衣套装'],
  ['detective outfit, trench coat, shirt, tie, trousers', '侦探套装'],
  ['scientist outfit, lab coat, glasses, pencil skirt', '科学家套装'],
  ['bartender outfit, vest, white shirt, black pants, bowtie', '酒保套装'],
  ['cowgirl outfit, cowboy hat, plaid shirt, denim shorts, boots', '西部牛仔套装'],
  ['pirate outfit, tricorn hat, coat, boots', '海盗套装'],
  ['maid lingerie, white apron, black lingerie, white thighhighs', '情趣女仆套装'],
  ['body stocking, sheer, garter belt, high heels', '连体丝袜套装'],
  ['santa outfit, red dress, white trim, santa hat, black boots', '圣诞套装'],
  ['cheongsam, fur shawl, black pantyhose, high heels', '旗袍披肩套装'],
  ['kimono, haori, obi, geta', '和服羽织套装'],
  ['yukata, obi, hair flower, sandals', '浴衣发饰套装'],
];
/* 服装只留「一整套」：单件（衬衫 / 牛仔裤 / 短裤…）不再出现在选择器里 */
const OUTFIT_SET_ALLOW = [
  'maid outfit', 'miko outfit',
  'cheerleader outfit', 'kunoichi outfit', 'armor',
  'lingerie', 'micro bikini', 'crotchless lingerie',
  'bunny girl', 'underwear only',
  'lace bodysuit', 'sheer leotard', 'fishnet bodysuit',
  'latex bodysuit',
  'teddy lingerie', 'chemise',
  'bdsm harness', 'see-through dress',
  'micro dress', 'string bikini', 'sling bikini',
  'side-tie bikini', 'leotard',
  'pvc outfit', 'belly dancer outfit',
  'apron only', 'bath towel', 'trench coat',
  'open shirt', 'undressed', 'completely nude',
];
const OUTFIT_SETS = new Set([...OUTFIT_SET_ALLOW, ...OUTFIT_THEME_SETS.map(([t]) => t)]);

const ACTION_LABELS = {
  'sitting': '坐着', 'standing': '站着', 'looking back': '回头看', 'reading': '看书',
  'hand on cheek': '托腮', 'stretching': '伸懒腰', 'selfie': '自拍', 'eating': '吃东西',
  'reaching out': '伸手', 'hugging each other': '拥抱', 'kissing': '接吻',
  'lying down': '躺着', 'lying on side': '侧躺', 'sleeping': '睡觉', 'walking': '走路',
  'hand in hair': '撩头发', 'in water': '下水', 'on bed': '在床上', 'on stomach': '趴着',
  'kneeling': '跪坐', 'spread legs': '张开腿', 'masturbation': '自慰',
  'doggystyle': '后入', 'cowgirl': '骑乘', 'breast grab': '摸胸',
  'missionary': '正常位', 'reverse cowgirl': '反向骑乘', 'standing sex': '站立',
  'desk sex, sitting on desk, facing each other, sex, penetration': '桌上插入·面对面',
  'reverse upright straddle, reverse cowgirl position, straddling, sitting on his lap, facing away, penetration': '反坐插入·凳上',
  'against wall': '抵墙', 'spooning': '侧入', 'mating press': '屈曲位',
  'prone bone': '趴压', '69': '69 式', 'fellatio': '口交', 'cunnilingus': '舔阴',
  'paizuri': '乳交', 'handjob': '手交', 'fingering': '指交', 'vibrator': '振动棒',
  'dildo': '假阳具', 'anal': '肛交', 'creampie': '内射', 'facial': '颜射',
  'cum in mouth': '口爆', 'exhibitionism': '露出', 'public nudity': '公开裸露',
  'flashing': '掀衣', 'undressing': '脱衣', 'on all fours': '趴跪', 'leg lift': '抬一条腿',
  'bent over': '弯腰', 'squatting': '蹲下', 'footjob': '足交',
  'holding hands': '牵手', 'leaning on shoulder': '靠肩', 'feeding each other': '互相喂',
  'walking together': '并肩走', 'piggyback ride': '背人', 'reading together': '一起看书',
  'selfie together': '一起自拍', 'hugging each other': '拥抱',
  'tribadism': '磨镜', 'scissoring': '剪刀式', 'facesitting': '骑脸',
  'mutual masturbation': '互相手淫', 'grinding': '蹭腿',
  'strapon': '穿戴假阳具', 'cunnilingus': '舔阴',
  'watering flowers': '浇花', 'holding phone': '拿着手机', 'eating popcorn': '吃爆米花',
  'holding drink': '拿饮料', 'holding books': '抱书', 'playing piano': '弹钢琴',
  'painting': '画画', 'holding brush': '拿画笔', 'looking at sky': '看天',
  'shivering': '发抖', 'holding umbrella': '撑伞', 'praying': '祈祷',
  'lying on sofa': '躺沙发', 'bent over desk': '趴在桌上', 'sitting on floor': '坐地上',
  'crawling': '爬行', 'leaning forward': '前倾', 'leaning on wall': '靠墙',
  'hugging pillow': '抱枕', 'tying hair': '扎头发', 'holding hand': '拉手',
  'drinking': '喝水', 'playing game': '打游戏', 'dancing': '跳舞', 'singing': '唱歌',
  'waking up': '刚睡醒', 'arms crossed': '抱臂', 'hand on hip': '叉腰',
  'pointing': '指', 'saluting': '敬礼', 'riding bike': '骑车', 'walking dog': '遛狗',
  'paizuri': '乳交', 'handjob': '手交', 'footjob': '足交', 'sixty-nine': '69',
  'prone bone': '趴压', 'missionary': '正常位', 'reverse cowgirl': '反向骑乘',
  'suspended congress': '抱起位', 'lotus': '莲花坐', 'standing sex': '站立位',
  'against wall': '抵墙', 'spooning': '侧入', 'leg lock': '夹腿', 'lifted legs': '双腿抬起',
  'bent over': '弯腰', 'on all fours': '趴跪', 'doggystyle': '后入', 'cowgirl': '骑乘',
  'posing': '摆姿势', 'waving': '挥手', 'holding cup': '拿杯子', 'eating snack': '吃零食',
  'cooking': '做饭', 'bathing': '泡澡', 'changing clothes': '换衣服', 'petting cat': '撸猫',
  'writing': '写字', 'playing guitar': '弹吉他', 'adjusting clothes': '整理衣服',
  'crossing arms': '双臂交叉', 'peace sign': '比耶', 'thinking pose': '思考状',
  'holding flower': '拿花', 'touching cheek': '摸脸',
  'leaning on railing': '靠栏杆', 'sitting on stairs': '坐在楼梯上', 'crouching': '蹲着', 'lying on grass': '躺草地',
  'kneeling on one knee': '单膝跪', 'stretching arms': '伸展手臂', 'tying shoes': '系鞋带', 'drinking tea': '喝茶',
  'taking photo': '拍照', 'jumping': '跳', 'running': '跑', 'climbing stairs': '上楼梯', 'leaning out window': '探窗',
  'hugging knees': '抱膝', 'sitting cross-legged': '盘腿坐', 'leaning on table': '靠桌', 'hands behind back': '背手',
  'hands in pockets': '插兜', 'adjusting hair': '整理头发', 'putting on shoes': '穿鞋', 'playing violin': '拉小提琴',
  'dancing ballet': '芭蕾', 'holding bag': '拎包', 'reading on bed': '床上看书', 'sunbathing': '晒太阳',
  'skateboarding': '滑板', 'riding scooter': '骑小摩托', 'holding balloon': '拿气球', 'blowing kiss': '飞吻',
  'finger to lips': '食指抵唇',
  'undressing herself': '自己脱衣', 'presenting': '抬臀展示', 'legs up': '双腿抬起', 'face down ass up': '趴跪抬臀',
  'holding own breasts': '自摸胸', 'licking lips': '舔嘴唇', 'grinding on him': '蹭他', 'arched back': '弓起背',
  'sitting on lap': '坐腿上', 'straddling': '跨坐', 'face to face': '面对面', 'back hug': '背后抱',
  'standing side by side': '并肩站',
  'after sex': '事后', 'afterglow': '余韵', 'lying limp': '瘫软躺着', 'messy hair': '头发凌乱',
  'cum on body': '身上带精', 'cum on stomach': '肚子上有精', 'cum dripping': '精液滴落', 'cum overflow': '精液溢出',
  'panting': '喘息', 'under blanket': '盖着被子', 'sitting up tired': '坐着喘', 'orgasm': '高潮',
  'squirting': '潮吹', 'body trembling': '身体发抖', 'legs trembling': '腿抖', 'toes curling': '脚趾蜷曲',
  'gripping bedsheet': '抓床单', 'clutching pillow': '抱紧枕头', 'hand between legs': '手在腿间', 'knees weak': '腿软',
  'missionary creampie': '正常位内射', 'doggystyle creampie': '后入内射', 'cowgirl creampie': '骑乘内射',
  'reverse cowgirl creampie': '反向骑乘内射', 'spooning creampie': '侧入内射', 'standing creampie': '站立内射',
  'suspended creampie': '抱起内射', 'prone bone creampie': '趴压内射', 'pulling out': '拔出来射',
  'facial': '颜射', 'cum on breasts': '射胸上', 'cum on belly': '射肚子上', 'cum on back': '射背上',
  'cum on ass': '射屁股上', 'cum on legs': '射腿上', 'cum in mouth': '口爆', 'swallowing': '吞精',
  'deepthroat': '深喉', 'paizuri cumshot': '乳交射', 'licking glans': '舔龟头', 'licking testicles': '舔蛋',
  'handjob cumshot': '手交射',
  'full nelson': '全尼尔森位', 'piledriver': '打桩机位', 'amazon position': '亚马逊位',
  'titjob': '乳交（titjob）', 'cum on face': '射脸上',
  'sitting on sand': '坐沙滩上', 'lying on sand': '躺沙滩上', 'against tree': '靠着树',
  'sitting on log': '坐木头上', 'sitting on tatami': '坐榻榻米', 'lying on futon': '躺被褥',
  'sitting in seat': '坐座位上', 'kneeling in aisle': '跪在过道', 'lying on seat': '躺座位上',
  'bent over crate': '趴在箱子上', 'sitting on crate': '坐箱子上',
  'bent over washing machine': '趴在洗衣机上', 'sitting on washing machine': '坐洗衣机上',
  'kneeling on pew': '跪在长椅上', 'sitting on pew': '坐长椅上', 'lying on altar': '躺在祭坛上',
  'sitting on bench': '坐长椅上', 'lying on bench': '躺长椅上',
  'kneeling on sofa': '跪沙发上', 'sitting on sofa': '坐沙发上',
  /* 场景专属姿势 */
  'sitting on desk': '坐课桌上', 'sitting on chair': '坐椅子上', 'leaning on windowsill': '靠窗台',
  'standing in front of blackboard': '站在黑板前', 'writing on blackboard': '写黑板', 'lying on desk': '躺课桌上',
  'leaning on desk': '靠课桌', 'reading at desk': '课桌上看书', 'sitting backwards on chair': '反坐椅子',
  'leaning on lockers': '靠储物柜', 'walking down hallway': '走廊上走', 'standing by window': '站窗边',
  'sitting at piano': '坐钢琴前', 'sitting on stool': '坐凳子上', 'holding sheet music': '拿乐谱',
  'leaning on piano': '靠钢琴', 'holding palette': '拿调色板', 'drawing at easel': '画架前画画',
  'reaching for bookshelf': '伸手拿书', 'sitting on ladder': '坐梯子上', 'leaning on bookshelf': '靠书架',
  'stacking books': '抱一摞书', 'sitting at counter': '坐吧台', 'leaning on counter': '靠吧台',
  'holding tray': '端盘子', 'sitting at window seat': '坐窗边座位', 'sitting on bed': '坐床上',
  'lying on pillow': '躺枕头上', 'sitting on sofa': '坐沙发上', 'sitting on rug': '坐地毯',
  'drinking from cup': '拿杯喝', 'sitting on counter': '坐厨台上', 'sitting in bathtub': '坐浴缸',
  'wrapping towel': '裹毛巾', 'washing hair': '洗头', 'sitting in water': '泡水里',
  'leaning on rock': '靠石头', 'sitting on poolside': '坐池边', 'leaning on pool edge': '靠池边',
  'wading': '涉水', 'sitting on sand': '坐沙上', 'lying on towel': '躺毛巾上', 'walking in water': '踩水',
  'sitting on bench': '坐长椅', 'feeding ducks': '喂鸭子', 'leaning on tree': '靠树',
  'sitting on rooftop edge': '坐天台边', 'waiting at bus stop': '公交站等车', 'waiting on platform': '站台等车',
  'sitting by window': '坐窗边', 'standing holding strap': '抓吊环', 'leaning on door': '靠车门',
  'sitting at desk': '坐办公桌', 'holding documents': '拿文件', 'sitting on tatami': '坐榻榻米',
  'kneeling on cushion': '跪坐垫上', 'lying on tatami': '躺榻榻米', 'walking up stairs': '上台阶',
  'sitting on steps': '坐台阶', 'stretching on floor': '地上拉伸', 'drinking from bottle': '喝瓶装水',
  'looking at painting': '看画', 'standing in hall': '站展厅', 'reading at shelf': '站着翻书',
  'sitting in theater': '坐影厅', 'holding popcorn': '拿爆米花', 'leaning on balcony': '靠阳台',
  'sitting on rubble': '坐碎石上',
  /* 成人场景专属 */
  'kneeling on bed': '跪在床上', 'bent over bed': '趴在床沿', 'lying on bed spread legs': '床上张腿',
  'sitting on office desk': '坐办公桌上', 'kneeling under desk': '跪在桌下', 'bent over sink': '趴在洗手台',
  'kneeling in shower': '跪在淋浴间', 'kneeling on grass': '跪在草地', 'lying on back seat': '躺后座',
  'sitting in passenger seat': '坐副驾', 'lying on sleeping bag': '躺睡袋', 'on all fours on sofa': '沙发趴跪',
  'riding pillow': '骑枕头',
  'standing behind': '站身后', 'kissing neck': '吻脖子', 'biting neck': '咬脖子', 'grabbing waist': '掐腰',
  'pinning wrists': '按住手腕', 'legs wrapped around': '腿缠腰', 'carrying her': '抱起',
  'pushed against window': '抵窗',
  'sitting on table': '坐桌上', 'lying on table': '躺桌上', 'sitting on desk spread legs': '坐桌上张腿',
  'bent over table': '趴在桌边',
  'arms behind head': '手放脑后', 'hands on knees': '双手扶膝', 'lying on back': '仰躺',
  'kneeling on floor': '跪在地上', 'sitting sideways': '侧坐', 'stretching legs': '伸腿',
  'crossing legs': '翘腿', 'hugging own body': '抱着自己', 'covering mouth': '捂嘴',
  'looking down': '低头', 'looking up': '抬头', 'curled up': '蜷着', 'sitting on windowsill': '坐窗台',
  'standing on tiptoes': '踮着脚', 'walking away': '背对走', 'running toward viewer': '迎面跑',
  'leaning back': '后仰', 'playing with hair': '玩头发', 'tucking hair behind ear': '别到耳后',
  'putting on lipstick': '涂口红', 'adjusting stockings': '整理丝袜', 'taking off jacket': '脱外套',
  'putting on socks': '穿袜子', 'tying ribbon': '系丝带',
  'masturbating through panties': '隔着内裤自慰', 'fingering herself': '自己指交', 'rubbing herself': '自己揉',
  'holding vibrator': '拿振动棒', 'sucking finger': '含手指', 'licking finger': '舔手指',
  'pulling panties aside': '拉开内裤', 'lifting skirt': '掀起裙子', 'lifting shirt': '掀起上衣',
  'hand on crotch': '手按私处', 'spread pussy': '张开小穴', 'legs together': '双腿并拢', 'knees together': '膝盖并拢',
  'looking over shoulder': '回眸', 'back to viewer': '背对镜头', 'chest out': '挺胸', 'armpit': '露腋',
  'sitting with legs spread': '坐着张腿', 'lying on back with legs spread': '仰躺张腿',
  'presenting pussy': '展示小穴', 'cameltoe': '骆驼趾', 'panty pull': '拉下内裤', 'bra lift': '掀起内衣',
  'cupping breasts': '托胸', 'underboob': '南半球', 'sideboob': '侧乳', 'cleavage': '乳沟',
  'nipple slip': '走光', 'one leg up': '单腿抬起', 'kneeling with legs apart': '跪着分腿',
  'hips thrust': '挺胯', 'presenting breasts': '挺胸展示', 'ass focus': '翘臀特写',
  'long legs': '长腿', 'bare legs': '光腿', 'leg focus': '腿部特写', 'thigh focus': '大腿特写',
  'thigh gap': '大腿缝', 'one leg raised': '单腿抬起·屈膝', 'standing on one leg': '单脚站立',
  'high kick': '高踢腿', 'splits': '一字马', 'knees up': '屈膝抱腿', 'crossed ankles': '交叉脚踝',
  'bare feet': '赤脚', 'feet up': '翘脚', 'feet on table': '脚搁桌上', 'soles': '脚底', 'toes': '脚趾',
  'foot focus': '脚部特写',
  'sitting on desk, one leg raised': '坐桌上抬腿',
  'sitting on desk, feet up': '坐桌上抬脚',
  'sitting on table, crossed legs': '坐桌上翘腿',
  'sitting on stool, crossed legs': '坐凳子翘二郎腿',
  'sitting on chair, crossed legs': '坐椅子翘二郎腿',
  'lying on back, legs up': '仰躺抬腿',
  'lying on stomach, feet up': '趴着翘脚',
  'standing, one leg raised': '站着抬腿',
  'sitting on chair, feet on desk': '坐椅子脚搁桌',
  'kneeling, sitting on heels': '跪坐·坐在脚跟上',
  'squatting, toes': '蹲着露脚趾',
  'foot on chair': '脚踩椅子',
  'crossed legs, bare feet': '盘腿赤脚',
  'pantyhose feet': '丝袜脚',
  'legs up': '腿抬起',
  /* 地点 + 摆法 */
  'lying on bed, legs spread in M shape, knees up': '躺床上·M字腿',
  'lying on bed, legs up': '躺床上·抬腿',
  'lying on bed, one knee up': '躺床上·屈膝',
  'sitting on chair, legs spread': '坐椅上·岔开腿',
  'sitting on chair, one leg over armrest': '坐椅上·腿搭扶手',
  'sitting on floor, legs spread in M shape': '坐地上·M字腿',
  'kneeling on bed, thighs apart': '跪床上·分腿',
  'standing, legs apart': '站立·分腿',
  'against wall, one leg raised': '靠墙·抬腿',
  'on stomach on bed, ass up, legs apart': '趴床上·撅臀',
  'sitting on desk, legs spread in M shape': '坐桌上·M字腿',
  'lying on sofa, legs spread': '躺沙发·张腿',
  'sitting in chair backwards, legs apart': '反坐椅子·分腿',
  'lying on bed, legs spread, spreading pussy': '躺床上·掰开小穴',
  'lying on bed, legs raised high': '躺床上·腿举高',
  'sitting on chair, legs spread, fingering herself': '坐椅上·张腿自慰',
  'sitting on desk, spread legs, masturbation': '坐桌上·张腿自慰',
  'on bed, all fours, ass up': '跪趴床上·撅臀',
  'on floor, legs spread in M shape, fingering herself': '地上·M字自慰',
  /* 再加一批地点 + 摆法 */
  'lying on sofa, legs up': '躺沙发·抬腿',
  'lying on sofa, legs spread in M shape': '躺沙发·M字腿',
  'sitting on sofa, legs spread': '坐沙发·岔开腿',
  'sitting on chair, hugging knees': '坐椅上·抱膝',
  'lying on desk, legs spread': '躺桌上·张腿',
  'sitting on stairs, legs apart': '坐台阶·分腿',
  'standing, back against wall, legs apart': '靠墙站·分腿',
  'lying on bed, on side, legs bent': '侧躺床上·曲腿',
  'lying on floor, legs up': '躺地上·抬腿',
  'kneeling on bed, sitting on heels': '跪坐床上',
  'leaning on desk, hips out': '靠桌·翘臀',
  'lying on bed, legs spread, masturbation': '躺床上·张腿自慰',
  'lying on sofa, legs spread, fingering herself': '躺沙发·张腿自慰',
  'sitting on chair, legs apart, spreading pussy': '坐椅上·掰开',
  'kneeling on bed, thighs apart, fingering herself': '跪床上·自慰',
  'lying on bed, on side, one leg lifted, fingering herself': '侧躺床上·抬腿自慰',
  'standing, one leg up, masturbation': '站着抬腿·自慰',
  'lying on desk, spread legs, masturbation': '躺桌上·张腿自慰',
  'sitting, crossed legs, sitting on throne, looking down at viewer, arrogant': '女王坐姿',
  'sitting on chair, crossed legs, leaning back, hands on armrests, looking down at viewer': '女王坐姿·扶手',
  'sitting on sofa, crossed legs, chin up, hand on knee, condescending': '女王坐姿·沙发',
  /* —— 待着那一组 —— */
  'sleeping on desk': '趴桌睡', 'head on desk': '伏在桌上', 'resting head on arms': '枕着手臂',
  'holding pillow': '抱着抱枕', 'curled up on sofa': '窝在沙发',
  'curled up in blanket': '缩在被子里', 'wrapped in blanket': '裹着毯子', 'holding mug': '捧着杯子',
  'holding cup with both hands': '双手捧杯', 'rubbing hands together': '搓手', 'blowing on hands': '哈气暖手',
  'hugging knees on floor': '抱膝坐地上', 'chin on knees': '下巴搁膝盖', 'sitting against wall': '靠墙坐',
  'leaning against wall': '靠墙站着', 'leaning on door frame': '倚着门框',
  'sitting alone': '一个人坐着', 'staring into distance': '望着远处出神', 'looking at phone': '盯着手机',
  'dozing off': '打瞌睡', 'half asleep': '半睡半醒', 'buried in scarf': '埋进围巾',
  'watching rain': '看雨', 'waiting': '等着',
  'sitting on bed edge': '坐床沿', 'legs dangling': '腿垂着', 'barefoot on floor': '光脚踩地',
  'lying face down': '趴着不动', 'hugging a plushie': '抱着玩偶',
  /* —— 半途那一组 —— */
  'mid-penetration': '插入中', 'just entered': '刚进去', 'half inside': '进去一半',
  'tip in': '只进去一点', 'barely inside': '浅浅的',
  'pulling out slowly': '慢慢抽出', 'still inside': '还留在里面', 'staying inside': '停在里面',
  'thrusting': '抽送', 'hips pressed together': '贴在一起', 'about to enter': '正要进去',
  'about to cum': '快要到了', 'holding it in': '忍着', 'stopped mid-thrust': '停在半路',
  'pressed down': '被压住', 'pinned wrists': '手腕被按住', 'hand on throat': '手抵着喉咙',
  'hair pulled': '头发被拽',

  'lying on bed, on side, hugging knees': '侧躺床上·抱膝',
  'lying on stomach on bed, legs up': '趴床上·翘腿',
  'lying on back on bed, legs raised': '仰躺床上·举腿',
  'lying on bed, pillow under hips': '床上·垫腰',
  'lying on bed, one leg bent, one straight': '床上·一屈一伸',
  'kneeling on bed, leaning forward': '跪床上·前倾',
  'sitting on bed, knees up, hugging knees': '坐床上·抱膝',
  'lying on bed, legs crossed at ankles': '床上·交叉脚踝',
  'lying on bed': '躺床上',
  'lying on floor': '躺地上',
  'lying on bed, legs spread': '躺床上·分开腿',
  'sitting on chair, one foot on seat': '椅上·一脚踩椅面',
  'sitting astride chair backwards': '反跨坐椅子',
  'sitting on chair, both legs over armrest': '椅上·双腿搭扶手',
  'sitting on chair, leaning forward, elbows on knees': '椅上·前倾撑膝',
  'kneeling on chair': '跪在椅子上',
  'curled up on sofa, knees up': '蜷在沙发·抱膝',
  'kneeling on sofa': '跪沙发',
  'lying on sofa, legs stretched': '躺沙发·伸腿',
  'sitting on sofa sideways': '侧坐沙发',
  'lying on stomach on desk': '趴桌上',
  'sitting on desk edge, legs dangling': '坐桌沿·垂腿',
  'sitting on floor, back against wall': '靠墙坐地上',
  'kneeling on floor, leaning forward': '跪地·前倾',
  'on stomach on floor, legs up': '趴地·翘腿',
  'sitting on floor, knees apart': '坐地·分膝',
  'standing, one foot on step': '站台阶·踩一脚',
  'standing, leaning on railing': '靠栏杆站',
  'lying on bed, legs spread, pillow under hips': '躺床上·垫腰张腿',
  'lying on side, one leg lifted, spreading pussy': '侧躺·抬腿掰开',
  'sitting on chair, spreading pussy': '坐椅·掰开',
  'kneeling on bed, spreading pussy': '跪床·掰开',
  'on all fours on bed, spreading pussy': '趴床·掰开',
  'sitting on floor, spread legs, fingering herself': '坐地·张腿自慰',
  'standing, spread legs, fingering herself': '站着·张腿自慰',
  'lying on sofa, legs up, masturbation': '躺沙发·抬腿自慰',

  'kneeling on bed, thighs apart, leaning back': '跪床·后仰',
  'lying on bed, on side, legs crossed': '侧躺床上·交腿',
  'sitting on bed, legs spread, leaning back on hands': '坐床上·张腿撑手',
  'lying on floor, legs raised, feet up': '地上·举腿',
  'standing, bent over desk': '站桌边·弯腰',
  'leaning on window, hips out': '靠窗·翘臀',
  'sitting on desk, legs crossed, leaning back': '坐桌上·翘腿后靠',
  'sitting on chair, legs over armrest, leaning back': '坐椅·搭腿后靠',
  'kneeling on bed, face down, ass up': '跪床·趴伏撅臀',
  'lying on stomach on bed, legs crossed at ankles': '趴床·交踝',
  'sitting on floor, legs in W shape': '坐地·W坐',
  'lying on back on bed, knees to chest': '仰躺床上·抱膝',
  'sitting on bathtub edge, legs crossed': '坐浴缸边·翘腿',
  'sitting on chair, legs spread, leaning back': '坐椅·张腿后靠',
  'kneeling on sofa, thighs apart': '跪沙发·分腿',
  'lying on bed, legs over shoulders': '躺床上·腿压肩',
  'kneeling on floor, thighs apart, spreading pussy': '跪地·掰开',
  'squatting, spread legs': '蹲下·张腿',
  'sitting on bed, legs spread, masturbation': '坐床上·张腿自慰',
  'lying on side, legs crossed, fingering herself': '侧躺·交腿自慰',
};

const EXPRESSION_LABELS = {
  'smile': '微笑', 'soft smile': '浅笑', 'blush': '脸红', 'serious': '认真',
  'surprised': '惊讶', 'looking away': '移开视线', 'laughing': '笑', 'sleepy': '困',
  'shy': '害羞', 'confident': '自信', 'closed eyes': '闭眼',
  'seductive expression': '色气', 'half-closed eyes': '半眯眼', 'ahegao': '阿黑颜',
  'drool': '流口水', 'unfocused eyes': '失神', 'heart-shaped pupils': '心形瞳',
  'teary eyes': '泪眼', 'biting lip': '咬唇', 'smirk': '坏笑', 'moaning': '张嘴喘',
  'pouting': '嘟嘴', 'winking': '眨眼', 'thinking': '思考', 'neutral expression': '无表情',
  'gentle smile': '温柔笑', 'nervous': '紧张', 'determined': '坚定', 'relieved': '放松',
  'embarrassed': '羞红脸', 'daydreaming': '发呆', 'angry': '生气', 'crying': '哭',
  'lewd expression': '淫荡表情', 'blissful expression': '迷醉', 'parted lips': '微张的嘴',
  'heavy breathing': '喘气', 'looking up at partner': '抬眼看他', 'teary smile': '含着泪笑',
  'flushed face': '脸泛红', 'biting finger': '咬手指', 'half-lidded eyes': '半睁眼',
  'smug': '得意', 'yawning': '打哈欠', 'sighing': '叹气', 'excited': '兴奋',
  'bored': '无聊', 'curious': '好奇', 'scared': '害怕', 'confused': '困惑',
  'hopeful': '期待', 'soft laugh': '轻笑', 'shy smile': '害羞笑', 'glancing up': '抬眼',
  'pleading eyes': '哀求的眼神', 'lustful eyes': '发情的眼神',
  'submissive expression': '顺从表情', 'dazed expression': '恍惚',
  'grin': '咧嘴笑', 'frown': '皱眉', 'wide-eyed': '睁大眼', 'worried': '担心', 'amused': '觉得好笑',
  'calm': '平静', 'open mouth': '张嘴', 'sticking out tongue': '吐舌', 'raised eyebrows': '挑眉',
  'soft gaze': '柔眼', 'dreamy': '出神', 'gentle gaze': '温柔看',
  'contempt': '嫌弃', 'disgust': '厌恶', 'tsundere': '傲娇', 'annoyed': '不耐烦', 'irritated': '烦躁',
  'jealous': '吃醋', 'disdainful smile': '轻蔑的笑', 'forced smile': '强笑',
  'lewd smile': '淫笑', 'empty eyes': '失神眼', 'rolling eyes': '翻白眼', 'tongue out': '伸舌喘',
  'heavy blush': '潮红', 'sultry': '媚眼', 'longing gaze': '渴求的眼神',
};

const EXPRESSIONS_SFW = [
  'smile', 'soft smile', 'blush', 'serious', 'surprised',
  'looking away', 'laughing', 'sleepy', 'shy', 'confident',
  'closed eyes', 'pouting', 'winking', 'thinking', 'neutral expression',
  'nervous', 'determined', 'relieved', 'embarrassed', 'daydreaming',
  'angry', 'crying', 'smug', 'sighing', 'excited',
  'bored', 'curious', 'scared', 'confused', 'hopeful',
  'shy smile', 'glancing up', 'frown', 'open mouth', 'sticking out tongue',
  'contempt', 'disgust', 'tsundere', 'annoyed', 'smirk',
];
const EXPRESSIONS_R18 = [
  ...EXPRESSIONS_SFW,
  'seductive expression', 'half-closed eyes', 'ahegao', 'drool', 'unfocused eyes', 'heart-shaped pupils',
  'teary eyes', 'biting lip', 'moaning', 'lewd expression', 'blissful expression',
  'parted lips', 'heavy breathing', 'looking up at partner', 'teary smile', 'flushed face',
  'biting finger', 'half-lidded eyes', 'pleading eyes', 'lustful eyes', 'submissive expression', 'dazed expression',
  'lewd smile', 'empty eyes', 'rolling eyes', 'tongue out', 'heavy blush', 'sultry', 'longing gaze',
];

/* 表情跟着情境走：事后、性爱、亲密、普通各一套池子 */
const AFTER_EXPRESSIONS = new Set([
  'unfocused eyes', 'empty eyes', 'dazed expression', 'teary eyes', 'blissful expression',
  'relieved', 'sleepy', 'flushed face', 'heavy breathing', 'parted lips', 'tongue out',
  'drool', 'half-lidded eyes', 'submissive expression', 'smile', 'soft smile', 'closed eyes',
]);
const SEX_EXPRESSIONS = new Set([
  'blush', 'shy', 'nervous', 'surprised', 'teary eyes', 'biting lip', 'moaning',
  'seductive expression', 'half-closed eyes', 'ahegao', 'drool', 'unfocused eyes',
  'heart-shaped pupils', 'lewd expression', 'blissful expression', 'parted lips',
  'heavy breathing', 'looking up at partner', 'teary smile', 'flushed face', 'biting finger',
  'half-lidded eyes', 'pleading eyes', 'lustful eyes', 'submissive expression', 'dazed expression',
  'lewd smile', 'empty eyes', 'rolling eyes', 'tongue out', 'heavy blush', 'sultry', 'longing gaze',
  'smile', 'soft smile', 'open mouth', 'closed eyes', 'looking away',
]);
const ROMANTIC_EXPRESSIONS = new Set([
  'smile', 'soft smile', 'blush', 'shy', 'shy smile', 'gentle smile', 'closed eyes',
  'looking away', 'teary smile', 'heart-shaped pupils', 'dreamy', 'soft gaze', 'gentle gaze',
  'happy', 'relieved',
]);
const UNDRESS_EXPRESSIONS = new Set([
  'shy', 'embarrassed', 'nervous', 'blush', 'looking away', 'biting lip', 'teary eyes',
  'surprised', 'pouting', 'smile', 'soft smile', 'confident', 'seductive expression',
  'half-closed eyes', 'flushed face', 'heavy blush', 'parted lips', 'closed eyes',
]);
function expressionPoolFor(pose, action) {
  const base = state.r18 ? EXPRESSIONS_R18 : EXPRESSIONS_SFW;
  const text = `${pose || ''} ${action || ''}`.toLowerCase();
  const ud = computeUndress(state.r18);
  const undressing = !!(ud.fullyNude || ud.underwearOnly || ud.tags.length);
  const finish = /\b(after sex|afterglow|orgasm|squirting|creampie|cum on|cum in|facial|panting|lying limp|body trembling|legs trembling|toes curling)\b/.test(text);
  const sex = SEX_POSES.has(String(pose || '').toLowerCase())
    || /\b(sex|penetration|fellatio|cunnilingus|paizuri|handjob|footjob|masturbat|fingering|cowgirl|missionary|doggystyle|spooning|mating press|prone bone|reverse cowgirl|suspended congress|lotus|full nelson|piledriver|amazon position|69)\b/.test(text);
  const romantic = /\b(kissing|hugging each other|holding hands|leaning on shoulder|face to face)\b/.test(text);
  let pool = base;
  if (state.r18 && finish) pool = base.filter((e) => AFTER_EXPRESSIONS.has(e));
  else if (undressing) pool = base.filter((e) => UNDRESS_EXPRESSIONS.has(e));
  else if (romantic) pool = base.filter((e) => ROMANTIC_EXPRESSIONS.has(e));
  else if (sex) pool = base.filter((e) => SEX_EXPRESSIONS.has(e));
  return pool.length ? pool : base;
}

/* 表情词光挂一个标签出来常常还是默认脸，补两句脸上看得见的 */
const EXPRESSION_SUPPORT = {
  /* —— 最常用的一批：光挂一个词容易被底模拉回默认脸 —— */
  'smile': 'upturned mouth, soft cheeks, warm eyes',
  'soft smile': 'gentle curve of lips, soft eyes, relaxed face',
  'blush': 'pink cheeks, shy eyes, looking slightly away',
  'serious': 'focused eyes, straight mouth, calm gaze',
  'looking away': 'averted eyes, side profile, distant gaze',
  'confident': 'chin up, steady eyes, subtle smirk',
  'closed eyes': 'peaceful face, visible eyelashes, soft breathing',
  'winking': 'one eye closed, playful smirk, raised brow',
  'thinking': 'finger on chin, eyes up, thoughtful gaze',
  'neutral expression': 'relaxed face, calm eyes, straight mouth',
  'determined': 'firm eyes, set jaw, focused gaze',
  'relieved': 'soft exhale, relaxed shoulders, faint smile',
  'daydreaming': 'distant eyes, unfocused gaze, faint smile',
  'sighing': 'slightly parted lips, drooping shoulders, closed eyes',
  'excited': 'sparkling eyes, bright smile, raised brows',
  'bored': 'half-lidded eyes, slack face, flat gaze',
  'curious': 'tilted head, bright eyes, raised brow',
  'hopeful': 'upturned eyes, slight smile, bright gaze',
  'shy smile': 'blush, averted eyes, small smile',
  'glancing up': 'eyes looking up, lowered head, soft gaze',
  /* —— 原有：傲 / 冷 / 别扭这一路 —— */
  'contempt': 'looking down at viewer, half-closed eyes, raised eyebrows',
  'disgust': 'furrowed brow, looking away, mouth slightly open',
  'tsundere': 'blush, pouting, looking away',
  'annoyed': 'frown, side glance',
  'irritated': 'frown, gritted teeth',
  'jealous': 'pouting, side glance',
  'disdainful smile': 'half-closed eyes, looking down at viewer',
  'forced smile': 'smile, furrowed brow, closed eyes',
  /* —— 日常情绪：光挂词最容易出默认脸的几个 —— */
  'surprised': 'wide eyes, open mouth, eyebrows raised',
  'crying': 'tears, closed eyes, trembling lips',
  'angry': 'frown, furrowed brow, glaring',
  'nervous': 'sweat drop, forced smile, averted gaze',
  'scared': 'wide eyes, trembling, backing away',
  'laughing': 'closed eyes, open mouth, head tilted back',
  'sleepy': 'half-closed eyes, yawning, drooping head',
  'confused': 'tilted head, raised eyebrow, blank stare',
  'shy': 'blush, looking away, fingers together',
  'pouting': 'pouting, blush, looking away',
  'smug': 'smirk, half-closed eyes, chin up',
  'yawning': 'open mouth, closed eyes, hand over mouth',
  'embarrassed': 'heavy blush, looking down, covering face',
  /* —— 成人向：失神 / 迷醉 / 喘 这一路 —— */
  'seductive expression': 'half-lidded eyes, slight smile, looking at viewer',
  'half-closed eyes': 'half-closed eyes, looking at viewer',
  'half-lidded eyes': 'half-lidded eyes, blush',
  'ahegao': 'eyes rolled up, tongue out, drooling, heavy blush, unfocused',
  'drool': 'drool, open mouth, unfocused eyes',
  'unfocused eyes': 'blank stare, parted lips, looking at viewer',
  'empty eyes': 'blank stare, dull eyes, half-closed',
  'dazed expression': 'blank eyes, parted lips, unfocused, blush',
  'blissful expression': 'closed eyes, soft smile, blush, head tilted back',
  'moaning': 'open mouth, half-closed eyes, blush, panting',
  'heavy breathing': 'open mouth, panting, blush, sweat',
  'parted lips': 'parted lips, half-closed eyes, blush',
  'lewd expression': 'half-closed eyes, blush, parted lips, looking at viewer',
  'lewd smile': 'smirk, half-closed eyes, blush',
  'smirk': 'smirk, half-closed eyes, looking at viewer',
  'sultry': 'half-lidded eyes, smirk, blush',
  'teary eyes': 'watery eyes, trembling lips, blush',
  'teary smile': 'teary eyes, smile, blush',
  'biting lip': 'biting lower lip, blush, looking up',
  'biting finger': 'finger in mouth, blush, looking at viewer',
  'heart-shaped pupils': 'heart-shaped pupils, blush, open mouth',
  'flushed face': 'heavy blush, red ears',
  'heavy blush': 'heavy blush, sweat, looking away',
  'looking up at partner': 'looking up, teary eyes, blush, parted lips',
  'pleading eyes': 'teary eyes, eyebrows raised, looking up',
  'submissive expression': 'looking up, eyebrows drawn, blush',
  'lustful eyes': 'half-lidded eyes, blush, looking at viewer',
  'longing gaze': 'teary eyes, looking at viewer, blush',
  'rolling eyes': 'eyes rolled up, tongue out, blush',
  'tongue out': 'tongue out, half-closed eyes, blush',
};

const SCENES = [
  { tag: 'classroom', label: '教室', mode: 'sfw', outfits: ['school uniform', 'sailor uniform', 'knit sweater', 'white t-shirt'], actions: ['sitting', 'standing', 'looking back', 'reading'] },
  { tag: 'bedroom', label: '卧室', mode: 'sfw', outfits: ['pajamas', 'camisole', 'casual clothes', 'knit sweater'], actions: ['lying down', 'lying on side', 'sitting', 'sleeping'] },
  { tag: 'cafe', label: '咖啡厅', mode: 'sfw', outfits: ['casual clothes', 'knit sweater', 'dress', 'white t-shirt'], actions: ['sitting', 'eating', 'hand on cheek', 'looking back'] },
  { tag: 'library', label: '图书馆', mode: 'sfw', outfits: ['school uniform', 'knit sweater', 'white t-shirt', 'dress'], actions: ['sitting', 'reading', 'standing', 'looking back'] },
  { tag: 'rooftop', label: '天台', mode: 'sfw', outfits: ['school uniform', 'sailor uniform', 'casual clothes'], actions: ['standing', 'looking back', 'stretching', 'hand in hair'] },
  { tag: 'park', label: '公园', mode: 'sfw', outfits: ['casual clothes', 'dress', 'white t-shirt', 'knit sweater'], actions: ['standing', 'walking', 'sitting', 'looking back'] },
  { tag: 'street', label: '街道', mode: 'sfw', outfits: ['casual clothes', 'dress', 'white t-shirt', 'knit sweater'], actions: ['standing', 'walking', 'looking back', 'selfie'] },
  { tag: 'swimming pool', label: '泳池', mode: 'sfw', outfits: ['swimsuit', 'bikini', 'sun shirt'], actions: ['standing', 'sitting', 'in water', 'hand in hair'] },
  { tag: 'beach', label: '海边', mode: 'sfw', outfits: ['swimsuit', 'bikini', 'sun shirt'], actions: ['standing', 'sitting', 'in water', 'looking back'] },
  { tag: 'japanese room', label: '和室', mode: 'sfw', outfits: ['kimono', 'cheongsam', 'casual clothes'], actions: ['sitting', 'standing', 'reading'] },
  { tag: 'shrine', label: '神社', mode: 'sfw', outfits: ['kimono', 'school uniform', 'casual clothes'], actions: ['standing', 'sitting', 'looking back'] },
  { tag: 'gym', label: '健身房', mode: 'sfw', outfits: ['gym clothes', 'white t-shirt', 'casual clothes'], actions: ['standing', 'stretching', 'sitting'] },
  { tag: 'office', label: '办公室', mode: 'sfw', outfits: ['office lady', 'knit sweater', 'white t-shirt'], actions: ['sitting', 'standing', 'reading'] },
  { tag: 'train', label: '列车', mode: 'sfw', outfits: ['school uniform', 'casual clothes', 'knit sweater'], actions: ['sitting', 'standing', 'looking back'] },
  { tag: 'aquarium', label: '水族馆', mode: 'sfw', outfits: ['casual clothes', 'dress', 'school uniform'], actions: ['standing', 'looking back', 'hand on cheek'] },
  { tag: 'living room', label: '客厅', mode: 'sfw', outfits: ['casual clothes', 'knit sweater', 'pajamas', 'dress'], actions: ['sitting', 'lying down', 'reading', 'eating'] },
  { tag: 'kitchen', label: '厨房', mode: 'sfw', outfits: ['casual clothes', 'white t-shirt', 'apron'], actions: ['standing', 'sitting', 'eating'] },
  { tag: 'balcony', label: '阳台', mode: 'sfw', outfits: ['casual clothes', 'dress', 'knit sweater'], actions: ['standing', 'looking back', 'hand in hair'] },
  { tag: 'bookstore', label: '书店', mode: 'sfw', outfits: ['school uniform', 'casual clothes', 'knit sweater', 'dress'], actions: ['reading', 'standing', 'sitting'] },
  { tag: 'arcade', label: '游戏厅', mode: 'sfw', outfits: ['casual clothes', 'white t-shirt', 'school uniform'], actions: ['standing', 'sitting', 'selfie'] },
  { tag: 'festival', label: '祭典', mode: 'sfw', outfits: ['yukata', 'kimono', 'casual clothes'], actions: ['standing', 'walking', 'sitting'] },
  { tag: 'train station', label: '车站', mode: 'sfw', outfits: ['casual clothes', 'school uniform', 'knit sweater'], actions: ['standing', 'walking', 'looking back'] },
  { tag: 'mountain', label: '山里', mode: 'sfw', outfits: ['casual clothes', 'dress', 'sun shirt'], actions: ['standing', 'walking', 'looking back'] },
  { tag: 'hotel room', label: '酒店', mode: 'r18', outfits: ['lingerie', 'camisole', 'open shirt', 'completely nude', 'crotchless lingerie'], actions: ['lying down', 'on bed', 'kneeling', 'spread legs', 'missionary', 'cowgirl'], duoActions: ['missionary','cowgirl','doggystyle','69','fellatio','kissing','hugging each other'] },
  { tag: 'bathroom', label: '浴室', mode: 'r18', outfits: ['bath towel', 'completely nude', 'lingerie', 'wet clothes'], actions: ['standing', 'sitting', 'on bed', 'against wall', 'masturbation'], duoActions: ['against wall','standing sex','fellatio','kissing'] },
  { tag: 'sofa', label: '沙发', mode: 'r18', outfits: ['lingerie', 'camisole', 'undressed', 'completely nude', 'fishnet'], actions: ['sitting', 'lying down', 'kneeling', 'spread legs', 'missionary', 'spooning'], duoActions: ['missionary','cowgirl','spooning','kissing','hugging each other'] },
  { tag: 'love hotel', label: '情趣酒店', mode: 'r18', outfits: ['lingerie', 'bunny suit', 'completely nude', 'open shirt', 'latex', 'collar'], actions: ['on bed', 'on stomach', 'kneeling', 'spread legs', 'doggystyle', 'cowgirl', '69'], duoActions: ['missionary','cowgirl','reverse cowgirl','suspended congress','69','paizuri','fellatio','kissing'] },
  { tag: 'onsen', label: '温泉', mode: 'r18', outfits: ['bath towel', 'completely nude', 'wet clothes'], actions: ['sitting', 'standing', 'lying down', 'spread legs'], duoActions: ['spooning','lotus','kissing','standing sex'] },
  { tag: 'shower', label: '淋浴', mode: 'r18', outfits: ['completely nude', 'bath towel', 'wet clothes'], actions: ['standing', 'sitting', 'against wall', 'masturbation'], duoActions: ['against wall','standing sex','fellatio','handjob'] },
  { tag: 'dressing room', label: '更衣室', mode: 'r18', outfits: ['lingerie', 'micro bikini', 'undressed', 'open shirt'], actions: ['standing', 'flashing', 'undressing', 'bent over'], duoActions: ['against wall','standing sex','lifted legs','kissing'] },
  { tag: 'public toilet', label: '公共厕所', mode: 'r18', outfits: ['undressed', 'open shirt', 'lingerie'], actions: ['standing', 'kneeling', 'spread legs', 'masturbation'], duoActions: ['against wall','standing sex','fellatio','kissing'] },
  { tag: 'garden', label: '庭院', mode: 'sfw', outfits: ['casual clothes', 'dress', 'sundress', 'kimono', 'white t-shirt'], actions: ['standing', 'walking', 'sitting', 'watering flowers', 'looking back'] },
  { tag: 'riverside', label: '河边', mode: 'sfw', outfits: ['casual clothes', 'sundress', 'white t-shirt', 'school uniform'], actions: ['standing', 'walking', 'sitting', 'looking back'] },
  { tag: 'convenience store', label: '便利店', mode: 'sfw', outfits: ['hoodie', 'casual clothes', 'school uniform', 'white t-shirt'], actions: ['standing', 'looking back', 'holding phone', 'eating'] },
  { tag: 'cinema', label: '电影院', mode: 'sfw', outfits: ['hoodie', 'casual clothes', 'dress', 'knit sweater'], actions: ['sitting', 'eating popcorn', 'holding drink', 'looking back'] },
  { tag: 'museum', label: '博物馆', mode: 'sfw', outfits: ['dress', 'office lady', 'casual clothes', 'knit sweater'], actions: ['standing', 'looking back', 'walking', 'reading'] },
  { tag: 'school hallway', label: '学校走廊', mode: 'sfw', outfits: ['school uniform', 'sailor uniform', 'casual clothes'], actions: ['walking', 'standing', 'looking back', 'holding books'] },
  { tag: 'music room', label: '音乐教室', mode: 'sfw', outfits: ['school uniform', 'sailor uniform', 'knit sweater', 'dress'], actions: ['playing piano', 'sitting', 'standing', 'reading'] },
  { tag: 'art room', label: '美术教室', mode: 'sfw', outfits: ['school uniform', 'apron', 'white t-shirt', 'casual clothes'], actions: ['painting', 'holding brush', 'sitting', 'standing'] },
  { tag: 'flower field', label: '花田', mode: 'sfw', outfits: ['sundress', 'dress', 'casual clothes', 'sun shirt'], actions: ['standing', 'walking', 'sitting', 'looking back'] },
  { tag: 'snowy field', label: '雪地', mode: 'sfw', outfits: ['coat', 'knit sweater', 'hoodie', 'casual clothes'], actions: ['standing', 'walking', 'shivering', 'looking back'] },
  { tag: 'rainy street', label: '雨中街道', mode: 'sfw', outfits: ['coat', 'trench coat', 'school uniform', 'casual clothes'], actions: ['standing', 'walking', 'holding umbrella', 'looking back'] },
  { tag: 'campsite', label: '露营地', mode: 'sfw', outfits: ['hoodie', 'coat', 'casual clothes', 'knit sweater'], actions: ['sitting', 'standing', 'eating', 'looking at sky'] },
  { tag: 'dorm room', label: '宿舍', mode: 'sfw', outfits: ['pajamas', 'camisole', 'shorts', 'casual clothes'], actions: ['sitting', 'lying down', 'reading', 'stretching'] },
  { tag: 'bus interior', label: '巴士', mode: 'sfw', outfits: ['school uniform', 'casual clothes', 'knit sweater'], actions: ['sitting', 'standing', 'looking back', 'sleeping'] },
  { tag: 'school pool', label: '学校泳池', mode: 'sfw', outfits: ['school swimsuit', 'swimsuit'], actions: ['standing', 'in water', 'sitting'] },
  { tag: 'castle', label: '城堡', mode: 'sfw', outfits: ['dress', 'wedding dress', 'kimono', 'gothic lolita'], actions: ['standing', 'sitting', 'looking back'] },
  { tag: 'ruins', label: '废墟', mode: 'sfw', outfits: ['casual clothes', 'coat', 'trench coat'], actions: ['standing', 'walking', 'looking back'] },
  { tag: 'forest', label: '森林', mode: 'sfw', outfits: ['casual clothes', 'dress', 'hoodie', 'coat'], actions: ['standing', 'walking', 'sitting', 'looking at sky'] },
  { tag: 'elevator', label: '电梯', mode: 'r18', outfits: ['office lady', 'open shirt', 'lingerie'], actions: ['standing', 'against wall', 'kneeling', 'bent over'], duoActions: ['against wall','standing sex','lifted legs','fellatio'] },
  { tag: 'parking garage', label: '停车场', mode: 'r18', outfits: ['trench coat', 'open shirt', 'undressed', 'leather jacket, black pants, boots, motorcycle', 'office lady, white blouse, pencil skirt, black pantyhose'], actions: ['standing', 'against wall', 'bent over', 'flashing'], duoActions: ['against wall','standing sex','bent over','lifted legs'] },
  { tag: 'tent', label: '帐篷', mode: 'r18', outfits: ['undressed', 'camisole', 'completely nude', 'casual clothes, cardigan, skirt, loafers', 'track suit, sneakers', 'pajamas, white socks, slippers'], actions: ['lying down', 'kneeling', 'cowgirl', 'spooning'], duoActions: ['spooning','cowgirl','missionary','kissing'] },
  { tag: 'public bath', label: '浴场', mode: 'r18', outfits: ['bath towel', 'completely nude', 'wet clothes'], actions: ['standing', 'sitting', 'in water', 'spread legs'], duoActions: ['spooning','standing sex','lotus','kissing'] },
  { tag: 'backstage', label: '演出后台', mode: 'r18', outfits: ['stage costume', 'lingerie', 'open shirt', 'latex'], actions: ['standing', 'sitting', 'kneeling', 'against wall'], duoActions: ['against wall','standing sex','lifted legs','kissing'] },
  { tag: 'private theater', label: '私人影院', mode: 'r18', outfits: ['lingerie', 'camisole', 'completely nude'], actions: ['sitting', 'lying down', 'fellatio', 'cowgirl'], duoActions: ['cowgirl','fellatio','missionary','kissing'] },
  { tag: 'school field', label: '学校操场', mode: 'sfw', outfits: ['school uniform', 'gym clothes', 'sailor uniform', 'blouse'], actions: ['standing', 'walking', 'stretching', 'waving', 'looking back'] },
  { tag: 'subway', label: '地铁', mode: 'sfw', outfits: ['school uniform', 'office lady', 'casual clothes', 'trench coat'], actions: ['sitting', 'standing', 'looking back', 'holding phone'] },
  { tag: 'winter street', label: '冬季街道', mode: 'sfw', outfits: ['coat', 'turtleneck', 'knit sweater', 'hoodie', 'school uniform, pleated skirt, black knee socks, loafers', 'casual clothes, cardigan, skirt, loafers'], actions: ['walking', 'standing', 'holding cup', 'looking back'] },
  { tag: 'dessert shop', label: '甜品店', mode: 'sfw', outfits: ['sundress', 'dress', 'blouse', 'cardigan'], actions: ['sitting', 'eating', 'holding cup', 'looking back'] },
  { tag: 'japanese garden', label: '和风庭院', mode: 'sfw', outfits: ['kimono', 'yukata', 'hanfu', 'casual clothes'], actions: ['walking', 'sitting', 'praying', 'looking back'] },
  { tag: 'photo studio', label: '摄影棚', mode: 'sfw', outfits: ['blouse', 'dress', 'crop top', 'jeans'], actions: ['standing', 'sitting', 'posing', 'looking back'] },
  { tag: 'bus stop rain', label: '雨天公交站', mode: 'sfw', outfits: ['coat', 'school uniform', 'trench coat', 'hoodie'], actions: ['standing', 'holding umbrella', 'looking back', 'holding phone'] },
  { tag: 'car interior', label: '车内', mode: 'sfw', outfits: ['casual clothes', 'office lady', 'trench coat'], actions: ['sitting', 'looking back', 'holding phone'] },
  { tag: 'hospital duty', label: '医院值班室', mode: 'r18', outfits: ['nurse outfit', 'open shirt', 'lingerie', 'blouse'], actions: ['sitting', 'kneeling', 'against wall', 'bent over'], duoActions: ['against wall','standing sex','cowgirl','fellatio','kissing'] },
  { tag: 'teacher office', label: '教师办公室', mode: 'r18', outfits: ['office lady', 'open shirt', 'lingerie', 'black pantyhose', 'blouse'], actions: ['bent over desk', 'sitting', 'against wall', 'kneeling'], duoActions: ['bent over','standing sex','cowgirl','against wall'] },
  { tag: 'tatami room', label: '榻榻米房间', mode: 'r18', outfits: ['yukata', 'completely nude', 'lingerie'], actions: ['lying down', 'kneeling', 'spread legs', 'cowgirl'], duoActions: ['missionary','cowgirl','spooning','kissing'] },
  { tag: 'stairwell', label: '楼梯间', mode: 'r18', outfits: ['office lady', 'open shirt', 'undressed', 'black pantyhose'], actions: ['against wall', 'kneeling', 'bent over'], duoActions: ['against wall','standing sex','lifted legs','fellatio'] },
  { tag: 'party', label: '酒会', mode: 'r18', outfits: ['evening gown', 'corset', 'bustier', 'lingerie', 'latex'], actions: ['standing', 'sitting', 'kissing', 'against wall'], duoActions: ['against wall','standing sex','kissing','hugging each other'] },
  { tag: 'sauna', label: '桑拿房', mode: 'r18', outfits: ['wet clothes', 'bikini', 'lingerie'], actions: ['sitting', 'lying down', 'spread legs', 'kneeling'], duoActions: ['spooning','standing sex','lotus','kissing'] },
  { tag: 'nightclub', label: '夜店', mode: 'r18', outfits: ['micro dress', 'evening gown', 'lingerie', 'latex'], actions: ['standing', 'dancing', 'against wall', 'kneeling'], duoActions: ['against wall','standing sex','kissing','dancing'] },
  { tag: 'bar', label: '酒吧', mode: 'r18', outfits: ['evening gown', 'office lady', 'lingerie', 'latex'], actions: ['sitting', 'standing', 'against wall', 'bent over'], duoActions: ['against wall','standing sex','sitting on lap','kissing'] },
  { tag: 'karaoke room', label: 'KTV 包厢', mode: 'r18', outfits: ['casual clothes', 'micro dress', 'lingerie'], actions: ['sitting', 'kneeling', 'against wall', 'lying on sofa'], duoActions: ['sitting on lap','cowgirl','missionary','kissing'] },
  { tag: 'warehouse', label: '仓库', mode: 'r18', outfits: ['trench coat', 'casual clothes', 'lingerie', 'latex'], actions: ['against wall', 'bent over', 'kneeling', 'standing'], duoActions: ['against wall','bent over','standing sex','lifted legs'] },
  { tag: 'basement', label: '地下室', mode: 'r18', outfits: ['lingerie', 'latex', 'bondage outfit'], actions: ['kneeling', 'against wall', 'lying down', 'spread legs'], duoActions: ['against wall','missionary','cowgirl','bondage'] },
  { tag: 'laundry room', label: '洗衣房', mode: 'r18', outfits: ['casual clothes', 'lingerie', 'wet clothes'], actions: ['standing', 'bent over', 'sitting', 'against wall'], duoActions: ['bent over','standing sex','against wall','lifted legs'] },
  { tag: 'infirmary', label: '医务室', mode: 'r18', outfits: ['nurse outfit', 'lingerie', 'school uniform'], actions: ['lying down', 'sitting', 'kneeling', 'against wall'], duoActions: ['missionary','cowgirl','against wall','fellatio'] },
  { tag: 'laboratory', label: '实验室', mode: 'r18', outfits: ['latex', 'office lady', 'lingerie'], actions: ['standing', 'sitting', 'bent over', 'against wall'], duoActions: ['bent over','standing sex','against wall','missionary'] },
  { tag: 'church', label: '教堂', mode: 'r18', outfits: ['wedding dress', 'lingerie', 'gothic lolita'], actions: ['kneeling', 'praying', 'standing', 'lying down'], duoActions: ['missionary','cowgirl','standing sex','kissing'] },
  { tag: 'airplane cabin', label: '机舱', mode: 'r18', outfits: ['office lady', 'lingerie', 'uniform'], actions: ['sitting', 'kneeling', 'lying down', 'against wall'], duoActions: ['sitting on lap','cowgirl','fellatio','handjob'] },
  { tag: 'host club', label: '牛郎店', mode: 'r18', outfits: ['micro dress', 'evening gown', 'lingerie', 'latex'], actions: ['sitting', 'standing', 'kneeling', 'against wall'], duoActions: ['sitting on lap','cowgirl','against wall','kissing'] },
  { tag: 'ryokan', label: '温泉旅馆', mode: 'r18', outfits: ['yukata', 'kimono', 'lingerie'], actions: ['sitting on tatami', 'lying down', 'kneeling', 'spread legs'], duoActions: ['spooning','missionary','cowgirl','lotus'] },
];

/* 双人动作的补充词：单个体位标签不够，模型会把姿势画松 / 画成单人 */
const ACTION_BOOST = {
  '69': 'mutual oral, fellatio, cunnilingus, head between legs, lying on sides, bodies mirrored',
  'tribadism': 'tribadism, scissoring, pussy to pussy, legs intertwined, grinding',
  'scissoring': 'scissoring, tribadism, pussy to pussy, legs intertwined, grinding',
  'cunnilingus': 'cunnilingus, head between legs, licking pussy',
  'facesitting': 'facesitting, sitting on face, cunnilingus',
  'mutual masturbation': 'mutual masturbation, fingers between legs',
  'grinding': 'grinding, crotch to crotch, legs between legs',
  'fingering': 'fingering, hand between legs',
  'strapon': 'strapon, girl wearing a strapon, pegging',
  'missionary': 'missionary position, on back, legs spread, penetration',
  'cowgirl': 'cowgirl position, girl on top, straddling, penetration',
  'doggystyle': 'doggystyle, on all fours, from behind, penetration',
  'standing sex': 'standing sex, lifted leg, penetration',
  'spooning': 'spooning, lying on side, from behind, penetration',
  'prone bone': 'prone bone, lying face down, from behind, penetration',
  'mating press': 'mating press, legs up, penetration',
  'against wall': 'against wall, standing, lifted leg',
  'lifted legs': 'legs up, holding legs, penetration',
  'suspended congress': 'suspended congress, standing, lifted, penetration',
  'lotus': 'lotus position, sitting on lap, penetration',
  'reverse cowgirl': 'reverse cowgirl, girl on top facing away, penetration',
  'paizuri': 'paizuri, breasts around penis',
  'handjob': 'handjob, hand on penis',
  'fellatio': 'fellatio, mouth on penis',
  'hugging each other': 'hugging, arms around each other',
  'kissing': 'kissing, lips together',
  'holding hands': 'holding hands, fingers intertwined',
  'dancing': 'dancing, close together',
  'leaning on shoulder': 'leaning on shoulder, heads close',
  'feeding each other': 'feeding each other',
  'walking together': 'walking side by side',
  'piggyback ride': 'piggyback, carried on back',
  'reading together': 'reading together',
  'selfie together': 'selfie, two people',
  /* 内射统一带 X 光透视：切面里能看到精液灌进去 */
  'creampie': 'x-ray, cross-section, internal view, cum in pussy, (internal cumshot:1.2), semen inside',
  'missionary creampie': 'missionary position, penetration, x-ray, cross-section, internal view, cum in pussy, (internal cumshot:1.2), semen inside',
  'doggystyle creampie': 'doggystyle, from behind, penetration, x-ray, cross-section, internal view, cum in pussy, (internal cumshot:1.2), semen inside',
  'cowgirl creampie': 'cowgirl position, girl on top, penetration, x-ray, cross-section, internal view, cum in pussy, (internal cumshot:1.2), semen inside',
  'reverse cowgirl creampie': 'reverse cowgirl, girl on top facing away, penetration, x-ray, cross-section, internal view, cum in pussy, (internal cumshot:1.2), semen inside',
  'spooning creampie': 'spooning, lying on side, from behind, penetration, x-ray, cross-section, internal view, cum in pussy, (internal cumshot:1.2), semen inside',
  'standing creampie': 'standing sex, lifted leg, penetration, x-ray, cross-section, internal view, cum in pussy, (internal cumshot:1.2), semen inside',
  'suspended creampie': 'suspended congress, lifted, penetration, x-ray, cross-section, internal view, cum in pussy, (internal cumshot:1.2), semen inside',
  'prone bone creampie': 'prone bone, face down, from behind, penetration, x-ray, cross-section, internal view, cum in pussy, (internal cumshot:1.2), semen inside',
};
/* 谁主动、谁在上面、朝哪边：双人动作光有体位名还不够 */
const DUO_ROLE_BOOST = {
  'missionary': 'male on top, male thrusting, girl lying on back',
  'cowgirl': 'girl on top, girl riding, male lying back',
  'reverse cowgirl': 'girl on top facing away, male lying back',
  'doggystyle': 'male from behind, girl on all fours',
  'spooning': 'male from behind, both lying on side',
  'mating press': 'male on top, girl legs up, face to face',
  'prone bone': 'male on top from behind, girl lying face down',
  'suspended congress': 'male holding girl up, girl legs wrapped around him',
  'lotus': 'face to face, girl sitting on lap',
  'full nelson': 'male behind, holding girl legs',
  'piledriver': 'male standing, girl upside down',
  'amazon position': 'girl on top facing away, male lying back',
  'standing sex': 'standing, bodies pressed together',
  'against wall': 'male pressing girl against wall',
  'sitting on lap': 'girl sitting on lap, face to face',
  '69': 'mutual oral, bodies mirrored',
};
/* 只有这些动作才默认把男性生殖器写进正面；亲吻 / 拥抱 / 自拍这类不加 */
const PENIS_ACTION_RE = /(missionary|cowgirl|doggystyle|standing sex|spooning|prone bone|mating press|reverse cowgirl|suspended congress|lotus|against wall|desk sex|penetration|fellatio|cunnilingus|paizuri|handjob|footjob|fingering|69|facial|creampie|cum in mouth|cum on|deepthroat|swallowing|licking|anal|straddl|sitting on lap|bent over|leg lock|lifted legs|mid-penetration|just entered|half inside|tip in|barely inside|still inside|thrusting|pulling out|hip|pressed down|pinned wrists|hair pulled|hand on throat)/i;

const PEOPLE_OPTS = [['单人', 'solo'], ['双人', 'duo']];
const DUO_ROLE_OPTS = [['男主动', 'male'], ['女主动', 'female'], ['互相', 'mutual']];
const DUO_ROLE_EXPECT = {
  missionary: 'male', cowgirl: 'female', 'reverse cowgirl': 'female', doggystyle: 'male',
  spooning: 'male', 'mating press': 'male', 'prone bone': 'male', 'suspended congress': 'male',
  'full nelson': 'male', piledriver: 'male', 'amazon position': 'female', 'standing sex': 'male',
  'against wall': 'male', 'sitting on lap': 'female', lotus: 'female', '69': 'mutual',
};
const DUO_ROLE_TEXT = {
  male: 'male dominant, male on top, male thrusting',
  female: 'female dominant, girl on top, girl in control',
  mutual: 'mutual, both active, equal',
};
function duoRoleCompatible(role, pose) {
  if (!role || !pose) return true;
  const expect = DUO_ROLE_EXPECT[String(pose).toLowerCase()];
  return !expect || expect === role;
}
const MALE_BODY_TYPES = [
  ['瘦小', 'slim male, slender male, short stature'],
  ['正常', 'male, medium build'],
  ['高大健壮', 'tall male, muscular male, broad shoulders, abs'],
];
const PENIS_SIZES = [
  ['小', 'small penis'],
  ['正常', 'penis'],
  ['大', 'large penis'],
  ['巨', 'huge penis'],
];
const CHAR_OUTFIT_OPTS = [
  ['穿好', 'keep'], ['半脱', 'undressed'], ['敞开', 'open'], ['全裸', 'nude'],
];
/* 双人射精：不同姿势内射 / 外射 / 口交几种射精（只在成人双人里出现） */
const DUO_FINISH_ACTIONS = [
  ['正常位内射', 'missionary creampie'], ['后入内射', 'doggystyle creampie'], ['骑乘内射', 'cowgirl creampie'],
  ['反向骑乘内射', 'reverse cowgirl creampie'], ['侧入内射', 'spooning creampie'], ['站立内射', 'standing creampie'],
  ['抱起内射', 'suspended creampie'], ['趴压内射', 'prone bone creampie'], ['拔出来射', 'pulling out'],
  ['颜射', 'facial'], ['射胸上', 'cum on breasts'], ['射肚子上', 'cum on belly'], ['射背上', 'cum on back'],
  ['射屁股上', 'cum on ass'], ['射腿上', 'cum on legs'], ['口爆', 'cum in mouth'], ['吞精', 'swallowing'],
  ['深喉', 'deepthroat'], ['乳交射', 'paizuri cumshot'], ['舔龟头', 'licking glans'],
  ['舔蛋', 'licking testicles'], ['手交射', 'handjob cumshot'],
];

/* 双人动作池（双人一律男 × 女） */
const DUO_ACTIONS_SFW = [
  ['拥抱', 'hugging each other'], ['接吻', 'kissing'], ['牵手', 'holding hands'],
  ['跳舞', 'dancing'], ['靠肩', 'leaning on shoulder'], ['互相喂', 'feeding each other'],
  ['并肩走', 'walking together'], ['背人', 'piggyback ride'], ['一起看书', 'reading together'],
  ['一起自拍', 'selfie together'], ['并肩站', 'standing side by side'], ['面对面', 'face to face'],
  ['额头相抵', 'forehead touch'],
  ['摸头', 'head pat'],
  ['搂腰', 'holding waist'],
  ['挽手', 'arm in arm'],
  ['依偎', 'cuddling'],
  ['一起吃饭', 'eating together'],
  ['一起看手机', 'looking at phone together'],
  ['一起躺', 'lying together'],
  ['牵手走', 'walking hand in hand'],
  ['耳边说话', 'whispering'],
  ['靠着睡', 'sleeping on shoulder'],
  ['一起洗澡', 'bathing together'],
];
const DUO_ACTIONS_MF_R18 = [
  ...DUO_ACTIONS_SFW,
  ['正常位', 'missionary'], ['骑乘', 'cowgirl'], ['后入', 'doggystyle'], ['站立位', 'standing sex'],
  ['侧入', 'spooning'], ['趴压', 'prone bone'], ['屈曲位', 'mating press'], ['69', '69'],
  ['口交', 'fellatio'], ['乳交', 'paizuri'], ['手交', 'handjob'], ['抵墙', 'against wall'],
  ['抬腿', 'lifted legs'], ['抱起位', 'suspended congress'], ['莲花坐', 'lotus'],
  ['反向骑乘', 'reverse cowgirl'],
  /* 常见但原来没进选项的体位 */
  ['全尼尔森位', 'full nelson'], ['打桩机位', 'piledriver'], ['亚马逊位', 'amazon position'],
  ['乳交（titjob）', 'titjob'],
  /* 坐着插的两个：坐桌上面对面、男坐凳上她反坐 */
  ['桌上插入·面对面', 'desk sex, sitting on desk, facing each other, sex, penetration'],
  ['反坐插入·凳上', 'reverse upright straddle, reverse cowgirl position, straddling, sitting on his lap, facing away, penetration'],
  /* 加 */
  ['坐腿上', 'sitting on lap'], ['跨坐', 'straddling'], ['趴跪抬臀', 'face down ass up'],
  ['后入抬腿', 'leg lock'], ['背后抱', 'back hug'],
  ['站身后', 'standing behind'], ['吻脖子', 'kissing neck'], ['咬脖子', 'biting neck'],
  ['掐腰', 'grabbing waist'], ['按住手腕', 'pinning wrists'], ['腿缠腰', 'legs wrapped around'],
  ['抱起', 'carrying her'], ['抵窗', 'pushed against window'],
  ...DUO_FINISH_ACTIONS,
];

function duoActionPairs() {
  /* 姿势是通用的：在哪都能用，场景只是额外补几条，不做收窄 */
  const pairs = (state.r18 ? DUO_ACTIONS_MF_R18 : DUO_ACTIONS_SFW).slice();
  const s = state.scene ? sceneByTag(state.scene) : null;
  /* 场景自带的双人姿势全是成人向：正常模式不要补进来 */
  for (const t of (state.r18 && s && SCENE_EXTRA_DUO_ACTIONS[s.tag]) || []) {
    if (!pairs.some((x) => x[1] === t)) pairs.push([labelOf(ACTION_LABELS, t), t]);
  }
  return pairs;
}
function duoPosePairs() { return duoActionPairs().filter(([, t]) => isPoseTag(t)); }
function duoActPairs() { return duoActionPairs().filter(([, t]) => !isPoseTag(t)); }

/* 双人姿势分组：内射 / 外射 / 口交那一类先认，再看插入，再看前戏、日常 */
const DUO_GROUP_ORDER = ['体位·插入', '抱·贴·前戏', '日常', '口交·手交·乳交', '内射', '外射'];
function duoActionGroup(tag) {
  const t = String(tag || '');
  if (/cum in mouth|swallow|deepthroat|fellatio|handjob|paizuri|licking|^69$/.test(t)) return '口交·手交·乳交';
  if (/creampie|internal cumshot|x-ray|cross-section/.test(t)) return '内射';
  if (/cum on |bukkake|facial|cumshot|pulling out/.test(t)) return '外射';
  if (/doggystyle|cowgirl|missionary|spooning|prone bone|mating press|lotus|suspended|straddl|desk sex|standing sex|penetration|against wall|leg lock|face down ass up|face to face|lifted legs|sitting on lap/.test(t)) return '体位·插入';
  if (/holding hands|walking together|piggyback|feeding each other|reading together|leaning on shoulder|dancing|selfie/.test(t)) return '日常';
  return '抱·贴·前戏';
}
function sortDuoByGroup(items) {
  const special = items.filter((it) => String(it.tag).startsWith('__'));
  const rest = items.filter((it) => !String(it.tag).startsWith('__'));
  const idx = (it) => {
    const i = DUO_GROUP_ORDER.indexOf(duoActionGroup(it.tag));
    return i < 0 ? DUO_GROUP_ORDER.length : i;
  };
  return [...special, ...rest.slice().sort((a, b) => idx(a) - idx(b))];
}

/* 单人姿势分组：场景专属 → 事后/高潮 → 成人 → 基础姿势 → 腿脚 → 展示 → 日常 */
const SOLO_GROUP_ORDER = ['场景专属', '事后·高潮', '成人·自慰·露出', '姿势·组合', '基础姿势', '腿部·脚', '展示·妖娆', '日常'];
/* 只有当前场景自带的那些才标「场景专属」；没选场景时它们并回普通组 */
let SCENE_ACTION_SET = null;
function sceneActionSet() {
  const s = state.scene ? sceneByTag(state.scene) : null;
  const key = (s && s.tag) || '';
  if (!SCENE_ACTION_SET || SCENE_ACTION_SET.key !== key) {
    SCENE_ACTION_SET = new Set((s && SCENE_EXTRA_ACTIONS[s.tag]) || []);
    SCENE_ACTION_SET.key = key;
  }
  return SCENE_ACTION_SET;
}
function soloActionGroup(tag) {
  const t = String(tag || '');
  if (state.scene && sceneActionSet().has(t)) return '场景专属';
  if (/after sex|afterglow|orgasm|squirting|climax|cum on|cum dripping|cum overflow|panting|lying limp|messy hair|body trembling|legs trembling|toes curling|gripping bedsheet|clutching pillow|hand between legs|knees weak|sitting up tired/.test(t)) return '事后·高潮';
  if (/masturbat|fingering|rubbing herself|vibrator|spread pussy|hand on crotch|pulling panties|panties aside|exhibitionism|public nudity|flashing|presenting|holding own breasts|licking lips|grinding|arched back|riding pillow|on all fours/.test(t)) return '成人·自慰·露出';
  /* 地点 + 摆法：床上 / 椅子上 / 桌上 / 沙发上 / 地上 / 靠墙，带腿怎么放 */
  if (/on bed|on chair|on desk|on table|on sofa|on floor|against wall|in chair backwards|on stairs/.test(t)) return '姿势·组合';
  if (/^(sitting|standing|lying|kneeling|squatting|crouching|on stomach|curled up|sitting sideways|lying on back|spread legs)/.test(t)) return '基础姿势';
  if (/legs up|stretching legs|crossing legs|tiptoes|legs together|knees together|barefoot|foot|toes|long legs|thigh|splits|kick|one leg/.test(t)) return '腿部·脚';
  if (/posing|blowing kiss|finger to lips|looking over shoulder|playing with hair|tucking hair|lipstick|stockings|peace sign|hands behind back|hands in pockets|arms behind head|hands on knees|hugging own body|covering mouth|looking down|looking up|leaning back|waving|lifting skirt|lifting shirt|undressing|changing clothes/.test(t)) return '展示·妖娆';
  return '日常';
}
function sortSoloByGroup(items) {
  const special = items.filter((it) => String(it.tag).startsWith('__'));
  const rest = items.filter((it) => !String(it.tag).startsWith('__'));
  const idx = (it) => {
    const i = SOLO_GROUP_ORDER.indexOf(soloActionGroup(it.tag));
    return i < 0 ? SOLO_GROUP_ORDER.length : i;
  };
  return [...special, ...rest.slice().sort((a, b) => idx(a) - idx(b))];
}

/* 双人专属动作，单人模式一律不出现（69 / 后入 / 正常位…） */
const DUO_ONLY_ACTIONS = new Set(
  [...DUO_ACTIONS_SFW, ...DUO_ACTIONS_MF_R18].map((x) => x[1])
);
/* 场景专属姿势：选了哪个场景，姿势列表里就多出这些 */
const SCENE_EXTRA_ACTIONS = {
  'classroom': ['sitting on desk', 'sitting on chair', 'leaning on windowsill', 'standing in front of blackboard', 'writing on blackboard', 'lying on desk', 'leaning on desk', 'reading at desk', 'sitting backwards on chair'],
  'classroom sunset': ['sitting on desk', 'sitting on chair', 'leaning on windowsill', 'standing in front of blackboard', 'writing on blackboard', 'lying on desk', 'leaning on desk'],
  'school hallway': ['leaning on lockers', 'walking down hallway', 'standing by window', 'sitting on stairs'],
  'music room': ['sitting at piano', 'sitting on stool', 'holding sheet music', 'leaning on piano', 'playing guitar'],
  'art room': ['holding palette', 'drawing at easel', 'sitting on stool', 'painting'],
  'library': ['reading at desk', 'reaching for bookshelf', 'sitting on ladder', 'leaning on bookshelf', 'stacking books'],
  'cafe': ['sitting at counter', 'leaning on counter', 'holding tray', 'sitting at window seat', 'holding cup'],
  'bedroom': ['sitting on bed', 'lying on pillow', 'hugging pillow', 'under blanket'],
  'dorm room': ['sitting on bed', 'lying on pillow', 'hugging pillow', 'sitting on floor'],
  'living room': ['sitting on sofa', 'lying on sofa', 'sitting on rug', 'hugging pillow'],
  'living room night': ['sitting on sofa', 'lying on sofa', 'sitting on rug'],
  'kitchen': ['leaning on counter', 'sitting on counter', 'drinking from cup', 'cooking'],
  'kitchen night': ['leaning on counter', 'sitting on counter', 'drinking from cup'],
  'bathroom': ['sitting in bathtub', 'leaning on wall', 'wrapping towel'],
  'shower': ['leaning against wall', 'washing hair', 'wrapping towel'],
  'onsen': ['sitting in water', 'leaning on rock', 'wrapping towel'],
  'swimming pool': ['sitting on poolside', 'leaning on pool edge', 'wading', 'in water'],
  'school pool': ['sitting on poolside', 'leaning on pool edge', 'wading', 'in water'],
  'beach': ['sitting on sand', 'lying on towel', 'walking in water', 'sitting on poolside'],
  'beach sunset': ['sitting on sand', 'lying on towel', 'walking in water'],
  'park': ['sitting on bench', 'lying on grass', 'feeding ducks', 'leaning on tree'],
  'rooftop': ['leaning on railing', 'sitting on rooftop edge', 'looking at sky'],
  'rooftop night': ['leaning on railing', 'sitting on rooftop edge', 'looking at sky'],
  'street': ['waiting at bus stop', 'leaning on railing', 'sitting on bench'],
  'rainy street': ['waiting at bus stop', 'holding umbrella', 'leaning on railing'],
  'train station': ['waiting on platform', 'sitting on bench', 'standing holding strap'],
  'train': ['sitting by window', 'standing holding strap', 'leaning on door'],
  'bus interior': ['sitting by window', 'standing holding strap'],
  'office': ['sitting at desk', 'leaning on desk', 'standing by window', 'holding documents'],
  'office night': ['sitting at desk', 'leaning on desk', 'standing by window', 'holding documents'],
  'japanese room': ['sitting on tatami', 'kneeling on cushion', 'lying on tatami', 'reading'],
  'shrine': ['walking up stairs', 'sitting on steps', 'praying'],
  'shrine night': ['walking up stairs', 'sitting on steps', 'praying'],
  'gym': ['sitting on bench', 'stretching on floor', 'drinking from bottle'],
  'museum': ['looking at painting', 'standing in hall', 'reading'],
  'bookstore': ['reading at shelf', 'reaching for bookshelf', 'holding books'],
  'cinema': ['sitting in theater', 'holding popcorn'],
  'castle': ['standing in hall', 'leaning on balcony'],
  'ruins': ['leaning on wall', 'sitting on rubble'],
  'forest': ['leaning on tree', 'lying on grass', 'walking'],
  /* 成人场景的单人姿势 */
  'love hotel': ['kneeling on bed', 'bent over bed', 'lying on bed spread legs', 'sitting on bed', 'riding pillow'],
  'hotel room': ['kneeling on bed', 'bent over bed', 'lying on bed spread legs', 'sitting on bed'],
  'bedroom night': ['kneeling on bed', 'bent over bed', 'lying on bed spread legs'],
  'sofa': ['on all fours on sofa', 'sitting on sofa', 'lying on sofa', 'riding pillow'],
  'bathroom': ['sitting in bathtub', 'bent over sink', 'kneeling in shower', 'wrapping towel'],
  'onsen': ['sitting in water', 'leaning on rock', 'wrapping towel'],
  'shower': ['kneeling in shower', 'leaning against wall', 'washing hair'],
  'office night': ['sitting on office desk', 'bent over desk', 'kneeling under desk', 'standing by window'],
  'park night': ['kneeling on grass', 'lying on grass', 'against wall'],
  'night street': ['against wall', 'kneeling', 'flashing', 'exhibitionism'],
  'public toilet': ['against wall', 'kneeling', 'bent over'],
  'car night': ['sitting in passenger seat', 'lying on back seat', 'spread legs'],
  'tent': ['lying on sleeping bag', 'kneeling on bed', 'spread legs'],
  'dressing room': ['changing clothes', 'bent over', 'against wall'],
  'love hotel night': ['kneeling on bed', 'bent over bed', 'lying on bed spread legs'],
  'bedroom night': ['lying on bed, legs spread', 'kneeling on bed', 'bent over bed', 'riding pillow'],
  'classroom night': ['sitting on desk', 'bent over desk', 'leaning on desk', 'against wall'],
  'sauna': ['sitting on bench', 'lying on bench', 'spread legs', 'wrapping towel'],
  'nightclub': ['dancing', 'against wall', 'sitting on sofa', 'kneeling'],
  'bar': ['sitting at counter', 'leaning on counter', 'against wall', 'bent over'],
  'karaoke room': ['sitting on sofa', 'kneeling on sofa', 'lying on sofa', 'against wall'],
  'warehouse': ['against wall', 'bent over crate', 'sitting on crate', 'kneeling'],
  'basement': ['kneeling on floor', 'against wall', 'lying on floor', 'spread legs'],
  'laundry room': ['bent over washing machine', 'sitting on washing machine', 'against wall', 'standing'],
  'infirmary': ['lying on bed', 'sitting on bed', 'kneeling', 'against wall'],
  'laboratory': ['bent over desk', 'sitting on desk', 'against wall', 'standing'],
  'church': ['kneeling on pew', 'sitting on pew', 'lying on altar', 'praying'],
  'beach night': ['sitting on sand', 'lying on sand', 'in water', 'flashing'],
  'forest night': ['lying on grass', 'sitting on log', 'against tree', 'kneeling'],
  'train night': ['sitting by window', 'standing holding strap', 'against wall', 'kneeling'],
  'airplane cabin': ['sitting in seat', 'kneeling in aisle', 'lying on seat', 'against wall'],
  'host club': ['sitting on sofa', 'sitting on lap', 'kneeling', 'against wall'],
  'ryokan': ['sitting on tatami', 'lying on futon', 'kneeling', 'spread legs'],
};

/* 成人场景的双人姿势：在场景自带的基础上再补 */
const SCENE_EXTRA_DUO_ACTIONS = {
  'love hotel': ['missionary', 'cowgirl', 'reverse cowgirl', 'doggystyle', '69', 'paizuri', 'fellatio', 'suspended congress', 'mating press', 'sitting on lap'],
  'hotel room': ['missionary', 'cowgirl', 'doggystyle', 'fellatio', 'paizuri', '69'],
  'sofa': ['cowgirl', 'missionary', 'spooning', 'sitting on lap', 'straddling', 'fellatio'],
  'bathroom': ['against wall', 'standing sex', 'lifted legs', 'fellatio', 'suspended congress'],
  'onsen': ['lotus', 'suspended congress', 'missionary', 'cowgirl'],
  'shower': ['against wall', 'standing sex', 'lifted legs', 'fellatio'],
  'office night': ['bent over desk', 'against wall', 'standing sex', 'sitting on lap', 'missionary'],
  'park night': ['standing sex', 'against wall', 'doggystyle', 'lifted legs'],
  'night street': ['standing sex', 'against wall', 'doggystyle'],
  'public toilet': ['against wall', 'standing sex', 'fellatio', 'doggystyle'],
  'car night': ['cowgirl', 'fellatio', 'handjob', 'missionary', 'reverse cowgirl'],
  'tent': ['spooning', 'cowgirl', 'missionary', 'mating press', 'prone bone'],
  'dressing room': ['against wall', 'standing sex', 'lifted legs', 'fellatio'],
  'bedroom': ['missionary', 'cowgirl', 'doggystyle', 'spooning', 'mating press', 'sitting on lap'],
  'bedroom night': ['missionary', 'cowgirl', 'doggystyle', 'spooning', 'mating press', 'full nelson'],
  'classroom night': ['bent over desk', 'against wall', 'standing sex', 'missionary', 'cowgirl'],
  'sauna': ['spooning', 'standing sex', 'lotus', 'missionary', 'cowgirl'],
  'nightclub': ['against wall', 'standing sex', 'kissing', 'sitting on lap'],
  'bar': ['against wall', 'standing sex', 'sitting on lap', 'reverse cowgirl'],
  'karaoke room': ['sitting on lap', 'cowgirl', 'missionary', 'against wall'],
  'warehouse': ['against wall', 'bent over', 'standing sex', 'lifted legs'],
  'basement': ['against wall', 'missionary', 'cowgirl', 'piledriver'],
  'laundry room': ['bent over', 'standing sex', 'against wall', 'lifted legs'],
  'infirmary': ['missionary', 'cowgirl', 'against wall', 'fellatio'],
  'laboratory': ['bent over', 'standing sex', 'against wall', 'mating press'],
  'church': ['missionary', 'cowgirl', 'standing sex', 'lotus'],
  'beach night': ['standing sex', 'spooning', 'missionary', 'cowgirl'],
  'forest night': ['against wall', 'standing sex', 'doggystyle', 'prone bone'],
  'train night': ['against wall', 'standing sex', 'cowgirl', 'fellatio'],
  'airplane cabin': ['sitting on lap', 'cowgirl', 'fellatio', 'handjob'],
  'host club': ['sitting on lap', 'cowgirl', 'against wall', 'reverse cowgirl'],
  'ryokan': ['spooning', 'missionary', 'cowgirl', 'lotus'],
};

const EXTRA_ACTIONS_SFW = [
  /* 动作 = 正在干什么（走路 / 看书 / 做饭 / 接吻…）。
     手怎么放归 HANDS_*，身体怎么摆归 EXTRA_POSES_SFW，阶段归 STAGE_*，别混进来。 */
  "posing", "walking", "running", "jumping", "climbing stairs",
  "looking back", "selfie", "taking photo", "stretching", "stretching arms",
  "leaning out window", "waiting", "watching rain", "staring into distance",
  "dozing off", "half asleep", "buried in scarf",
  "cooking", "eating snack", "drinking tea", "bathing", "sunbathing",
  "petting cat", "writing", "reading", "sleeping", "eating", "praying",
  "playing guitar", "playing violin", "dancing ballet", "skateboarding", "riding scooter",
  "holding cup", "holding flower", "holding bag", "holding balloon", "holding umbrella",
  "hugging pillow", "holding pillow", "hugging a plushie", "wrapped in blanket",
  "crossing arms", "thinking pose",
];

/* 姿势：在哪儿 + 身体怎么摆。以前混在动作数组里靠 isPoseTag() 猜，现在单独一份 */
const EXTRA_POSES_SFW = [
  "standing", "standing, leaning on railing",
  "leaning against wall", "standing, one leg raised",
  "standing on tiptoes", "standing, legs apart",
  "standing, bent over desk", "leaning on window, hips out",
  "sitting", "sitting cross-legged",
  "sitting on chair, crossed legs", "sitting with legs spread",
  "sitting on floor, knees apart", "sitting on bed edge",
  "sitting on table", "sitting on desk, legs crossed, leaning back",
  "sitting on sofa sideways", "sitting on stairs",
  "sitting on chair, leaning forward, elbows on knees", "sitting astride chair backwards",
  "kneeling", "kneeling on floor",
  "kneeling on bed, thighs apart", "kneeling on bed, face down, ass up",
  "kneeling on one knee", "kneeling, sitting on heels",
  "kneeling on sofa", "kneeling on chair",
  "lying on stomach on bed, legs up", "lying face down",
  "on stomach on floor, legs up", "on stomach on bed, ass up, legs apart",
  "lying on stomach on desk", "face down ass up",
  "bent over table", "squatting, toes",
  "lying down", "lying on back",
  "lying on back, legs up", "lying on bed, legs up",
  "lying on bed, legs spread in M shape, knees up", "lying on bed, legs spread",
  "lying on bed, on side, legs crossed", "lying on bed, on side, hugging knees",
  "lying on sofa, legs stretched", "lying on grass",
  "lying on back on bed, knees to chest", "curled up",
  "hugging knees", "chin on knees",
  "crouching", "head on desk",
  "under blanket", "legs together",
  "knees up", "legs spread",
  "presenting pussy", "presenting breasts",
  "lying on bed, legs spread, spreading pussy", "lying on sofa, legs spread",
  "sitting on chair, legs spread", "sitting on sofa, legs spread",
  "sitting on desk, legs spread in M shape", "lying on sofa, legs spread in M shape",
  "sitting on floor, legs spread in M shape", "on floor, legs spread in M shape, fingering herself",
  "sitting on desk, legs spread", "lying on desk, legs spread",
  "sitting in chair backwards, legs apart", "kneeling with legs apart",
  "against wall, one leg raised",
];

/* 场景 → 可用姿势（场景自己的 + 专属扩展 + 通用） */
function sceneActionTags(s) {
  const own = s && Array.isArray(s.actions) ? s.actions : [];
  const extra = (s && SCENE_EXTRA_ACTIONS[s.tag]) || [];
  return [...new Set([...own, ...extra, ...EXTRA_ACTIONS_SFW, ...EXTRA_POSES_SFW])];
}

/* 姿势和场景联动：只收「明确绑在少数场景」的姿势，坐/站/躺这类到处能用的照旧全给 */
const ACTION_SCENES = new Map();
for (const s of SCENES) {
  for (const t of [...(s.actions || []), ...(SCENE_EXTRA_ACTIONS[s.tag] || [])]) {
    if (!ACTION_SCENES.has(t)) ACTION_SCENES.set(t, new Set());
    ACTION_SCENES.get(t).add(s.tag);
  }
}
function actionSceneSet(tag) {
  const set = ACTION_SCENES.get(tag);
  if (!set) return null;
  /* 出现场景够多 = 通用姿势，不绑 */
  return set.size >= 12 ? null : set;
}
function actionAllowedIn(action, sceneTag) {
  if (!sceneTag) return true;
  const set = actionSceneSet(action);
  return !set || set.has(sceneTag);
}
function filterActionsForScene(list, sceneTag) {
  return sceneTag ? list.filter((a) => actionAllowedIn(a, sceneTag)) : list.slice();
}

const PROPS_SFW = [
  ['书', 'book'], ['杯子', 'cup'], ['伞', 'umbrella'],
  ['花', 'flowers'], ['手机', 'phone'], ['包', 'bag'],
  ['耳机', 'headphones'], ['玩偶', 'plush toy'], ['扇子', 'fan'],
  ['相机', 'camera'], ['气球', 'balloon'], ['冰淇淋', 'ice cream'],
  ['咖啡', 'coffee'], ['泰迪熊', 'teddy bear'], ['游戏手柄', 'game controller'],
  ['信', 'letter'], ['野餐篮', 'picnic basket'], ['画本', 'sketchbook'],
  ['吉他', 'guitar'], ['小提琴', 'violin'], ['香烟', 'cigarette'],
  ['糖果', 'candy'], ['红酒杯', 'wine glass'], ['蛋糕', 'cake'],
  ['便当', 'bento'], ['笔记本电脑', 'laptop'], ['枕头', 'pillow'],
  ['毯子', 'blanket'], ['梳子', 'hairbrush'], ['口红', 'lipstick'],
  ['香水', 'perfume'], ['钱包', 'wallet'], ['钥匙', 'keys'],
  ['猫', 'cat'], ['沙滩球', 'beach ball'], ['泳圈', 'swim ring'],
  ['防晒霜', 'sunscreen'], ['冲浪板', 'surfboard'],
];
const PROPS_R18 = [
  ...PROPS_SFW,
  ['振动棒', 'vibrator'], ['假阳具', 'dildo'], ['避孕套', 'condom'],
  ['手铐', 'handcuffs'], ['绳子', 'rope'], ['项圈', 'collar'],
  ['牵引绳', 'leash'], ['眼罩', 'blindfold'], ['鞭子', 'whip'],
  ['蜡烛', 'candle'], ['镜子', 'mirror'], ['冰块', 'ice cube'],
  ['羽毛', 'feather'], ['口球', 'ball gag'], ['跳蛋', 'vibrating egg'],
  ['乳夹', 'nipple clamps'], ['束带', 'harness'], ['马鞭', 'riding crop'],
  ['肛塞', 'butt plug'], ['肛珠', 'anal beads'], ['锁精环', 'cock ring'],
  ['润滑液', 'lube'],
];
/* 没有男性在画面里就没有意义的道具，单人模式不出现 */
const PROPS_NEED_MALE = new Set(['condom', 'cock ring']);
const HANDS_SFW = [
  ['双手抱头', 'both hands on head'], ['抓紧床单', 'gripping sheets tightly'], ['手放锁骨', 'hand on collarbone'],
  ['手扶脖子', 'hand on neck'], ['双手撑桌', 'both hands on desk'], ['手背贴脸', 'back of hand on cheek'],
  ['双手放小腹', 'hands on stomach'], ['双手交握', 'hands clasped'], ['抓栏杆', 'gripping railing'],
  ['捂耳朵', 'covering ears'], ['捏自己脸', 'pinching own cheek'], ['撑地', 'hand on floor'],
  ['拉衣领', 'pulling collar'], ['双手捧脸', 'both hands cupping face'], ['摸头发', 'touching hair'],
  ['捧脸', 'hand on cheek'], ['背后', 'hands behind back'], ['挥手', 'waving'],
  ['比耶', 'peace sign'], ['牵手', 'holding hand'], ['扶眼镜', 'adjusting glasses'],
  ['叉腰', 'hand on hip'], ['手放胸口', 'hand on chest'], ['十指相扣', 'fingers interlaced'],
  ['摸脸', 'touching cheek'], ['整理衣服', 'adjusting clothes'], ['手插口袋', 'hands in pockets'],
  ['摸耳朵', 'touching ear'], ['托下巴', 'chin rest'], ['飞吻', 'blowing kiss'],
  ['食指抵唇', 'finger to lips'], ['手放脑后', 'arms behind head'], ['双手扶膝', 'hands on knees'],
  ['抱自己', 'hugging own body'], ['别到耳后', 'tucking hair behind ear'], ['双手撑床', 'both hands on bed'],
  ['抓床沿', 'gripping bed edge'], ['抓桌沿', 'gripping desk edge'], ['抓椅背', 'holding chair back'],
  ['扶墙', 'hand on wall'], ['双手捂脸', 'hands covering face'],
];
const HANDS_R18 = [
  ...HANDS_SFW,
  ['双手拉内裤', 'both hands pulling panties'], ['一只手指插入一只手指揉外阴', 'one finger inside, one finger rubbing clit'], ['抓自己头发', 'pulling own hair'], ['手指放嘴里', 'finger in mouth'], ['咬手指', 'biting finger'], ['解内衣', 'unclasping bra'],
  ['两手掰开腿', 'both hands spreading own legs'], ['一手扶床沿一手插入', 'one hand on bed edge, one hand fingering'], ['一手托胸一手揉', 'one hand lifting breast, one hand groping'],
  ['自摸', 'self-touch'], ['揉胸', 'groping breast'], ['摸对方', 'hand on partner'],
  ['搂腰', 'hands on waist'], ['抓手腕', 'holding wrists'], ['按手腕', 'pinning wrists'],
  ['抬下巴', 'lifting chin'], ['摸大腿', 'hand on thigh'], ['掰开腿', 'spreading legs'],
  ['抓头发', 'pulling hair'], ['捂嘴', 'covering mouth'], ['扶腰', 'holding hips'],
  ['摸臀', 'groping ass'], ['拉衣服', 'pulling clothes'], ['按头', 'pushing head down'],
  ['掰开小穴', 'spreading pussy'], ['插入小穴', 'fingering herself'], ['捏乳头', 'pinching nipple'],
  ['揉阴蒂', 'rubbing clit'], ['双手叉腰', 'hands on hips'], ['托胸', 'lifting breasts'],
  ['解开扣子', 'unbuttoning'], ['拉下内裤', 'pulling down panties'], ['一手揉胸一手插入', 'one hand groping breast, one hand fingering'],
  ['一手揉胸一手掰开', 'one hand groping breast, one hand spreading pussy'], ['双手揉胸', 'both hands groping breasts'], ['双手掰开', 'both hands spreading pussy'],
  ['一手捏乳头一手插入', 'one hand pinching nipple, one hand fingering'], ['脱衣', 'undressing'], ['换衣服', 'changing clothes'],
  ['掀起裙子', 'lifting skirt'], ['掀起上衣', 'lifting shirt'], ['一手按小腹', 'hand pressing on lower abdomen'],
  ['一手拉内裤一手插入', 'one hand pulling panties aside, one hand fingering'], ['两手都插入', 'both hands fingering'], ['一只手揉小穴', 'hand rubbing pussy'],
  ['手按私处', 'hand on crotch'], ['拨到一边', 'pulling panties aside'],
];
/* 这些动作是「对对方」做的，单人模式不给 */
const HANDS_PARTNER = new Set([
  'hand on partner', 'holding wrists', 'pinning wrists', 'lifting chin', 'hand on thigh',
  'grabbing waist', 'holding hips', 'groping ass', 'pulling hair', 'pushing head down',
]);
/* 已经脱光了还让手去脱衣服，会出「裸体 + undressing」这种打架词 */
const HANDS_UNDRESS = new Set([
  'both hands pulling panties', 'unclasping bra', 'pulling down panties',
  'one hand pulling panties aside, one hand fingering', 'undressing', 'changing clothes',
  'lifting skirt', 'lifting shirt', 'undressing herself', 'taking off socks', 'pulling down pants',
  'pulling clothes',
]);
/* 道具不能只写「有这件东西」，得写它正在怎么用 */
const PROP_USAGE_SFW = {
  'book': 'holding book, reading book',
  'cup': 'holding cup, drinking',
  'umbrella': 'holding umbrella',
  'flowers': 'holding flowers',
  'phone': 'holding phone, looking at phone',
  'bag': 'holding bag',
  'headphones': 'wearing headphones',
  'plush toy': 'holding plush toy',
  'fan': 'holding fan',
  'camera': 'holding camera, taking photo',
  'balloon': 'holding balloon',
  'ice cream': 'holding ice cream, eating ice cream',
  'coffee': 'holding coffee cup, drinking coffee',
  'teddy bear': 'holding teddy bear',
  'game controller': 'holding game controller',
  'letter': 'holding letter, reading letter',
  'picnic basket': 'holding picnic basket',
  'sketchbook': 'holding sketchbook, drawing',
  'guitar': 'playing guitar',
  'violin': 'playing violin',
  'cigarette': 'holding cigarette, smoking',
  'candy': 'holding candy, eating candy',
  'lollipop': 'licking lollipop',
  'wine glass': 'holding wine glass, drinking wine',
  'champagne': 'holding champagne bottle',
  'cake': 'holding cake',
  'donut': 'holding donut, eating donut',
  'strawberry': 'holding strawberry, eating strawberry',
  'bento': 'holding bento box',
  'onigiri': 'holding onigiri, eating onigiri',
  'soda': 'holding soda can, drinking',
  'laptop': 'using laptop, laptop on lap',
  'pillow': 'hugging pillow',
  'blanket': 'wrapped in blanket',
  'hairbrush': 'holding hairbrush, brushing hair',
  'lipstick': 'holding lipstick, applying lipstick',
  'perfume': 'holding perfume bottle',
  'wallet': 'holding wallet',
  'keys': 'holding keys',
  'cat': 'holding cat, petting cat',
  'beach ball': 'holding beach ball',
  'swim ring': 'holding swim ring, inflatable ring',
  'sunscreen': 'applying sunscreen, holding sunscreen bottle',
  'surfboard': 'holding surfboard, carrying surfboard',
};
const PROP_USAGE = {
  ...PROP_USAGE_SFW,
  'dildo': 'dildo in pussy, using dildo, penetration',
  'vibrator': 'vibrator on pussy, using vibrator, clitoral stimulation',
  'vibrating egg': 'vibrating egg in pussy, remote vibrator',
  'condom': 'condom on penis, using condom',
  'handcuffs': 'handcuffed, hands behind back',
  'rope': 'bound with rope, rope bondage',
  'collar': 'wearing collar, collar around neck',
  'leash': 'leash attached to collar, holding leash',
  'blindfold': 'blindfolded, eyes covered',
  'whip': 'holding whip, whip in hand',
  'candle': 'wax play, hot wax on skin',
  'mirror': 'mirror, reflection, facing mirror',
  'ice cube': 'ice cube on skin, melting ice',
  'feather': 'feather on skin, tickling',
  'ball gag': 'ball gag in mouth',
  'nipple clamps': 'nipple clamps on nipples',
  'harness': 'wearing harness, harness straps',
  'riding crop': 'holding riding crop',
  'butt plug': 'anal plug in ass',
  'anal beads': 'anal beads in ass',
  'cock ring': 'cock ring on penis',
  'lube': 'lubricant, shiny skin',
  'lubricant': 'lubricant, shiny skin',
  'blindfold ribbon': 'blindfolded with ribbon',
  'vibrating egg': 'vibrating egg in pussy',
};
/* 道具用法里靠手拿的部分：已经选了手上动作时就不再叠一遍 */
const PROP_HAND_USAGE = /holding|in hand|hands|hand on|gripping|leash|whip/i;
function propSceneCompatible(prop, scene) {
  if (!prop || !scene) return true;
  const p = String(prop).toLowerCase();
  const s = String(scene).toLowerCase();
  if (p === 'umbrella') return /rain|street|park|beach|garden|riverside|rooftop|forest|mountain|snow|field|campsite|festival|station|bus stop|ruins|castle/.test(s);
  if (p === 'picnic basket') return /park|garden|beach|campsite|forest|flower field|riverside|lake/.test(s);
  if (/beach ball|swim ring|sunscreen|surfboard/.test(p)) return /pool|beach|swimming/.test(s);
  if (/guitar|violin/.test(p)) return !/bathroom|shower|onsen|public bath|sauna|pool/.test(s);
  if (p === 'cigarette') return !/hospital|infirmary|laboratory|church/.test(s);
  if (p === 'laptop') return !/bathroom|shower|onsen|public bath|sauna/.test(s);
  return true;
}
function propHandCompatible(prop, hand) {
  if (!prop || !hand) return true;
  const usage = PROP_USAGE[prop] || '';
  return !/holding|playing|using|hugging|drawing|brushing|applying|smoking|eating|drinking|licking|taking photo|petting/.test(usage);
}
function sceneTimeCompatible(scene, time) {
  if (!scene || !time) return true;
  const s = String(scene).toLowerCase();
  const t = String(time).toLowerCase();
  if (/night/.test(s) && /^(day|morning|noon|afternoon|early morning)$/.test(t)) return false;
  if (/snow/.test(s) && /rainy/.test(t)) return false;
  if (/rain/.test(s) && /snowy/.test(t)) return false;
  if (/beach|pool/.test(s) && /snowy/.test(t)) return false;
  return true;
}
function sceneOutfitCompatible(scene, outfit) {
  if (!scene || !outfit || outfit === 'ORIGINAL' || outfit === 'LORA') return true;
  const s = String(scene).toLowerCase();
  const o = String(outfit).toLowerCase();
  if (/snow|winter/.test(s) && /swimsuit|bikini|micro bikini|school swimsuit|sundress|sun shirt/.test(o)) return false;
  if (/bathroom|shower|onsen|public bath|sauna|pool/.test(s) && /armor|wedding dress|evening gown|trench coat/.test(o)) return false;
  if (/beach|swimming pool|pool night|private pool/.test(s) && /armor|wedding dress|evening gown|trench coat|winter coat/.test(o)) return false;
  return true;
}
const STAGES = [
  ['前戏', 'foreplay'], ['插入前', 'about to insert'], ['插入中', 'sex, mid-thrust'],
  ['骑乘中', 'cowgirl position, riding'], ['后入中', 'doggystyle, taken from behind'],
  ['口交中', 'fellatio, oral'], ['手交中', 'handjob'], ['高潮', 'orgasm, climax'],
  ['内射', 'creampie'], ['事后', 'after sex, exhausted'],
  ['爱抚', 'caressing'], ['脱衣中', 'undressing'], ['接吻中', 'kissing'],
  ['临门', 'about to cum'], ['失神', 'mind break'],
];
const STAGE_SEQUENCE = [
  {
    label: '前戏', tag: 'foreplay, teasing, lying close together', expression: 'biting lip',
    actionHint: '亲吻抚摸', support: 'touching each other, hands on body, caressing',
    remove: /(missionary|cowgirl|doggystyle|spooning|prone bone|mating press|suspended congress|lotus|reverse cowgirl|missionary position|position|on back, legs spread|male on top|male thrusting|girl lying on back|penetration|x-ray|cross-section|internal view|cum in pussy|internal cumshot|semen inside|sex, mid-thrust|kissing|lips together)/gi,
  },
  {
    label: '插入前', tag: 'about to insert, tip in, close bodies', expression: 'nervous',
    actionHint: '抵住·分开腿', support: 'gripping hips, spreading legs, close proximity',
    remove: /(missionary|cowgirl|doggystyle|spooning|prone bone|mating press|suspended congress|lotus|reverse cowgirl|missionary position|position|on back, legs spread|male on top|male thrusting|girl lying on back|penetration|x-ray|cross-section|internal view|cum in pussy|internal cumshot|semen inside|sex, mid-thrust|kissing|lips together)/gi,
  },
  {
    label: '插入中', tag: 'sex, mid-thrust', expression: 'moaning',
    actionHint: '抽送', support: 'hips thrusting, penetration',
  },
  {
    label: '高潮', tag: 'orgasm, climax, body trembling', expression: 'ahegao',
    actionHint: '颤抖·绷紧', support: 'legs trembling, toes curling, arching back',
  },
  {
    label: '内射', tag: 'creampie, x-ray, cross-section, internal view', expression: 'ahegao',
    actionHint: '内射·透视', support: 'cum in pussy, internal cumshot, semen inside, penetration',
  },
  {
    label: '事后', tag: 'after sex, cum on body, satisfied smile', expression: 'smile',
    actionHint: '满足·余韵', support: 'satisfied smile, happy, blush, afterglow, lying limp, cum on body',
    remove: /(missionary|cowgirl|doggystyle|spooning|prone bone|mating press|suspended congress|lotus|reverse cowgirl|missionary position|position|on back, legs spread|male on top|male thrusting|girl lying on back|penetration|x-ray|cross-section|internal view|cum in pussy|internal cumshot|semen inside|sex, mid-thrust|kissing|lips together|spread legs)/gi,
    replace: [[/\bon all fours\b/gi, 'lying down'], [/\bon back\b/gi, 'lying on side']],
  },
];
const FOREPLAY_OPTIONS = {
  random: null,
  fellatio: {
    label: '口交', tag: 'fellatio, oral, kneeling, between legs', support: 'mouth on penis, tongue, eye contact', expression: 'seductive expression',
    finish: [
      { label: '口爆', tag: 'cum in mouth, oral, kneeling', support: 'cum in mouth, swallowing, cum on tongue', expression: 'blissful expression' },
      { label: '射一脸', tag: 'facial, cum on face, kneeling', support: 'facial, cum on face, cum dripping', expression: 'teary eyes' },
    ],
  },
  paizuri: {
    label: '乳交', tag: 'paizuri, breasts around penis, lying on back', support: 'breasts around penis, titjob', expression: 'seductive expression',
    finish: [
      { label: '口爆', tag: 'cum in mouth, oral, breasts around penis, lying on back', support: 'cum in mouth, swallowing, cum on tongue', expression: 'blissful expression' },
      { label: '射脸一身', tag: 'facial, cum on face, cum on breasts, cum on body, lying on back', support: 'facial, cum on face, cum on breasts, cum on body', expression: 'blissful expression' },
    ],
  },
  handjob: {
    label: '手交', tag: 'handjob, hand on penis, close bodies', support: 'hand on penis, stroking', expression: 'biting lip',
    finish: [
      { label: '射手上', tag: 'cum on hand, cum on body, handjob', support: 'cum on hand, cum on body', expression: 'blissful expression' },
    ],
  },
  fingering: {
    label: '指交', tag: 'fingering, fingers in pussy, spreading legs', support: 'fingers inside pussy, wet', expression: 'blush',
    finish: [
      { label: '女性高潮', tag: 'female orgasm, squirting, body trembling, fingers in pussy', support: 'female orgasm, squirting, body trembling, legs trembling', expression: 'ahegao' },
    ],
  },
  cunnilingus: {
    label: '舔阴', tag: 'cunnilingus, head between legs, lying on back', support: 'licking pussy, head between legs', expression: 'half-closed eyes',
    finish: [
      { label: '女性高潮', tag: 'female orgasm, squirting, body trembling, head between legs', support: 'female orgasm, squirting, body trembling, legs trembling', expression: 'ahegao' },
    ],
  },
  breast: {
    label: '揉胸', tag: 'breast grab, hands on breasts, kneading', support: 'hands on breasts, kneading breasts', expression: 'biting lip',
    finish: [
      { label: '女性高潮', tag: 'female orgasm, body trembling, hands on breasts', support: 'female orgasm, body trembling, legs trembling', expression: 'blissful expression' },
    ],
  },
  kiss: {
    label: '亲吻抚摸', tag: 'kissing, touching, caressing', support: 'touching each other, hands on body', expression: 'biting lip',
    finish: [
      { label: '满足', tag: 'satisfied smile, blush, afterglow, lying close together', support: 'satisfied smile, happy, blush, afterglow', expression: 'smile' },
    ],
  },
};
function makeForeplayStages(choice, finishChoice = 'auto') {
  const base = STAGE_SEQUENCE.find((s) => s.label === '前戏');
  const key = choice === 'random' || !FOREPLAY_OPTIONS[choice]
    ? pickOne(Object.keys(FOREPLAY_OPTIONS).filter((k) => k !== 'random'))
    : choice;
  const opt = FOREPLAY_OPTIONS[key] || FOREPLAY_OPTIONS.kiss;
  const wantedFinish = finishChoice && finishChoice !== 'auto'
    ? (opt.finish || []).find((f) => f.label === finishChoice) : null;
  const finishOpt = wantedFinish || pickOne(opt.finish || []) || { label: '满足', tag: 'satisfied smile', support: 'satisfied smile, blush', expression: 'smile' };
  return [
    { ...base, tag: opt.tag, support: opt.support, actionHint: opt.label, expression: opt.expression },
    { ...base, label: '前戏结束', tag: finishOpt.tag, support: finishOpt.support, actionHint: finishOpt.label, expression: finishOpt.expression },
  ];
}
function stageVariant(base, stage) {
  let prompt = String(base.prompt || '');
  const oldExpr = String(base.expression || '');
  if (oldExpr) {
    prompt = prompt.replace(`(${oldExpr}:1.25)`, `(${stage.expression}:1.25)`);
    const oldSupport = EXPRESSION_SUPPORT[oldExpr];
    if (oldSupport) prompt = prompt.replace(oldSupport, '');
  }
  if (stage.remove) prompt = prompt.replace(stage.remove, '');
  for (const [re, to] of stage.replace || []) prompt = prompt.replace(re, to);
  const support = stage.support || EXPRESSION_SUPPORT[stage.expression];
  if (support) prompt = prompt.replace(`(${stage.expression}:1.25)`, `(${stage.expression}:1.25), ${support}`);
  prompt = stage.tag + (prompt ? ', ' + prompt : '');
  prompt = prompt.replace(/\s*,\s*/g, ', ').replace(/(?:,\s*){2,}/g, ', ').replace(/,\s*$/, '').replace(/\s{2,}/g, ' ');
  return {
    ...base,
    expression: stage.expression,
    expressionLabel: labelOf(EXPRESSION_LABELS, stage.expression),
    actionLabel: stage.label + (stage.actionHint ? ' · ' + stage.actionHint : ''),
    prompt,
  };
}

/* 阶段不再手动选：跟着姿势走，姿势已经说清楚的就不重复 */
const STAGE_FOLLOW = {
  'orgasm, climax': ['orgasm', 'squirting', 'body trembling', 'legs trembling', 'toes curling', 'gripping bedsheet', 'clutching pillow', 'hand between legs', 'knees weak'],
  'after sex, exhausted': ['after sex', 'afterglow', 'lying limp', 'messy hair', 'cum on body', 'cum on stomach', 'cum dripping', 'cum overflow', 'panting', 'under blanket', 'sitting up tired'],
  'fellatio, oral': ['fellatio', 'deepthroat', 'cum in mouth', 'swallowing', 'licking glans', 'licking testicles'],
  'handjob': ['handjob', 'handjob cumshot'],
  'paizuri': ['paizuri', 'paizuri cumshot'],
  'undressing': ['undressing herself', 'undressing', 'changing clothes'],
  'kissing': ['kissing'],
};
const STAGE_MID = new Set([
  'missionary', 'cowgirl', 'doggystyle', 'standing sex', 'spooning', 'prone bone', 'mating press',
  'reverse cowgirl', 'lifted legs', 'suspended congress', 'lotus', 'against wall', 'sitting on lap',
  'straddling', 'face to face', 'back hug', 'leg lock', '69', 'fingering', 'masturbation', 'vibrator',
  'dildo', 'anal', 'breast grab', 'on all fours', 'bent over', 'squatting', 'leg lift', 'spread legs',
  'kneeling', 'on bed', 'on stomach', 'presenting', 'legs up', 'face down ass up', 'holding own breasts',
  'grinding on him', 'arched back', 'mutual masturbation', 'tribadism', 'scissoring', 'facesitting',
  'cunnilingus', 'strapon',
]);
function stageForAction(...input) {
  const tags = input.flatMap((x) => String(x || '').split(',').map((s) => s.trim()).filter(Boolean));
  if (!tags.length) return '';
  for (const [words, list] of Object.entries(STAGE_FOLLOW)) {
    if (tags.some((t) => list.includes(t))) return words;
  }
  if (!tags.some((t) => STAGE_MID.has(t))) return '';
  return 'sex, mid-thrust';
}

/* 淫水程度：从干到喷 */
const WET_LEVELS = [
  ['不流', ''],
  ['少量', 'wet pussy, pussy juice'],
  ['一小片', 'wet pussy, pussy juice, dripping, wet sheets'],
  ['一大片', 'dripping wet pussy, pussy juice, soaked, wet sheets, puddle'],
  ['喷出来', 'squirting, female ejaculation, pussy juice, orgasm'],
];
const WET_RANDOM = '__random__';
function labelOfTattoo(list, tag) {
  if (isEnName()) return tag || '';
  const hit = list.find(([, t]) => t === tag);
  return hit ? hit[0] : tag;
}
function wetTag(level) {
  if (!level) return '';
  if (level === WET_RANDOM) {
    /* 随机只在「有」的几档里抽，免得随机出来还是不流 */
    level = pickOne(WET_LEVELS.filter(([label]) => label !== '不流').map(([label]) => label));
  }
  const hit = WET_LEVELS.find((x) => x[0] === level);
  return hit ? hit[1] : '';
}

const UNDRESS = [
  ['穿好', 'dressed'], ['半脱', 'undressed'], ['敞开', 'open clothes'],
  ['上衣半脱', 'shirt lifted'], ['裙子掀起', 'skirt lifted'], ['只穿内衣', 'underwear only'],
  ['裸体', 'completely nude'],
  ['解开衬衫', 'open shirt'], ['内衣半脱', 'bra pulled down'], ['内裤半脱', 'panties pulled aside'],
  ['只穿内裤', 'panties only'], ['只穿上衣', 'shirt only'],
];

/* 穿脱按部位：每个部位各自选，组合出「没穿衣服但穿着袜子」这种 */
const UNDRESS_PARTS = [
  { key: 'top', label: '上衣', tags: { half: 'shirt lifted', open: 'open shirt', off: 'topless' } },
  { key: 'bottom', label: '下装', tags: { half: 'skirt lifted', open: 'pants down', off: 'bottomless' } },
  { key: 'bra', label: '内衣', tags: { half: 'bra pulled down', open: 'open bra', off: 'no bra' } },
  { key: 'panties', label: '内裤', tags: { half: 'panties pulled aside', open: 'panties pulled down', off: 'no panties', aside: 'panties aside, side-tie panties, pussy visible' } },
  { key: 'socks', label: '袜子', tags: { half: 'socks down', open: '', off: 'barefoot' } },
  { key: 'shoes', label: '鞋子', tags: { half: 'one shoe off', open: '', off: 'barefoot' } },
];
const UNDRESS_CHOICES = [['', '不选'], ['keep', '穿好'], ['half', '半脱'], ['open', '敞开'], ['aside', '拨到一边'], ['off', '脱下']];

/* 每套衣服有哪些部位：默认六个部位都有（含内衣内裤），只登记真正缺的 */
const ALL_UNDRESS_PARTS = ['top', 'bottom', 'bra', 'panties', 'socks', 'shoes'];
const OUTFIT_COVER = {
  'bikini, straw hat, sandals': ['bra', 'panties', 'shoes'],
  'bikini': ['bra', 'panties'], 'micro bikini': ['bra', 'panties'], 'sling bikini': ['bra', 'panties'],
  'string bikini': ['bra', 'panties'], 'side-tie bikini': ['bra', 'panties'],
  'lingerie': ['bra', 'panties'], 'crotchless lingerie': ['bra', 'panties'], 'underwear only': ['bra', 'panties'],
  'lace bodysuit': ['top', 'bottom'], 'lace babydoll': ['top', 'bottom'], 'teddy lingerie': ['top', 'bottom'],
  'chemise': ['top', 'bottom'], 'leotard': ['top', 'bottom'], 'sheer leotard': ['top', 'bottom'],
  'fishnet bodysuit': ['top', 'bottom'], 'crotchless bodysuit': ['top', 'bottom'], 'latex bodysuit': ['top', 'bottom'],
  'pasties': ['bra'], 'plunge bra': ['bra'], 'open bra': ['bra'], 'cupless bra': ['bra'], 'cage bra': ['bra'],
  'swimsuit': ['top', 'bottom', 'shoes'], 'school swimsuit': ['top', 'bottom'],
  'bunny suit': ['top', 'bottom', 'shoes'], 'bunny girl': ['top', 'bottom', 'shoes'],
  'apron only': ['top'], 'bath towel': ['top'], 'bathrobe': ['top', 'bottom'],
  'completely nude': [], 'nude': [],
};
function outfitCoverage(tag) {
  const key = String(tag || '').trim().toLowerCase();
  if (!key || key === 'lora' || key === 'original') return ALL_UNDRESS_PARTS.slice();
  if (OUTFIT_COVER[key]) return OUTFIT_COVER[key].slice();
  if (/bikini|lingerie|panties|underwear|\bbra\b|thong|g-string|c-string|crotchless/.test(key)) return ['bra', 'panties'];
  if (/swimsuit|swim ?wear/.test(key)) return ['top', 'bottom', 'shoes'];
  if (/leotard|bodysuit/.test(key)) return ['top', 'bottom'];
  if (/nude|naked/.test(key)) return [];
  return ALL_UNDRESS_PARTS.slice();
}
function pruneUndressParts() {
  const cover = outfitCoverage(state.outfit);
  if (!state.undressParts) state.undressParts = {};
  for (const p of UNDRESS_PARTS) {
    if (!cover.includes(p.key)) state.undressParts[p.key] = '';
  }
}

function computeUndress(enabled, outfitTag = state.outfit) {
  const parts = (enabled && state.undressParts) || {};
  const cover = outfitCoverage(outfitTag);
  const tags = [];
  for (const p of UNDRESS_PARTS) {
    if (!cover.includes(p.key)) continue;
    const v = parts[p.key] || '';
    if (!v || v === 'keep') continue;
    const t = p.tags[v] || '';
    if (t) tags.push(...t.split(',').map((s) => s.trim()).filter(Boolean));
  }
  const core = ['top', 'bottom', 'bra', 'panties'].filter((k) => cover.includes(k));
  const fullyNude = !!enabled && core.length > 0 && core.every((k) => parts[k] === 'off');
  /* 衣服全脱、袜子留着 → 「只穿袜子」，别再塞 completely nude 跟它打架 */
  const socksOnly = fullyNude && parts.socks === 'keep' && parts.shoes !== 'keep';
  /* 上衣和下装都脱了、内衣还留着 → 「只穿内衣」；这时服装支不能再挂 */
  const topOff = cover.includes('top') && parts.top === 'off';
  const bottomOff = cover.includes('bottom') && parts.bottom === 'off';
  const underwearOnly = !!enabled && !fullyNude && topOff && bottomOff;
  return { tags: [...new Set(tags)], fullyNude, socksOnly, underwearOnly };
}

/* 姿势里带衣服 / 脱衣动作的，穿脱把对应部位脱了就换成中性动作 */
const POSE_CLOTHES_SWAP = [
  { re: /lifting shirt/gi, to: 'hands on chest', part: 'top' },
  { re: /flashing|exhibitionism|public nudity/gi, to: 'presenting body', part: 'top' },
  { re: /lifting skirt/gi, to: 'hands on thighs', part: 'bottom' },
  { re: /pulling panties aside/gi, to: 'hand between legs', part: 'panties' },
  { re: /undressing herself|undressing/gi, to: 'hands behind back', part: 'top' },
  { re: /changing clothes/gi, to: 'standing', part: 'top' },
  { re: /taking off jacket/gi, to: 'hands on hips', part: 'top' },
  { re: /adjusting clothes/gi, to: 'hands on waist', part: 'top' },
  { re: /adjusting stockings/gi, to: 'touching thigh', part: 'socks' },
  { re: /putting on socks|putting on shoes|tying shoes/gi, to: 'legs crossed', part: 'shoes' },
  { re: /tying ribbon/gi, to: 'hands at collar', part: 'top' },
  { re: /holding own breasts|bra lift/gi, to: 'hands on own breasts', part: 'top' },
  { re: /masturbating through panties/gi, to: 'fingering herself', part: 'panties' },
  { re: /pantyhose feet/gi, to: 'touching thigh', part: 'socks' },
];
function neutralizePoseForUndress(tag) {
  if (!tag) return tag;
  const parts = state.undressParts || {};
  const allOff = ['top', 'bottom', 'bra', 'panties'].every((k) => parts[k] === 'off');
  const isOff = (part) => allOff || (part && parts[part] === 'off');
  let out = String(tag);
  for (const { re, to, part } of POSE_CLOTHES_SWAP) {
    re.lastIndex = 0;
    if (re.test(out) && isOff(part)) {
      re.lastIndex = 0;
      out = out.replace(re, to);
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/* 姿势里焊了手上动作的，选了「手上动作」卡之后把这些短语摘掉，手只由那张卡管 */
const HAND_POSE_PHRASES = [
  'holding cup with both hands', 'rubbing hands together', 'hugging knees on floor', 'resting head on arms',
  'hands on armrests', 'hand on knee', 'hand on throat', 'hand between legs', 'hands behind back', 'arms behind head', 'hands on knees', 'hugging own body', 'covering mouth', 'tucking hair behind ear', 'adjusting stockings', 'adjusting clothes', 'adjusting hair',
  'touching cheek', 'touching own hair', 'touching hair', 'finger to lips', 'holding own breasts',
  'fingering herself', 'rubbing herself', 'holding vibrator', 'sucking finger', 'licking finger',
  'pulling panties aside', 'hand on crotch', 'bra lift', 'cupping breasts', 'spreading pussy',
  'hugging pillow', 'holding pillow', 'hugging a plushie', 'holding mug', 'holding cup', 'holding flower',
  'holding bag', 'holding balloon', 'holding sheet music', 'holding tray', 'holding documents',
  'holding phone', 'holding brush', 'holding palette', 'holding popcorn', 'holding drink', 'holding books',
  'holding book', 'playing guitar', 'playing violin', 'playing piano', 'writing', 'cooking',
  'drinking tea', 'eating snack', 'petting cat', 'crossing arms', 'peace sign', 'waving',
  'stretching arms', 'hugging knees', 'blowing on hands', 'self-touch', 'groping breast',
];
const HAND_POSE_RE = new RegExp(
  HAND_POSE_PHRASES.slice().sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi',
);
function neutralizePoseForHands(tag, enabled = !!state.hands) {
  if (!enabled || !tag) return tag;
  let t = String(tag).replace(HAND_POSE_RE, '');
  t = t.replace(/,\s*,/g, ',').replace(/^\s*,\s*/, '').replace(/\s*,\s*$/, '').replace(/\s+/g, ' ').trim();
  return t;
}

const UNDRESS_NAMES = { top: '上衣', bottom: '下装', bra: '内衣', panties: '内裤', socks: '袜子', shoes: '鞋子' };const UNDRESS_STATE_LABELS = { keep: '穿好', half: '半脱', open: '敞开', aside: '拨到一边', off: '脱下' };
function undressSummary() {
  const parts = state.undressParts || {};
  const cover = outfitCoverage(state.outfit);
  const picked = UNDRESS_PARTS.filter((p) => cover.includes(p.key) && UNDRESS_STATE_LABELS[parts[p.key]]);
  if (!picked.length) return '';
  const core = ['top', 'bottom', 'bra', 'panties'].filter((k) => cover.includes(k));
  if (core.length && core.every((k) => parts[k] === 'off') && parts.socks === 'keep' && parts.shoes !== 'keep') return '只穿袜子';
  const fullyNude = core.length && core.every((k) => parts[k] === 'off');
  if (!fullyNude && cover.includes('top') && parts.top === 'off' && cover.includes('bottom') && parts.bottom === 'off') return '只穿内衣';
  if (picked.every((p) => parts[p.key] === 'keep')) return '全穿好';
  return picked.filter((p) => parts[p.key] !== 'keep')
    .map((p) => UNDRESS_NAMES[p.key] + UNDRESS_STATE_LABELS[parts[p.key]]).join(' / ');
}
function renderUndressParts() {
  const box = $('#undressParts');
  if (!box) return;
  const cover = outfitCoverage(state.outfit);
  box.innerHTML = UNDRESS_PARTS.map((p) => {
    const on = cover.includes(p.key);
    const cur = on ? ((state.undressParts && state.undressParts[p.key]) || '') : '';
    return `<div class="undress-row ${on ? '' : 'disabled'}" title="${on ? '' : '这套衣服没有这个部位'}"><span>${UNDRESS_NAMES[p.key]}</span>${
      UNDRESS_CHOICES.filter(([v]) => v === '' || v === 'keep' || !!p.tags[v]).map(([v, l]) =>
        `<button class="undress-choice ${cur === v ? 'on' : ''}" ${on ? '' : 'disabled'} data-undress-part="${p.key}" data-undress-val="${v}">${l}</button>`).join('')
    }</div>`;
  }).join('');
}
function openUndressModal() {
  pruneUndressParts();
  renderUndressParts();
  $('#undressModal').classList.remove('hidden');
}
function closeUndressModal() {
  $('#undressModal').classList.add('hidden');
}
const TATTOO_POSITIONS = [
  ['无', ''], ['下腹·淫纹', 'pubic tattoo, womb tattoo'], ['后腰', 'tramp stamp'], ['大腿', 'thigh tattoo'],
  ['手臂', 'arm tattoo'], ['后背', 'back tattoo'], ['胸前', 'chest tattoo'], ['胸下', 'underboob tattoo'],
  ['脖子', 'neck tattoo'], ['肩', 'shoulder tattoo'], ['锁骨', 'collarbone tattoo'], ['舌', 'tongue tattoo'],
  ['私处', 'crotch tattoo'],
];
/* 性器官附近的位置正常模式不显示；舌 / 后腰 / 胸下这类不算 */
const ADULT_TATTOO_TAGS = new Set(TATTOO_POSITIONS
  .filter(([, t]) => /pubic tattoo|crotch tattoo|womb tattoo|ass tattoo|hip tattoo|thigh tattoo, band tattoo/i.test(t))
  .map(([, t]) => t));
const TATTOO_PATTERNS = [
  ['无', ''], ['心形', 'heart-shaped tattoo'], ['玫瑰', 'rose tattoo'], ['蝴蝶', 'butterfly tattoo'],
  ['星星', 'star tattoo'], ['蛇', 'snake tattoo'], ['符文', 'rune tattoo'], ['魔法阵', 'magic circle tattoo'],
  ['藤蔓', 'vine tattoo'], ['樱花', 'cherry blossom tattoo'], ['龙', 'dragon tattoo'], ['翅膀', 'wing tattoo'],
  ['十字', 'cross tattoo'], ['月亮', 'moon tattoo'], ['条形码', 'barcode tattoo'], ['正字计数', 'tally marks'],
  ['文字', 'text tattoo, lettering'],
];
const SHOTS = [
  ['全身', 'full body'], ['中景', 'medium shot'], ['七分身', 'cowboy shot'], ['上半身', 'upper body'],
  ['面部特写', 'face focus'], ['远景', 'wide shot'], ['大远景', 'extreme wide shot'], ['半身特写', 'upper body close-up'],
  ['足部特写', 'foot focus, feet close-up'], ['脚底特写', 'soles, soles toward viewer'], ['腿部特写', 'leg focus, thighs close-up'], ['下半身特写', 'lower body, thighs and feet'],
  ['腋部特写', 'armpit focus, armpit close-up'], ['胸部特写', 'breast focus, breasts close-up, chest focus'], ['小穴特写', 'pussy focus, pussy close-up, crotch focus'],
];
const ADULT_SHOTS = new Set(['pussy focus, pussy close-up, crotch focus']);
const ANGLES = [
  ['正面', 'straight-on'], ['俯视', 'from above'], ['仰视', 'from below'], ['侧面', 'from side'],
  ['过肩', 'over shoulder'], ['第一人称', 'pov'], ['荷兰角', 'dutch angle'], ['后视', 'rear view'],
];
const LIGHTS = [
  ['自然光', 'sunlight'], ['暖光', 'warm light'], ['霓虹', 'neon light'], ['逆光', 'rim light'],
  ['烛光', 'candlelight'], ['月光', 'moonlight'], ['屏幕光', 'screen light'], ['舞台光', 'stage lighting'],
  ['台灯', 'desk lamp light'], ['冷光', 'cold light'], ['窗光', 'window light'], ['车灯', 'car headlights'],
];
const TIMES = [
  ['白天', 'day'], ['黄昏', 'dusk'], ['夜晚', 'night'], ['清晨', 'morning'],
  ['深夜', 'late night'], ['下午', 'afternoon'],
];
function pairLabel(list, tag) {
  if (isEnName()) return tag || '';
  const hit = list.find((x) => x[1] === tag);
  return hit ? hit[0] : tag;
}

const QUICK_STYLES = {
  sfw: [
    { label: '日常', scene: 'classroom', outfit: 'school uniform, pleated skirt, black knee socks, loafers', action: 'sitting', expression: 'soft smile' },
    { label: '夜景', scene: 'rooftop', time: 'night', outfit: 'casual clothes, cardigan, skirt, loafers', action: 'looking at sky', expression: 'relieved' },
    { label: '泳装', scene: 'swimming pool', outfit: 'one-piece swimsuit, sandals', action: 'standing', expression: 'smile' },
    { label: '双人', scene: 'living room', outfit: 'pajamas, white socks, slippers', action: 'hugging each other', expression: 'smile', people: 'duo' },
    { label: '外出', scene: 'street', outfit: 'casual clothes, cardigan, skirt, loafers', action: 'walking', expression: 'smile' },
    { label: '咖啡', scene: 'cafe', outfit: 'casual clothes, cardigan, skirt, loafers', action: 'sitting', expression: 'soft smile' },
    { label: '图书馆', scene: 'library', outfit: 'school uniform, pleated skirt, black knee socks, loafers', action: 'reading', expression: 'serious' },
    { label: '海边', scene: 'beach', outfit: 'one-piece swimsuit, sandals', action: 'standing', expression: 'smile' },
    { label: '雨天', scene: 'rainy street', outfit: 'trench coat', action: 'holding umbrella', expression: 'soft smile' },
    { label: '雪景', scene: 'snowy field', outfit: 'winter coat, turtleneck, plaid skirt, black tights, boots', action: 'standing', expression: 'blush' },
    { label: '祭典', scene: 'festival', outfit: 'yukata, obi, sandals, hair ornament', action: 'walking', expression: 'smile' },
    { label: '音乐', scene: 'music room', outfit: 'school uniform, pleated skirt, black knee socks, loafers', action: 'playing piano', expression: 'soft smile' },
    { label: '野餐', scene: 'garden', outfit: 'casual clothes, cardigan, skirt, loafers', action: 'sitting', expression: 'smile' },
    { label: '花田', scene: 'flower field', outfit: 'casual clothes, cardigan, skirt, loafers', action: 'looking back', expression: 'soft smile' },
    { label: '冬街', scene: 'winter street', outfit: 'winter coat, turtleneck, plaid skirt, black tights, boots', action: 'walking', expression: 'blush' },
    { label: '甜品店', scene: 'dessert shop', outfit: 'casual clothes, cardigan, skirt, loafers', action: 'eating', expression: 'smile' },
    { label: '地铁', scene: 'subway', outfit: 'office lady, white blouse, pencil skirt, black pantyhose', action: 'standing', expression: 'neutral expression' },
    { label: '和风庭院', scene: 'japanese garden', outfit: 'kimono, obi, tabi, sandals', action: 'walking', expression: 'soft smile' },
    { label: '摄影棚', scene: 'photo studio', outfit: 'office lady, white blouse, pencil skirt, black pantyhose', action: 'posing', expression: 'confident' },
    { label: '雨天等车', scene: 'bus stop rain', outfit: 'trench coat', action: 'holding umbrella', expression: 'looking away' },
  ],
  r18: [
    { label: '做爱', scene: 'bedroom', outfit: 'lingerie', action: 'missionary', expression: 'ahegao', people: 'duo' },
    { label: '后入', scene: 'love hotel', outfit: 'completely nude', action: 'doggystyle', expression: 'ahegao', people: 'duo' },
    { label: '骑乘', scene: 'bedroom', outfit: 'lingerie', action: 'cowgirl', expression: 'seductive expression', people: 'duo' },
    { label: '口交', scene: 'hotel room', outfit: 'undressed', action: 'fellatio', expression: 'seductive expression', people: 'duo' },
    { label: '自慰', scene: 'bedroom', outfit: 'completely nude', action: 'masturbation', expression: 'half-closed eyes' },
    { label: '露出', scene: 'street', time: 'night', outfit: 'open shirt', action: 'exhibitionism', expression: 'shy' },
    { label: '淋浴', scene: 'shower', outfit: 'completely nude', action: 'standing', expression: 'seductive expression' },
    { label: '情趣', scene: 'love hotel', outfit: 'bunny suit', action: 'kneeling', expression: 'seductive expression' },
    { label: '双人成人', scene: 'bedroom', outfit: 'lingerie', action: 'hugging each other', expression: 'seductive expression', people: 'duo' },
    { label: '浴室', scene: 'shower', outfit: 'wet clothes', action: 'standing', expression: 'lewd expression' },
    { label: '情趣酒店', scene: 'love hotel', outfit: 'latex', action: 'bent over', expression: 'lewd expression', people: 'duo' },
    { label: '夜街露出', scene: 'street', time: 'night', outfit: 'trench coat', action: 'flashing', expression: 'shy' },
    { label: '办公室夜', scene: 'office', time: 'night', outfit: 'office lady, white blouse, pencil skirt, black pantyhose', action: 'bent over', expression: 'lewd expression', people: 'duo' },
    { label: '浴场', scene: 'public bath', outfit: 'bath towel', action: 'in water', expression: 'seductive expression' },
    { label: '电梯', scene: 'elevator', outfit: 'office lady, white blouse, pencil skirt, black pantyhose', action: 'against wall', expression: 'nervous', people: 'duo' },
    { label: '雨夜', scene: 'rainy street', time: 'night', outfit: 'office lady, white blouse, pencil skirt, black pantyhose', action: 'against wall', expression: 'seductive expression', people: 'duo' },
    { label: '影院', scene: 'private theater', outfit: 'casual clothes, cardigan, skirt, loafers', action: 'fellatio', expression: 'seductive expression', people: 'duo' },
    { label: '帐篷', scene: 'tent', outfit: 'casual clothes, cardigan, skirt, loafers', action: 'cowgirl', expression: 'blissful expression', people: 'duo' },
    { label: '后台', scene: 'backstage', outfit: 'idol costume, frilled skirt, white thighhighs, boots', action: 'kneeling', expression: 'seductive expression', people: 'duo' },
    { label: '值班室', scene: 'hospital duty', outfit: 'nurse outfit', action: 'against wall', expression: 'nervous', people: 'duo' },
    { label: '教师办公室', scene: 'teacher office', outfit: 'office lady, white blouse, pencil skirt, black pantyhose', action: 'bent over', expression: 'lewd expression', people: 'duo' },
    { label: '榻榻米', scene: 'tatami room', outfit: 'yukata, obi, sandals, hair ornament', action: 'cowgirl', expression: 'blissful expression', people: 'duo' },
    { label: '楼梯间', scene: 'stairwell', outfit: 'office lady, white blouse, pencil skirt, black pantyhose', action: 'against wall', expression: 'seductive expression', people: 'duo' },
    { label: '酒会', scene: 'party', outfit: 'evening gown', action: 'standing sex', expression: 'lewd expression', people: 'duo' },
    { label: '私人泳池', scene: 'swimming pool', outfit: 'micro bikini', action: 'standing sex', expression: 'seductive expression', people: 'duo' },
  ],
};

function pickOne(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function sceneByTag(tag) {
  return SCENES.find((s) => s.tag === tag) || null;
}

function modeScenes() {
  return SCENES.filter((s) => state.r18 || s.mode !== 'r18');
}

/* 上下一套的服装统一叫「套装」；比基尼 / 连衣裙 / 泳装 / 单件上装下装这些不加 */
const SINGLE_PIECE_RE = /(bikini|swimsuit|swim ?wear|lingerie|panties|underwear|\bbra\b|thong|g-string|c-string|leotard|bodysuit|dress|gown|cheongsam|kimono|yukata|hanfu|skirt|jeans|pants|leggings|shorts|camisole|tank top|crop top|t-shirt|shirt|blouse|sweater|cardigan|hoodie|coat|jacket|cape|poncho|apron|towel|robe|pasties|nude|naked|stockings|pantyhose|turtleneck|bustier|corset|fishnet|collar|babydoll|chemise|wet clothes)/;
function outfitLabel(tag) {
  if (isEnName()) return tag || '';
  const base = OUTFIT_LABELS[tag] || tag;
  if (/套装/.test(base)) return base;
  const key = String(tag || '').toLowerCase();
  if (!key || SINGLE_PIECE_RE.test(key)) return base;
  return base + '套装';
}
function labelOf(map, tag) {
  if (isEnName()) return tag || '';
  if (map === OUTFIT_LABELS) return outfitLabel(tag);
  return map[tag] || tag;
}

function charLooksChildlike() {
  const c = state.char;
  if (!c) return false;
  const text = [c.body_words, c.feature_words, c.trigger, c.name, c.name_zh]
    .filter(Boolean).join(' ').toLowerCase();
  return /\b(loli|child|toddler|teen|small body|flat chest)\b/.test(text);
}

/* 词路用的权重包装：单段词才套括号；多段（带逗号）或已带括号/冒号的整串不动，
   避免把一整串衣服当一个 token 加权，也避免 ((x:1.3):1.05) 这种叠出来的怪东西。 */
function w(tag, n) {
  const t = String(tag == null ? '' : tag).trim();
  if (!t || n == null) return t;
  if (Math.abs(Number(n) - 1) < 1e-6) return t;
  if (/[,()]/.test(t) || t.includes(':')) return t;
  return `(${t}:${Number(n)})`;
}

const LAYER_LABEL = { quality: '画质', identity: '身份', body: '身体', wear: '衣着', cam: '构图', pose: '姿态', interact: '互动', face: '面孔', env: '环境', tail: '收尾' };

/* 场景词性：统一成「介词 + the + 地点」，别裸着名词进提示词。
   默认 in the，露天/地面类用 on the，岸边用 by the，站牌/车站用 at the。 */
const SCENE_PREP = {
  'beach': 'on', 'beach night': 'on', 'street': 'on', 'night street': 'on',
  'rainy street': 'on', 'rainy night street': 'on', 'rooftop': 'on', 'rooftop night': 'on',
  'mountain': 'on', 'snowy field': 'on', 'snow field': 'on', 'picnic field': 'on',
  'riverside': 'by', 'riverbank': 'by', 'lakeside': 'by',
  'bus stop': 'at', 'bus stop rain': 'at', 'train station': 'at', 'school gate': 'at',
};
function scenePhrase(tag) {
  const t = String(tag || '').trim();
  if (!t) return '';
  const p = SCENE_PREP[t.toLowerCase()] || 'in';
  /* 「xxx night」这种带时间后缀的场景：拆成「in the xxx at night」，比 in the pool night 顺 */
  if (/\snight$/i.test(t)) return `${p} the ${t.replace(/\snight$/i, '')} at night`;
  return `${p} the ${t}`;
}

/* 动作词性：动作层统一成动名词短语。名词形式的几个动作转一下，
   不然 sitting / reading / masturbation 混在一层里，模型读着别扭。 */
const ACTION_VERB = {
  'masturbation': 'masturbating',
  'fellatio': 'performing fellatio',
  'cunnilingus': 'performing cunnilingus',
  'paizuri': 'performing paizuri',
  'handjob': 'performing handjob',
  'footjob': 'performing footjob',
  'vibrator': 'using a vibrator',
  'dildo': 'using a dildo',
  'anal': 'anal sex',
  'sex': 'having sex',
};
function actionPhrase(tag) {
  const t = String(tag || '').trim();
  if (!t) return '';
  return ACTION_VERB[t.toLowerCase()] || t;
}

function buildSixRecipe() {
  const pool = modeScenes();
  const scenePick = state.scene ? sceneByTag(state.scene) : null;
  const scene = (scenePick && (state.r18 || scenePick.mode !== 'r18')) ? scenePick : pickOne(pool);
  const preset = state.charPreset || null;
  const hasPerson = !!(state.char || preset);
  /* 角色被清掉后不要把 ORIGINAL 留在服装位：它不是词，会原样进 prompt */
  let outfitChoice = (state.outfit === 'ORIGINAL' && !hasPerson) ? '' : state.outfit;
  if (outfitChoice && !state.r18 && ADULT_OUTFITS.includes(outfitChoice)) outfitChoice = '';
  if (outfitChoice === 'LORA' && !state.outfitLora) outfitChoice = '';
  const wantsOriginal = hasPerson && (!outfitChoice || outfitChoice === 'ORIGINAL');
  const outfitLoraPicked = !!state.outfitLora;
  const actionLoraOn = !!state.actionLora;
  const outfitPool = (scene ? sceneOutfitSets(scene) : allOutfits()).filter((t) => sceneOutfitCompatible(scene && scene.tag, t));
  let outfit = wantsOriginal ? '' : (outfitChoice === 'LORA' ? '' : (outfitChoice || pickOne(outfitPool) || ''));
  if (outfit && !sceneOutfitCompatible(scene && scene.tag, outfit)) outfit = '';
  let keepCharClothes = wantsOriginal;
  /* 穿脱按这一张实际穿的算：服装留空时先把场景服装抽出来，再算覆盖率。
     不然会出「随机到 lingerie，却加 shirt lifted」这种词。 */
  const outfitForCover = outfitLoraPicked ? 'LORA' : (wantsOriginal ? 'ORIGINAL' : outfit);
  const ud = computeUndress(state.r18, outfitForCover);
  const outfitLoraOff = outfitLoraPicked && (ud.fullyNude || ud.underwearOnly);
  const outfitLoraOn = outfitLoraPicked && !outfitLoraOff;
  const bodyPool = (state.r18 && !isDevBuild()) ? BODY_TYPES.filter((b) => ADULT_OK_BODY_LABELS.has(b.label)) : BODY_TYPES;
  const useBody = (!state.char && !preset) || !!state.bodyOverride;
  const body = useBody ? (bodyPool.find((b) => b.tag === state.body) || pickOne(bodyPool)) : null;
  const bodyLabel = (state.char || preset) && !state.bodyOverride ? '角色原装' : (body ? body.label : '随机');
  const people = state.people || 'solo';
  const head = people === 'duo' ? '1girl, 1boy, hetero couple' : '1girl, solo';
  const duoPoses = duoPosePairs().map((x) => x[1]);
  const duoActs = duoActPairs().map((x) => x[1]).filter((a) => actionUndressCompatible(a, ud) && actionSceneCompatible(a, scene.tag));
  const soloActions = filterActionsForScene(allActions(), scene.tag);
  const soloPoses = poseTagsOf(soloActions);
  const soloActs = actTagsOf(soloActions).filter((a) => actionUndressCompatible(a, ud) && actionSceneCompatible(a, scene.tag));
  const propList = state.r18 ? PROPS_R18 : PROPS_SFW;
  const propPool = propList.filter(([, t]) => (people !== 'solo' || !PROPS_NEED_MALE.has(t))
    && propSceneCompatible(t, scene.tag) && propHandCompatible(t, state.hands));
  const props = state.useProps
    ? (state.props && propList.some(([, t]) => t === state.props)
      && (people !== 'solo' || !PROPS_NEED_MALE.has(state.props))
      && propSceneCompatible(state.props, scene.tag) && propHandCompatible(state.props, state.hands)
      ? state.props : (pickOne(propPool) || [])[1] || '')
    : '';
  const handsList = state.r18 ? HANDS_R18 : HANDS_SFW;
  const hands = state.hands && handsList.some(([, t]) => t === state.hands)
    && !(people === 'solo' && HANDS_PARTNER.has(state.hands))
    && !((ud.tags.length || ud.fullyNude || ud.underwearOnly) && HANDS_UNDRESS.has(state.hands)) ? state.hands : '';
  let pose = '';
  let action = '';
  if (!actionLoraOn) {
    if (people === 'duo') {
      pose = state.pose && duoPoses.includes(state.pose) ? state.pose : pickOne(duoPoses);
      const acts = duoActs.filter((a) => poseActionCompatible(pose, a));
      action = state.action && acts.includes(state.action) ? state.action : (pickOne(acts) || '');
    } else {
      pose = state.pose && !DUO_ONLY_ACTIONS.has(state.pose) && (state.r18 || !ADULT_TAGS.has(state.pose))
        ? state.pose : (pickOne(soloPoses.length ? soloPoses : ['standing']) || 'standing');
      const acts = soloActs.filter((a) => poseActionCompatible(pose, a));
      action = state.action && acts.includes(state.action) ? state.action : (pickOne(acts) || '');
    }
  }
  /* 姿势里焊了衣服 / 手部动作的：穿脱、手上、道具任意一个占了位，就把对应短语摘掉 */
  pose = neutralizePoseForUndress(pose);
  pose = neutralizePoseForHands(pose, !!hands || !!props);
  action = neutralizePoseForUndress(action);
  action = neutralizePoseForHands(action, !!hands || !!props);
  const exprPool = expressionPoolFor(pose, action);
  const allExpr = state.r18 ? EXPRESSIONS_R18 : EXPRESSIONS_SFW;
  const expression = state.expression && allExpr.includes(state.expression) ? state.expression : pickOne(exprPool);
  /* 穿脱按部位：每处各选一档，最后拼成一组词；全脱时走裸体 / 只穿袜子 */
  let undressTags = ud.tags;
  const fullyNude = ud.fullyNude;
  if (fullyNude) {
    /* 裸体这个词由 outfit 那一位带（(completely nude:1.1)），别再重复塞一遍 */
    undressTags = ud.socksOnly ? ['socks only', 'socks'] : [];
    outfit = ud.socksOnly ? '' : 'completely nude';
    keepCharClothes = false;
  } else if (ud.underwearOnly) {
    /* 只脱了上衣和下装：别再让原服装 / 服装支把整套衣服穿回来 */
    outfit = 'underwear only';
    /* 这时不能带 topless / bottomless，否则和「还穿着内衣」打架 */
    undressTags = [];
    keepCharClothes = false;
  }
  if (outfitLoraPicked) keepCharClothes = false;
  const defaultShot = people === 'duo' ? 'medium shot' : 'full body';
  const shotPool = SHOTS.map(([, t]) => t).filter((s) => (state.r18 || !ADULT_SHOTS.has(s)) && poseShotCompatible(pose, action, s, state.angle));
  const shotFallback = SHOTS.map(([, t]) => t).filter((s) => (state.r18 || !ADULT_SHOTS.has(s)) && poseShotCompatible(pose, action, s, ''));
  const usableShots = shotPool.length ? shotPool : shotFallback;
  const preferredShot = state.shot && usableShots.includes(state.shot) ? state.shot : defaultShot;
  const shot = usableShots.includes(preferredShot) ? preferredShot : (usableShots[0] || preferredShot);
  const light = state.light || 'soft light';
  let angle = state.angle || '';
  if (angle && !poseShotCompatible(pose, action, shot, angle)) angle = '';
  let time = state.time || '';
  if (!sceneTimeCompatible(scene.tag, time)) time = '';
  /* 光照 / 时间和场景打架时，时间让位：夜景 + 白天、夜晚光 + 白天… */
  const lightText = String(light);
  const timeText = String(time);
  const lightNight = /(night|moonlight|candlelight|neon|screen light|stage lighting|car headlights)/i.test(lightText);
  const lightDay = /(sunlight|golden hour|window light|overcast|fluorescent)/i.test(lightText);
  const timeDay = /^(day|morning|noon|afternoon)$/i.test(timeText);
  const timeNight = /^(night|late night)$/i.test(timeText);
  if ((/night/i.test(scene.tag) || lightNight) && timeDay) time = '';
  if (lightDay && timeNight) time = '';
  const stage = state.r18 ? stageForAction(pose, action) : '';
  const second = null;
  const boost = (people === 'duo'
    ? [pose, action].map((t) => ACTION_BOOST[t]).filter(Boolean).join(', ')
    : '');
  const autoRole = people === 'duo' ? (DUO_ROLE_BOOST[pose] || DUO_ROLE_BOOST[action] || '') : '';
  const manualRole = people === 'duo' && state.duoRole && duoRoleCompatible(state.duoRole, pose)
    ? (DUO_ROLE_TEXT[state.duoRole] || '') : '';
  const duoRole = manualRole || autoRole;
  /* ---------- 词路：八层 ----------
     顺序 = 提示词顺序；每层只出一个说法。来源记 user / auto / random：
     user 是用户在格子里点的，random 是系统替他抽的（放本层后部、权重 ×0.95）。 */
  const layers = [];
  const seenTags = new Set();
  const pushLayer = (layer, text, from = 'user', weight = null) => {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return;
    const n = from === 'random' && weight != null ? Number((weight * 0.95).toFixed(3)) : weight;
    /* 同一段词只出一次（action 和 boost 都带 kissing 这种）；后端还会再兜一层去重 */
    const pieces = [];
    for (const p of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      const k = p.toLowerCase();
      if (seenTags.has(k)) continue;
      seenTags.add(k);
      pieces.push(p);
    }
    if (!pieces.length) return;
    layers.push({ layer, text: w(pieces.join(', '), n), from });
  };
  const fromPick = (chosen, actual) => ((chosen && actual === chosen) ? 'user' : 'random');

  /* L0 画质锚：压在最前，先定调 */
  pushLayer('quality', 'best quality', 'auto');

  /* L1 身份：头词 → trigger → 预设特征 → 原装 */
  pushLayer('identity', head, 'auto');
  /* 角色 trigger 是人工填的，比自动解析出来的特征词可靠；红发这类固有色就写在这里。 */
  if (state.char && state.char.trigger) {
    for (const t of String(state.char.trigger).split(/[,，]/).map((s) => s.trim()).filter(Boolean)) {
      pushLayer('identity', t, 'user');
    }
  }
  /* 预设角色没有 LoRA，人和衣服全靠词 */
  if (preset) {
    pushLayer('identity', preset.feature, 'user');
    if (keepCharClothes && preset.outfit) pushLayer('identity', preset.outfit, 'user');
  }
  if (second && second.feature_words) pushLayer('identity', second.feature_words, 'user');

  /* L2 身体：男方 → 阴茎 → 女主体型 → 纹身 */
  const actionText = [pose, action].filter(Boolean).join(' ');
  const stageSexual = /sex|penetration|fellatio|paizuri|handjob|cunnilingus|fingering|cum|creampie|orgasm|climax/i.test(stage || '');
  if (people === 'duo') {
    pushLayer('body', 'faceless male', 'auto');
    pushLayer('body', state.maleBody || 'male, medium build', state.maleBody ? 'user' : 'auto');
    /* 亲吻 / 拥抱 / 牵手 / 自拍这类不带男性生殖器；只有性行为动作或用户明确选了大小时才加 */
    if (state.r18 && (state.penis || stageSexual || PENIS_ACTION_RE.test(actionText)
      || /penetration|penis|sex|fellatio|paizuri|handjob|creampie|facial|cum/i.test(boost))) {
      pushLayer('body', state.penis || 'penis', state.penis ? 'user' : 'auto');
    }
  }
  if (body) pushLayer('body', body.tag, 'user');
  /* 纹身：先有位置才有图案和发光；性器官附近的位置正常模式不写 */
  const tattooPos = state.tattoo && (state.r18 || !ADULT_TATTOO_TAGS.has(state.tattoo)) ? state.tattoo : '';
  if (tattooPos) {
    pushLayer('body', tattooPos, 'user');
    if (state.tattooPattern) pushLayer('body', state.tattooPattern, 'user');
    if (state.tattooGlow === 'on') pushLayer('body', 'glowing tattoo', 'user');
  }

  /* L3 衣着：服装 → 穿脱 → 淫水 */
  if (outfit) pushLayer('wear', outfit, fromPick(state.outfit, outfit), 1.1);
  if (undressTags.length) pushLayer('wear', undressTags.join(', '), 'user');
  const wetWords = state.r18 && isSexualContext(pose, action, `${state.stage} ${stage}`) ? wetTag(state.wet) : '';
  if (wetWords) pushLayer('wear', wetWords, state.wet === WET_RANDOM ? 'random' : 'user');

  /* L4 构图：景别 → 角度。放在动作前，全身/半身这种全局约束先定，后面的动作词不会把画面拉近 */
  if (shot) pushLayer('cam', shot, state.shot && shot === state.shot ? 'user' : 'auto', 0.95);
  if (angle) pushLayer('cam', angle, 'user', 0.95);

  /* L5 姿态：姿势 + 动作合成一句（动作统一成动名词）→ 阶段 → 体位补充 → 主动 */
  const posePhrase = [pose, actionPhrase(action)].filter(Boolean).join(', ');
  if (posePhrase) pushLayer('pose', posePhrase, fromPick(state.pose, pose), 1.0);
  if (stage) pushLayer('pose', stage, 'auto', 1.05);
  if (boost) pushLayer('pose', boost, 'auto');
  if (duoRole) pushLayer('pose', duoRole, manualRole ? 'user' : 'auto');

  /* L6 互动：道具 → 用法 → 手上 */
  if (props) {
    pushLayer('interact', `with ${props}`, fromPick(state.props, props), 0.95);
    /* 道具得带「在怎么用」，不然模型只画成摆件或拿在手里 */
    const usage = PROP_USAGE[props] || '';
    /* 已经选了手上动作时，道具用法里「拿着 / 手里」那半句不再叠 */
    if (usage && !(hands && PROP_HAND_USAGE.test(usage))) pushLayer('interact', usage, 'auto', 0.9);
  }
  if (hands) pushLayer('interact', hands, 'user', 1.0);

  /* L7 面孔：表情 → 支撑 */
  pushLayer('face', expression, fromPick(state.expression, expression), 1.25);
  if (EXPRESSION_SUPPORT[expression]) pushLayer('face', EXPRESSION_SUPPORT[expression], 'auto', 1.05);

  /* L8 环境：场景 → 时间 → 光 */
  pushLayer('env', scenePhrase(scene.tag), fromPick(state.scene, scene.tag), 1.0);
  if (time) pushLayer('env', time, fromPick(state.time, time), 0.9);
  if (light) pushLayer('env', light, state.light ? 'user' : 'auto', 0.9);

  /* L9 收尾：看镜头 → 背景 → 附加词 */
  /* 嫌弃 / 傲娇 / 闭眼 / 背影这类本来就不看镜头，别硬塞 looking at viewer 把它拉回来 */
  const fromBehind = /from behind|rear view/i.test(`${shot} ${angle}`);
  const looksAway = /looking away|side glance|looking down|closed eyes|eyes closed|eyes rolled|blank|unfocused|empty eyes|averted|sleeping/i.test(`${expression} ${EXPRESSION_SUPPORT[expression] || ''}`);
  if (!fromBehind && !looksAway) pushLayer('tail', 'looking at viewer', 'auto', 0.9);
  pushLayer('tail', 'detailed background', 'auto', 0.85);
  for (const t of state.extra || []) pushLayer('tail', t, 'user');

  const prompt = layers.map((l) => l.text).join(', ');
  const nude = fullyNude || outfit === 'completely nude';
  const negative = DEFAULT_NEG
    + (nude ? ', (clothes:1.3), (dress:1.3), (shirt:1.3), (skirt:1.3), (bra:1.4), (panties:1.4)' : '')
    + (people === 'duo' ? ', fused bodies, merged bodies, conjoined, extra girl, third girl, extra person, extra limbs' : '')
    + (body && body.neg ? ', ' + body.neg : '');
  return {
    scene: scene.tag, sceneLabel: scene.label,
    outfit, outfitLabel: outfitLoraOn
      ? '服装支 · ' + (loraLabel(state.outfitLora) || '已选')
      : (keepCharClothes ? '原装' : (ud.socksOnly ? '只穿袜子' : (outfit ? labelOf(OUTFIT_LABELS, outfit) : '随机'))),
    action, actionLabel: actionLoraOn
      ? '动作支 · ' + (loraLabel(state.actionLora) || '已选')
      : [pose, action].filter(Boolean).map((t) => labelOf(ACTION_LABELS, t)).join(' + '),
    pose, poseLabel: labelOf(ACTION_LABELS, pose),
    expression, expressionLabel: labelOf(EXPRESSION_LABELS, expression),
    body: body ? body.tag : '', bodyLabel,
    keepOriginalClothes: keepCharClothes,
    outfitLora: outfitLoraOn,
    people, props, hands, stage, undress: undressTags.join(', '), shot, angle, light, time, negative,
    size: people === 'duo' ? '1216x832' : '832x1216',
    prompt,
    /* 分层词路：看最终词时按层 + 来源（user 点的 / auto 推的 / random 抽的）显示 */
    layers: layers.map((l) => ({ layer: l.layer, text: l.text, from: l.from })),
  };
}

const state = {
  cfg: null,
  token: '',
  options: null,
  chars: [],
  char: null,
  charPreset: null,
  r18: false,
  r18Note: '',
  extra: [],
  extraNeg: [],
  body: '',
  bodyOverride: false,
  scene: '',
  outfit: '',
  pose: '',
  action: '',
  expression: '',
  people: 'solo',
  duoRole: '',
  maleBody: '',
  penis: '',
  charOutfit: '',
  model: '',
  clip: '',
  vae: '',
  outfitLora: null,
  actionLora: null,
  auxLoras: [],
  auxIndex: -1,
  loraLists: { outfit: [], aux: [] },
  useProps: false,
  props: '',
  hands: '',
  stage: '',
  undress: '',
  undressParts: {},
  wet: '',
  tattoo: '',
  tattooPattern: '',
  tattooGlow: '',
  shot: '',
  angle: '',
  light: '',
  time: '',
  simpleCount: 1,
  busy: false,
  jobId: null,
  result: null,
  results: [],
  history: [],
  lastMode: 'simple',
  advSlots: {},
  models: null,
  page: 'create',
  lib: { q: '', category: '', work: '', tag: '', sort: 'name', preview: '', variants: false, offset: 0, total: 0, items: [], loading: false, done: false },
};

const isEnName = () => { try { return localStorage.getItem('v2-lang') === 'en'; } catch { return false; } };
/* 英文界面显示 LoRA 原名（中文译名只给中文界面查） */
const loraLabel = (it) => (it ? (isEnName() ? (it.name || it.name_zh || '') : (it.name_zh || it.name || '')) : '');
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
try {
  state.bodyOverride = localStorage.getItem('v2-body-override') === '1';
  state.r18 = localStorage.getItem('v2-r18') === '1';
} catch { /* ignore */ }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 看最终词：按八层显示，user 是点出来的、auto 是联动推的、random 是系统抽的 */
function renderPromptLayers(layers) {
  const box = $('#promptLayers');
  if (!box) return;
  const list = Array.isArray(layers) ? layers : [];
  if (!list.length) { box.innerHTML = ''; return; }
  const FROM = { user: '', auto: '联动', random: '随机' };
  box.innerHTML = list.map((l) => {
    /* 身份层的头词、画质锚是固定的（1girl, solo / best quality），不标「联动」 */
    const tag = ((l.layer === 'identity' || l.layer === 'quality') && l.from === 'auto') ? '' : FROM[l.from];
    return `<div class="pl-row${l.from === 'random' ? ' pl-rand' : ''}">`
      + `<span class="pl-n">${esc(LAYER_LABEL[l.layer] || l.layer)}</span>`
      + `<span class="pl-t">${esc(l.text)}</span>`
      + `${tag ? `<em>${tag}</em>` : ''}</div>`;
  }).join('');
}

function toast(msg, err = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2400);
}

async function api(path, opt = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opt.headers || {}) };
  if (state.token && opt.auth !== false) headers['X-API-Token'] = state.token;
  const r = await fetch(path, { ...opt, headers });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
  return data;
}
const write = (path, body, method = 'POST') => api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

function setStatus() {
  const o = state.options;
  const online = !!(o && o.online);
  const text = o ? (online ? (o.remote ? 'ComfyUI 远程在线' : 'ComfyUI 在线') : 'ComfyUI 没开') : '读模型中…';
  if ($('#topStatus')) {
    $('#topStatus').textContent = text;
    $('#topStatus').classList.toggle('on', online);
  }
  if ($('#railComfy')) $('#railComfy').textContent = online ? '在线' : '离线';
  if ($('#railDot')) $('#railDot').classList.toggle('on', online);
}

function pageMeta(page) {
  return {
    create: ['创作', '选一个角色，选一种风格，出一张。'],
    expert: ['专家', '模型、LoRA、词、权重全手填；不走六项随机。'],
    library: ['洛栈', '分类、作品、标签、触发词和预览图都在这里。'],
    models: ['模型', '底模 / 整包 / CLIP / VAE；能设默认、复制名字、删文件。'],
    records: ['记录', '按 prompt 反查以前出过什么、挂了哪几支。'],
    gallery: ['图库', '出图目录里的所有图；点开看大图，可以选着删。'],
    guide: ['教学', '怎么写词；新手看这一页就够。'],
  manual: ['说明', '两分钟上手：怎么配、每个页面干什么、出问题先查哪。'],
    settings: ['设置', 'ComfyUI、目录和模型；改完保存。'],
  }[page] || ['创作', ''];
}

function switchPage(page, push = true) {
  if (!['create', 'expert', 'library', 'models', 'records', 'gallery', 'guide', 'manual', 'settings'].includes(page)) page = 'create';
  state.page = page;
  for (const el of $$('[data-page]')) el.classList.toggle('hidden', el.id !== `page-${page}`);
  for (const el of $$('.railbtn')) el.classList.toggle('on', el.dataset.nav === page);
  const meta = pageMeta(page);
  $('#pageTitle').textContent = meta[0];
  $('#pageSub').textContent = meta[1];
  if (push) {
    try { history.replaceState(null, '', '#' + page); } catch { /* ignore */ }
  }
  if (page === 'library') loadLibrary(true);
  if (page === 'models') loadModelsPage();
  if (page === 'settings') { fillSettings(); loadBackups(); }
  if (page === 'expert') initExpert();
  if (page === 'gallery') { initGallery(); loadGallery(true); }
  if (page === 'guide') loadGuide();
  if (page === 'manual') loadManual();
}

/* ---------------- 教学页 ---------------- */

let guideLoaded = false;
let manualLoaded = false;

async function loadManual() {
  const box = $('#manualBody');
  if (!box || manualLoaded) return;
  try {
    const file = isEnName() ? '/v2/manual.en.html' : '/v2/manual.html';
    const r = await fetch(file, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    box.innerHTML = await r.text();
    manualLoaded = true;
  } catch (e) {
    box.innerHTML = `<div class="hint">说明页读取失败：${esc(e.message)}</div>`;
  }
}

/* 首次用：洛栈页顶部一张卡，点了/滚过就不再出现 */
function initFirstRun() {
  const box = $('#firstRun');
  if (!box) return;
  let done = false;
  try { done = localStorage.getItem('v2-firstrun-done') === '1'; } catch { /* ignore */ }
  if (done) return;
  box.classList.remove('hidden');
  if ($('#frTitle')) $('#frTitle').textContent = isEnName() ? 'First time here?' : '第一次用？';
  if ($('#frSub')) $('#frSub').textContent = isEnName()
    ? 'Two minutes in the manual: connect ComfyUI, set folders, make the first image.'
    : '两分钟看完「说明」：连 ComfyUI、设目录、出第一张图。';
  if ($('#firstRunOpen')) $('#firstRunOpen').textContent = isEnName() ? 'Open manual' : '看说明';
  if ($('#firstRunSkip')) $('#firstRunSkip').textContent = isEnName() ? 'Later' : '不用了';
  const dismiss = () => {
    box.classList.add('hidden');
    try { localStorage.setItem('v2-firstrun-done', '1'); } catch { /* ignore */ }
  };
  if ($('#firstRunOpen')) {
    $('#firstRunOpen').onclick = () => { dismiss(); switchPage('manual'); };
  }
  if ($('#firstRunSkip')) $('#firstRunSkip').onclick = dismiss;
}

async function loadGuide() {
  const box = $('#guideBody');
  if (!box || guideLoaded) return;
  try {
    const file = isEnName() ? '/v2/guide.en.html' : '/v2/guide.html';
    const r = await fetch(file, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    box.innerHTML = await r.text();
    guideLoaded = true;
  } catch (e) {
    box.innerHTML = `<div class="hint">教学页读取失败：${esc(e.message)}</div>`;
  }
}

/* ---------------- models ---------------- */

const MODEL_KINDS = [
  ['unet', '底模（unet）'],
  ['checkpoint', '整包（checkpoint）'],
  ['clip', 'CLIP'],
  ['vae', 'VAE'],
];

function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v >= 1024 ** 3) return (v / 1024 ** 3).toFixed(2) + ' GB';
  if (v >= 1024 ** 2) return (v / 1024 ** 2).toFixed(1) + ' MB';
  return Math.round(v / 1024) + ' KB';
}

async function loadModelsPage() {
  const box = $('#modelsBody');
  if (!box) return;
  box.innerHTML = '<div class="skeleton">读取模型…</div>';
  let data = null;
  try { data = await api('/api/models'); } catch (e) {
    box.innerHTML = `<div class="hint">读取失败：${esc(e.message)}</div>`;
    return;
  }
  state.models = data;
  renderModelsPage();
}

function renderModelsPage() {
  const data = state.models;
  const box = $('#modelsBody');
  if (!data || !box) return;
  const comfy = data.comfy || {};
  const comfyOf = { unet: comfy.unets || [], checkpoint: comfy.checkpoints || [], clip: comfy.clips || [], vae: comfy.vaes || [] };
  const defaults = data.defaults || {};
  const all = MODEL_KINDS.reduce((n, [k]) => n + ((data.models && data.models[k]) || []).length, 0);
  if ($('#modelsSummary')) {
    $('#modelsSummary').textContent = isEnName()
    ? `${all} in total · default ${defaults.unet || defaults.checkpoint || 'not set'}`
    : `共 ${all} 个 · 默认 ${defaults.unet || defaults.checkpoint || '未设'}`;
  }
  box.innerHTML = MODEL_KINDS.map(([kind, label]) => {
    const items = (data.models && data.models[kind]) || [];
    const known = comfyOf[kind];
    const isKnown = (it) => known.includes(it.rel) || known.includes(it.name) || known.includes(String(it.rel || '').replaceAll('\\', '/'));
    const isDefault = (it) => {
      const d = defaults[kind] || '';
      return !!d && (d === it.rel || d === it.name);
    };
    const rows = items.map((it) => `<div class="model-row" data-kind="${kind}" data-name="${esc(it.name)}" data-path="${esc(it.path)}" data-rel="${esc(it.rel || '')}">
        <div class="model-name"><b>${esc(it.name)}</b><span>${esc(it.rel || '')}</span></div>
        <div class="model-meta">${fmtBytes(it.size)}${isKnown(it) ? (isEnName() ? ' · known to ComfyUI' : ' · ComfyUI 已认') : ''}${isDefault(it) ? (isEnName() ? ' · default' : ' · 默认') : ''}</div>
        <div class="model-acts">
          <button class="mini" data-mact="default">设为默认</button>
          <button class="mini" data-mact="copy">复制名</button>
          <button class="mini" data-mact="delete">删除</button>
        </div>
      </div>`).join('');
    return `<div class="model-group"><h3>${label} <span class="hint">${items.length}</span></h3>${rows || '<div class="hint">没有</div>'}</div>`;
  }).join('');
  if (!all) box.innerHTML = '<div class="hint">没有扫到模型。去设置里把模型目录填上，点「自动检测」。</div>';
}

async function setModelDefault(kind, name) {
  const gen = {};
  if (kind === 'unet') {
    const comp = modelCompanions('unet:' + name, pickModel());
    Object.assign(gen, { unet: name, checkpoint: '', clip: comp.clip || '', vae: comp.vae || '' });
  } else if (kind === 'checkpoint') {
    Object.assign(gen, { checkpoint: name, unet: '' });
  } else if (kind === 'clip') {
    gen.clip = name;
  } else if (kind === 'vae') {
    gen.vae = name;
  } else {
    return;
  }
  await write('/api/config', { gen });
  toast('默认模型：' + name);
  await loadOptions(true);
  loadModelsPage();
}

/* ---------------- create ---------------- */

function loadCreate() {
  loadOptions().then(() => renderSix()).catch(() => {});
  loadChars();
  loadLoraSlot('outfit');
  loadLoraSlot('aux');
  renderMode();
  renderSix();
  renderQuick();
}

async function loadLoraSlot(slot) {
  try {
    const r = await api('/api/gen/loras?slot=' + encodeURIComponent(slot) + '&limit=300' + loraBaseQS());
    state.loraLists[slot] = r.items || [];
  } catch { /* ignore */ }
}

async function loadOptions(force = false) {
  try {
    state.options = await api('/api/gen/options' + (force ? '?force=1' : ''));
  } catch (e) {
    state.options = { online: false, error: e.message };
  }
  setStatus();
}

async function loadSetup() {
  try {
    const s = await api('/api/setup');
    if ($('#setupBanner')) $('#setupBanner').classList.toggle('hidden', !s.needsSetup);
  } catch { /* ignore */ }
}

async function loadAbout() {
  try {
    const a = await api('/api/about', { auth: false });
    if ($('#aboutApp')) $('#aboutApp').textContent = a.app || '洛栈 · LoRA-Vault';
    if ($('#aboutVer')) $('#aboutVer').textContent = (isEnName() ? 'Version ' : '版本 ') + (a.version || '');
    if ($('#aboutLine')) {
      $('#aboutLine').innerHTML = `${esc(a.app || 'LoRA 库')} v${esc(a.version || '')} · ${esc(a.licenseLabel || '')} · <a class="source-link" href="${esc(a.licenseUrl || '/api/license')}" target="_blank" rel="noreferrer">LICENSE</a>`;
    }
    const sponsor = $('#aboutSponsor');
    const link = $('#aboutSponsorLink');
    const url = String(a.sponsorUrl || '').trim();
    if (sponsor && link) {
      const ok = /^https?:\/\//i.test(url);
      sponsor.classList.toggle('hidden', !ok);
      if (ok) link.href = url;
    }
    const folio = $('#aboutPortfolio');
    const folioLink = $('#aboutPortfolioLink');
    const furl = String(a.portfolioUrl || '').trim();
    if (folio && folioLink) {
      const ok2 = /^https?:\/\//i.test(furl);
      folio.classList.toggle('hidden', !ok2);
      if (ok2) folioLink.href = furl;
    }
  } catch { /* ignore */ }
}

async function loadBackups() {
  if (!$('#backupList')) return;
  try {
    const r = await api('/api/backups');
    const items = r.items || [];
    if (!items.length) { $('#backupList').textContent = '还没有备份。'; return; }
    $('#backupList').innerHTML = items.slice(0, 6).map((b) => {
      const when = String(b.at || '').replace('T', ' ').slice(0, 16);
      const size = fmtMB(b.size || 0);
      return `<div>${esc(when)} · ${esc(size)} · ${esc(b.reason === 'auto' ? '自动' : '手动')}</div>`;
    }).join('');
  } catch (e) {
    $('#backupList').textContent = '读备份失败：' + e.message;
  }
}

async function backupNow() {
  try {
    const r = await write('/api/backups', {});
    toast('备份好了：' + (r.backup ? fmtMB(r.backup.size || 0) : ''));
    loadBackups();
  } catch (e) { toast(e.message, true); }
}

/* ---------------- 更新 ---------------- */

const updateUi = { info: null, timer: 0, mode: '', installAt: 0 };

function updateHintText(html) {
  const el = $('#updateHint');
  if (el) el.innerHTML = html;
}

function updateBadge(text, on) {
  const el = $('#updateBadge');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('on', !!on);
}

function updateProgressShow(show) {
  const el = $('#updateProgress');
  if (el) el.classList.toggle('hidden', !show);
}

function updateProgressSet(percent, text) {
  const fill = $('#updateBarFill');
  if (fill) fill.style.width = Math.max(0, Math.min(100, Number(percent) || 0)) + '%';
  const t = $('#updateProgressText');
  if (t) t.textContent = text || '';
}

function updateGoSet(mode, label) {
  const go = $('#updateGo');
  if (!go) return;
  updateUi.mode = mode;
  go.classList.toggle('hidden', !mode);
  if (label) go.textContent = label;
  go.disabled = mode === 'waiting';
}

async function checkAppUpdate(quiet = false) {
  const btn = $('#updateCheck');
  const url = ($('#cfgUpdate') ? $('#cfgUpdate').value.trim() : '') || (state.cfg && state.cfg.updateUrl) || '';
  if (btn && !quiet) { btn.disabled = true; btn.textContent = '检查中…'; }
  try {
    const r = await api('/api/update/check' + (url ? '?url=' + encodeURIComponent(url) : ''));
    updateUi.info = r;
    if (!r.ok) {
      updateBadge('检查失败', false);
      updateHintText(esc(r.error || '检查失败'));
      updateGoSet('');
      if (!quiet) toast(r.error || '检查失败', true);
      return;
    }
    if (!r.hasUpdate) {
      updateBadge('已是最新', false);
      updateHintText(`已是最新：v${esc(r.current)}` + (r.source ? `<br><span class="dim">清单：${esc(r.source)}</span>` : ''));
      updateGoSet('');
      if (!quiet) toast('已是最新');
      return;
    }
    updateBadge('有新版 v' + r.latest, true);
    const notes = r.notes ? `<br>${esc(r.notes).slice(0, 800).replace(/\n/g, '<br>')}` : '';
    const size = r.size ? ` · ${fmtBytes(r.size)}` : '';
    const where = r.canAutoInstall
      ? `下载完点一次就能装到 ${esc(r.installDir)} 并自动重启。`
      : '现在不是安装版（找不到安装目录），只能下载后自己装。';
    updateHintText(`发现新版本 v${esc(r.latest)}（当前 v${esc(r.current)}）${notes}<br>${where}${size}`);
    updateProgressShow(false);
    if (!r.url) {
      updateHintText(`发现新版本 v${esc(r.latest)}，但清单里没给 url，没法自动下载。`);
      updateGoSet('');
    } else {
      updateGoSet('download', r.downloaded ? '继续安装' : '下载并更新');
    }
    if (!quiet) toast('有新版：v' + r.latest);
  } catch (e) {
    updateBadge('检查失败', false);
    updateHintText('检查失败：' + esc(e.message));
    if (!quiet) toast(e.message, true);
  } finally {
    if (btn && !quiet) { btn.disabled = false; btn.textContent = '检查更新'; }
  }
}

function stopUpdatePoll() {
  if (updateUi.timer) { clearTimeout(updateUi.timer); updateUi.timer = 0; }
}

function pollUpdateStatus() {
  stopUpdatePoll();
  const tick = async () => {
    let j = null;
    try { j = await api('/api/update/status'); } catch { /* ignore */ }
    if (!j) { updateUi.timer = setTimeout(tick, 1200); return; }
    if (j.stage === 'downloading') {
      updateProgressShow(true);
      updateProgressSet(j.percent || 0, `下载中 ${j.percent || 0}%` + (j.size ? ` · ${fmtBytes(j.size)}` : ''));
      updateGoSet('waiting', '下载中…');
      updateUi.timer = setTimeout(tick, 700);
      return;
    }
    if (j.stage === 'installing') {
      if (!updateUi.installAt) updateUi.installAt = Date.now();
      const late = Date.now() - updateUi.installAt > 120000;
      updateProgressShow(true);
      updateProgressSet(100, late
        ? '还没重启？安装器可能被拦了 —— 到 %TEMP%\\lora-vault-update 里手动跑一次那个 setup.exe'
        : '正在安装，程序会自己重启…');
      updateGoSet('waiting', '正在安装…');
      updateUi.timer = setTimeout(tick, 30000);
      return;
    }
    updateUi.installAt = 0;
    if (j.stage === 'error') {
      updateProgressShow(true);
      updateProgressSet(j.percent || 0, '下载失败：' + (j.error || '未知原因'));
      updateGoSet('download', '重试下载');
      toast('下载失败：' + (j.error || ''), true);
      return;
    }
    if (j.stage === 'ready') {
      updateProgressShow(true);
      updateProgressSet(100, `安装包已下好 · ${fmtBytes(j.size || 0)}` + (j.sha256 ? ` · sha256 ${j.sha256.slice(0, 10)}…` : ''));
      updateBadge('可安装 v' + (j.version || (updateUi.info && updateUi.info.latest) || ''), true);
      if (j.canAutoInstall) updateGoSet('install', '重启并安装');
      else updateGoSet('', '');
      return;
    }
    updateProgressShow(false);
    updateGoSet('download', '下载并更新');
  };
  tick();
}

async function startUpdateDownload() {
  const info = updateUi.info;
  const go = $('#updateGo');
  if (go) go.disabled = true;
  updateProgressShow(true);
  updateProgressSet(2, '开始下载…');
  try {
    await write('/api/update/download', {
      url: info && info.url,
      version: info && info.latest,
      sha256: info && info.sha256,
    });
    pollUpdateStatus();
  } catch (e) {
    updateProgressSet(0, '下载没起来：' + e.message);
    toast(e.message, true);
    if (go) go.disabled = false;
  }
}

async function installUpdate() {
  const go = $('#updateGo');
  if (go) { go.disabled = true; go.textContent = '重启中…'; }
  try {
    const r = await write('/api/update/install', {});
    updateProgressShow(true);
    updateProgressSet(100, `正在安装到 ${r.installDir || ''}，程序会自己重启…`);
    updateGoSet('waiting', '正在安装…');
    pollUpdateStatus();
  } catch (e) {
    toast(e.message, true);
    updateProgressSet(0, '安装失败：' + e.message);
    if (go) { go.disabled = false; go.textContent = '重启并安装'; }
  }
}

async function onUpdateGo() {
  if (updateUi.mode === 'install') return installUpdate();
  return startUpdateDownload();
}

async function autoSetup() {
  const btn = $('#autoSetup');
  if (btn) { btn.disabled = true; btn.textContent = '检测中…'; }
  try {
    const d = await api('/api/config/discover');
    if (!d.found) {
      toast('没自动找到，去设置里手动选', true);
      switchPage('settings');
      return;
    }
    const body = {};
    if (d.lorasRoot) body.lorasRoot = d.lorasRoot;
    const extras = (d.lorasRoots || []).filter((r) => String(r).toLowerCase() !== String(d.lorasRoot || '').toLowerCase());
    if (extras.length) body.lorasRoots = extras;
    if (d.samplesRoot) body.samplesRoot = d.samplesRoot;
    if (d.comfyDir) body.comfyDir = d.comfyDir;
    if (d.comfyLaunch) body.comfyLaunch = d.comfyLaunch;
    if (d.outputRoot) body.gen = { outputRoot: d.outputRoot };
    if (d.modelRoots && Object.values(d.modelRoots).some((a) => Array.isArray(a) && a.length)) body.modelRoots = d.modelRoots;
    await write('/api/config', body);
    try { await write('/api/scan', { read_meta: true }); } catch { /* ignore */ }
    state.cfg = await api('/api/config');
    state.token = state.cfg.token || state.token;
    state.options = null;
    await loadOptions();
    await loadChars();
    await loadSetup();
    toast('配好了');
  } catch (e) {
    toast('自动检测失败：' + e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '自动检测'; }
  }
}

function familyOfName(name) {
  const m = String(name || '').replace(/^(unet|checkpoint):/, '').toLowerCase();
  if (!m) return '';
  if (/krea/.test(m)) return 'krea';
  if (/anima|qwen/.test(m)) return 'anima';
  if (/sdxl|noob|illustrious|wai|pony/.test(m)) return 'sdxl';
  return '';
}

function currentModelFamily() {
  return familyOfName(state.model || (pickModel() || {}).model || '');
}

/* C站搜索的底模筛选值；和 Civitai 的 baseModels 参数对齐 */
function currentBaseModelFilter() {
  const m = String(state.model || (pickModel() || {}).model || '')
    .replace(/^(unet|checkpoint):/, '').toLowerCase();
  if (!m) return '';
  if (/anima|qwen/.test(m)) return 'Anima';
  if (/illustrious/.test(m)) return 'Illustrious';
  if (/pony/.test(m)) return 'Pony';
  if (/noob|sdxl|wai/.test(m)) return 'SDXL 1.0';
  if (/flux/.test(m)) return 'Flux.1 D';
  if (/sd ?1\.5|sd15/.test(m)) return 'SD 1.5';
  return '';
}

function loraBaseQS() {
  const fam = currentModelFamily();
  return fam ? '&base=' + fam : '';
}

async function loadChars(q = '') {
  const rail = $('#charRail');
  if (!rail) return;
  rail.innerHTML = '<div class="skeleton">读角色…</div>';
  try {
    const r = await api('/api/gen/loras?slot=char&limit=60&q=' + encodeURIComponent(q) + loraBaseQS());
    state.chars = r.items || [];
    if (!state.char && state.chars.length) state.char = state.chars[0];
    if (state.char && state.char.id) {
      state.char = state.chars.find((x) => String(x.id) === String(state.char.id)) || state.char;
    }
    renderChars();
  } catch (e) {
    rail.innerHTML = `<div class="skeleton">读角色失败：${esc(e.message)}</div>`;
  }
}

function charPreview(it) {
  return it.preview ? `/media/${it.id}/thumb` : '';
}

function recentCharPaths() {
  try {
    const a = JSON.parse(localStorage.getItem('v2-recent-chars') || '[]');
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

function pushRecentChar(relPath) {
  if (!relPath) return;
  try {
    const list = recentCharPaths().filter((x) => x !== relPath);
    list.unshift(relPath);
    localStorage.setItem('v2-recent-chars', JSON.stringify(list.slice(0, 12)));
  } catch { /* ignore */ }
}

function renderChars() {
  const rail = $('#charRail');
  if (!rail) return;
  const famEl = $('#charFamFilter');
  if (famEl) {
    const f = currentModelFamily();
    const label = f === 'sdxl' ? 'SDXL' : (f === 'krea' ? 'Krea2' : (f === 'anima' ? 'Anima' : ''));
    famEl.textContent = label ? (isEnName() ? 'Only ' + label : '只看 ' + label + ' 支') : '';
  }
  const cur = state.char && state.char.rel_path;
  const cards = [
    `<button class="char rand" data-char="__random__"><div class="pic">✦</div><div class="nm">随机角色</div></button>`,
    `<button class="char ${!state.char && !state.charPreset ? 'on' : ''}" data-char="__none__"><div class="pic">—</div><div class="nm">不挂角色</div></button>`,
  ];
  const recent = recentCharPaths();
  const rank = (it) => {
    const i = recent.indexOf(it.rel_path);
    return i < 0 ? 999 : i;
  };
  const list = [...state.chars].sort((a, b) => rank(a) - rank(b));
  /* 预设角色排在最前：没下角色支也能先出图 */
  const presetOn = state.charPreset && state.charPreset.id;
  for (const pc of PRESET_CHARS) {
    /* 成人模式不挂儿童体型的预设角色（对外分发的口径；开发版放开） */
    if (state.r18 && !isDevBuild() && PRESET_KID.has(pc.id)) continue;
    cards.push(`<button class="char preset ${presetOn === pc.id ? 'on' : ''}" data-preset="${esc(pc.id)}" title="预设角色 · 不挂 LoRA">
      <div class="pic">${esc(isEnName() ? String(pc.feature || pc.tag || '?').trim().charAt(0).toUpperCase() : pc.name.slice(0, 1))}</div>
      <div class="nm"><b>${esc(pc.name)}</b><span>预设</span></div>
    </button>`);
  }
  for (const it of list) {
    const on = cur && it.rel_path === cur;
    const pv = charPreview(it);
    const isRecent = recent.includes(it.rel_path);
    cards.push(`<button class="char ${on ? 'on' : ''}" data-char="${esc(it.rel_path)}" title="${esc(loraLabel(it))}">
      <div class="pic">${pv ? `<img loading="lazy" src="${esc(pv)}" alt="" />` : `<span>${esc((it.name || '?').slice(0, 1))}</span>`}</div>
      <div class="nm"><b>${esc(loraLabel(it) || '未命名')}</b>${isRecent ? ' ·' : ''}</div>
    </button>`);
  }
  if (!list.length) {
    const fam = currentModelFamily();
    cards.push(`<div class="skeleton">没有匹配「${fam === 'krea' ? 'Krea2' : (fam === 'sdxl' ? 'SDXL' : (fam === 'anima' ? 'Anima' : '这个模型'))}」的角色支</div>`);
  }
  rail.innerHTML = cards.join('');
  renderSix();
}

async function chooseLoraVariant(item, slot) {
  if (!item || !item.id) return;
  let r = null;
  try { r = await api('/api/loras/' + item.id + '/variants'); } catch { return; }
  const vs = (r && r.variants) || [];
  if (vs.length < 2) return;
  state.variantTarget = { item, slot };
  $('#variantTitle').textContent = '这个支里有多个触发词，选一个';
  const kindLabel = { character: '角色', feature: '特征', outfit: '服装', body: '身体', other: '其他', all: '全部', dataset: '训练集', block: '角色' };
  $('#variantOptions').innerHTML = vs.map((v) => {
    const prefix = v.kind === 'dataset' ? '训练集 · ' : (v.kind && v.kind !== 'all' ? ((kindLabel[v.kind] || '触发词') + ' · ') : '');
    const label = prefix + (v.label || v.trigger || '');
    const hay = (label + ' ' + (v.trigger || '')).toLowerCase();
    return `<button class="picker-opt" data-variant="${esc(v.trigger)}" data-vlabel="${esc(label)}" data-vkind="${esc(v.kind || '')}" data-search="${esc(hay)}">${esc(label)}</button>`;
  }).join('');
  const vsSearch = $('#variantSearch');
  if (vsSearch) {
    vsSearch.value = '';
    vsSearch.oninput = () => {
      const q = vsSearch.value.trim().toLowerCase();
      let shown = 0;
      $$('#variantOptions [data-variant]').forEach((b) => {
        const hit = !q || String(b.dataset.search || '').includes(q);
        b.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      const empty = $('#variantEmpty');
      if (empty) empty.classList.toggle('hidden', shown > 0);
    };
  }
  $('#variantEmpty')?.classList.add('hidden');
  $('#variantModal').classList.remove('hidden');
}

function closeVariantModal() {
  $('#variantModal').classList.add('hidden');
  state.variantTarget = null;
}

function applyLoraVariant(btn) {
  const t = state.variantTarget;
  if (!t || !btn) return;
  const trigger = btn.dataset.variant;
  const label = btn.dataset.vlabel || '';
  const vkind = btn.dataset.vkind || '';
  if (t.slot === 'char') {
    state.char = vkind === 'block'
      ? { ...t.item, trigger, feature_words: '', outfit_words: '', name: t.item.name_zh || t.item.name || '' }
      : { ...t.item, trigger, name: t.item.name_zh || t.item.name || '' };
    if (label && label !== '默认' && label !== '全部' && vkind !== 'character' && vkind !== 'block' && vkind !== 'all') {
      state.char.name = state.char.name + ' · ' + label;
    }
    renderChars();
    renderSix();
  } else if (t.slot === 'outfitLora') {
    state.outfitLora = { ...t.item, trigger };
    renderSix();
  } else if (t.slot === 'actionLora') {
    state.actionLora = { ...t.item, trigger };
    renderSix();
  } else if (t.slot === 'auxSlot') {
    if (state.auxIndex >= 0 && state.auxIndex < state.auxLoras.length) state.auxLoras[state.auxIndex] = { ...t.item, trigger };
    renderSix();
  } else if (t.slot === 'auxLora') {
    state.auxLora = { ...t.item, trigger };
    renderSix();
  }
  closeVariantModal();
}

function pickChar(value) {
  state.charPreset = null;
  if (value === '__random__') {
    if (!state.chars.length) { toast('没有可随机角色'); return; }
    state.char = state.chars[Math.floor(Math.random() * state.chars.length)];
    pushRecentChar(state.char.rel_path);
  } else if (value === '__none__') {
    state.char = null;
    /* 没有角色了，「原装」就不成立；留着会在 prompt 里变成字面量 ORIGINAL */
    if (state.outfit === 'ORIGINAL') state.outfit = '';
  } else {
    state.char = state.chars.find((x) => x.rel_path === value) || null;
    if (state.char) pushRecentChar(state.char.rel_path);
  }
  renderChars();
  if ($('#createHint')) $('#createHint').textContent = state.char ? `角色：${state.char.name}` : '不挂角色';
  if (state.char) chooseLoraVariant(state.char, 'char');
}

function pickPreset(id) {
  const pc = PRESET_CHARS.find((x) => x.id === id);
  if (!pc) return;
  if (state.r18 && !isDevBuild() && PRESET_KID.has(pc.id)) { toast('这个预设角色不进成人模式', true); return; }
  state.char = null;
  state.charPreset = pc;
  renderChars();
  if (typeof renderSix === 'function') renderSix();
  if ($('#createHint')) $('#createHint').textContent = `预设角色：${pc.name}（不挂 LoRA）`;
}

const ADULT_OUTFITS = [
  'bunny suit, black pantyhose, high heels, bunny ears', 'latex dress, black pantyhose, high heels, gloves', 'shibari, red rope, bound arms', 'bondage outfit, straps, harness, cuffs', 'lace babydoll, thighhighs, garter belt', 'crotchless bodysuit, thighhighs', 'wet clothes, wet shirt, see-through','lingerie', 'completely nude', 'open shirt', 'bunny suit', 'undressed', 'wet clothes', 'micro bikini', 'crotchless lingerie', 'fishnet', 'latex', 'collar', 'garter belt', 'underwear only',
  'lace bodysuit', 'bdsm harness', 'wet shirt', 'maid lingerie', 'bondage outfit', 'see-through dress', 'micro skirt', 'latex bodysuit', 'plunge bra', 'pasties',
  'string bikini', 'sling bikini', 'side-tie bikini', 'micro shorts', 'crotchless panties', 'thong', 'g-string', 'c-string',
  'lace babydoll', 'teddy lingerie', 'chemise', 'cupless bra', 'cage bra', 'open bra', 'fishnet bodysuit',
  'sheer leotard', 'crotchless bodysuit', 'leotard', 'shibari', 'armbinder', 'apron only', 'latex dress',
  'bunny suit, black pantyhose, high heels', 'latex dress, black pantyhose, high heels',
  'pvc outfit', 'belly dancer outfit', 'micro dress', 'wet t-shirt', 'open-crotch pantyhose', 'bunny girl',
  'completely nude', 'undressed', 'open shirt',
  'race queen outfit, bikini, boots, gloves, jacket on shoulders',
  'maid lingerie, white apron, black lingerie, white thighhighs',
  'body stocking, sheer, garter belt, high heels'];
const ADULT_ACTIONS = [
  /* 成人专属动作池：只放「单人正在做的成人行为」。
     体位 / 射精收尾在 DUO_*，半途阶段在 STAGE_*，姿势串在 EXTRA_POSES_SFW。 */
  'fingering herself', 'rubbing herself', 'masturbating through panties', 'masturbation',
  'fingering', 'holding vibrator', 'vibrator', 'dildo',
  'anal', 'riding pillow', 'pulling panties aside', 'hand on crotch',
  'hand between legs', 'spread pussy', 'presenting pussy', 'presenting breasts',
  'presenting', 'panty pull', 'bra lift', 'cupping breasts',
  'holding own breasts', 'breast grab', 'underboob', 'sideboob',
  'cleavage', 'nipple slip', 'cameltoe', 'exhibitionism',
  'public nudity', 'flashing', 'grinding on him', 'licking lips',
  'arched back',
];

/* 成人标记：所有带成人含义的词。正常模式统一靠这个挡，跟动作池拆开维护。
   加新的成人词：动作池加一份，这里也加一份；只加这里等于「标记但不给选」。 */
const ADULT_TAGS = new Set([
  'lying on bed, legs over shoulders', 'kneeling on floor, thighs apart, spreading pussy', 'squatting, spread legs', 'sitting on bed, legs spread, masturbation',
  'lying on side, legs crossed, fingering herself', 'lying on bed, legs spread, pillow under hips', 'lying on side, one leg lifted, spreading pussy', 'sitting on chair, spreading pussy',
  'kneeling on bed, spreading pussy', 'on all fours on bed, spreading pussy', 'sitting on floor, spread legs, fingering herself', 'standing, spread legs, fingering herself',
  'lying on sofa, legs up, masturbation', 'on bed', 'on stomach', 'kneeling',
  'spread legs', 'masturbation', 'breast grab', 'fingering',
  'vibrator', 'dildo', 'anal', 'exhibitionism',
  'public nudity', 'flashing', 'on all fours', 'leg lift',
  'bent over', 'squatting', 'bent over desk', 'presenting',
  'legs up', 'face down ass up', 'holding own breasts', 'licking lips',
  'grinding on him', 'arched back', 'after sex', 'afterglow',
  'lying limp', 'messy hair', 'cum on body', 'cum on stomach',
  'cum dripping', 'cum overflow', 'panting', 'under blanket',
  'sitting up tired', 'orgasm', 'squirting', 'body trembling',
  'legs trembling', 'toes curling', 'gripping bedsheet', 'clutching pillow',
  'hand between legs', 'knees weak', 'kneeling on bed', 'bent over bed',
  'lying on bed spread legs', 'sitting on office desk', 'kneeling under desk', 'bent over sink',
  'kneeling in shower', 'kneeling on grass', 'lying on back seat', 'sitting in passenger seat',
  'lying on sleeping bag', 'on all fours on sofa', 'riding pillow', 'sitting on table',
  'lying on table', 'sitting on desk spread legs', 'bent over table', 'masturbating through panties',
  'fingering herself', 'rubbing herself', 'holding vibrator', 'pulling panties aside',
  'hand on crotch', 'spread pussy', 'sitting with legs spread', 'lying on back with legs spread',
  'presenting pussy', 'cameltoe', 'panty pull', 'bra lift',
  'cupping breasts', 'underboob', 'sideboob', 'cleavage',
  'nipple slip', 'one leg up', 'kneeling with legs apart', 'hips thrust',
  'presenting breasts', 'ass focus', 'lying on bed, legs spread, spreading pussy', 'lying on bed, legs raised high',
  'lying on bed, legs spread', 'sitting on chair, legs spread, fingering herself', 'sitting on desk, spread legs, masturbation', 'on bed, all fours, ass up',
  'on floor, legs spread in M shape, fingering herself', 'lying on bed, legs spread, masturbation', 'lying on sofa, legs spread, fingering herself', 'sitting on chair, legs apart, spreading pussy',
  'kneeling on bed, thighs apart, fingering herself', 'lying on bed, on side, one leg lifted, fingering herself', 'standing, one leg up, masturbation', 'lying on desk, spread legs, masturbation',
  'kneeling on bed, thighs apart, leaning back', 'sitting on bed, legs spread, leaning back on hands', 'sitting on chair, legs over armrest, leaning back', 'kneeling on bed, face down, ass up',
  'sitting on chair, legs spread, leaning back', 'kneeling on sofa, thighs apart', 'lying on stomach on bed, legs up', 'sitting on chair, both legs over armrest',
  'on stomach on floor, legs up', 'lying on back, legs up', 'lying on bed, legs spread in M shape, knees up', 'lying on bed, legs up',
  'sitting on chair, legs spread', 'sitting on floor, legs spread in M shape', 'kneeling on bed, thighs apart', 'standing, legs apart',
  'on stomach on bed, ass up, legs apart', 'sitting on desk, legs spread in M shape', 'lying on sofa, legs spread', 'sitting in chair backwards, legs apart',
  'lying on sofa, legs up', 'lying on sofa, legs spread in M shape', 'sitting on sofa, legs spread', 'lying on desk, legs spread',
  'sitting on stairs, legs apart', 'standing, back against wall, legs apart', 'lying on floor, legs up',
]);

const ADULT_EXPRESSIONS = [
  'seductive expression', 'half-closed eyes', 'ahegao', 'drool', 'unfocused eyes', 'heart-shaped pupils',
  'teary eyes', 'biting lip', 'smirk', 'moaning', 'lewd expression', 'blissful expression', 'parted lips',
  'heavy breathing', 'looking up at partner', 'teary smile', 'flushed face', 'biting finger', 'half-lidded eyes',
  'lewd smile', 'empty eyes', 'rolling eyes', 'tongue out', 'heavy blush', 'sultry', 'longing gaze',
  'pleading eyes', 'lustful eyes', 'submissive expression', 'dazed expression',
];

function renderAuxRows() {
  const box = $('#moreAuxRows');
  if (!box) return;
  const rows = state.auxLoras || [];
  box.innerHTML = rows.length
    ? rows.map((it, i) => `<div class="aux-row">
        <button class="aux-pick ${it ? '' : 'empty'}" data-aux="${i}" title="点这里换一支">${it ? esc(loraLabel(it) || it.rel_path) : '选一支 LoRA'}</button>
        <button class="mini aux-del" data-auxdel="${i}" title="删掉这一槽">×</button>
      </div>`).join('')
    : '<div class="aux-empty">还没有额外 LoRA</div>';
  const add = $('#moreAuxAdd');
  if (add) {
    add.disabled = rows.length >= 8;
    add.textContent = rows.length >= 8 ? '最多 8 支' : '＋ 添加 LoRA 槽';
  }
}

function renderSix() {
  const body = BODY_TYPES.find((b) => b.tag === state.body);
  const bodyOk = !body || !state.r18 || isDevBuild() || ADULT_OK_BODY_LABELS.has(body.label);
  const override = !!state.bodyOverride;
  const locked = (!!state.char || !!state.charPreset) && !override;
  $('#sixBody').textContent = locked ? '角色原装' : (body && bodyOk ? body.label : '随机');
  const bodyCard = document.querySelector('#sixGrid [data-pick="body"]');
  if (bodyCard) {
    bodyCard.disabled = locked;
    bodyCard.classList.toggle('disabled', locked);
    bodyCard.title = locked ? '挂角色 / 预设角色时用原设体型；要改体型就勾「覆盖角色体型」' : '';
  }
  if ($('#bodyOverride')) $('#bodyOverride').checked = override;
  $('#sixScene').textContent = state.scene ? (sceneByTag(state.scene)?.label || '随机') : '随机';
  const duoPosePool = duoPosePairs().map((x) => x[1]);
  const duoActPool = duoActPairs().map((x) => x[1]);
  const poseTag = state.pose && (state.people === 'duo' ? duoPosePool.includes(state.pose) : !DUO_ONLY_ACTIONS.has(state.pose)) && poseActionCompatible(state.pose, state.action) ? state.pose : '';
  const actTag = state.action && (state.people === 'duo' ? duoActPool.includes(state.action) : !DUO_ONLY_ACTIONS.has(state.action)) && poseActionCompatible(state.pose, state.action) ? state.action : '';
  if ($('#sixPose')) $('#sixPose').textContent = poseTag ? labelOf(ACTION_LABELS, poseTag) : '随机';
  $('#sixAction').textContent = state.actionLora
    ? '动作支 · ' + (loraLabel(state.actionLora) || '已选')
    : (actTag ? labelOf(ACTION_LABELS, actTag) : '随机');
  const undressNow = computeUndress(state.r18);
  const nudeLike = undressNow.fullyNude;
  const socksOnly = undressNow.socksOnly;
  const underwearOnly = undressNow.underwearOnly;
  const currentPersonOutfit = (state.char || state.charPreset) && (state.outfit === 'ORIGINAL' || !state.outfit);
  const outfitOk = !state.outfit || state.outfit === 'LORA' || state.outfit === 'ORIGINAL' || sceneOutfitCompatible(state.scene, state.outfit);
  $('#sixOutfit').textContent = state.outfit === 'LORA'
    ? '服装支 · ' + (state.outfitLora ? (loraLabel(state.outfitLora) || '已选') : '已选') + (state.outfitLora && (nudeLike || socksOnly || underwearOnly) ? '（这支不挂）' : '')
    : (nudeLike ? '裸体'
      : socksOnly ? '只穿袜子'
        : underwearOnly ? '只穿内衣'
          : (currentPersonOutfit ? '原装' : (state.outfit && outfitOk ? labelOf(OUTFIT_LABELS, state.outfit) : '随机')));
  const outfitSlot = $('#outfitLoraSlot');
  if (outfitSlot) {
    const on = !!state.outfitLora;
    outfitSlot.classList.toggle('hidden', !on);
    if (on && $('#outfitLoraName')) $('#outfitLoraName').textContent = state.outfitLora.name_zh || state.outfitLora.name || '已选';
  }
  const actionSlot = $('#actionLoraSlot');
  if (actionSlot) {
    const on = !!state.actionLora;
    actionSlot.classList.toggle('hidden', !on);
    if (on && $('#actionLoraName')) $('#actionLoraName').textContent = state.actionLora.name_zh || state.actionLora.name || '已选';
  }
  const exprOk = state.expression && (state.r18 ? EXPRESSIONS_R18 : EXPRESSIONS_SFW).includes(state.expression);
  $('#sixExpression').textContent = exprOk ? labelOf(EXPRESSION_LABELS, state.expression) : '随机';
  $$('#sixGrid .six-card[data-pick]').forEach((el) => {
    const k = el.dataset.pick;
    /* 人数默认就是「单人」，不算用户选过；只有切到双人才点灯 */
    const on = k === 'people' ? state.people === 'duo'
      : k === 'props' ? !!state.useProps
      : (!!state[k] || (k === 'action' && !!state.actionLora) || (k === 'outfit' && !!state.outfitLora));
    el.classList.toggle('on', on);
  });
  if ($('#sixPeople')) $('#sixPeople').textContent = pairLabel(PEOPLE_OPTS, state.people || 'solo');
  if ($('#morePeople')) $('#morePeople').textContent = pairLabel(PEOPLE_OPTS, state.people || 'solo');
  if ($('#moreClip')) $('#moreClip').textContent = state.clip || '自动';
  if ($('#moreVae')) $('#moreVae').textContent = state.vae || '自动';
  if ($('#moreModel')) {
    const base = pickModel();
    $('#moreModel').textContent = state.model
      ? state.model.replace(/^(unet|checkpoint):/, '')
      : (base ? '默认 · ' + base.model.replace(/^(unet|checkpoint):/, '') : '默认');
  }
  if ($('#moreOutfitLora')) $('#moreOutfitLora').textContent = state.outfitLora ? (state.outfitLora.name || '已选') : '不指定';
  renderAuxRows();
  const outfitLoraOn = !!state.outfitLora;
  /* 只剩一张「穿脱」卡；挂服装支时它作用在支上 */
  const undressCard = document.querySelector('#sixGrid [data-pick="undress"]');
  if (undressCard) {
    undressCard.title = outfitLoraOn ? '服装支：半脱/敞开只是加词、支照挂；全裸或只穿内衣才不挂这支' : '';
  }
  const duo = (state.people || 'solo') === 'duo';
  if ($('#moreMaleBody')) $('#moreMaleBody').textContent = pairLabel(MALE_BODY_TYPES, state.maleBody || 'male, medium build');
  if ($('#moreMaleBodyRow')) $('#moreMaleBodyRow').classList.toggle('hidden', !duo);
  if ($('#moreDuoRoleRow')) $('#moreDuoRoleRow').classList.toggle('hidden', !duo);
  if ($('#moreDuoRole')) $('#moreDuoRole').textContent = state.duoRole && duoRoleCompatible(state.duoRole, state.pose) ? pairLabel(DUO_ROLE_OPTS, state.duoRole) : '自动';
  if ($('#morePenis')) $('#morePenis').textContent = pairLabel(PENIS_SIZES, state.penis || 'penis');
  if ($('#morePenisRow')) $('#morePenisRow').classList.toggle('hidden', !duo || !state.r18);
  if ($('#moreProps')) $('#moreProps').textContent = state.useProps ? (state.props && propSceneCompatible(state.props, state.scene) && propHandCompatible(state.props, state.hands) ? pairLabel(state.r18 ? PROPS_R18 : PROPS_SFW, state.props) : '随机') : '不带道具';
  if ($('#useProps')) $('#useProps').checked = !!state.useProps;
  const propCard = document.querySelector('#sixGrid [data-pick="props"]');
  if (propCard) {
    propCard.disabled = !state.useProps;
    propCard.classList.toggle('disabled', !state.useProps);
    propCard.title = state.useProps ? '' : '先打开「启用道具」';
  }
  if ($('#moreHands')) $('#moreHands').textContent = state.hands ? pairLabel(state.r18 ? HANDS_R18 : HANDS_SFW, state.hands) : '不指定';
  if ($('#moreShot')) $('#moreShot').textContent = state.shot && (state.r18 || !ADULT_SHOTS.has(state.shot)) && poseShotCompatible(state.pose, state.action, state.shot, state.angle) ? pairLabel(SHOTS, state.shot) : '默认';
  if ($('#moreAngle')) $('#moreAngle').textContent = state.angle && poseShotCompatible(state.pose, state.action, state.shot, state.angle) ? pairLabel(ANGLES, state.angle) : '不指定';
  if ($('#moreLight')) $('#moreLight').textContent = state.light ? pairLabel(LIGHTS, state.light) : '默认';
  if ($('#moreTime')) $('#moreTime').textContent = state.time && sceneTimeCompatible(state.scene, state.time) ? pairLabel(TIMES, state.time) : '不指定';
  if ($('#moreUndress')) $('#moreUndress').textContent = undressSummary() || '不指定';
  const wetOkNow = isSexualContext(state.pose, state.action, state.stage);
  if ($('#moreWet')) $('#moreWet').textContent = wetOkNow ? (state.wet === WET_RANDOM ? '随机' : (state.wet || '不流')) : '不流';
  if ($('#moreTattoo')) $('#moreTattoo').textContent = state.tattoo ? labelOfTattoo(TATTOO_POSITIONS, state.tattoo) : '无';
  if ($('#moreTattooPattern')) $('#moreTattooPattern').textContent = state.tattooPattern ? labelOfTattoo(TATTOO_PATTERNS, state.tattooPattern) : '无';
  if ($('#moreTattooGlow')) $('#moreTattooGlow').textContent = state.tattooGlow === 'on' ? '开' : '关';
  /* 没选位置时图案 / 发光卡先锁住，别让用户打开一个选不了的列表 */
  for (const f of ['tattooPattern', 'tattooGlow']) {
    const card = document.querySelector(`#sixGrid [data-pick="${f}"]`);
    if (!card) continue;
    const off = !state.tattoo;
    card.disabled = off;
    card.classList.toggle('disabled', off);
    card.title = off ? '先选纹身位置' : '';
  }
  for (const id of ['#moreUndressRow', '#moreWetRow']) $(id)?.classList.toggle('hidden', !state.r18);
}

function renderQuick() {
  const box = $('#quickStyles');
  if (!box) return;
  box.innerHTML = (QUICK_STYLES[state.r18 ? 'r18' : 'sfw'] || []).map((q, i) =>
    `<button class="quick-chip" data-quick="${i}">${esc(q.label)}</button>`).join('');
}

/* 成人模式下创作页顶上那行提醒：每次开启随机换一句，不跟上一句重复 */
const R18_NOTES = [
  '请注意自己的身体。',
  '别熬太晚，明天还要早起。',
  '起来走两步，别一坐三小时。',
  '喝口水，慢慢来。',
  '手酸了就歇会儿，没人催你。',
  '腰要紧，别把自己当年轻人用。',
  '今天已经够了吧？',
  '适度，懂吗。',
  '画得慢不要紧，别熬到天亮。',
  '又来？先吃点东西。',
  '你这坐姿，先管管腰。',
  '图是假的，你的时间是自己的。',
  '画归画，日子归日子。',
  '眼睛干了吧，往窗外看一会儿。',
  '别空着肚子开工。',
  '一张一张来，别一口气刷十张。',
  '累了就停，这功能不会跑。',
  '你不是机器，这点别忘了。',
  '画完站起来走一圈，别瘫那儿。',
  '明天再画也一样。',
];

function pickR18Note() {
  let last = '';
  try { last = localStorage.getItem('v2-r18-note') || ''; } catch { /* ignore */ }
  const pool = R18_NOTES.filter((x) => x !== last);
  const line = pool[Math.floor(Math.random() * pool.length)] || R18_NOTES[0];
  try { localStorage.setItem('v2-r18-note', line); } catch { /* ignore */ }
  return line;
}

function renderMode() {
  const on = !!state.r18;
  const sw = $('#r18Toggle');
  if (sw) sw.checked = on;
  const badge = $('#r18State');
  if (badge) {
    badge.textContent = on ? '已开启' : '未开启';
    badge.classList.toggle('on', on);
  }
  /* 创作页那行提醒只在成人模式出现；正常模式一个字都不留 */
  const note = $('#r18Note');
  if (note) {
    note.classList.toggle('hidden', !on);
    if (on) {
      if (!state.r18Note) {
        try { state.r18Note = localStorage.getItem('v2-r18-note') || ''; } catch { /* ignore */ }
      }
      if (!state.r18Note) state.r18Note = pickR18Note();
      if (note.textContent !== state.r18Note) note.textContent = state.r18Note;
    }
  }
}

function setMode(r18) {
  state.r18 = !!r18;
  if (state.r18) state.r18Note = pickR18Note();
  try { localStorage.setItem('v2-r18', state.r18 ? '1' : '0'); } catch { /* ignore */ }
  if (!state.r18) {
    if (state.scene && sceneByTag(state.scene)?.mode === 'r18') state.scene = '';
    if (state.outfit && ADULT_OUTFITS.includes(state.outfit)) state.outfit = '';
    if (state.pose && ADULT_TAGS.has(state.pose)) state.pose = '';
    if (state.action && ADULT_TAGS.has(state.action)) state.action = '';
    if (state.expression && ADULT_EXPRESSIONS.includes(state.expression)) state.expression = '';
    if (state.props && !PROPS_SFW.some((x) => x[1] === state.props)) state.props = '';
    if (state.hands && !HANDS_SFW.some((x) => x[1] === state.hands)) state.hands = '';
    if (state.shot && ADULT_SHOTS.has(state.shot)) state.shot = '';
    if (state.outfit === 'LORA') state.outfit = '';
    state.outfitLora = null;
    state.actionLora = null;
    state.undressParts = {};
    state.wet = '';
    if (state.tattoo && ADULT_TATTOO_TAGS.has(state.tattoo)) {
      state.tattoo = '';
      state.tattooPattern = '';
      state.tattooGlow = '';
    }
    state.stage = '';
    state.undress = '';
    state.people = 'solo';
    state.duoRole = '';
  } else {
    /* 成人模式：幼女 / 萝莉 不进池，已经选着的清掉（开发版放开） */
    if (!isDevBuild()) {
      const cur = BODY_TYPES.find((b) => b.tag === state.body);
      if (cur && !ADULT_OK_BODY_LABELS.has(cur.label)) state.body = '';
      if (state.charPreset && PRESET_KID.has(state.charPreset.id)) state.charPreset = null;
    }
  }
  const duoPosePool = duoPosePairs().map((x) => x[1]);
  const duoActPool = duoActPairs().map((x) => x[1]);
  if (state.people === 'duo') {
    if (state.pose && !duoPosePool.includes(state.pose)) state.pose = '';
    if (state.action && !duoActPool.includes(state.action)) state.action = '';
  }
  if (!poseActionCompatible(state.pose, state.action)) state.action = '';
  renderMode();
  renderSix();
  renderQuick();
  fillSemantic();
}

/* ---------------- 词表 / 查词 ---------------- */

const TAG_CJK = /[\u4e00-\u9fa5]/;

/* 选择池里没有、但常用会想查的零散词（袜子/鞋/身体/质量/负面） */
const TAG_EXTRAS = [
  ['服装', '过膝袜', 'thighhighs'], ['服装', '白丝过膝袜', 'white thighhighs'],
  ['服装', '黑丝过膝袜', 'black thighhighs'], ['服装', '白丝连裤袜', 'white pantyhose'],
  ['服装', '黑丝连裤袜', 'black pantyhose'], ['服装', '吊袜带', 'garter belt'],
  ['服装', '渔网袜', 'fishnet pantyhose'], ['服装', '网眼丝袜', 'fishnets'],
  ['服装', '白短袜', 'white socks'], ['服装', '黑短袜', 'black socks'],
  ['服装', '运动鞋', 'sneakers'], ['服装', '小皮鞋', 'loafers'],
  ['服装', '高跟鞋', 'high heels'], ['服装', '长靴', 'boots'],
  ['服装', '围裙', 'apron'], ['服装', '露脐上衣', 'crop top'],
  ['服装', '比基尼', 'bikini'], ['服装', '泳装', 'swimsuit'],
  ['服装', '裸足', 'barefoot'], ['服装', '赤脚', 'bare legs'],
  ['身体', '锁骨', 'collarbone'], ['身体', '肚脐', 'navel'],
  ['身体', '大腿', 'thighs'], ['身体', '露肩', 'bare shoulders'],
  ['身体', '平胸', 'flat chest'], ['身体', '小胸', 'small breasts'],
  ['身体', '大胸', 'large breasts'], ['身体', '长腿', 'long legs'],
  ['身体', '短发', 'short hair'], ['身体', '长发', 'long hair'],
  ['身体', '双马尾', 'twintails'], ['身体', '呆毛', 'ahoge'],
  ['身体', '猫耳', 'cat ears'], ['身体', '尾巴', 'tail'],
  ['身体', '虎牙', 'fang'], ['身体', '泪痣', 'mole under eye'],
  ['画风质量', '厚涂', 'impasto'], ['画风质量', '水彩', 'watercolor'],
  ['画风质量', '线稿', 'lineart'], ['画风质量', '单色', 'monochrome'],
  ['画风质量', '赛璐璐', 'cel shading'], ['画风质量', '电影感', 'cinematic'],
  ['画风质量', '景深', 'depth of field'], ['画风质量', '虚化', 'bokeh'],
  ['画风质量', '低分辨率', 'lowres'], ['画风质量', '最差质量', 'worst quality'],
  ['画风质量', '坏手', 'bad hands'], ['画风质量', '多余手指', 'extra fingers'],
  ['画风质量', '人体崩坏', 'bad anatomy'], ['画风质量', '水印', 'watermark'],
  ['画风质量', '文字', 'text'], ['画风质量', '签名', 'signature'],
  ['画风质量', '打码', 'bar censor'], ['画风质量', '马赛克', 'mosaic censoring'],
  ['画风质量', '模糊', 'blurry'],
];

function buildBuiltinTags() {
  const out = [];
  const seen = new Set();
  const add = (tag, label, group) => {
    const t = String(tag || '').trim();
    if (!t || t === 'ORIGINAL' || seen.has(t)) return;
    seen.add(t);
    out.push({ tag: t, label: String(label || ''), group });
  };
  const pairs = (arr, group) => (arr || []).forEach(([zh, tag]) => add(tag, zh, group));
  (SCENES || []).forEach((s) => add(s.tag, s.label, '场景'));
  [...new Set([...(SCENES || []).flatMap((s) => s.outfits || []), ...EXTRA_OUTFITS])]
    .forEach((t) => add(t, OUTFIT_LABELS[t] || '', '服装'));
  [...new Set([...EXTRA_ACTIONS_SFW, ...ADULT_TAGS])]
    .forEach((t) => add(t, ACTION_LABELS[t] || '', '姿势'));
  [...new Set([...EXPRESSIONS_SFW, ...EXPRESSIONS_R18])]
    .forEach((t) => add(t, EXPRESSION_LABELS[t] || '', '表情'));
  pairs(PROPS_SFW, '道具'); pairs(PROPS_R18, '道具');
  pairs(HANDS_SFW, '手上'); pairs(HANDS_R18, '手上');
  pairs(SHOTS, '景别'); pairs(ANGLES, '角度'); pairs(LIGHTS, '光线'); pairs(TIMES, '时间');
  pairs(TATTOO_POSITIONS, '纹身'); pairs(TATTOO_PATTERNS, '纹身');
  (UNDRESS_PARTS || []).forEach((p) => Object.values(p.tags || {}).forEach((t) => add(t, p.label, '穿脱')));
  (BODY_TYPES || []).forEach((b) => add(b.tag, b.label, '体型'));
  /* 标签表里还有一批没进选择池的词，也一起收进来 */
  Object.entries(OUTFIT_LABELS || {}).forEach(([t, l]) => add(t, l, '服装'));
  Object.entries(ACTION_LABELS || {}).forEach(([t, l]) => add(t, l, '姿势'));
  Object.entries(EXPRESSION_LABELS || {}).forEach(([t, l]) => add(t, l, '表情'));
  TAG_EXTRAS.forEach(([group, zh, tag]) => add(tag, zh, group));
  return out;
}

const BUILTIN_TAGS = buildBuiltinTags();
const TAG_RECENT_KEY = 'v2-tag-recent';
const tagUi = { target: 'create', src: 'builtin', q: '', offset: 0, items: [], total: 0, loading: false };

function tagRecent() {
  try { return JSON.parse(localStorage.getItem(TAG_RECENT_KEY) || '[]'); } catch { return []; }
}

function tagRemember(item) {
  try {
    const list = tagRecent().filter((x) => x.tag !== item.tag);
    list.unshift({ tag: item.tag, label: item.label || '', group: item.group || '' });
    localStorage.setItem(TAG_RECENT_KEY, JSON.stringify(list.slice(0, 20)));
  } catch { /* ignore */ }
}

function renderExtraChips() {
  const box = $('#extraChips');
  if (!box) return;
  const chips = [
    ...(state.extra || []).map((t) => ({ t, neg: false })),
    ...(state.extraNeg || []).map((t) => ({ t, neg: true })),
  ];
  box.innerHTML = chips.map(({ t, neg }) =>
    `<button type="button" class="tag-chip${neg ? ' neg' : ''}" data-rm="${neg ? 'neg' : 'pos'}" data-t="${esc(t)}">${esc(t)} <i>×</i></button>`).join('');
}

function insertAtCursor(el, tag) {
  if (!el) return;
  const v = String(el.value || '');
  const at = typeof el.selectionStart === 'number' ? el.selectionStart : v.length;
  const before = v.slice(0, at).replace(/[\s,，]+$/, '');
  const after = v.slice(at).replace(/^[\s,，]+/, '');
  el.value = (before ? before + ', ' : '') + tag + (after ? ', ' + after : '');
  const pos = (before ? before.length + 2 : 0) + tag.length;
  try { el.focus(); el.setSelectionRange(pos, pos); } catch { /* ignore */ }
}

function insertTag(item, neg) {
  if (tagUi.target === 'expert') {
    insertAtCursor(neg ? $('#expNeg') : $('#expPrompt'), item.tag);
  } else {
    const list = neg ? state.extraNeg : state.extra;
    if (!list) return;
    if (!list.includes(item.tag)) {
      list.push(item.tag);
      renderExtraChips();
    }
  }
  tagRemember(item);
  toast(isEnName() ? (neg ? 'Added to negative: ' : 'Added: ') + item.tag : (neg ? '已加到负面词：' + item.tag : '已加：' + item.tag));
}

/* 词表数据：public/v2/wordbank.json（从 lora.db 导，20,000 条，带中文/分类/用过次数） */
let WORD_BANK = null;
let wordBankLoading = null;
const TAG_MAX_ROWS = 300;
const TAG_CATS = [
  ['', '全部', 'All'],
  ['subject', '主体', 'Subject'],
  ['composition', '构图', 'Framing'],
  ['quality', '画质', 'Quality'],
  ['light', '光', 'Light'],
  ['hair', '头发', 'Hair'],
  ['eyes', '眼睛', 'Eyes'],
  ['expression', '表情', 'Expression'],
  ['clothes', '服装', 'Clothes'],
  ['body', '身体', 'Body'],
  ['pose', '姿势', 'Pose'],
  ['action', '动作', 'Action'],
  ['scene', '场景', 'Scene'],
  ['props', '道具', 'Props'],
  ['character', '角色', 'Character'],
  ['style', '风格', 'Style'],
  ['adult', '成人', 'Adult'],
  ['other', '其他', 'Other'],
];
/* 桶 → 当前语言的显示名 */
const TAG_CAT_LABEL = Object.fromEntries(TAG_CATS.map(([k, zh, en]) => [k, (isEnName ? isEnName() : false) ? en : zh]));
const TAG_CAT_ZH = TAG_CAT_LABEL;

function ensureWordbank() {
  if (WORD_BANK) return Promise.resolve(WORD_BANK);
  if (!wordBankLoading) {
    wordBankLoading = fetch('/v2/wordbank.json?v=202611242151')
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        WORD_BANK = Array.isArray(arr) ? arr.map((x) => ({
          tag: x.word, label: x.cn || '', group: x.cat || 'other', count: Number(x.count) || 0,
        })) : [];
        return WORD_BANK;
      })
      .catch(() => { WORD_BANK = []; return WORD_BANK; });
  }
  return wordBankLoading;
}

/* 词表 + 内置词表合并：中文名以词表里的为准，内置的叫法留作别名一起能搜到 */
function tagAll() {
  const map = new Map();
  (WORD_BANK || []).forEach((x) => map.set(x.tag, { ...x }));
  BUILTIN_TAGS.forEach((x) => {
    const cur = map.get(x.tag);
    if (cur) {
      if (x.label && x.label !== cur.label) cur.alt = x.label;
      if (!cur.group || cur.group === 'other') cur.group = x.group;
    } else {
      map.set(x.tag, { tag: x.tag, label: x.label, group: x.group, count: 0 });
    }
  });
  return [...map.values()].filter(tagVisible);
}

function tagVisible(item) {
  if (!item) return false;
  if (item.group === 'adult' && !state.r18) return false;
  return true;
}

function tagMatches(item, q) {
  if (!q) return true;
  const k = q.toLowerCase();
  return item.tag.toLowerCase().includes(k)
    || String(item.label || '').toLowerCase().includes(k)
    || String(item.alt || '').toLowerCase().includes(k);
}

function renderTagCats() {
  const box = $('#tagCats');
  if (!box) return;
  box.innerHTML = TAG_CATS
    .filter(([key]) => key !== 'adult' || state.r18)
    .map(([key, zh, en]) =>
      `<button type="button" class="quick-chip${key === tagUi.cat ? ' on' : ''}" data-cat="${key}">${isEnName() ? en : zh}</button>`).join('');
}

function renderTagList() {
  const box = $('#tagList');
  if (!box) return;
  const shown = tagUi.items.slice(0, TAG_MAX_ROWS);
  box.innerHTML = shown.length
    ? shown.map((it) => `<button type="button" class="tag-row" data-tag="${esc(it.tag)}" data-label="${esc(it.label || '')}" data-group="${esc(it.group || '')}">
      <code>${esc(it.tag)}</code>
      <span class="tg-lb">${esc(isEnName() ? '' : (it.label || ''))}</span>
      <span class="tg-meta">${it.count ? `${it.count}${isEnName() ? ' LoRAs' : ' 支'}` : esc(TAG_CAT_ZH[it.group] || '')}</span>
    </button>`).join('')
    : '<div class="tag-empty hint">没找到。换个词试试，中文英文都行。</div>';
  if ($('#tagCount')) {
    const total = tagUi.total;
    $('#tagCount').textContent = !total ? '' : (isEnName()
    ? (total > TAG_MAX_ROWS ? `${total} tags, showing first ${TAG_MAX_ROWS}` : `${total} tags`)
    : (total > TAG_MAX_ROWS ? `${total} 条，显示前 ${TAG_MAX_ROWS}` : `${total} 条`));
  }
  if ($('#tagMore')) $('#tagMore').classList.add('hidden');
}

async function loadTagSource() {
  const q = tagUi.q;
  const cat = tagUi.cat;
  let list;
  if (tagUi.src === 'recent') {
    list = tagRecent().map((x) => ({ ...x, count: x.count || 0 }));
  } else {
    await ensureWordbank();
    list = tagAll();
    list.sort((a, b) => (b.count || 0) - (a.count || 0));
  }
  list = list.filter((x) => tagMatches(x, q));
  if (cat) list = list.filter((x) => (x.group || 'other') === cat);
  tagUi.items = list;
  tagUi.total = list.length;
  renderTagList();
}

function setTagSource(src) {
  tagUi.src = src;
  $$('#tagSrc [data-src]').forEach((b) => b.classList.toggle('on', b.dataset.src === src));
  loadTagSource();
}

function openTagPicker(target) {
  const modal = $('#tagModal');
  if (!modal) return;
  tagUi.target = target;
  tagUi.q = '';
  tagUi.cat = '';
  if ($('#tagSearch')) $('#tagSearch').value = '';
  if ($('#tagHint')) {
    $('#tagHint').textContent = target === 'expert'
      ? '点一行插到正面；按住 Shift 点插到负面'
      : '点一行加到「附加词」；按住 Shift 点加到附加负面';
  }
  modal.classList.remove('hidden');
  renderTagCats();
  setTagSource('all');
  setTimeout(() => $('#tagSearch')?.focus(), 60);
}

function closeTagPicker() {
  $('#tagModal')?.classList.add('hidden');
}

function bindTagPicker() {
  if ($('#tagOpenCreate')) $('#tagOpenCreate').onclick = () => openTagPicker('create');
  if ($('#tagOpenExpert')) $('#tagOpenExpert').onclick = () => openTagPicker('expert');
  if ($('#tagClose')) $('#tagClose').onclick = closeTagPicker;
  const modal = $('#tagModal');
  if (modal) modal.onclick = (e) => { if (e.target === modal) closeTagPicker(); };
  if ($('#tagSrc')) {
    $('#tagSrc').onclick = (e) => {
      const b = e.target.closest('[data-src]');
      if (b) setTagSource(b.dataset.src);
    };
  }
  if ($('#tagCats')) {
    $('#tagCats').onclick = (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      tagUi.cat = b.dataset.cat;
      if (tagUi.cat === 'adult' && !state.r18) tagUi.cat = '';
      renderTagCats();
      loadTagSource();
    };
  }
  const search = $('#tagSearch');
  if (search) {
    search.addEventListener('input', () => {
      clearTimeout(search._t);
      search._t = setTimeout(() => { tagUi.q = search.value.trim(); loadTagSource(true); }, 180);
    });
  }
  if ($('#tagMore')) $('#tagMore').onclick = () => loadTagSource(false);
  if ($('#tagList')) {
    $('#tagList').onclick = (e) => {
      const row = e.target.closest('.tag-row');
      if (!row) return;
      insertTag({ tag: row.dataset.tag, label: row.dataset.label, group: row.dataset.group }, !!e.shiftKey);
    };
  }
  if ($('#extraChips')) {
    $('#extraChips').onclick = (e) => {
      const b = e.target.closest('[data-rm]');
      if (!b) return;
      const list = b.dataset.rm === 'neg' ? state.extraNeg : state.extra;
      const i = list.indexOf(b.dataset.t);
      if (i >= 0) list.splice(i, 1);
      renderExtraChips();
    };
  }
}

function allOutfits() {
  const all = [...new Set([...SCENES.flatMap((s) => s.outfits), ...EXTRA_OUTFITS, ...OUTFIT_THEME_SETS.map(([t]) => t)])];
  return all.filter((x) => OUTFIT_SETS.has(x) && (state.r18 || !ADULT_OUTFITS.includes(x)));
}

/* 场景里的单件也不让选：只取场景里对得上的套装，没有就用全量 */
/* 场景里还在用单件（针织衫 / 白T / 牛仔裤 / 风衣…）：统一换成整套。
   不然它们被「只留整套」白名单滤掉，场景服装就退化成 fallback，随机起来跟场景不搭。 */
const SCENE_OUTFIT_MAP = {
  'knit sweater': 'casual clothes, cardigan, skirt, loafers',
  'white t-shirt': 'casual clothes, cardigan, skirt, loafers',
  'camisole': 'casual clothes, cardigan, skirt, loafers',
  'sun shirt': 'casual clothes, cardigan, skirt, loafers',
  'hoodie': 'casual clothes, cardigan, skirt, loafers',
  'shorts': 'casual clothes, cardigan, skirt, loafers',
  'cardigan': 'casual clothes, cardigan, skirt, loafers',
  'crop top': 'casual clothes, cardigan, skirt, loafers',
  'apron': 'apron only',
  'fishnet': 'body stocking, sheer, garter belt, high heels',
  'black pantyhose': 'office lady, white blouse, pencil skirt, black pantyhose',
  'collar': 'bondage outfit, straps, harness, cuffs',
  'coat': 'winter coat, turtleneck, plaid skirt, black tights, boots',
  'turtleneck': 'winter coat, turtleneck, plaid skirt, black tights, boots',
  'sports bra': 'track suit, sneakers',
  'leggings': 'track suit, sneakers',
  'blouse': 'office lady, white blouse, pencil skirt, black pantyhose',
  'jeans': 'casual suit, blazer, jeans, sneakers',
  'corset': 'lace babydoll, thighhighs, garter belt',
  'bustier': 'lingerie',
  'dress': 'casual clothes, cardigan, skirt, loafers',
  'uniform': 'school uniform, pleated skirt, black knee socks, loafers',
  'jersey': 'volleyball uniform, jersey, shorts, knee pads, sneakers',
  'tennis outfit': 'tennis outfit, pleated skirt, white socks, sneakers',
  'swimsuit': 'one-piece swimsuit, sandals',
  'school uniform': 'school uniform, pleated skirt, black knee socks, loafers',
  'sailor uniform': 'sailor uniform, pleated skirt, white socks, loafers',
  'pajamas': 'pajamas, white socks, slippers',
  'casual clothes': 'casual clothes, cardigan, skirt, loafers',
  'bikini': 'bikini, straw hat, sandals',
  'kimono': 'kimono, obi, tabi, sandals',
  'cheongsam': 'cheongsam, black pantyhose, high heels, hair ornament',
  'gym clothes': 'gym uniform, bloomers, white socks, sneakers',
  'office lady': 'office lady, white blouse, pencil skirt, black pantyhose',
  'yukata': 'yukata, obi, sandals, hair ornament',
  'wet clothes': 'wet clothes, wet shirt, see-through',
  'bunny suit': 'bunny suit, black pantyhose, high heels, bunny ears',
  'latex': 'latex dress, black pantyhose, high heels, gloves',
  'sundress': 'casual clothes, cardigan, skirt, loafers',
  'school swimsuit': 'school swimsuit, swim cap, sandals',
  'wedding dress': 'wedding dress, veil, white thighhighs, gloves',
  'gothic lolita': 'gothic lolita, frilled dress, black thighhighs, mary janes',
  'stage costume': 'idol costume, frilled skirt, white thighhighs, boots',
  'hanfu': 'hanfu, hair ornament, flats',
  'nurse outfit': 'nurse outfit, white dress, nurse cap, white pantyhose',
  'evening gown': 'evening gown, black pantyhose, high heels, earrings',
  'bondage outfit': 'bondage outfit, straps, harness, cuffs',
};

function sceneOutfitSets(scene) {
  const raw = scene ? (scene.outfits || []) : [];
  const seen = new Set();
  const list = [];
  for (const t of raw) {
    const mapped = SCENE_OUTFIT_MAP[t] || t;
    if (seen.has(mapped)) continue;
    if (!OUTFIT_SETS.has(mapped)) continue;
    if (!state.r18 && ADULT_OUTFITS.includes(mapped)) continue;
    seen.add(mapped);
    list.push(mapped);
  }
  if (list.length) return list;
  /* 场景自带的衣服全被「整套」白名单滤掉时，别退回全量：冬季街道会随机出泳装 */
  const fallback = ['casual clothes, cardigan, skirt, loafers', 'school uniform, pleated skirt, black knee socks, loafers'];
  if (state.r18) fallback.push('lingerie');
  const valid = fallback.filter((t) => OUTFIT_SETS.has(t) && (state.r18 || !ADULT_OUTFITS.includes(t)));
  return valid.length ? valid : allOutfits();
}

/* 只属于「手上动作」或「穿脱」的词，不从姿势里出；场景自带的也拦掉 */
const POSE_EXCLUDE = new Set([
  'waving', 'peace sign', 'hands behind back', 'hands in pockets', 'blowing kiss', 'finger to lips',
  'arms behind head', 'hands on knees', 'hugging own body', 'covering mouth', 'playing with hair',
  'tucking hair behind ear', 'putting on lipstick', 'adjusting stockings', 'adjusting clothes',
  'undressing', 'changing clothes', 'undressing herself', 'lifting skirt', 'lifting shirt',
  'taking off jacket', 'putting on socks', 'putting on shoes', 'tying shoes', 'tying ribbon',
  'foot focus', 'feet close-up', 'foot close-up', 'thigh focus', 'leg focus',
  'leg focus, thighs close-up', 'thigh focus, thighs close-up', 'long legs', 'thigh gap',
  'toes', 'soles', 'bare legs', 'pantyhose feet', 'lower body, thighs and feet',
]);
function allActions() {
  /* 成人专属动作（ADULT_ACTIONS）以前只当「成人标记」用，从不进池子；
     现在它同时是成人模式的来源之一，正常模式靠下面的过滤挡住。 */
  const extra = state.r18 ? ADULT_ACTIONS : [];
  const all = [...new Set([...SCENES.flatMap((s) => [...(s.actions || []), ...(SCENE_EXTRA_ACTIONS[s.tag] || [])]), ...EXTRA_ACTIONS_SFW, ...EXTRA_POSES_SFW, ...extra])];
  return all.filter((x) => !DUO_ONLY_ACTIONS.has(x) && !POSE_EXCLUDE.has(x) && (state.r18 || !ADULT_TAGS.has(x)));
}

/* pose 是身体怎么摆；action 是在干什么。两者分开选、分开进词。 */
const POSE_RE = /\b(sitting|standing|lying|kneeling|squatting|crouching|on all fours|on back|on stomach|on side|spread legs|legs up|legs spread|bent over|arched back|presenting|face down|against wall|straddling|sitting on lap|missionary|cowgirl|doggystyle|spooning|mating press|prone bone|reverse cowgirl|suspended congress|lotus|full nelson|piledriver|amazon position|69|leg lock|lifted legs|riding pillow|in water|face to face|knees up|legs together|legs apart|crossed legs|crossing legs|legs crossed|legs bent|legs stretched|stretching legs|feet up|leg lift|legs over shoulders|knees to chest|hugging knees|fetal position|leaning on|curled up|under blanket|knees together|one leg raised|high kick|splits|crossed ankles|bare feet|feet on table|feet on chair|foot on chair|pantyhose feet|wading|at desk|head on arms|resting head on arms|chin on knees|legs dangling|on floor|on sofa|on chair|on table|on desk|on bed|on grass|on sand|on rock|on stairs|on bench)\b/i;
function isPoseTag(tag) {
  return POSE_RE.test(String(tag || '').replace(/_/g, ' '));
}
function poseTagsOf(list) {
  return (list || []).filter(isPoseTag);
}
function actTagsOf(list) {
  return (list || []).filter((t) => !isPoseTag(t));
}

/* 互斥：插入体位不能同时口交/手交/走路；要动起来的动作必须站着 */
const SEX_POSES = new Set([
  'missionary', 'cowgirl', 'doggystyle', 'spooning', 'mating press', 'prone bone',
  'reverse cowgirl', 'suspended congress', 'lotus', 'full nelson', 'piledriver',
  'amazon position', 'standing sex', '69',
]);
const ORAL_ACTION_RE = /\b(fellatio|cunnilingus|irrumatio|deepthroat|licking glans|licking testicles|cum in mouth|swallowing|facial|cum on face)\b/i;
const MANUAL_ACTION_RE = /\b(paizuri|titjob|handjob|footjob|masturbat|fingering herself|rubbing herself)\b/i;
const MOVING_ACTION_RE = /\b(walking|running|jumping|dancing|climbing|crawling|fleeing|skateboarding|riding scooter|riding bike)\b/i;
const SEATED_ACTION_RE = /\b(reading|eating|drinking|holding phone|playing piano|painting|cooking|sleeping|waking up|working)\b/i;
const SEX_POSE_ACTIONS = new Set([
  'kissing', 'hugging each other', 'breast grab', 'moaning', 'panting',
  'after sex', 'afterglow', 'orgasm', 'squirting', 'creampie',
  'cum on body', 'cum on stomach', 'body trembling', 'legs trembling', 'toes curling',
  'gripping bedsheet', 'clutching pillow', 'hand between legs', 'kissing neck', 'biting neck',
  'grabbing waist', 'pinning wrists', 'hair pulled', 'leg lock', 'legs wrapped around',
  'sitting on lap', 'straddling', 'face to face', 'selfie together', 'looking at viewer',
]);
function poseActionCompatible(pose, action) {
  const p = String(pose || '').toLowerCase();
  const a = String(action || '').toLowerCase();
  if (!p || !a) return true;
  const sexPose = SEX_POSES.has(p) || /penetration|sex/.test(p);
  if (sexPose) return SEX_POSE_ACTIONS.has(a);
  if (MOVING_ACTION_RE.test(a) && !/\bstanding\b/.test(p)) return false;
  if (/\bstanding\b/.test(p) && /\b(bathing|knees up|legs up|feet up|hugging knees|reading on bed|sunbathing|sleeping)\b/.test(a)) return false;
  return true;
}

const ACTION_SCENE_RULES = [
  [/\bbathing\b|wrapping towel/i, /bath|onsen|shower|pool|public bath|sauna/i],
  [/sunbathing/i, /beach|pool|garden|park|rooftop/i],
  [/cooking|drinking from cup|drinking tea/i, /kitchen|cafe|living room|dining/i],
  [/playing piano/i, /music room|living room|party|backstage/i],
  [/painting|drawing at easel/i, /art room/i],
  [/praying/i, /shrine|church/i],
  [/in water|wading|swimming/i, /pool|beach|onsen|bath|swimming/i],
  /* 补进全局池的日常动作：不在不该出现的场景里冒出来 */
  [/holding umbrella/i, /rain|street|bus stop|city|garden|park|festival/i],
  [/eating|eating popcorn|holding drink/i, /cafe|living room|kitchen|convenience store|campsite|dessert shop|dining|restaurant|park|festival|beach|cinema|classroom/i],
  [/sleeping/i, /bedroom|bus interior|dorm|living room|tent|sofa|tatami|hotel/i],
  [/dancing/i, /nightclub|party|stage|backstage|street|festival|dance/i],
  [/looking at sky/i, /campsite|rooftop|shrine|forest|beach|balcony|park|garden/i],
];
function actionSceneCompatible(action, scene) {
  if (!action || !scene) return true;
  for (const [actionRe, sceneRe] of ACTION_SCENE_RULES) {
    if (actionRe.test(action) && !sceneRe.test(scene)) return false;
  }
  return true;
}

const UNDRESS_ACTION_RE = /\b(undress|undressing|taking off|pulling down|pulling off|lifting skirt|lifting shirt|lifting dress|adjusting clothes|changing clothes|panty pull|bra lift|clothes lift|shirt lift|skirt lift|putting on|getting dressed)\b/i;
function actionUndressCompatible(action, ud) {
  if (!action || !ud) return true;
  if (!(ud.fullyNude || ud.underwearOnly || ud.tags.length)) return true;
  return !UNDRESS_ACTION_RE.test(action);
}
function isSexualContext(pose, action, stage) {
  const text = `${action || ''} ${stage || ''}`.toLowerCase();
  return SEX_POSES.has(String(pose || '').toLowerCase())
    || /\b(sex|penetration|fellatio|cunnilingus|paizuri|handjob|footjob|masturbat|fingering|orgasm|climax|squirting|creampie|cum|cowgirl|missionary|doggystyle|spooning|mating press|prone bone|reverse cowgirl|suspended congress|lotus|full nelson|piledriver|amazon position|69|after sex|afterglow)\b/.test(text);
}

/* 景别 / 角度跟姿势走：后入不能正面平视，正常位不能从背后拍 */
function poseShotCompatible(pose, action, shot, angle) {
  const p = String(pose || '').toLowerCase();
  const s = String(shot || '').toLowerCase();
  const a = String(angle || '').toLowerCase();
  const rear = /from behind|rear view/.test(`${s} ${a}`);
  const front = /straight-on|facing viewer|pov/.test(`${s} ${a}`);
  if (/missionary|mating press|prone bone|spooning|lotus|suspended congress/.test(p) && rear) return false;
  if (/doggystyle|on all fours|face down ass up/.test(p) && /straight-on|facing viewer/.test(`${s} ${a}`)) return false;
  if (/face focus/.test(s) && /from behind|rear view/.test(a)) return false;
  if (/from behind/.test(s) && front) return false;
  return true;
}

function pickerOptionsFor(field) {
  if (field === 'body') return ((state.r18 && !isDevBuild()) ? BODY_TYPES.filter((b) => ADULT_OK_BODY_LABELS.has(b.label)) : BODY_TYPES).map((b) => ({ tag: b.tag, label: b.label }));
  if (field === 'people') return PEOPLE_OPTS.map(([label, tag]) => ({ tag, label }));
  if (field === 'duoRole') return state.people === 'duo'
    ? DUO_ROLE_OPTS.filter(([, tag]) => duoRoleCompatible(tag, state.pose)).map(([label, tag]) => ({ tag, label }))
    : [];
  if (field === 'model') {
    const o = state.options || {};
    const list = [{ tag: '', label: '默认' }];
    for (const x of o.checkpoints || []) list.push({ tag: 'checkpoint:' + x, label: '整包 · ' + x });
    for (const x of o.unets || []) list.push({ tag: 'unet:' + x, label: 'unet · ' + x });
    return list;
  }
  if (field === 'clip') return [{ tag: '', label: '自动' }, ...(state.options && state.options.clips || []).map((x) => ({ tag: x, label: x }))];
  if (field === 'vae') return [{ tag: '', label: '自动' }, ...(state.options && state.options.vaes || []).map((x) => ({ tag: x, label: x }))];
  if (field === 'maleBody') return MALE_BODY_TYPES.map(([label, tag]) => ({ tag, label }));
  if (field === 'penis') return PENIS_SIZES.map(([label, tag]) => ({ tag, label }));
  if (field === 'charOutfit') return CHAR_OUTFIT_OPTS.map(([label, tag]) => ({ tag, label }));
  if (field === 'outfitLora') return [{ tag: '', label: '不指定' }, ...state.loraLists.outfit.map((it) => ({ tag: it.rel_path, label: loraLabel(it) || '未命名' }))];
  if (field === 'actionLora') return [{ tag: '', label: '不指定' }, ...state.loraLists.aux.map((it) => ({ tag: it.rel_path, label: loraLabel(it) || '未命名' }))];
  if (field === 'auxSlot') return [{ tag: '', label: '不指定' }, ...state.loraLists.aux.map((it) => ({ tag: it.rel_path, label: loraLabel(it) || '未命名' }))];
  if (field === 'auxLora') return [{ tag: '', label: '不指定' }, ...state.loraLists.aux.map((it) => ({ tag: it.rel_path, label: loraLabel(it) || '未命名' }))];
  if (field === 'props') return (state.r18 ? PROPS_R18 : PROPS_SFW)
    .filter(([, t]) => (state.people !== 'solo' || !PROPS_NEED_MALE.has(t))
      && propSceneCompatible(t, state.scene) && propHandCompatible(t, state.hands))
    .map(([label, tag]) => ({ tag, label }));
  if (field === 'hands') return (state.r18 ? HANDS_R18 : HANDS_SFW)
    .filter(([, t]) => (state.people !== 'solo' || !HANDS_PARTNER.has(t)) && propHandCompatible(state.props, t))
    .map(([label, tag]) => ({ tag, label }));
  if (field === 'stage') return state.r18 ? STAGES.map(([label, tag]) => ({ tag, label })) : [];
  if (field === 'undress') return state.r18 ? UNDRESS.map(([label, tag]) => ({ tag, label })) : [];
  if (field === 'tattoo') return TATTOO_POSITIONS
    .filter(([, t]) => state.r18 || !ADULT_TATTOO_TAGS.has(t))
    .map(([label, tag]) => ({ tag, label }));
  if (field === 'tattooPattern') return TATTOO_PATTERNS.map(([label, tag]) => ({ tag, label }));
  if (field === 'tattooGlow') return [{ tag: '', label: '关' }, { tag: 'on', label: '开' }];
  if (field === 'wet') return state.r18 && isSexualContext(state.pose, state.action, state.stage) ? [{ tag: WET_RANDOM, label: '随机' }, ...WET_LEVELS.map(([label]) => ({ tag: label, label }))] : [];
  if (field === 'shot') return SHOTS.filter(([, tag]) => (state.r18 || !ADULT_SHOTS.has(tag)) && poseShotCompatible(state.pose, state.action, tag, '')).map(([label, tag]) => ({ tag, label }));
  if (field === 'angle') {
    const baseShot = state.shot && poseShotCompatible(state.pose, state.action, state.shot, '') ? state.shot : '';
    return ANGLES.filter(([, tag]) => poseShotCompatible(state.pose, state.action, baseShot, tag)).map(([label, tag]) => ({ tag, label }));
  }
  if (field === 'light') return LIGHTS.map(([label, tag]) => ({ tag, label }));
  if (field === 'time') return TIMES.filter(([, tag]) => sceneTimeCompatible(state.scene, tag)).map(([label, tag]) => ({ tag, label }));
  if (field === 'scene') return modeScenes().map((s) => ({ tag: s.tag, label: s.label }));
  const scene = state.scene ? sceneByTag(state.scene) : null;
  if (field === 'outfit') {
    const tags = (state.r18 || !scene ? allOutfits() : sceneOutfitSets(scene)).filter((t) => sceneOutfitCompatible(state.scene, t));
    const list = tags.map((x) => ({ tag: x, label: labelOf(OUTFIT_LABELS, x) }));
    /* 快捷风格可能填了不在白名单里的单件：至少让当前这件在选择器里有回显 */
    const custom = state.outfit && state.outfit !== 'LORA' && state.outfit !== 'ORIGINAL'
      && (state.r18 || !ADULT_OUTFITS.includes(state.outfit)) && !tags.includes(state.outfit) ? state.outfit : '';
    if (custom) list.unshift({ tag: custom, label: labelOf(OUTFIT_LABELS, custom) });
    if (state.char || state.charPreset) list.unshift({ tag: 'ORIGINAL', label: '原装' });
    else list.unshift({ tag: '', label: '随机' });
    /* 服装支不在这里混排：只留一个入口，选完弹专门的服装支列表 */
    list.unshift({ tag: 'LORA', label: '使用服装 LoRA…' });
    return list;
  }
  if (field === 'pose') {
    if (state.people === 'duo') {
      return duoPosePairs().filter(([, t]) => poseActionCompatible(t, state.action)).map(([label, tag]) => ({ tag, label }));
    }
    const tags = poseTagsOf(filterActionsForScene(allActions(), scene && scene.tag));
    return tags.filter((x) => !DUO_ONLY_ACTIONS.has(x) && (state.r18 || !ADULT_TAGS.has(x)) && poseActionCompatible(x, state.action))
      .map((x) => ({ tag: x, label: labelOf(ACTION_LABELS, x) }));
  }
  if (field === 'action') {
    const ud = computeUndress(state.r18);
    if (state.people === 'duo') {
      const pairs = duoActPairs().filter(([, t]) => poseActionCompatible(state.pose, t) && actionUndressCompatible(t, ud) && actionSceneCompatible(t, scene && scene.tag));
      return [{ tag: '__ACTION_LORA__', label: '使用动作 LoRA…' }, ...pairs.map(([label, tag]) => ({ tag, label }))];
    }
    /* 动作按场景收：只留这个场景能用的 */
    const tags = actTagsOf(filterActionsForScene(allActions(), scene && scene.tag));
    return [{ tag: '__ACTION_LORA__', label: '使用动作 LoRA…' },
      ...tags.filter((x) => !DUO_ONLY_ACTIONS.has(x) && (state.r18 || !ADULT_TAGS.has(x)) && poseActionCompatible(state.pose, x) && actionUndressCompatible(x, ud) && actionSceneCompatible(x, scene && scene.tag)).map((x) => ({ tag: x, label: labelOf(ACTION_LABELS, x) }))];
  }
  if (field === 'expression') {
    const all = state.r18 ? EXPRESSIONS_R18 : EXPRESSIONS_SFW;
    const recommended = expressionPoolFor(state.pose, state.action);
    return [...new Set([...recommended, ...all])].map((x) => ({ tag: x, label: labelOf(EXPRESSION_LABELS, x) }));
  }
  return [];
}

/* 底部按钮清空后实际是什么，就写什么；别一律写「随机」 */
function pickerClearLabel(field) {
  if (field === 'outfit') return (state.char || state.charPreset) ? '原装' : '随机';
  if (field === 'tattooGlow') return '关';
  if (field === 'wet') return '不流';
  if (field === 'people') return '单人';
  if (field === 'duoRole') return '自动';
  if (field === 'shot' || field === 'light' || field === 'model' || field === 'clip' || field === 'vae'
    || field === 'maleBody' || field === 'penis') return '默认';
  if (field === 'scene' || field === 'pose' || field === 'action' || field === 'expression' || field === 'body' || field === 'props') return '随机';
  return '不指定';
}

function openPicker(field, skipRefresh = false) {
  if (field === 'body' && (state.char || state.charPreset) && !state.bodyOverride) { toast('挂角色时用角色原设体型，不覆盖', true); return; }
  if (field === 'props' && !state.useProps) { toast('先打开「启用道具」', true); return; }
  if ((field === 'tattooPattern' || field === 'tattooGlow') && !state.tattoo) { toast('先选纹身位置', true); return; }
  if (field === 'wet' && !(state.r18 && isSexualContext(state.pose, state.action, state.stage))) { toast('先选一个性爱姿势或动作，再选淫水', true); return; }
  state.pickerField = field;
  /* 底部按钮在有的字段是「随机抽一个」，有的是「清空回默认/无」 */
  $('#pickerRandom').textContent = (field === 'tattoo' || field === 'tattooPattern') ? '随机' : pickerClearLabel(field);
  const titles = {
    body: '选体型', scene: '选场景', outfit: '选服装', pose: '选姿势', action: '选动作', expression: '选表情',
    duoRole: '选双人主动',
    people: '选人数', model: '选模型', clip: '选 CLIP', vae: '选 VAE', maleBody: '选男性体型', penis: '选阴茎大小', charOutfit: '选穿脱程度', props: '选道具', hands: '选手上动作', stage: '选阶段', undress: '选穿脱',
    outfitLora: '选服装支', auxLora: '选辅助支', actionLora: '选动作支', auxSlot: '选一支 LoRA',
    shot: '选景别', angle: '选角度', light: '选光线', time: '选时间',
    tattoo: '选纹身位置', tattooPattern: '选纹身图案', tattooGlow: '纹身发光',
  };
  $('#pickerTitle').textContent = titles[field] || '选择';
  const cur = field === 'outfitLora'
    ? (state.outfitLora ? state.outfitLora.rel_path : '')
    : (field === 'actionLora'
      ? (state.actionLora ? state.actionLora.rel_path : '')
      : (field === 'auxLora'
        ? (state.auxLora ? state.auxLora.rel_path : '')
        : (field === 'auxSlot'
          ? ((state.auxLoras[state.auxIndex] || {}).rel_path || '')
          : state[field])));
  if ($('#pickerSearch')) $('#pickerSearch').value = '';
  const opts = pickerOptionsFor(field);
  /* 动作按组排：双人一份分组、单人一份分组，插组标题，找起来不用一行行扫 */
  const grouped = field === 'action';
  const isDuo = state.people === 'duo';
  const list = grouped ? (isDuo ? sortDuoByGroup(opts) : sortSoloByGroup(opts)) : opts;
  const groupOf = (tag) => (isDuo ? duoActionGroup(tag) : soloActionGroup(tag));
  let html = '';
  let lastGroup = '';
  for (const o of list) {
    if (grouped && !String(o.tag).startsWith('__')) {
      const g = groupOf(o.tag);
      if (g !== lastGroup) { html += `<div class="picker-group">${esc(g)}</div>`; lastGroup = g; }
    }
    html += `<button class="picker-opt ${o.tag === cur ? 'on' : ''}" data-pick-val="${esc(o.tag)}">${esc(o.label)}</button>`;
  }
  $('#pickerOptions').innerHTML = html || '<div class="hint">没有可选</div>';
  $('#pickerModal').classList.remove('hidden');
  if (!skipRefresh) {
    const slot = (field === 'outfit' || field === 'outfitLora') ? 'outfit' : ((field === 'auxLora' || field === 'actionLora' || field === 'auxSlot') ? 'aux' : '');
    if (slot) {
      loadLoraSlot(slot).then(() => {
        if (state.pickerField === field && !$('#pickerModal').classList.contains('hidden')) openPicker(field, true);
      }).catch(() => {});
    }
  }
}

function closePicker() {
  $('#pickerModal').classList.add('hidden');
}

function setPick(field, tag) {
  if (field === 'body' && (state.char || state.charPreset) && !state.bodyOverride) { toast('挂角色时用角色原设体型，不覆盖', true); closePicker(); return; }
  if (field === 'props' && !state.useProps) { toast('先打开「启用道具」', true); closePicker(); return; }
  if ((field === 'tattooPattern' || field === 'tattooGlow') && tag && !state.tattoo) { toast('先选纹身位置', true); closePicker(); return; }
  let openNext = '';
  if (field === 'outfit') {
    if (tag && tag !== 'LORA' && !String(tag).startsWith('lora:') && !sceneOutfitCompatible(state.scene, tag)) {
      toast('这套衣服和当前场景不搭', true);
      closePicker();
      return;
    }
    if (tag === 'LORA') {
      /* 先不落 state：等服装支真的选好了再挂，不然中途关掉会剩一个空的「服装支」 */
      openNext = 'outfitLora';
    } else if (String(tag || '').startsWith('lora:')) {
      const rel = String(tag).slice(5);
      state.outfitLora = state.loraLists.outfit.find((x) => x.rel_path === rel) || null;
      state.outfit = 'LORA';
      if (state.outfitLora) chooseLoraVariant(state.outfitLora, 'outfitLora');
    } else {
      state.outfit = tag || '';
      state.outfitLora = null;
    }
  } else if (field === 'outfitLora') {
    state.outfitLora = tag ? (state.loraLists.outfit.find((x) => x.rel_path === tag) || null) : null;
    if (state.outfitLora) {
      state.outfit = 'LORA';
      chooseLoraVariant(state.outfitLora, 'outfitLora');
    } else if (state.outfit === 'LORA') {
      state.outfit = '';
    }
  } else if (field === 'pose') {
    state.pose = tag || '';
    state.actionLora = null;
    if (state.duoRole && !duoRoleCompatible(state.duoRole, state.pose)) state.duoRole = '';
    if (state.pose && state.action && !poseActionCompatible(state.pose, state.action)) {
      state.action = '';
      toast('这个姿势和动作互斥，动作已清空', true);
    }
  } else if (field === 'duoRole') {
    if (state.people !== 'duo') {
      toast('先切到双人', true);
      closePicker();
      return;
    }
    if (tag && !duoRoleCompatible(tag, state.pose)) {
      toast('这个主动方和当前体位不搭', true);
      closePicker();
      return;
    }
    state.duoRole = tag || '';
  } else if (field === 'action') {
    if (tag === '__ACTION_LORA__') {
      state.action = '';
      state.pose = '';
      if (!state.actionLora) openNext = 'actionLora';
    } else {
      if (tag && !poseActionCompatible(state.pose, tag)) {
        toast('这个动作和当前姿势互斥，先换姿势', true);
        closePicker();
        return;
      }
      if (tag && !actionUndressCompatible(tag, computeUndress(state.r18))) {
        toast('这个动作和当前穿脱状态冲突', true);
        closePicker();
        return;
      }
      if (tag && !actionSceneCompatible(tag, state.scene)) {
        toast('这个动作和当前场景不搭', true);
        closePicker();
        return;
      }
      state.action = tag || '';
      state.actionLora = null;
    }
  } else if (field === 'actionLora') {
    state.actionLora = tag ? (state.loraLists.aux.find((x) => x.rel_path === tag) || null) : null;
    if (state.actionLora) {
      state.action = '';
      state.pose = '';
      chooseLoraVariant(state.actionLora, 'actionLora');
    }
  } else if (field === 'auxSlot') {
    const it = tag ? (state.loraLists.aux.find((x) => x.rel_path === tag) || null) : null;
    if (state.auxIndex >= 0 && state.auxIndex < state.auxLoras.length) state.auxLoras[state.auxIndex] = it;
    if (it) chooseLoraVariant(it, 'auxSlot');
  } else if (field === 'auxLora') {
    state.auxLora = tag ? (state.loraLists.aux.find((x) => x.rel_path === tag) || null) : null;
    if (state.auxLora) chooseLoraVariant(state.auxLora, 'auxLora');
  } else if (field === 'tattoo') {
    state.tattoo = tag || '';
    if (!tag) { state.tattooPattern = ''; state.tattooGlow = ''; }
  } else if (field === 'props') {
    if (tag && (!propSceneCompatible(tag, state.scene) || !propHandCompatible(tag, state.hands))) {
      toast('这个道具和当前场景/手上动作不搭', true);
      closePicker();
      return;
    }
    state.props = tag || '';
  } else if (field === 'hands') {
    if (tag && !propHandCompatible(state.props, tag)) {
      toast('这个手上动作和当前道具不搭', true);
      closePicker();
      return;
    }
    state.hands = tag || '';
  } else if (field === 'time') {
    if (tag && !sceneTimeCompatible(state.scene, tag)) {
      toast('这个时间和当前场景不搭', true);
      closePicker();
      return;
    }
    state.time = tag || '';
  } else if (field === 'wet') {
    if (tag && !isSexualContext(state.pose, state.action, state.stage)) {
      toast('这个场景/动作没有淫水可写', true);
      closePicker();
      return;
    }
    state.wet = tag || '';
  } else if (field === 'expression') {
    const all = state.r18 ? EXPRESSIONS_R18 : EXPRESSIONS_SFW;
    if (tag && !all.includes(tag)) {
      toast('这个表情在当前模式不可用', true);
      closePicker();
      return;
    }
    state.expression = tag || '';
  } else if (field === 'shot' || field === 'angle') {
    if (field === 'shot' && tag && !state.r18 && ADULT_SHOTS.has(tag)) {
      toast('这个特写只在成人模式出现', true);
      closePicker();
      return;
    }
    if (tag && !poseShotCompatible(state.pose, state.action, field === 'shot' ? tag : state.shot, field === 'angle' ? tag : state.angle)) {
      if (field === 'shot' && poseShotCompatible(state.pose, state.action, tag, '')) {
        state.angle = '';
      } else {
        toast('这个景别/角度和当前姿势不搭', true);
        closePicker();
        return;
      }
    }
    state[field] = tag || '';
  } else {
    state[field] = tag || '';
  }
  if (field === 'people') {
    const duoPosePool = duoPosePairs().map((x) => x[1]);
    const duoActPool = duoActPairs().map((x) => x[1]);
    if (tag === 'duo') {
      if (state.pose && !duoPosePool.includes(state.pose)) state.pose = '';
      if (state.action && !duoActPool.includes(state.action)) state.action = '';
      if (state.duoRole && !duoRoleCompatible(state.duoRole, state.pose)) state.duoRole = '';
    } else {
      state.duoRole = '';
      if (state.pose && DUO_ONLY_ACTIONS.has(state.pose)) state.pose = '';
      if (state.action && DUO_ONLY_ACTIONS.has(state.action)) state.action = '';
      /* 单人没有「对对方」的手上动作，也没有必须男性在场的道具 */
      if (state.props && PROPS_NEED_MALE.has(state.props)) state.props = '';
      if (state.hands && HANDS_PARTNER.has(state.hands)) state.hands = '';
    }
  }
  if (field === 'scene' && tag) {
    const s = sceneByTag(tag);
    if (s && state.outfit && state.outfit !== 'ORIGINAL' && state.outfit !== 'LORA' && !s.outfits.includes(state.outfit)) state.outfit = '';
    if (state.outfit && !sceneOutfitCompatible(tag, state.outfit)) state.outfit = '';
    if (state.props && !propSceneCompatible(state.props, tag)) state.props = '';
    if (state.time && !sceneTimeCompatible(tag, state.time)) state.time = '';
    /* 姿势 / 动作跟场景联动：新场景用不了的自动清掉，免得打架 */
    if (state.pose) {
      if (state.people === 'duo') {
        if (!duoPosePairs().some((x) => x[1] === state.pose)) state.pose = '';
      } else if (!actionAllowedIn(state.pose, tag)) {
        state.pose = '';
      }
    }
    if (state.action) {
      if (state.people === 'duo') {
        if (!duoActPairs().some((x) => x[1] === state.action)) state.action = '';
      } else if (!actionAllowedIn(state.action, tag) || !actionSceneCompatible(state.action, tag)) {
        state.action = '';
      }
    }
  }
  pruneUndressParts();
  renderSix();
  closePicker();
  if (openNext) setTimeout(() => openPicker(openNext), 80);
  if (field === 'model') {
    const q = ($('#charSearch') && $('#charSearch').value || '').trim();
    loadChars(q);
    loadLoraSlot('outfit');
    loadLoraSlot('aux');
  }
}

function applyQuick(i) {
  const q = (QUICK_STYLES[state.r18 ? 'r18' : 'sfw'] || [])[Number(i)];
  if (!q) return;
  state.scene = q.scene;
  state.outfit = q.outfit;
  state.outfitLora = null;
  state.actionLora = null;
  const quickIsPose = isPoseTag(q.action);
  state.pose = quickIsPose ? q.action : '';
  state.action = quickIsPose ? '' : q.action;
  state.expression = q.expression;
  state.time = q.time !== undefined ? q.time : '';
  state.people = q.people || 'solo';
  state.duoRole = '';
  /* 快捷风格是整套预设：先把上一轮的穿脱清掉，别让「全裸」把新衣服又脱了 */
  state.undressParts = {};
  pruneUndressParts();
  renderSix();
  if ($('#createHint')) $('#createHint').textContent = `已填好「${q.label}」，点一键出图`;
}

function randomAll() {
  state.body = '';
  state.scene = '';
  state.outfit = '';
  state.outfitLora = null;
  state.actionLora = null;
  state.auxLoras = [];
  state.pose = '';
  state.action = '';
  state.expression = '';
  state.people = 'solo';
  state.duoRole = '';
  state.maleBody = '';
  state.penis = '';
  state.props = '';
  state.hands = '';
  state.stage = '';
  state.undress = '';
  state.undressParts = {};
  state.wet = '';
  state.tattoo = '';
  state.tattooPattern = '';
  state.tattooGlow = '';
  state.shot = '';
  state.angle = '';
  state.light = '';
  state.time = '';
  renderSix();
  generate();
}

function pickModel() {
  const o = state.options || {};
  const d = o.defaults || {};
  const clip = d.clip || (o.clips && o.clips[0]) || '';
  const vae = d.vae || (o.vaes && o.vaes[0]) || '';
  const unet = d.unet || (o.unets && o.unets[0]) || '';
  const ckpt = d.checkpoint || (o.checkpoints && o.checkpoints[0]) || '';
  if (unet && clip && vae) return { model: 'unet:' + unet, clip, vae, clipType: d.clipType || 'stable_diffusion' };
  if (ckpt) return { model: 'checkpoint:' + ckpt, clip: '', vae: '', clipType: d.clipType || 'stable_diffusion' };
  return null;
}

/* 选模型后自动配 clip / vae，避免换底模后环境错乱 */
function modelCompanions(model, fallback) {
  const o = state.options || {};
  const d = o.defaults || {};
  const name = String(model || '').replace(/^(unet|checkpoint):/, '');
  if (String(model || '').startsWith('checkpoint:')) return { clip: '', vae: '' };
  if (/wan2|wan_|wan\./i.test(name)) {
    const clip = (o.clips || []).find((x) => /umt5/i.test(x)) || '';
    const vae = (o.vaes || []).find((x) => /wan/i.test(x)) || '';
    return { clip, vae };
  }
  if (/krea/i.test(name)) {
    return {
      clip: (o.clips || []).find((x) => /qwen3vl/i.test(x)) || d.clip || '',
      vae: d.vae || (o.vaes || []).find((x) => /qwen_image/i.test(x)) || '',
    };
  }
  if (/anima|qwen|krea/i.test(name)) {
    return {
      clip: d.clip || (o.clips || []).find((x) => /qwen_3_06b/i.test(x)) || '',
      vae: d.vae || (o.vaes || []).find((x) => /qwen_image/i.test(x)) || '',
    };
  }
  return { clip: (fallback && fallback.clip) || d.clip || '', vae: (fallback && fallback.vae) || d.vae || '' };
}

function charPayload(it) {
  if (!it) return null;
  return {
    path: it.rel_path,
    weight: Number(it.weight) || 0.85,
    trigger: it.trigger || '',
    feature: it.feature_words || '',
    outfit: it.outfit_words || '',
    negative: it.negative || '',
  };
}



const viewer = { scale: 1, x: 0, y: 0, drag: null, list: [], index: 0 };

function applyViewerTransform() {
  const img = $('#viewerImg');
  if (img) img.style.transform = `translate(${viewer.x}px, ${viewer.y}px) scale(${viewer.scale})`;
  const label = $('#viewerZoomLabel');
  if (label) label.textContent = Math.round(viewer.scale * 100) + '%';
}

function resetViewer() {
  viewer.scale = 1;
  viewer.x = 0;
  viewer.y = 0;
  applyViewerTransform();
}

function setViewerZoom(next, cx, cy) {
  const s0 = viewer.scale;
  const s1 = Math.min(8, Math.max(0.2, next));
  if (s1 === s0) return;
  const img = $('#viewerImg');
  const rect = img ? img.getBoundingClientRect() : null;
  if (rect && cx != null && cy != null) {
    const ox = cx - (rect.left + rect.width / 2);
    const oy = cy - (rect.top + rect.height / 2);
    viewer.x = ox - (ox - viewer.x) * (s1 / s0);
    viewer.y = oy - (oy - viewer.y) * (s1 / s0);
  }
  viewer.scale = s1;
  applyViewerTransform();
}

/** 看图窗：list 是同一批（本次结果 / 历史 / 图库 / 记录）的图，能左右翻 */
function viewerGoto(i) {
  const list = viewer.list || [];
  if (!list.length) return;
  const n = list.length;
  viewer.index = ((i % n) + n) % n;
  const url = list[viewer.index];
  const img = $('#viewerImg');
  if (img) img.src = url;
  const link = $('#viewerOpen');
  if (link) link.href = url;
  const pos = $('#viewerPos');
  if (pos) pos.textContent = (viewer.index + 1) + ' / ' + n;
  const nav = $('#viewerNav');
  if (nav) nav.classList.toggle('hidden', n < 2);
  resetViewer();
}

function viewerStep(delta) {
  if (!viewer.list || viewer.list.length < 2) return;
  viewerGoto(viewer.index + delta);
}

function openImageViewer(url, list) {
  if (!url) return;
  const arr = (Array.isArray(list) ? list : []).filter(Boolean);
  viewer.list = arr.length ? arr : [url];
  let i = viewer.list.indexOf(url);
  if (i < 0) { viewer.list = [url]; i = 0; }
  viewer.index = i;
  viewerGoto(i);
  const gate = $('#imgViewer');
  if (gate) gate.classList.remove('hidden');
}

function closeImageViewer() {
  const gate = $('#imgViewer');
  if (gate) gate.classList.add('hidden');
  const img = $('#viewerImg');
  if (img) img.src = '';
  viewer.drag = null;
  viewer.list = [];
  viewer.index = 0;
  const nav = $('#viewerNav');
  if (nav) nav.classList.add('hidden');
  resetViewer();
}

function shotUrl(o) {
  if (!o) return '';
  if (o.out) return '/api/localfile?path=' + encodeURIComponent(o.out);
  if (o.file) return '/api/comfy/view?filename=' + encodeURIComponent(o.file) + '&subfolder=' + encodeURIComponent(o.subfolder || '') + '&type=output';
  return '';
}

async function generate(sequenceMode = '') {
  if (state.busy) return;
  if (!state.options) await loadOptions();
  const base = pickModel();
  if (!base) { toast('没有可用模型，去设置里检查模型目录', true); return; }
  const chosen = state.model || base.model;
  const companion = modelCompanions(chosen, base);
  const isUnet = chosen.startsWith('unet:');
  const model = chosen;
  const clip = isUnet ? (state.clip || companion.clip) : '';
  const vae = isUnet ? (state.vae || companion.vae) : '';
  const selVal = ($('#simpleCount') && $('#simpleCount').value) || '1';
  const randMatch = /^r(\d+)$/.exec(selVal);
  const batch = randMatch ? Number(randMatch[1]) : (Number(selVal) || 1);
  const makeBody = (recipe, count, forcedSeed = null) => ({
    model,
    clip,
    vae,
    clipType: base.clipType,
    modelSampling: 'auto',
    char: charPayload(state.char),
    outfit: recipe.outfitLora ? charPayload(state.outfitLora) : null,
    style: null,
    aux: [...state.auxLoras, state.actionLora].filter(Boolean)
      .filter((it, i, arr) => arr.findIndex((x) => x && x.rel_path === it.rel_path) === i)
      .map(charPayload),
    scene: recipe.prompt,
    negative: recipe.negative + ((state.extraNeg && state.extraNeg.length) ? ', ' + state.extraNeg.join(', ') : ''),
    keepOriginalClothes: !!recipe.keepOriginalClothes,
    size: recipe.size,
    count,
    r18: !!state.r18,
    steps: 28,
    cfg: 4,
    seed: Number.isFinite(forcedSeed)
      ? forcedSeed
      : (() => { const v = Number($('#simpleSeed') && $('#simpleSeed').value); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : -1; })(),
    variants: [],
    twoPass: null,
  });
  if (sequenceMode === 'stage') {
    const recipe = buildSixRecipe();
    if (!state.r18) { toast('阶段序列只在成人模式开', true); return; }
    if (!isSexualContext(state.pose, state.action, state.stage)) {
      toast('先选一个性爱姿势/动作，再做阶段序列', true);
      return;
    }
    if (state.people !== 'duo') {
      toast('阶段序列先按双人 1v1 做，单人的等下一版', true);
      return;
    }
    /* 阶段序列固定 7 张，张数下拉（4 张 / 每张随机）不作数，别因此跳去跑随机图 */
    if (randMatch || batch > 1) toast('阶段序列固定 7 张，张数选择不参与');
    let fixedSeed = Number($('#simpleSeed') && $('#simpleSeed').value);
    if (!Number.isFinite(fixedSeed) || fixedSeed < 0) fixedSeed = Math.floor(Math.random() * 2147483000);
    if ($('#simpleSeed')) $('#simpleSeed').value = fixedSeed;
    state.seqCanceled = false;
    const foreplayChoice = ($('#stageForeplay') && $('#stageForeplay').value) || 'random';
    const finishChoice = ($('#stageFinish') && $('#stageFinish').value) || 'auto';
    const foreplayStages = makeForeplayStages(foreplayChoice, finishChoice);
    const stages = [...foreplayStages, ...STAGE_SEQUENCE.filter((s) => s.label !== '前戏')];
    for (const stage of stages) {
      if (state.seqCanceled) break;
      const stageRecipe = stageVariant(recipe, stage);
      if ($('#recipeHint')) {
        $('#recipeHint').textContent = `阶段序列：${stage.label} · ${stageRecipe.sceneLabel} · ${stageRecipe.actionLabel}`;
      }
      const body = makeBody(stageRecipe, 1, fixedSeed);
      await runGeneration(body, 'simple', { mode: 'simple', baseScene: stageRecipe.prompt, body });
    }
    return;
  }
  if (!randMatch) {
    const recipe = buildSixRecipe();
    if ($('#recipeHint')) {
      $('#recipeHint').textContent = `本次：${recipe.sceneLabel} · ${recipe.bodyLabel} · ${recipe.outfitLabel} · ${recipe.actionLabel} · ${recipe.expressionLabel} · ${batch} 张`;
    }
    state.lastLayers = recipe.layers;
    const body = makeBody(recipe, batch);
    await runGeneration(body, 'simple', { mode: 'simple', baseScene: recipe.prompt, body });
    return;
  }
  /* 每张随机：一张一个配方，串行跑，各自重抽场景 / 姿势 / 服装 / 表情 */
  for (let i = 0; i < batch; i++) {
    const recipe = buildSixRecipe();
    if ($('#recipeHint')) {
      $('#recipeHint').textContent = `第 ${i + 1}/${batch} 张：${recipe.sceneLabel} · ${recipe.bodyLabel} · ${recipe.outfitLabel} · ${recipe.actionLabel} · ${recipe.expressionLabel}`;
    }
    state.lastLayers = recipe.layers;
    const body = makeBody(recipe, 1);
    await runGeneration(body, 'simple', { mode: 'simple', baseScene: recipe.prompt, body });
  }
}

async function runGeneration(body, mode = 'simple', spec = null) {
  if (state.busy) return;
  // 出图前先预检：服务、模型、LoRA、词，有一项不对就别交任务
  let pre = null;
  try { pre = await write('/api/gen/precheck', body); } catch { /* 预检接口挂了不挡出图 */ }
  if (pre && pre.ok === false) {
    const msg = (pre.problems || []).join('；') || '参数没通过预检';
    $('#createHint').textContent = '先改一下：' + msg;
    toast(msg, true);
    return;
  }
  if (pre && Array.isArray(pre.warnings) && pre.warnings.length) toast(pre.warnings[0]);
  if (pre && pre.prompt && $('#promptText')) {
    $('#promptText').value = pre.prompt;
    renderPromptLayers(state.lastLayers);
    $('#promptBox').classList.remove('hidden');
  }
  state.genStartedAt = Date.now();
  state.lastMode = mode;
  state.lastSpec = spec || { mode, baseScene: body.scene, sem: { scene: '', outfit: '', pose: '', action: '' }, body };
  state.busy = true;
  state.jobId = null;
  const btn = mode === 'advanced' ? $('#advRun') : $('#createBtn');
  const normalText = mode === 'advanced' ? '用这些参数出图' : '一键出图';
  if (btn) { btn.disabled = true; btn.textContent = '出图中…'; }
  $('#createHint').textContent = '正在出图…';
  $('#stage').className = 'stage loading';
  $('#stageActions').innerHTML = '';
  try {
    const r = await write('/api/generate', body);
    state.jobId = r.jobId;
    // 出图期间给个取消按钮：真取消（会停掉 ComfyUI 里正在跑的那张）
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancelGen';
    cancelBtn.className = 'ghost danger';
    cancelBtn.textContent = '取消出图';
    cancelBtn.onclick = async () => {
      if (!state.jobId) return;
      state.seqCanceled = true;
      cancelBtn.disabled = true;
      cancelBtn.textContent = '取消中…';
      try { await write('/api/jobs/' + state.jobId + '/cancel', {}); }
      catch (e) { toast(e.message, true); cancelBtn.disabled = false; cancelBtn.textContent = '取消出图'; }
    };
    const holder = $('#stageActions');
    if (holder) { holder.innerHTML = ''; holder.appendChild(cancelBtn); }
    await poll(r.jobId, mode);
  } catch (e) {
    state.busy = false;
    if (btn) { btn.disabled = false; btn.textContent = normalText; }
    $('#createHint').textContent = '出图失败：' + e.message;
    toast(e.message, true);
  }
}

async function poll(id, mode = 'simple') {
  for (let i = 0; i < 900; i++) {
    let j;
    try { j = await api('/api/jobs/' + id); }
    catch (e) {
      state.busy = false;
      state.jobId = null;
      const btn = mode === 'advanced' ? $('#advRun') : $('#createBtn');
      if (btn) { btn.disabled = false; btn.textContent = mode === 'advanced' ? '用这些参数出图' : '一键出图'; }
      $('#stage').className = 'stage empty';
      $('#stage').innerHTML = '<div class="stage-empty"><div class="stage-orb"></div><b>任务丢了</b><span>服务器可能重启过，去 ComfyUI 输出目录看看这张。</span></div>';
      $('#stageActions').innerHTML = '';
      $('#createHint').textContent = '任务丢了：' + e.message;
      toast('任务丢了，服务器可能重启过', true);
      return;
    }
    if (j.status === 'running') {
      const total = Number(j.total) || 0;
      const done = Number(j.done) || 0;
      const last = (j.log || []).slice(-1)[0];
      const secs = state.genStartedAt ? Math.max(0, Math.round((Date.now() - state.genStartedAt) / 1000)) : 0;
      const eta = (total > done && done > 0 && secs > 0)
        ? `，约剩 ${Math.max(1, Math.round((secs / done) * (total - done)))}s` : '';
      const prog = total > 0 ? ` ${Math.min(done, total)}/${total}` : '';
      $('#createHint').textContent = `正在出图…${prog}${secs ? ` · ${secs}s` : ''}${eta}${last ? ' · ' + String(last).slice(0, 80) : ''}`;
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    state.busy = false;
    state.jobId = null;
    const btn = mode === 'advanced' ? $('#advRun') : $('#createBtn');
    if (btn) {
      btn.disabled = false;
      btn.textContent = mode === 'advanced' ? '用这些参数出图' : '一键出图';
    }
    if (j.status === 'error') {
      restoreStage();
      $('#createHint').textContent = '出图失败：' + (j.error || '未知错误');
      toast(j.error || '出图失败', true);
      return;
    }
    if (j.status === 'cancelled') {
      const outs = j.outputs || [];
      if (outs.length) {
        state.results = outs;
        state.result = outs[0];
        state.history.unshift(...outs.map((o) => ({ o, spec: state.lastSpec, at: Date.now() })));
        state.history = state.history.slice(0, 24);
        saveHistory(outs, state.lastSpec);
        renderHistory();
        renderStageResults(outs);
        $('#createHint').textContent = `已取消（前面 ${outs.length} 张还在）`;
      } else {
        restoreStage();
        $('#createHint').textContent = '已取消';
      }
      return;
    }
    const outputs = j.outputs || [];
    if (!outputs.length) { $('#createHint').textContent = '没有返回图'; return; }
    state.results = outputs;
    state.result = outputs[0];
    state.history.unshift(...outputs.map((o) => ({ o, spec: state.lastSpec, at: Date.now() })));
    state.history = state.history.slice(0, 24);
    saveHistory(outputs, state.lastSpec);
    renderHistory();
    renderStageResults(outputs);
    $('#createHint').textContent = outputs.length > 1 ? `出好了 ${outputs.length} 张` : ('出好了 · seed ' + outputs[0].seed);
    return;
  }
  $('#createHint').textContent = '等太久了，去 ComfyUI 看看';
}

function outputRating(o) {
  const key = o.out || o.file || String(o.seed);
  return Number(ratingMap()[key]) || 0;
}

async function rateOutput(o, v) {
  if (!o) return;
  if (o.out) {
    try { await write('/api/samples/by-path', { path: o.out, rating: v }, 'PATCH'); } catch { /* ignore */ }
  }
  try {
    const map = ratingMap();
    map[o.out || o.file || String(o.seed)] = v;
    localStorage.setItem('v2-ratings', JSON.stringify(map));
  } catch { /* ignore */ }
}

function reuseOutput(o) {
  if (!o) return;
  switchPage('create');
  if ($('#advScene')) $('#advScene').value = o.prompt || '';
  if ($('#advNeg')) $('#advNeg').value = o.negative || DEFAULT_NEG;
  if ($('#advSeed')) $('#advSeed').value = Number.isFinite(Number(o.seed)) ? Number(o.seed) : -1;
  openAdvanced().then(() => toast('已带到高级参数')).catch(() => {});
}

function rerunSeed(seed) {
  const spec = state.lastSpec;
  if (!spec || !spec.body) { toast('这张没有配方，不能同 seed 重画', true); return; }
  const fixed = Number(seed);
  if (!Number.isFinite(fixed) || fixed < 0) { toast('这张没有 seed', true); return; }
  const body = { ...spec.body, seed: fixed, count: 1 };
  runGeneration(body, spec.mode || state.lastMode || 'simple', { ...spec, body });
}

/** 出图区回到上一批结果；没有上一批就回空态 */
function restoreStage() {
  if (state.results && state.results.length) { renderStageResults(state.results); return; }
  const stage = $('#stage');
  if (stage) {
    stage.className = 'stage empty';
    stage.innerHTML = '<div class="stage-empty"><div class="stage-orb"></div><b>这里会出图</b><span>选好角色和风格，点一下就出。</span></div>';
  }
  if ($('#stageActions')) $('#stageActions').innerHTML = '';
}

function renderStageResults(outputs) {
  state.results = outputs;
  if (outputs.length === 1) { renderStage(outputs[0]); return; }
  const stage = $('#stage');
  const list = outputs.map(shotUrl).filter(Boolean);
  stage.className = 'stage';
  stage.innerHTML = `<div class="stage-grid">${outputs.map((o, i) => {
    const url = shotUrl(o);
    const r = outputRating(o);
    return `<div class="sg" data-idx="${i}">
      <div class="sg-img" data-url="${esc(url)}" title="点击打开原图">${url ? `<img loading="lazy" src="${esc(url)}" alt="" onerror="this.style.display='none';this.parentElement.classList.add('noimg')" />` : ''}</div>
      <span>${i + 1} · seed ${esc(o.seed)}</span>
      <div class="sg-act">
        <button class="ghost ${r === 1 ? 'on' : ''}" data-gact="keep">保留</button>
        <button class="ghost ${r === -1 ? 'on' : ''}" data-gact="drop">丢弃</button>
        <button class="ghost" data-gact="rerun">重画</button>
        <button class="ghost" data-gact="reuse">复用</button>
      </div>
    </div>`;
  }).join('')}</div>`;
  $$('.stage-grid .sg', stage).forEach((el) => {
    const o = outputs[Number(el.dataset.idx)];
    const img = $('.sg-img', el);
    if (img) img.onclick = () => { if (img.dataset.url) openImageViewer(img.dataset.url, list); };
    $$('[data-gact]', el).forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const act = b.dataset.gact;
        if (act === 'reuse') { reuseOutput(o); return; }
        if (act === 'rerun') { rerunSeed(o.seed); return; }
        const v = act === 'keep' ? 1 : -1;
        await rateOutput(o, outputRating(o) === v ? 0 : v);
        renderStageResults(outputs);
        toast(act === 'keep' ? '已保留' : '已丢弃');
      };
    });
  });
  $('#stageActions').innerHTML = `
    <div class="stage-actions">
      <button class="primary" data-act="again">再来一批</button>
      <button class="ghost" data-act="copy">复制词</button>
    </div>
    <div class="stage-reroll">
      <button class="ghost" data-reroll="body">换体型</button>
      <button class="ghost" data-reroll="scene">换场景</button>
      <button class="ghost" data-reroll="outfit">换服装</button>
      <button class="ghost" data-reroll="pose">换姿势</button>
      <button class="ghost" data-reroll="action">换动作</button>
      <button class="ghost" data-reroll="expression">换表情</button>
    </div>
    <div class="stage-meta">${outputs.length} 张 · seed ${esc(outputs[0].seed)} 起${outputs[0].elapsed_s ? ' · 每张约 ' + esc(outputs[0].elapsed_s) + 's' : ''}</div>`;
  $('#stageActions').dataset.prompt = outputs[0].prompt || '';
}

function renderStage(o) {
  const stage = $('#stage');
  const url = shotUrl(o);
  const list = (state.results && state.results.length ? state.results : [o]).map(shotUrl).filter(Boolean);
  const r = outputRating(o);
  stage.className = 'stage';
  stage.innerHTML = url
    ? `<img src="${esc(url)}" alt="" title="点击打开原图" />`
    : '<div class="stage-empty"><b>图在 ComfyUI 输出目录</b></div>';
  const img = $('img', stage);
  if (img) {
    img.addEventListener('click', () => openImageViewer(url, list));
    img.addEventListener('error', () => {
      /* 图还没加载完就被下一批覆盖了：别把新内容清掉 */
      if (!stage.contains(img)) return;
      stage.innerHTML = '<div class="stage-empty"><b>图不在了</b><span>被删了，或者还留在 ComfyUI 的 output 里。</span></div>';
    });
  }
  $('#stageActions').innerHTML = `
    <div class="vote">
      <button class="ghost ${r === 1 ? 'on' : ''}" data-act="keep">保留</button>
      <button class="ghost ${r === -1 ? 'on' : ''}" data-act="drop">丢弃</button>
    </div>
    <div class="stage-actions">
      <button class="primary" data-act="again">再来一张</button>
      <button class="ghost" data-act="seedagain">同 seed</button>
      <button class="ghost" data-act="same">同配方再出</button>
      <button class="ghost" data-act="next">随机全部</button>
      <button class="ghost" data-act="copy">复制词</button>
    </div>
    <div class="stage-reroll">
      <button class="ghost" data-reroll="body">换体型</button>
      <button class="ghost" data-reroll="scene">换场景</button>
      <button class="ghost" data-reroll="outfit">换服装</button>
      <button class="ghost" data-reroll="pose">换姿势</button>
      <button class="ghost" data-reroll="action">换动作</button>
      <button class="ghost" data-reroll="expression">换表情</button>
    </div>
    <div class="stage-meta">seed ${esc(o.seed)}${o.elapsed_s ? ' · ' + esc(o.elapsed_s) + 's' : ''}</div>`;
  $('#stageActions').dataset.prompt = o.prompt || '';
}

function fillSemantic() {
  const keep = (sel, html) => {
    const cur = sel.value;
    sel.innerHTML = '<option value="">不选</option>' + html;
    if (cur) sel.value = cur;
  };
  const sceneSel = $('#advSemScene');
  if (sceneSel) {
    const sfw = SCENES.filter((s) => s.mode !== 'r18');
    const adult = state.r18 ? SCENES.filter((s) => s.mode === 'r18') : [];
    const group = (title, list) => list.length
      ? `<optgroup label="${esc(title)}">${list.map((s) => `<option value="${esc(s.tag)}">${esc(s.label)}</option>`).join('')}</optgroup>`
      : '';
    keep(sceneSel, group('普通场景', sfw) + group('成人场景', adult));
  }
  const outfitSel = $('#advSemOutfit');
  if (outfitSel) {
    const list = allOutfits();
    const normal = list.filter((t) => !ADULT_OUTFITS.includes(t));
    const adult = list.filter((t) => ADULT_OUTFITS.includes(t));
    const group = (title, arr) => arr.length
      ? `<optgroup label="${esc(title)}">${arr.map((t) => `<option value="${esc(t)}">${esc(outfitLabel(t))}</option>`).join('')}</optgroup>`
      : '';
    keep(outfitSel, group('普通服装', normal) + group('成人服装', adult));
  }
  const actionGroupHtml = (tags) => {
    const byGroup = new Map();
    for (const t of tags) {
      const g = soloActionGroup(t);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(t);
    }
    const order = [...SOLO_GROUP_ORDER, ...[...byGroup.keys()].filter((g) => !SOLO_GROUP_ORDER.includes(g))];
    return order.filter((g) => byGroup.has(g)).map((g) =>
      `<optgroup label="${esc(g)}">${byGroup.get(g).map((t) => `<option value="${esc(t)}">${esc(labelOf(ACTION_LABELS, t))}</option>`).join('')}</optgroup>`
    ).join('');
  };
  const poseSel = $('#advSemPose');
  if (poseSel) keep(poseSel, actionGroupHtml(poseTagsOf(allActions())));
  const actionSel = $('#advSemAction');
  if (actionSel) keep(actionSel, actionGroupHtml(actTagsOf(allActions())));
}

function fillAdvSelect(id, items) {
  const sel = $(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">无</option>' + (items || []).map((it) =>
    `<option value="${esc(it.rel_path)}">${esc(it.name || it.rel_path)}</option>`).join('');
}

/** 高级参数里的 LoRA 下拉搜索：按名字 / 路径 / 触发词 / 特征词过滤；已选项永远保留在列表里 */
function filterAdvSelect(selId, slot, q) {
  const sel = $(selId);
  if (!sel) return;
  const items = state.advSlots[slot] || [];
  const text = String(q || '').trim().toLowerCase();
  const hay = (it) => [it.name, it.rel_path, it.trigger, it.feature_words].filter(Boolean).join(' ').toLowerCase();
  const list = text ? items.filter((it) => hay(it).includes(text)) : items;
  const cur = sel.value;
  const curItem = items.find((it) => it.rel_path === cur);
  const opts = curItem && !list.some((it) => it.rel_path === cur) ? [curItem, ...list] : list;
  sel.innerHTML = '<option value="">无</option>' + opts.map((it) =>
    `<option value="${esc(it.rel_path)}">${esc(it.name || it.rel_path)}</option>`).join('');
  if (cur) sel.value = cur;
}

function advSlotPayload(slot, relPath, weightId) {
  if (!relPath) return null;
  const it = (state.advSlots[slot] || []).find((x) => x.rel_path === relPath);
  if (!it) return null;
  const wEl = weightId ? $(weightId) : null;
  const wRaw = wEl && String(wEl.value).trim() !== '' ? Number(wEl.value) : NaN;
  return {
    path: it.rel_path,
    weight: Number.isFinite(wRaw) && wRaw >= 0 ? Math.min(wRaw, 2) : (Number(it.weight) || 0.8),
    trigger: it.trigger || '',
    feature: it.feature_words || '',
    negative: it.negative || '',
  };
}

async function loadAdv() {
  if (!state.options) await loadOptions();
  const o = state.options || {};
  const models = [];
  for (const x of o.checkpoints || []) models.push({ value: 'checkpoint:' + x, label: '整包 · ' + x });
  for (const x of o.unets || []) models.push({ value: 'unet:' + x, label: 'unet · ' + x });
  const cur = pickModel();
  const html = models.map((m) => `<option value="${esc(m.value)}">${esc(m.label)}</option>`).join('');
  for (const id of ['#advModel', '#advModel2']) {
    const sel = $(id);
    if (sel) {
      sel.innerHTML = html;
      if (cur) sel.value = cur.model;
    }
  }
  fillSemantic();
  for (const slot of ['aux', 'outfit', 'style']) {
    try {
      const advFam = familyOfName(($('#advModel') && $('#advModel').value) || '');
      const r = await api('/api/gen/loras?slot=' + slot + '&limit=500' + (advFam ? '&base=' + advFam : ''));
      state.advSlots[slot] = r.items || [];
    } catch { state.advSlots[slot] = []; }
  }
  fillAdvSelect('#advAux', state.advSlots.aux);
  fillAdvSelect('#advOutfit', state.advSlots.outfit);
  fillAdvSelect('#advStyle', state.advSlots.style);
  fillAdvSelect('#advStyle2', state.advSlots.style);
}

async function openAdvanced() {
  const panel = $('#advPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  const recipe = buildSixRecipe();
  if (!$('#advScene').value.trim()) $('#advScene').value = recipe.prompt;
  if (!$('#advNeg').value.trim()) $('#advNeg').value = DEFAULT_NEG;
  $('#advSize').value = recipe.size;
  const d = (state.options && state.options.defaults) || {};
  if ($('#advSampler') && !$('#advSampler').dataset.touched) $('#advSampler').value = d.sampler || 'euler';
  if ($('#advScheduler') && !$('#advScheduler').dataset.touched) $('#advScheduler').value = d.scheduler || 'normal';
  await loadAdv();
}

/* ---------------- 专家模式 ---------------- */

async function initExpert() {
  if (!state.options) await loadOptions();
  const o = state.options || {};
  const d = o.defaults || {};
  const models = [];
  for (const x of o.checkpoints || []) models.push({ v: 'checkpoint:' + x, l: '整包 · ' + x });
  for (const x of o.unets || []) models.push({ v: 'unet:' + x, l: 'unet · ' + x });
  const mh = models.map((m) => `<option value="${esc(m.v)}">${esc(m.l)}</option>`).join('');
  for (const id of ['#expModel', '#expModel2']) {
    const el = $(id);
    if (!el) continue;
    el.innerHTML = mh;
    if (!el.dataset.touched) {
      const want = d.unet ? 'unet:' + d.unet : (d.checkpoint ? 'checkpoint:' + d.checkpoint : (models[0] ? models[0].v : ''));
      if (want) el.value = want;
    }
  }
  const clipOpts = '<option value="">自动</option>' + (o.clips || []).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  const vaeOpts = '<option value="">自动</option>' + (o.vaes || []).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if ($('#expClip')) $('#expClip').innerHTML = clipOpts;
  if ($('#expVae')) $('#expVae').innerHTML = vaeOpts;
  if ($('#expSampler') && !$('#expSampler').dataset.touched) $('#expSampler').value = d.sampler || 'euler';
  if ($('#expScheduler') && !$('#expScheduler').dataset.touched) $('#expScheduler').value = d.scheduler || 'normal';
  if ($('#expNeg') && !$('#expNeg').value.trim()) $('#expNeg').value = DEFAULT_NEG;
  if (!Array.isArray(state.expAuxRows) || !state.expAuxRows.length) state.expAuxRows = [{ rel: '', w: '' }];
  await loadExpertWorkflows();
  bindExpertWorkflow();
  await loadExpertSlots();
  if ($('#expChar') && state.char) { $('#expChar').value = state.char.rel_path || ''; syncLoraPickLabel($('#expChar')); }
  if ($('#expOutfit') && state.outfitLora) { $('#expOutfit').value = state.outfitLora.rel_path || ''; syncLoraPickLabel($('#expOutfit')); }
}

async function loadExpertSlots() {
  const fam = currentModelFamily();
  const qs = '&limit=500' + (fam ? '&base=' + fam : '');
  const out = {};
  for (const slot of ['char', 'aux', 'outfit', 'style']) {
    try { out[slot] = (await api('/api/gen/loras?slot=' + slot + qs)).items || []; } catch { out[slot] = []; }
  }
  state.expSlots = out;
  fillExpertSelect('#expChar', out.char, state.char && state.char.rel_path);
  fillExpertSelect('#expOutfit', out.outfit, state.outfitLora && state.outfitLora.rel_path);
  fillExpertSelect('#expStyle', out.style, '');
  fillExpertSelect('#expStyle2', out.style, '');
  renderExpAuxRows();
}

async function openWorkflowManager() {
  const modal = $('#wfModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const pre = $('#wfJson');
  if (pre) { pre.classList.add('hidden'); pre.textContent = ''; }
  await renderWorkflowManager();
}

async function renderWorkflowManager() {
  const box = $('#wfList');
  if (!box) return;
  box.innerHTML = '<div class="skeleton">读取…</div>';
  let items = [];
  try { items = ((await api('/api/workflows')).items) || []; } catch { items = []; }
  if (!items.length) {
    box.innerHTML = '<div class="hint">还没有保存的工作流。去专家页点「导入…」。</div>';
    return;
  }
  box.innerHTML = items.map((w) => `<div class="wf-row" data-id="${esc(w.id)}">
    <div class="wf-main"><b>${esc(w.name)}</b><span class="hint">${w.nodes} 节点 · ${esc(String(w.createdAt || '').slice(0, 10))}</span></div>
    <div class="wf-acts">
      <button class="mini" data-wf="view">查看</button>
      <button class="mini" data-wf="rename">改名</button>
      <button class="mini" data-wf="del">删除</button>
    </div>
  </div>`).join('');
  $$('#wfList [data-wf]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const row = b.closest('.wf-row');
      const it = items.find((x) => x.id === row.dataset.id);
      if (!it) return;
      if (b.dataset.wf === 'view') {
        const pre = $('#wfJson');
        if (pre) { pre.textContent = JSON.stringify(it.workflow, null, 2); pre.classList.remove('hidden'); }
      } else if (b.dataset.wf === 'rename') {
        const name = window.prompt('新名字', it.name);
        if (!name) return;
        try {
          await write('/api/workflows/' + it.id, { name }, 'PATCH');
          toast('改好了');
          await renderWorkflowManager();
          await loadExpertWorkflows(it.id);
        } catch (err) { toast(err.message, true); }
      } else if (b.dataset.wf === 'del') {
        if (!window.confirm('删掉「' + it.name + '」？')) return;
        try {
          await write('/api/workflows/' + it.id, {}, 'DELETE');
          toast('已删除');
          await renderWorkflowManager();
          await loadExpertWorkflows('');
        } catch (err) { toast(err.message, true); }
      }
    };
  });
}

async function loadExpertWorkflows(selectId) {
  const sel = $('#expWorkflowSel');
  let items = [];
  try { items = (await api('/api/workflows')).items || []; } catch { items = []; }
  state.expWorkflows = items;
  if (!sel) return;
  const cur = selectId || sel.value || '';
  sel.innerHTML = '<option value="">不用（按上面参数自动生成）</option>' + items.map((w) =>
    `<option value="${esc(w.id)}">${esc(w.name)}（${w.nodes} 节点）</option>`).join('');
  if (cur) sel.value = cur;
  applyExpWorkflow();
}

function applyExpWorkflow() {
  const sel = $('#expWorkflowSel');
  const it = sel ? (state.expWorkflows || []).find((w) => w.id === sel.value) : null;
  state.expWorkflow = it ? it.workflow : null;
  const hint = $('#expWorkflowHint');
  const tokens = '{{prompt}} {{negative}} {{seed}} {{steps}} {{cfg}} {{width}} {{height}} {{sampler}} {{scheduler}} {{model}} {{clip}} {{vae}}';
  if (hint) hint.textContent = it
    ? `已选「${it.name}」（${it.nodes} 节点）。占位符：${tokens}`
    : `导入 ComfyUI 的 Save (API) JSON；占位符：${tokens}`;
}

function bindExpertWorkflow() {
  const sel = $('#expWorkflowSel');
  if (sel && !sel.dataset.bound) {
    sel.dataset.bound = '1';
    sel.onchange = applyExpWorkflow;
  }
  const imp = $('#expWorkflowImport');
  const file = $('#expWorkflowFile');
  if (imp && file && !imp.dataset.bound) {
    imp.dataset.bound = '1';
    imp.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        let wf = JSON.parse(text);
        if (Array.isArray(wf) || typeof wf !== 'object') throw new Error('不是 API JSON 对象');
        const nodes = Object.values(wf).filter((n) => n && typeof n === 'object' && n.class_type).length;
        if (!nodes) throw new Error('没有节点（要 ComfyUI 的 Save (API) JSON）');
        const defaultName = String(f.name || '工作流').replace(/\.json$/i, '');
        const name = window.prompt('给这个工作流起个名字', defaultName);
        if (!name) return;
        const r = await write('/api/workflows', { name, workflow: wf });
        toast('工作流已保存：' + (r.name || name));
        await loadExpertWorkflows(r.id);
      } catch (e) {
        toast('导入失败：' + e.message, true);
      } finally {
        file.value = '';
      }
    };
  }
  const del = $('#expWorkflowDel');
  if (del && !del.dataset.bound) {
    del.dataset.bound = '1';
    del.onclick = async () => {
      const cur = $('#expWorkflowSel') && $('#expWorkflowSel').value;
      if (!cur) { toast('先选一个已保存的工作流', true); return; }
      if (!window.confirm('删掉这个已保存的工作流？（只删这里的存档，不动文件）')) return;
      try {
        await write('/api/workflows/' + cur, {}, 'DELETE');
        toast('已删除');
        await loadExpertWorkflows('');
      } catch (e) { toast('删除失败：' + e.message, true); }
    };
  }
}

function renderExpAuxRows() {
  const box = $('#expAuxList');
  if (!box) return;
  const items = (state.expSlots && state.expSlots.aux) || [];
  if (!Array.isArray(state.expAuxRows) || !state.expAuxRows.length) state.expAuxRows = [{ rel: '', w: '' }];
  box.innerHTML = state.expAuxRows.map((row, i) => `<div class="exp-aux-row" data-idx="${i}">
    <select id="expAuxSel${i}" class="exp-aux-sel hidden-select">${['<option value="">不指定</option>'].concat(items.map((it) =>
      `<option value="${esc(it.rel_path)}" ${it.rel_path === row.rel ? 'selected' : ''}>${esc(loraLabel(it))}</option>`)).join('')}</select>
    <button type="button" class="lora-pick exp-aux-pick" data-for="expAuxSel${i}"><span data-label>不指定</span><em>选择</em></button>
    <input class="adv-weight exp-aux-w" type="number" min="0" max="2" step="0.05" placeholder="权重" value="${esc(row.w || '')}" />
    <button class="mini exp-aux-del" title="删掉这一槽">×</button>
  </div>`).join('');
  $$('#expAuxList .exp-aux-row').forEach((el) => {
    const i = Number(el.dataset.idx);
    const sel = $('.exp-aux-sel', el);
    const w = $('.exp-aux-w', el);
    if (sel) sel.onchange = () => { state.expAuxRows[i].rel = sel.value; };
    if (w) w.oninput = () => { state.expAuxRows[i].w = w.value; };
    const del = $('.exp-aux-del', el);
    if (del) del.onclick = () => {
      state.expAuxRows.splice(i, 1);
      if (!state.expAuxRows.length) state.expAuxRows.push({ rel: '', w: '' });
      renderExpAuxRows();
    };
    syncLoraPickLabel(sel);
  });
}

function fillExpertSelect(sel, items, current) {
  const el = $(sel);
  if (!el) return;
  const cur = current || el.value;
  el.innerHTML = '<option value="">不指定</option>' + (items || []).map((it) =>
    `<option value="${esc(it.rel_path)}">${esc(loraLabel(it))}</option>`).join('');
  if (cur) el.value = cur;
  syncLoraPickLabel(el);
}

/* ---------------- LoRA 选择弹窗（点一下展开、能搜、点一行选中、右下确定） ---------------- */

const loraPickState = { target: null, slot: '', pending: '', q: '' };

const LORA_SLOT_BY_ID = {
  expChar: 'char', expOutfit: 'outfit', expStyle: 'style', expStyle2: 'style',
};

function loraSlotOfSelect(el) {
  if (!el || !el.id) return '';
  if (el.id.startsWith('expAuxSel')) return 'aux';
  return LORA_SLOT_BY_ID[el.id] || 'char';
}

function loraPickLabelOf(el) {
  if (!el) return '不指定';
  const opt = el.selectedOptions && el.selectedOptions[0];
  if (!el.value || !opt) return '不指定';
  return opt.textContent || '不指定';
}

function syncLoraPickLabel(selectEl) {
  if (!selectEl) return;
  const btn = selectEl.parentElement && selectEl.parentElement.querySelector('.lora-pick');
  if (!btn) return;
  const label = btn.querySelector('[data-label]');
  if (label) label.textContent = loraPickLabelOf(selectEl);
  btn.classList.toggle('on', !!selectEl.value);
}

function loraPickItems() {
  return ((state.expSlots && state.expSlots[loraPickState.slot]) || []);
}

function renderLoraPickList() {
  const box = $('#loraPickList');
  if (!box) return;
  const q = loraPickState.q.toLowerCase();
  let items = loraPickItems();
  if (q) {
    items = items.filter((it) => `${it.name_zh || ''} ${it.name || ''} ${it.rel_path || ''} ${it.trigger || ''}`
      .toLowerCase().includes(q));
  }
  const rows = [`
    <button type="button" class="lora-row${loraPickState.pending === '' ? ' on' : ''}" data-rel="">
      <span class="rp-name">不指定</span><span class="rp-sub">这一槽空着</span>
    </button>`].concat(items.map((it) => `
    <button type="button" class="lora-row${loraPickState.pending === it.rel_path ? ' on' : ''}" data-rel="${esc(it.rel_path)}">
      <span class="rp-check">${loraPickState.pending === it.rel_path ? '✓' : ''}</span>
      <span class="rp-name">${esc(loraLabel(it))}</span>
      <span class="rp-sub">${esc(it.rel_path)}</span>
    </button>`));
  box.innerHTML = rows.join('') || '<div class="hint tag-empty">没找到</div>';
  if ($('#loraPickHint')) $('#loraPickHint').textContent = isEnName()
    ? `${items.length} LoRA(s)${q ? ' (filtered)' : ''} · click a row to select, then OK`
    : `共 ${items.length} 支${q ? '（已过滤）' : ''} · 点一行选中，右下「确定」生效`;
}

function openLoraPicker(selectEl) {
  const modal = $('#loraPickModal');
  if (!modal || !selectEl) return;
  loraPickState.target = selectEl;
  loraPickState.slot = loraSlotOfSelect(selectEl);
  loraPickState.pending = selectEl.value || '';
  loraPickState.q = '';
  if ($('#loraPickSearch')) $('#loraPickSearch').value = '';
  const title = $('#loraPickTitle');
  if (title) {
    if (isEnName()) {
      const slotEn = { char: 'character', outfit: 'outfit', style: 'style', aux: 'extra LoRA' }[loraPickState.slot] || 'LoRA';
      title.textContent = 'Choose ' + slotEn;
    } else {
      const slotZh = { char: '角色', outfit: '服装', style: '画风', aux: '额外 LoRA' }[loraPickState.slot] || 'LoRA';
      title.textContent = '选' + slotZh;
    }
  }
  modal.classList.remove('hidden');
  renderLoraPickList();
  setTimeout(() => $('#loraPickSearch')?.focus(), 60);
}

function closeLoraPicker() {
  $('#loraPickModal')?.classList.add('hidden');
}

function bindLoraPicker() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.lora-pick');
    if (!btn) return;
    const sel = document.getElementById(btn.dataset.for || '');
    if (sel) openLoraPicker(sel);
  });
  if ($('#loraPickClose')) $('#loraPickClose').onclick = closeLoraPicker;
  const modal = $('#loraPickModal');
  if (modal) modal.onclick = (e) => { if (e.target === modal) closeLoraPicker(); };
  if ($('#loraPickList')) {
    $('#loraPickList').onclick = (e) => {
      const row = e.target.closest('.lora-row');
      if (!row) return;
      loraPickState.pending = row.dataset.rel || '';
      renderLoraPickList();
    };
  }
  const search = $('#loraPickSearch');
  if (search) {
    search.addEventListener('input', () => {
      loraPickState.q = search.value.trim();
      renderLoraPickList();
    });
  }
  if ($('#loraPickOk')) {
    $('#loraPickOk').onclick = () => {
      const sel = loraPickState.target;
      if (sel) {
        sel.value = loraPickState.pending;
        syncLoraPickLabel(sel);
        try { sel.dispatchEvent(new Event('change')); } catch { /* ignore */ }
      }
      closeLoraPicker();
    };
  }
}

function expSlot(slot, relPath, weightId) {
  if (!relPath) return null;
  const it = ((state.expSlots && state.expSlots[slot]) || []).find((x) => x.rel_path === relPath);
  if (!it) return null;
  const wEl = weightId ? $(weightId) : null;
  const wRaw = wEl && String(wEl.value).trim() !== '' ? Number(wEl.value) : NaN;
  return {
    path: it.rel_path,
    weight: Number.isFinite(wRaw) && wRaw >= 0 ? Math.min(wRaw, 2) : (Number(it.weight) || 0.8),
    trigger: it.trigger || '',
    feature: it.feature_words || '',
    negative: it.negative || '',
  };
}

function expSlotW(slot, relPath, wRaw) {
  if (!relPath) return null;
  const it = ((state.expSlots && state.expSlots[slot]) || []).find((x) => x.rel_path === relPath);
  if (!it) return null;
  const w = Number(wRaw);
  return {
    path: it.rel_path,
    weight: Number.isFinite(w) && w >= 0 ? Math.min(w, 2) : (Number(it.weight) || 0.8),
    trigger: it.trigger || '',
    feature: it.feature_words || '',
    negative: it.negative || '',
  };
}

async function expertGenerate() {
  if (state.busy) return;
  if (!state.options) await loadOptions();
  const model = $('#expModel') && $('#expModel').value;
  if (!model) { toast('先选模型', true); return; }
  const isUnet = model.startsWith('unet:');
  const base = pickModel();
  const comp = modelCompanions(model, base);
  const clip = isUnet ? (($('#expClip') && $('#expClip').value) || comp.clip) : '';
  const vae = isUnet ? (($('#expVae') && $('#expVae').value) || comp.vae) : '';
  const scene = ($('#expPrompt') && $('#expPrompt').value || '').trim();
  if (!scene) { toast('正面词不能空', true); return; }
  const sizeSel = $('#expSize') ? $('#expSize').value : '832x1216';
  const size = sizeSel === 'custom'
    ? `${Math.min(Math.max(Number($('#expW') && $('#expW').value) || 832, 256), 2048)}x${Math.min(Math.max(Number($('#expH') && $('#expH').value) || 1216, 256), 2048)}`
    : sizeSel;
  const d = (state.options && state.options.defaults) || {};
  const body = {
    model,
    clip,
    vae,
    clipType: d.clipType || 'stable_diffusion',
    modelSampling: 'auto',
    workflow: state.expWorkflow || null,
    char: expSlot('char', $('#expChar') && $('#expChar').value, '#expCharW'),
    aux: (state.expAuxRows || []).map((r) => expSlotW('aux', r.rel, r.w)).filter(Boolean),
    outfit: expSlot('outfit', $('#expOutfit') && $('#expOutfit').value, '#expOutfitW'),
    style: expSlot('style', $('#expStyle') && $('#expStyle').value, '#expStyleW'),
    scene,
    negative: ($('#expNeg') && $('#expNeg').value || '').trim(),
    keepOriginalClothes: false,
    r18: true,
    size,
    count: Number($('#expCount') && $('#expCount').value) || 1,
    steps: Number($('#expSteps') && $('#expSteps').value) || 28,
    cfg: Number($('#expCfg') && $('#expCfg').value) || 4,
    seed: Number($('#expSeed') && $('#expSeed').value),
    variants: [],
    sampler: ($('#expSampler') && $('#expSampler').value) || 'euler',
    scheduler: ($('#expScheduler') && $('#expScheduler').value) || 'normal',
    twoPass: ($('#expTwoPass') && $('#expTwoPass').checked) ? {
      enable: true,
      model: ($('#expModel2') && $('#expModel2').value) || model,
      style: expSlot('style', $('#expStyle2') && $('#expStyle2').value, '#expStyle2W'),
      strength: ($('#expStrength') && $('#expStrength').value) || 'mid',
      scene: ($('#expScene2') && $('#expScene2').value || '').trim(),
    } : null,
  };
  let pre = null;
  try { pre = await write('/api/gen/precheck', body); } catch { /* ignore */ }
  if (pre && pre.ok === false) {
    $('#expHint').textContent = '先改一下：' + (pre.problems || []).join('；');
    toast((pre.problems || [])[0] || '预检没通过', true);
    return;
  }
  if (pre && Array.isArray(pre.warnings) && pre.warnings.length) toast(pre.warnings[0]);
  state.busy = true;
  const btn = $('#expRun');
  if (btn) { btn.disabled = true; btn.textContent = '出图中…'; }
  $('#expHint').textContent = '正在出图…';
  $('#expStage').className = 'stage loading';
  $('#expStage').innerHTML = '<div class="stage-empty"><div class="stage-orb"></div><b>出图中…</b></div>';
  $('#expActions').innerHTML = '<button id="expCancel" class="ghost">取消出图</button>';
  try {
    const r = await write('/api/generate', body);
    const cancel = $('#expCancel');
    if (cancel) cancel.onclick = async () => {
      try { await write('/api/jobs/' + r.jobId + '/cancel', {}); } catch (e) { toast(e.message, true); }
    };
    let j = null;
    for (let i = 0; i < 900; i++) {
      j = await api('/api/jobs/' + r.jobId);
      if (j.status === 'running') {
        const done = Number(j.done) || 0;
        const total = Number(j.total) || 0;
        const last = (j.log || []).slice(-1)[0];
        $('#expHint').textContent = `正在出图… ${done}/${total}${last ? ' · ' + String(last).slice(0, 60) : ''}`;
        await new Promise((res) => setTimeout(res, 1200));
        continue;
      }
      break;
    }
    if (j && j.status === 'done') {
      renderExpertOutputs(j.outputs || []);
      $('#expHint').textContent = `出好了 ${(j.outputs || []).length} 张 · seed ${(j.outputs || [])[0] ? j.outputs[0].seed : '-'}`;
    } else if (j && j.status === 'cancelled') {
      $('#expHint').textContent = '已取消';
    } else {
      $('#expHint').textContent = '出图失败：' + ((j && j.error) || '未知错误');
    }
  } catch (e) {
    $('#expHint').textContent = '出图失败：' + e.message;
    toast(e.message, true);
  } finally {
    state.busy = false;
    if (btn) { btn.disabled = false; btn.textContent = '按这些参数出图'; }
    $('#expActions').innerHTML = '';
  }
}

function renderExpertOutputs(outputs) {
  const stage = $('#expStage');
  if (!stage) return;
  if (!outputs.length) {
    stage.className = 'stage empty';
    stage.innerHTML = '<div class="stage-empty"><b>没有返回图</b></div>';
    return;
  }
  stage.className = 'stage';
  stage.innerHTML = `<div class="stage-grid">${outputs.map((o, i) => {
    const url = shotUrl(o);
    return `<div class="sg" data-idx="${i}">
      <div class="sg-img" data-url="${esc(url)}">${url ? `<img loading="lazy" src="${esc(url)}" alt="" />` : ''}</div>
      <span>${i + 1} · seed ${esc(o.seed)}</span>
      <div class="sg-act">
        <button class="ghost" data-gact="keep">保留</button>
        <button class="ghost" data-gact="drop">丢弃</button>
      </div>
    </div>`;
  }).join('')}</div>`;
  $$('#expStage .sg').forEach((el) => {
    const o = outputs[Number(el.dataset.idx)];
    const img = $('.sg-img', el);
    if (img) img.onclick = () => { if (img.dataset.url) openImageViewer(img.dataset.url, outputs.map(shotUrl).filter(Boolean)); };
    $$('[data-gact]', el).forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const v = b.dataset.gact === 'keep' ? 1 : -1;
        try { await rateOutput(o, v); toast(v === 1 ? '已保留' : '已丢弃'); } catch { /* ignore */ }
      };
    });
  });
}

async function advancedGenerate() {
  if (state.busy) return;
  if (!state.options) await loadOptions();
  const model = $('#advModel').value;
  if (!model) { toast('没有可用模型', true); return; }
  const isUnet = model.startsWith('unet:');
  const baseM = pickModel();
  const compat = modelCompanions(model, baseM);
  const d = (state.options && state.options.defaults) || {};
  const clip = isUnet ? (state.clip || compat.clip) : '';
  const vae = isUnet ? (state.vae || compat.vae) : '';
  const scene = $('#advScene').value.trim();
  if (!scene) { toast('正面词不能空', true); return; }
  const sem = {
    scene: $('#advSemScene').value || '',
    outfit: $('#advSemOutfit').value || '',
    pose: $('#advSemPose').value || '',
    action: $('#advSemAction').value || '',
  };
  const semTags = [sem.scene, sem.outfit, sem.pose, sem.action].filter(Boolean);
  if (sem.pose && sem.action && !poseActionCompatible(sem.pose, sem.action)) {
    toast('姿势和动作互斥，换一个再出', true);
    return;
  }
  if (sem.action && !actionUndressCompatible(sem.action, computeUndress(state.r18))) {
    toast('这个动作和当前穿脱状态冲突', true);
    return;
  }
  const two = $('#advTwoPass').checked;
  const sizeSel = $('#advSize').value;
  const customW = Math.min(Math.max(Number($('#advW') && $('#advW').value) || 832, 256), 2048);
  const customH = Math.min(Math.max(Number($('#advH') && $('#advH').value) || 1216, 256), 2048);
  const size = sizeSel === 'custom' ? `${customW}x${customH}` : sizeSel;
  const body = {
    model,
    clip,
    vae,
    clipType: d.clipType || 'stable_diffusion',
    modelSampling: 'auto',
    char: charPayload(state.char),
    aux: [advSlotPayload('aux', $('#advAux').value, '#advAuxW')].filter(Boolean),
    outfit: advSlotPayload('outfit', $('#advOutfit').value, '#advOutfitW'),
    style: advSlotPayload('style', $('#advStyle').value, '#advStyleW'),
    scene: scene + (semTags.length ? ', ' + semTags.join(', ') : ''),
    negative: $('#advNeg').value.trim() || DEFAULT_NEG,
    keepOriginalClothes: false,
    r18: !!state.r18,
    size,
    count: Number($('#advCount').value) || 1,
    steps: Number($('#advSteps').value) || 28,
    cfg: Number($('#advCfg').value) || 4,
    seed: Number($('#advSeed').value),
    sampler: ($('#advSampler') && $('#advSampler').value) || 'euler',
    scheduler: ($('#advScheduler') && $('#advScheduler').value) || 'normal',
    variants: [],
    twoPass: two ? {
      enable: true,
      model: $('#advModel2').value || model,
      style: advSlotPayload('style', $('#advStyle2').value, '#advStyle2W'),
      strength: $('#advStrength').value || 'mid',
      scene: $('#advScene2').value.trim(),
    } : null,
  };
  await runGeneration(body, 'advanced', { mode: 'advanced', baseScene: scene, sem, body });
}

function rerollField(field) {
  if (!['body', 'scene', 'outfit', 'pose', 'action', 'expression'].includes(field)) return;
  const opts = pickerOptionsFor(field);
  if (!opts.length) return;
  let pick = opts[Math.floor(Math.random() * opts.length)].tag;
  if (state[field] === pick && opts.length > 1) {
    pick = opts[(opts.findIndex((x) => x.tag === pick) + 1) % opts.length].tag;
  }
  setPick(field, pick);
  generate();
}

function ratingMap() {
  try { return JSON.parse(localStorage.getItem('v2-ratings') || '{}'); } catch { return {}; }
}

function historyRating(o) {
  const key = o.out || o.file || String(o.seed);
  return Number(ratingMap()[key]) || 0;
}

async function clearHistoryWall() {
  const had = state.history.length > 0;
  /* 不弹确认：记录清空不动磁盘图，点了就直接清 */
  state.history = [];
  renderHistory();
  const stage = $('#stage');
  if (stage) { stage.className = 'stage'; stage.innerHTML = '<div class="stage-empty"><b>还没有出图</b></div>'; }
  if ($('#stageActions')) $('#stageActions').innerHTML = '';
  try { await api('/api/history', { method: 'DELETE' }); } catch { /* 本地也照样清 */ }
  toast(had ? '已清空本次结果' : '已清空残留记录');
}

function renderHistory() {
  const box = $('#history');
  if (!box) return;
  const items = state.history;
  if ($('#historyCount')) $('#historyCount').textContent = items.length ? items.length + ' 张' : '';
  if (!items.length) { box.innerHTML = '<div class="hint">出完一张，这里会留一张。</div>'; return; }
  box.innerHTML = items.map((h, i) => {
    const o = h.o;
    const url = shotUrl(o);
    const r = historyRating(o);
    const tip = ['seed ' + o.seed, o.elapsed_s ? o.elapsed_s + 's' : '', (o.twoPass || (h.spec && h.spec.body && h.spec.body.twoPass && h.spec.body.twoPass.enable)) ? '两段' : '']
      .filter(Boolean).join(' · ');
    const canAgain = !!(h.spec && h.spec.body);
    return `<div class="hcard" data-hidx="${i}">
      <div class="hp" data-hopen="${esc(url)}" title="${esc(tip)}">${url ? `<img loading="lazy" src="${esc(url)}" alt="" onerror="this.style.display='none';this.parentElement.classList.add('noimg')" />` : ''}</div>
      <div class="hm"><span>seed ${esc(o.seed)}</span><span>${o.twoPass || (h.spec && h.spec.body && h.spec.body.twoPass && h.spec.body.twoPass.enable) ? '两段' : ''}</span></div>
      <div class="ha">
        <button class="ghost ${r === 1 ? 'on' : ''}" data-hact="keep">保留</button>
        <button class="ghost ${r === -1 ? 'on' : ''}" data-hact="drop">丢弃</button>
        ${canAgain ? '<button class="ghost" data-hact="again">再出</button>' : ''}
        ${canAgain ? '<button class="ghost" data-hact="seed">同 seed</button>' : ''}
      </div>
    </div>`;
  }).join('');
}

async function loadHistory() {
  try {
    const r = await api('/api/history?limit=24');
    const rows = r.items || [];
    if (!rows.length) {
      state.history = [];
      renderHistory();
      return;
    }
    const items = rows.map((h) => ({
      o: {
        out: h.out, file: h.file, subfolder: h.subfolder, seed: h.seed,
        prompt: h.prompt, negative: h.negative, loras: h.loras, elapsed_s: h.elapsed_s,
      },
      spec: h.spec || null,
      at: Date.parse(h.at) || Date.now(),
    }));
    try {
      const map = ratingMap();
      for (const h of rows) { if (h.rating && h.out) map[h.out] = h.rating; }
      localStorage.setItem('v2-ratings', JSON.stringify(map));
    } catch { /* ignore */ }
    const keyOf = (o) => o.out || o.file || String(o.seed);
    const seen = new Set(items.map((i) => keyOf(i.o)));
    state.history = [...items, ...state.history.filter((h) => !seen.has(keyOf(h.o)))].slice(0, 24);
    renderHistory();
  } catch { /* ignore */ }
}

function saveHistory(outputs, spec) {
  if (!Array.isArray(outputs) || !outputs.length) return;
  const items = outputs.map((o) => ({
    at: new Date().toISOString(),
    out: o.out || ('comfy:' + (o.file || '') + '|' + (o.subfolder || '')),
    file: o.file || '',
    subfolder: o.subfolder || '',
    seed: o.seed,
    prompt: o.prompt || '',
    negative: o.negative || '',
    loras: o.loras || [],
    elapsed_s: o.elapsed_s,
    spec: spec || state.lastSpec || {},
  }));
  write('/api/history', { items }).catch(() => {});
}

async function historyRate(i, v) {
  const h = state.history[i];
  if (!h) return;
  const o = h.o;
  if (o.out) {
    try { await write('/api/samples/by-path', { path: o.out, rating: v }, 'PATCH'); } catch { /* ignore */ }
    try { await write('/api/history/rate', { out: o.out, rating: v }, 'PATCH'); } catch { /* ignore */ }
  }
  const map = ratingMap();
  map[o.out || o.file || String(o.seed)] = v;
  try { localStorage.setItem('v2-ratings', JSON.stringify(map)); } catch { /* ignore */ }
  renderHistory();
}

async function rate(v) {
  const o = state.result;
  if (!o) return;
  if (o.out) {
    try { await write('/api/samples/by-path', { path: o.out, rating: v }, 'PATCH'); } catch { /* ignore */ }
    try { await write('/api/history/rate', { out: o.out, rating: v }, 'PATCH'); } catch { /* ignore */ }
  }
  try {
    const map = JSON.parse(localStorage.getItem('v2-ratings') || '{}');
    const key = o.out || o.file || String(o.seed);
    map[key] = v;
    localStorage.setItem('v2-ratings', JSON.stringify(map));
  } catch { /* ignore */ }
  $$('#stageActions [data-act]').forEach((b) => {
    if (b.dataset.act === 'keep') b.classList.toggle('on', v === 1);
    if (b.dataset.act === 'drop') b.classList.toggle('on', v === -1);
  });
  toast(v === 1 ? '已保留' : '已丢弃');
}

/* ---------------- library ---------------- */

async function loadLibrary(reset = false) {
  if (reset) {
    state.lib.offset = 0;
    state.lib.items = [];
    state.lib.done = false;
  }
  if (state.lib.loading || state.lib.done) return;
  state.lib.loading = true;
  if (reset) $('#libGrid').innerHTML = '<div class="skeleton">读图库…</div>';
  try {
    const params = new URLSearchParams({
      q: state.lib.q,
      category: state.lib.category,
      work: state.lib.work,
      tag: state.lib.tag,
      limit: '60',
      offset: String(state.lib.offset),
      sort: state.lib.sort,
      hasPreview: state.lib.preview,
      variants: state.lib.variants ? '1' : '0',
    });
    const r = await api('/api/loras?' + params.toString());
    state.lib.items.push(...(r.items || []));
    state.lib.total = r.total;
    state.lib.offset += (r.items || []).length;
    state.lib.done = (r.items || []).length < 60 || state.lib.offset >= r.total;
    if (reset) $('#libGrid').innerHTML = '';
    const frag = document.createElement('div');
    frag.innerHTML = (r.items || []).map(cardHTML).join('');
    for (const el of [...frag.children]) $('#libGrid').appendChild(el);
    $('#libCount').textContent = r.total + ' 支';
    $('#libMore').classList.toggle('hidden', state.lib.done);
    $$('#libGrid img').forEach((img) => {
      if (img.dataset.armed) return;
      img.dataset.armed = '1';
      img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
    });
  } catch (e) {
    $('#libGrid').innerHTML = `<div class="skeleton">读图库失败：${esc(e.message)}</div>`;
  } finally {
    state.lib.loading = false;
  }
}

function cardHTML(it) {
  const img = it.preview ? `<img loading="lazy" src="/media/${it.id}/thumb" alt="" />` : `<span>${esc((it.name || '?').slice(0, 1))}</span>`;
  return `<article class="lcard" data-id="${it.id}">
    <div class="pic">${img}</div>
    <div class="meta">
      <div class="nm">${esc(loraLabel(it) || '未命名')}</div>
      <div class="tr">${esc(it.trigger || '—')}</div>
      ${it.category ? `<span class="tag">${esc(it.category)}</span>` : ''}
    </div>
  </article>`;
}

function openDownload() {
  const modal = $('#downloadModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  $('#dlText').value = '';
  $('#dlStatus').textContent = '';
  $('#civHint').textContent = '';
  $('#civGrid').innerHTML = '';
  $('#civDetail').classList.add('hidden');
  const cats = (facetsCache && facetsCache.categories) || [];
  $('#dlCat').innerHTML = '<option value="">自动</option>' +
    cats.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
  switchDlTab('link');
  refreshDownloads(true);
  setTimeout(() => $('#dlText').focus(), 60);
}

function closeDownload() {
  clearTimeout(dlTimer);
  $('#downloadModal').classList.add('hidden');
}

function switchDlTab(tab) {
  $$('.dl-tab').forEach((b) => b.classList.toggle('on', b.dataset.dltab === tab));
  $('#dlLinkPane').classList.toggle('hidden', tab !== 'link');
  $('#dlSearchPane').classList.toggle('hidden', tab !== 'search');
  if (tab === 'search' && !$('#civGrid').children.length) {
    setTimeout(() => $('#civQ').focus(), 60);
  }
}

function dlStatusZh(s) {
  return { queued: '排队', running: '下载中', paused: '已暂停', done: '完成', error: '失败' }[s] || s;
}

function fmtMB(n) {
  const v = Number(n) || 0;
  if (!v) return '';
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB';
  return Math.round(v / 1024) + ' KB';
}

function renderDownloads() {
  const box = $('#dlQueue');
  if (!box) return;
  const list = state.downloads || [];
  const active = list.filter((t) => ['queued', 'running'].includes(t.status)).length;
  const paused = list.filter((t) => t.status === 'paused').length;
  const finished = list.filter((t) => ['done', 'error'].includes(t.status)).length;
  if ($('#dlQueueCount')) $('#dlQueueCount').textContent = list.length ? `${active} 进行 / ${paused} 暂停 / ${finished} 结束` : '';
  if ($('#dlPauseAll')) $('#dlPauseAll').disabled = !active;
  if ($('#dlResumeAll')) $('#dlResumeAll').disabled = !paused;
  if ($('#dlClear')) $('#dlClear').disabled = !finished;
  if (!list.length) { box.innerHTML = '<div class="hint">还没有下载任务。</div>'; return; }
  box.innerHTML = list.map((t) => {
    const total = Number(t.totalBytes) || 0;
    const bytes = Number(t.bytes) || 0;
    const pct = total ? Math.min(100, Math.round((bytes / total) * 100)) : (t.status === 'done' ? 100 : 0);
    const out = (t.outputs || [])[0];
    const canPause = ['queued', 'running'].includes(t.status);
    const canResume = t.status === 'paused';
    return `<div class="dq ${t.status === 'done' ? 'done' : t.status === 'error' ? 'error' : ''}" data-dlid="${esc(t.id)}">
      <div>
        <div class="dn">${esc(t.name || '下载')}</div>
        <div class="ds">${esc(dlStatusZh(t.status))}${total ? ` · ${fmtMB(bytes)} / ${fmtMB(total)}` : ''}${out && out.rel_path ? ' · ' + esc(out.rel_path) : ''}${t.error ? ' · ' + esc(t.error) : ''}</div>
        <div class="db"><i style="width:${pct}%"></i></div>
      </div>
      <div class="ds">${pct}%</div>
      <div class="da">
        ${canPause ? `<button class="ghost" data-dlact="pause">暂停</button>` : ''}
        ${canResume ? `<button class="ghost" data-dlact="resume">继续</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

let dlTimer = null;

async function refreshDownloads(first = false) {
  clearTimeout(dlTimer);
  try {
    const list = await api('/api/downloads');
    const prev = new Set((state.downloads || []).map((t) => t.id + ':' + t.status));
    const firstDone = new Map((state.downloads || []).filter((t) => t.status === 'done').map((t) => [t.id, t]));
    state.downloads = list;
    renderDownloads();
    const newlyDone = list.filter((t) => t.status === 'done' && !firstDone.has(t.id));
    if (!first && newlyDone.length) {
      toast(`下载完成 ${newlyDone.length} 支，已自动入库`);
      await loadFacets();
      await loadLibrary(true);
    }
    if (list.some((t) => ['queued', 'running'].includes(t.status))) {
      dlTimer = setTimeout(() => refreshDownloads(false), 1500);
    }
  } catch (e) {
    if (!first) $('#dlStatus').textContent = '读下载队列失败：' + e.message;
  }
}

async function startDownload() {
  const lines = String($('#dlText').value || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) { $('#dlStatus').textContent = '先贴 C站链接 / AIR / 版本号'; return; }
  const subdir = $('#dlCat').value || '';
  const btn = $('#dlStart');
  btn.disabled = true;
  btn.textContent = '提交中…';
  let ok = 0;
  try {
    for (const line of lines) {
      try {
        await write('/api/civitai/download-by-url', { text: line, subdir });
        ok++;
      } catch (e) {
        $('#dlStatus').textContent = '提交失败：' + e.message;
      }
    }
    $('#dlStatus').textContent = ok ? `已加入下载队列：${ok} 个` : '没有加入任何下载';
    if (ok) toast(`已加入队列 ${ok} 个`);
    await refreshDownloads(true);
  } finally {
    btn.disabled = false;
    btn.textContent = '开始下载';
  }
}

/* ---------------- C站搜索 ---------------- */

const civState = { items: [], cursor: '', q: '', nsfw: 0, baseModel: '', selected: new Map() };

function civVersionId(it) {
  return it && it.version && it.version.id ? String(it.version.id) : '';
}

function renderCivGrid() {
  const grid = $('#civGrid');
  const items = civState.items;
  if (!items.length) { grid.innerHTML = '<div class="skeleton">没搜到，换个词。</div>'; return; }
  grid.innerHTML = items.map((it, i) => {
    const vid = civVersionId(it);
    const picked = vid && civState.selected.has(vid);
    return `<div class="civ-card${picked ? ' picked' : ''}" data-civ="${i}">
      <label class="civ-pick" title="选择"><input type="checkbox" data-civpick="${i}" ${picked ? 'checked' : ''} /></label>
      ${it.image ? `<img loading="lazy" src="${esc(it.image)}" alt="" />` : '<div style="aspect-ratio:3/4;background:#0b0d12"></div>'}
      <div class="nm">${esc(it.name)}</div>
      <div class="mt">${esc(it.version.baseModel || '')}${it.nsfw ? ' · NSFW' : ''} · ${esc(it.creator || '')}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-civ]').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('.civ-pick')) return;
      const it = items[Number(el.dataset.civ)];
      if (it) openCivDetail(it.id, it.version && it.version.id, it);
    };
  });
  grid.querySelectorAll('[data-civpick]').forEach((cb) => {
    cb.onchange = () => {
      const it = items[Number(cb.dataset.civpick)];
      const vid = civVersionId(it);
      if (!vid) return;
      if (cb.checked) civState.selected.set(vid, it);
      else civState.selected.delete(vid);
      const card = cb.closest('.civ-card');
      if (card) card.classList.toggle('picked', cb.checked);
      updateCivSelBar();
    };
  });
  updateCivSelBar();
}

function updateCivSelBar() {
  const n = civState.selected.size;
  if ($('#civSelCount')) $('#civSelCount').textContent = n ? `已选 ${n} 个` : '没选';
  if ($('#civDlSel')) $('#civDlSel').disabled = n === 0;
  if ($('#civMore')) {
    $('#civMore').disabled = !civState.cursor;
    $('#civMore').hidden = !civState.cursor;
  }
}

async function searchCivitai(reset = true) {
  const grid = $('#civGrid');
  const hint = $('#civHint');
  if (reset) {
    civState.items = [];
    civState.selected.clear();
    civState.cursor = '';
    civState.q = ($('#civQ').value || '').trim();
    civState.nsfw = $('#civNsfw').checked ? 1 : 0;
    const baseSel = ($('#civBase') && $('#civBase').value) || '';
    civState.baseModel = baseSel === '__current__' ? currentBaseModelFilter() : baseSel;
    grid.innerHTML = '<div class="skeleton">搜 C站…</div>';
    const baseText = civState.baseModel || (baseSel === '__current__' ? '全部（当前底模没识别）' : '全部');
    hint.textContent = (civState.q ? `搜「${civState.q}」` : '看最热门的') + ` · ${baseText}`;
  } else {
    if (!civState.cursor) return;
    if ($('#civMore')) { $('#civMore').disabled = true; $('#civMore').textContent = '加载中…'; }
  }
  try {
    const url = `/api/civitai/search?q=${encodeURIComponent(civState.q)}&nsfw=${civState.nsfw}&limit=24`
      + (civState.baseModel ? `&baseModel=${encodeURIComponent(civState.baseModel)}` : '')
      + (civState.cursor ? `&cursor=${encodeURIComponent(civState.cursor)}` : '');
    const r = await api(url);
    civState.cursor = r.nextCursor || '';
    let items = r.items || [];
    /* 有些 C站接口版本会忽略 baseModels，客户端再兜一层 */
    if (civState.baseModel) {
      const want = civState.baseModel.toLowerCase();
      items = items.filter((it) => {
        const got = String(it.version && it.version.baseModel || '').toLowerCase();
        return got === want || got.includes(want) || want.includes(got);
      });
    }
    civState.items = reset ? items : civState.items.concat(items);
    if (reset && !items.length) { grid.innerHTML = '<div class="skeleton">没搜到，换个词。</div>'; return; }
    renderCivGrid();
    if ($('#civMore')) $('#civMore').textContent = '加载更多';
    const token = state.cfg && state.cfg.civitaiToken;
    if (!token) hint.textContent = '没填 C站 API Key：能看不一定能下（NSFW 会 401）';
  } catch (e) {
    if ($('#civMore')) { $('#civMore').textContent = '加载更多'; $('#civMore').disabled = !civState.cursor; }
    grid.innerHTML = `<div class="skeleton">搜索失败：${esc(e.message)}</div>`;
  }
}

async function downloadSelectedCiv() {
  const ids = [...civState.selected.keys()];
  if (!ids.length) { toast('先勾几个', true); return; }
  const subdir = ($('#dlCat') && $('#dlCat').value) || '';
  let ok = 0;
  for (const vid of ids) {
    try { await write('/api/civitai/download', { versionId: vid, subdir }); ok++; }
    catch (e) { toast(e.message, true); }
  }
  toast(`已加入队列 ${ok} 个`);
  if ($('#dlStatus')) $('#dlStatus').textContent = `已加入下载队列：${ok} 个`;
  await refreshDownloads(true);
}

async function openCivDetail(modelId, versionId, summary) {
  const box = $('#civDetail');
  box.classList.remove('hidden');
  box.innerHTML = '<div class="skeleton">读模型…</div>';
  try {
    const d = await api(`/api/civitai/model?id=${encodeURIComponent(modelId)}&versionId=${encodeURIComponent(versionId || '')}`);
    renderCivDetail(d, versionId || '', summary);
  } catch (e) {
    box.innerHTML = `<div class="skeleton">读模型失败：${esc(e.message)}</div>`;
  }
}

function renderCivDetail(d, preferVersionId, summary) {
  const box = $('#civDetail');
  const vs = d.versions || [];
  if (!vs.length) { box.innerHTML = '<div class="skeleton">这个模型没有可下载版本。</div>'; return; }
  const cur = vs.find((v) => String(v.id) === String(preferVersionId || '')) || vs[0];
  const img = (d.images && d.images[0]) || (summary && summary.image) || '';
  const pageUrl = `https://civitai.com/models/${d.id}${cur.id ? '?modelVersionId=' + cur.id : ''}`;
  const words = (cur.trainedWords || []).join(', ');
  box.innerHTML = `
    <div class="civ-d-header"><b>${esc(d.name)}</b><button class="mini" id="civBack">返回列表</button></div>
    <div class="civ-d-body">
      <div>${img ? `<img src="${esc(img)}" alt="" />` : ''}</div>
      <div>
        <h3>${esc(d.name)}</h3>
        <div class="civ-d-meta">${esc(d.creator || '')} · ${esc(d.type || '')}${d.nsfw ? ' · NSFW' : ''}</div>
        <div class="civ-d-tags">${(d.tags || []).slice(0, 12).map((x) => `<span>${esc(x)}</span>`).join('')}</div>
        <div class="civ-d-words"><b>触发词</b> ${esc(words || '（这个版本没写）')}</div>
        <div class="civ-d-words"><b>文件</b> ${cur.file ? esc(cur.file.name) + ' · ' + Math.round((cur.file.sizeKB || 0) / 1024) + ' MB' : '没有 .safetensors'}</div>
        <div class="civ-d-prompt">${esc((d.description || '').slice(0, 1200))}</div>
        <div class="civ-d-actions">
          <select id="civVerSel">${vs.map((v) => `<option value="${esc(v.id)}" ${v.id === cur.id ? 'selected' : ''}>${esc(v.name || v.id)} · ${esc(v.baseModel || '-')}</option>`).join('')}</select>
          <button class="primary mini-primary" id="civDlBtn" ${cur.file ? '' : 'disabled'}>下载这个版本</button>
          <a class="ghost" href="${esc(pageUrl)}" target="_blank" rel="noreferrer">C站页面</a>
        </div>
      </div>
    </div>`;
  $('#civBack').onclick = () => { box.classList.add('hidden'); };
  $('#civVerSel').onchange = () => {
    const v = vs.find((x) => String(x.id) === $('#civVerSel').value);
    if (!v) return;
    $('#civDlBtn').disabled = !v.file;
    const a = box.querySelector('.civ-d-actions a');
    if (a) a.href = `https://civitai.com/models/${d.id}?modelVersionId=${v.id}`;
  };
  $('#civDlBtn').onclick = async () => {
    const v = vs.find((x) => String(x.id) === $('#civVerSel').value);
    if (!v || !v.file) { toast('这个版本没有文件', true); return; }
    const subdir = $('#dlCat').value || '';
    const btn = $('#civDlBtn');
    btn.disabled = true;
    btn.textContent = '下载中…';
    try {
      await write('/api/civitai/download', { versionId: v.id, name: d.name, subdir });
      $('#civHint').textContent = '已加入下载队列，下完自动入库';
      await refreshDownloads(true);
    } catch (e) {
      $('#civHint').textContent = '失败：' + e.message;
      toast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = '下载这个版本';
    }
  };
}

let facetsCache = null;

async function loadFacets() {
  try {
    const f = await api('/api/facets');
    facetsCache = f;
    renderFacets();
  } catch { /* ignore */ }
}

function renderFacets() {
  if (!facetsCache) return;
  const total = (facetsCache.categories || []).reduce((s, c) => s + c.c, 0);
  const cats = facetsCache.categories || [];
  const catBox = $('#libCats');
  if (catBox) {
    catBox.innerHTML = `<button class="side-item ${!state.lib.category ? 'on' : ''}" data-cat=""><span>全部</span><b>${total}</b></button>` +
      cats.map((c) => `<button class="side-item ${state.lib.category === c.name ? 'on' : ''}" data-cat="${esc(c.name)}"><span>${esc(c.name)}</span><b>${c.c}</b></button>`).join('');
  }
  const works = (facetsCache.works || []).filter((w) => !state.lib.category || w.category === state.lib.category).slice(0, 30);
  if ($('#libWorksWrap')) {
    $('#libWorksWrap').classList.toggle('hidden', !state.lib.category || !works.length);
    if ($('#libWorks')) {
      $('#libWorks').innerHTML = `<button class="side-item ${!state.lib.work ? 'on' : ''}" data-work=""><span>全部作品</span></button>` +
        works.map((w) => `<button class="side-item ${state.lib.work === w.name ? 'on' : ''}" data-work="${esc(w.name)}"><span>${esc(w.name)}</span><b>${w.c}</b></button>`).join('');
    }
  }
  const tags = (facetsCache.tags || []).slice(0, 40);
  if ($('#libTags')) {
    $('#libTags').innerHTML = tags.map((t) => `<button class="tag ${state.lib.tag === t.name ? 'on' : ''}" data-tag="${esc(t.name)}">${esc(t.name)}</button>`).join('');
  }
}

function needsZhName(name) {
  const s = String(name || '').trim();
  if (!s) return false;
  const han = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  return han / s.length < 0.5;
}

async function openDetail(id) {
  $('#detail').classList.remove('hidden');
  $('#detailTitle').textContent = '详情';
  $('#detailBody').innerHTML = '<div class="skeleton">读详情…</div>';
  try {
    const row = await api('/api/loras/' + id);
    renderDetail(row);
    maybeTranslate(row);
  } catch (e) {
    $('#detailBody').innerHTML = `<div class="skeleton">读详情失败：${esc(e.message)}</div>`;
  }
}

const translatedOnce = new Set();
async function translateLora(row) {
  if (!row || translatedOnce.has(row.id + ':busy')) return null;
  translatedOnce.add(row.id + ':busy');
  try {
    const r = await write('/api/loras/' + row.id + '/translate', {}, 'POST');
    if (r && r.translated) toast('翻译好了');
    return r || row;
  } catch (e) {
    toast('翻译失败：' + e.message, true);
    return row;
  } finally {
    translatedOnce.delete(row.id + ':busy');
  }
}

async function maybeTranslate(row) {
  const nameNeeds = row.name && needsZhName(row.name) && !row.name_zh;
  const descNeeds = row.description && !row.description_zh;
  if (!nameNeeds && !descNeeds) return;
  if (translatedOnce.has(row.id)) return;
  translatedOnce.add(row.id);
  const r = await translateLora(row);
  if (r && $('#detail') && !$('#detail').classList.contains('hidden')) {
    const cur = $('#detailTitle').textContent || '';
    if (cur === '详情' || cur === (row.name_zh || row.name || '')) renderDetail(r);
  }
}

function triggerKindOptions(selected) {
  return TRIGGER_KIND_ORDER.map((k) =>
    `<option value="${k}" ${k === selected ? 'selected' : ''}>${TRIGGER_KIND_LABELS[k]}</option>`).join('');
}

function renderDetail(row) {
  $('#detailTitle').textContent = loraLabel(row) || '详情';
  const img = row.preview ? `<img class="big" src="/media/${row.id}/thumb" alt="" />` : '';
  const kv = [
    ['分类', row.category],
    ['作品', row.work],
    ['底模', row.base_model],
    ['触发词（整串）', row.trigger],
    ['特征词', row.feature_words],
    ['服装词', row.outfit_words],
    ['负面词', row.negative],
    ['下载地址', row.download_url],
    ['C站 ID', [row.model_id, row.version_id].filter(Boolean).join(' / ')],
    ['路径', row.rel_path],
  ].filter(([, v]) => v);
  const trs = Array.isArray(row.triggers) ? row.triggers.filter((t) => t && t.enabled) : [];
  const triggerGroups = TRIGGER_KIND_ORDER.map((kind) => {
    const list = trs.filter((t) => (t.kind || 'other') === kind);
    if (!list.length) return '';
    return `<div class="trigger-group"><b>${esc(TRIGGER_KIND_LABELS[kind])}</b>${list.map((t) =>
      `<div class="trigger-item"><code>${esc(t.text || '')}</code><button class="mini" data-copy-trigger="${esc(t.text || '')}">复制</button></div>`).join('')}</div>`;
  }).join('');
  const triggerBlock = `<div class="detail-desc"><b>触发词分类</b> <button id="trigOrganize" class="mini">重新整理</button>
    ${triggerGroups ? `<div class="trigger-groups">${triggerGroups}</div>` : '<p class="hint">还没有逐条触发词；点「重新整理」或编辑里手动加。</p>'}
  </div>`;
  const srcUrl = String(row.source_url || '');
  const source = /^https?:\/\//i.test(srcUrl)
    ? `<a class="source-link" href="${esc(srcUrl)}" target="_blank" rel="noreferrer">下载页 / 作者页 ↗</a>`
    : '';
  const descText = row.description_zh || row.description || '';
  const desc = row.description
    ? `<div class="detail-desc"><b>作者描述</b> <button id="trDesc" class="mini">${row.description_zh ? '重翻' : '翻译'}</button>
        <p>${esc(descText)}</p>
        ${row.description_zh ? `<details class="hint"><summary>原文</summary><p>${esc(row.description)}</p></details>` : ''}
      </div>`
    : '';
  const note = row.note ? `<div class="detail-desc"><b>备注</b><p>${esc(row.note)}</p></div>` : '';
  const nameNeedsZh = row.name && needsZhName(row.name) && !row.name_zh;
  $('#detailBody').innerHTML = `${img}
    <h3>${esc(loraLabel(row) || '')}${nameNeedsZh ? ' <button id="trName" class="mini">译名</button>' : ''}</h3>
    <div class="sub">${esc(row.name || '')}</div>
    ${source}
    <dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${triggerBlock}
    ${desc}${note}
    <button class="primary use" id="useChar">用它出图</button>
    <button class="ghost use" id="editLora" style="margin-top:7px">编辑</button>
    <div class="detail-manage">
      <select id="moveCat">${((facetsCache && facetsCache.categories) || []).map((c) =>
        `<option value="${esc(c.name)}" ${c.name === row.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <button id="moveLora" class="ghost">移动</button>
      <button id="changePreview" class="ghost">换预览</button>
      <button id="deleteFile" class="ghost danger">删除文件</button>
      <button id="deleteLora" class="ghost danger">删除记录</button>
      <input id="previewFile" type="file" accept="image/*" hidden />
    </div>`;
  $('#useChar').onclick = () => {
    /* 按分类送到对应的槽：服装进服装支、辅助进 LoRA 槽，别一律当角色挂 */
    const cat = String(row.category || '');
    const item = {
      id: row.id,
      rel_path: row.rel_path,
      name: row.name_zh || row.name,
      name_zh: row.name_zh || '',
      weight: row.weight,
      trigger: row.trigger,
      feature_words: row.feature_words,
      outfit_words: row.outfit_words,
      negative: row.negative,
    };
    $('#detail').classList.add('hidden');
    switchPage('create');
    if (/服装/.test(cat)) {
      state.outfitLora = item;
      state.outfit = 'LORA';
      renderSix();
      if ($('#createHint')) $('#createHint').textContent = `服装支：${item.name}`;
      chooseLoraVariant(state.outfitLora, 'outfitLora');
      return;
    }
    if (/辅助/.test(cat)) {
      if (state.auxLoras.some((x) => x && x.rel_path === item.rel_path)) {
        toast('这支已经在 LoRA 槽里了');
        renderSix();
        return;
      }
      if (state.auxLoras.length >= 8) {
        toast('LoRA 槽最多 8 支，先删一支', true);
        renderSix();
        return;
      }
      state.auxLoras.push(item);
      state.auxIndex = state.auxLoras.length - 1;
      renderSix();
      if ($('#createHint')) $('#createHint').textContent = `辅助支：${item.name}`;
      chooseLoraVariant(item, 'auxSlot');
      return;
    }
    state.char = item;
    renderChars();
    if ($('#createHint')) $('#createHint').textContent = `角色：${state.char.name}`;
    chooseLoraVariant(state.char, 'char');
  };
  const big = $('#detailBody img.big');
  if (big) big.onclick = () => openImageViewer('/media/' + row.id + '/full');
  $$('#detailBody [data-copy-trigger]').forEach((b) => {
    b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copyTrigger || ''); toast('复制了：' + (b.dataset.copyTrigger || '')); }
      catch { toast('复制失败，手动选吧', true); }
    };
  });
  const trigOrganize = $('#trigOrganize');
  if (trigOrganize) trigOrganize.onclick = async () => {
    if (!window.confirm('重新整理会覆盖当前逐条触发词，继续？')) return;
    try {
      const r = await write('/api/loras/' + row.id + '/triggers/organize', {}, 'POST');
      toast('整理好了');
      renderDetail(r);
    } catch (e) { toast('整理失败：' + e.message, true); }
  };
  $('#editLora').onclick = () => renderEdit(row);
  const trName = $('#trName');
  if (trName) trName.onclick = async () => { const r = await translateLora(row); if (r) renderDetail(r); };
  const trDesc = $('#trDesc');
  if (trDesc) trDesc.onclick = async () => { const r = await translateLora(row); if (r) renderDetail(r); };
  const delFile = $('#deleteFile');
  if (delFile) delFile.onclick = async () => {
    if (!window.confirm(`删除磁盘上的这个文件？\n\n${row.rel_path}\n\n文件会被真删掉，记录标为「丢失」。`)) return;
    try {
      await write('/api/loras/' + row.id + '/file', {}, 'DELETE');
      toast('文件已删除');
      await openDetail(row.id);
      loadLib(true);
    } catch (e) {
      toast('删除失败：' + e.message, true);
    }
  };
  $('#moveLora').onclick = async () => {
    const cat = $('#moveCat').value;
    if (!cat) return;
    try {
      await write('/api/loras/' + row.id + '/move', { category: cat });
      toast('已移动');
      await loadFacets();
      await loadLibrary(true);
      openDetail(row.id);
    } catch (e) { toast(e.message, true); }
  };
  $('#deleteLora').onclick = async () => {
    if (!window.confirm(`删除「${row.name_zh || row.name}」的库记录？\n只删记录，不删磁盘文件。`)) return;
    try {
      await write('/api/loras/' + row.id, {}, 'DELETE');
      toast('记录已删');
      $('#detail').classList.add('hidden');
      await loadFacets();
      await loadLibrary(true);
    } catch (e) { toast(e.message, true); }
  };
  $('#changePreview').onclick = () => $('#previewFile').click();
  $('#previewFile').onchange = async () => {
    const f = $('#previewFile').files[0];
    if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const r = await fetch('/api/loras/' + row.id + '/preview', {
        method: 'POST',
        headers: { 'Content-Type': f.type || 'image/png', 'X-API-Token': state.token },
        body: buf,
      });
      if (!r.ok) throw new Error((await r.json()).error || 'HTTP ' + r.status);
      toast('预览已更新');
      await loadLibrary(true);
      openDetail(row.id);
    } catch (e) { toast(e.message, true); }
  };
}

function renderEdit(row) {
  $('#detailTitle').textContent = '编辑 · ' + (row.name_zh || row.name || '');
  const f = (key, label, val, area = false) => `<label class="field"><span>${label}</span>${area
    ? `<textarea data-f="${key}" rows="2">${esc(val || '')}</textarea>`
    : `<input data-f="${key}" value="${esc(val || '')}" />`}</label>`;
  $('#detailBody').innerHTML = `<div class="edit-form">
    ${f('name', '文件名 / 英文名', row.name)}
    ${f('name_zh', '中文名', row.name_zh)}
    ${f('trigger', '触发词（整串，兼容旧记录）', row.trigger, true)}
    <div class="field"><span>逐条触发词</span>
      <div id="triggerEditRows"></div>
      <div class="trigger-tools"><button type="button" id="triggerAdd" class="ghost">＋ 加一条</button><button type="button" id="triggerOrganize" class="ghost">重新整理</button></div>
      <div class="hint">出图时优先用这里的逐条词；旧整串只在没有逐条词时兜底。</div>
    </div>
    ${f('feature_words', '特征词', row.feature_words, true)}
    ${f('outfit_words', '服装词', row.outfit_words, true)}
    ${f('body_words', '身体词', row.body_words, true)}
    ${f('negative', '负面词', row.negative, true)}
    ${f('weight', '权重', row.weight)}
    ${f('source_url', '下载页 / 作者页', row.source_url)}
    ${f('download_url', '文件下载地址', row.download_url)}
    ${f('description', '作者描述', row.description, true)}
    ${f('note', '备注', row.note, true)}
    <div class="edit-actions"><button class="goal-btn primary" id="editSave">保存</button><button class="ghost" id="editCancel">取消</button></div>
  </div>`;
  const trBox = $('#triggerEditRows');
  const addTriggerRow = (t = {}) => {
    const el = document.createElement('div');
    el.className = 'trigger-edit-row';
    el.innerHTML = `<input data-t-text value="${esc(t.text || '')}" placeholder="触发词" />
      <select data-t-kind>${triggerKindOptions(t.kind || 'other')}</select>
      <label class="tr-on"><input type="checkbox" data-t-enabled ${t.enabled === 0 ? '' : 'checked'} />启用</label>
      <button type="button" class="mini" data-t-del title="删掉这条">×</button>`;
    trBox.appendChild(el);
  };
  (Array.isArray(row.triggers) ? row.triggers : []).forEach(addTriggerRow);
  $('#triggerAdd').onclick = () => addTriggerRow({ kind: 'other', enabled: 1 });
  trBox.onclick = (e) => {
    const b = e.target.closest('[data-t-del]');
    if (b) b.closest('.trigger-edit-row').remove();
  };
  $('#triggerOrganize').onclick = async () => {
    if (!window.confirm('重新整理会覆盖当前逐条触发词，继续？')) return;
    try {
      const r = await write('/api/loras/' + row.id + '/triggers/organize', {}, 'POST');
      toast('整理好了');
      renderEdit(r);
    } catch (e) { toast('整理失败：' + e.message, true); }
  };
  $('#detailBody').querySelector('#editCancel').onclick = () => renderDetail(row);
  $('#detailBody').querySelector('#editSave').onclick = async () => {
    const body = {};
    for (const el of $$('#detailBody [data-f]')) body[el.dataset.f] = el.value.trim();
    const w = Number(body.weight);
    body.weight = Number.isFinite(w) ? w : null;
    const triggers = $$('#triggerEditRows .trigger-edit-row').map((el) => ({
      text: (el.querySelector('[data-t-text]')?.value || '').trim(),
      kind: el.querySelector('[data-t-kind]')?.value || 'other',
      enabled: el.querySelector('[data-t-enabled]')?.checked ? 1 : 0,
    })).filter((t) => t.text);
    try {
      await write('/api/loras/' + row.id, body, 'PATCH');
      await write('/api/loras/' + row.id + '/triggers', { triggers }, 'PUT');
      toast('保存了');
      await openDetail(row.id);
      state.lib.items = [];
      loadLibrary(true);
    } catch (e) { toast(e.message, true); }
  };
}

/* ---------------- records ---------------- */

async function searchRecords(q) {
  const box = $('#recList');
  if (!box) return;
  const kw = String(q || '').trim();
  if (!kw) {
    box.innerHTML = '<div class="skeleton">输入关键词，反查以前用了哪支 LoRA、什么 prompt。</div>';
    if ($('#recCount')) $('#recCount').textContent = '';
    return;
  }
  box.innerHTML = '<div class="skeleton">查记录…</div>';
  try {
    const r = await api('/api/prompts?q=' + encodeURIComponent(kw) + '&limit=40');
    const items = r.items || [];
    if ($('#recCount')) $('#recCount').textContent = items.length + ' 条';
    box.innerHTML = items.length ? items.map((it) => `<article class="record">
      <div class="rp" data-full="/api/samples/${it.sample_id}/full"><img loading="lazy" src="/api/samples/${it.sample_id}/thumb" alt="" /></div>
      <div>
        <div class="rl">${esc(it.lora_names || '没记 LoRA')}</div>
        <div class="rq">${esc(it.prompt || '')}</div>
        <div class="rt">${esc(String(it.created_at || '').replace('T', ' ').slice(0, 19))}</div>
      </div>
    </article>`).join('') : '<div class="skeleton">没有匹配的记录。</div>';
    $$('.record .rp', box).forEach((el) => {
      el.onclick = () => openImageViewer(el.dataset.full, $$('.record .rp', box).map((x) => x.dataset.full).filter(Boolean));
    });
  } catch (e) {
    box.innerHTML = `<div class="skeleton">查记录失败：${esc(e.message)}</div>`;
  }
}

/* ---------------- 图库（出图目录） ---------------- */

const GAL_PAGE = 60;
const gal = { q: '', sort: 'new', kind: 'output', offset: 0, total: 0, items: [], selected: new Set(), picking: false, seq: 0, bound: false, root: '' };

function galUrl(item) {
  return '/api/localfile?path=' + encodeURIComponent(item.path);
}

function galSize(bytes) {
  const n = Number(bytes) || 0;
  return n > 1048576 ? (n / 1048576).toFixed(1) + 'M' : Math.max(1, Math.round(n / 1024)) + 'K';
}

function renderGallery() {
  const box = $('#galGrid');
  if (!box) return;
  if (!gal.items.length) {
    box.innerHTML = isEnName()
    ? `<div class="skeleton">${gal.root ? 'No images in this folder (' + esc(gal.root) + ') — try Samples above.' : 'No output folder set. Pick one in Settings.'}</div>`
    : `<div class="skeleton">${gal.root ? '这个目录里没有图（' + esc(gal.root) + '）—— 上面切到「成品区」看看。' : '还没设出图目录，去设置里选一下。'}</div>`;
  } else {
    box.innerHTML = gal.items.map((it) => `<figure class="gal-card${gal.selected.has(it.rel) ? ' on' : ''}" data-rel="${esc(it.rel)}">
      ${gal.picking ? `<span class="gal-check">${gal.selected.has(it.rel) ? '✓' : ''}</span>` : ''}
      <img loading="lazy" src="${esc(galUrl(it))}" alt="${esc(it.rel)}">
      <figcaption title="${esc(it.rel)}">${esc(it.rel)}</figcaption>
    </figure>`).join('');
  }
  if ($('#galCount')) {
    $('#galCount').textContent = (isEnName() ? `${gal.total || 0} images` : `${gal.total || 0} 张`) + (gal.selected.size ? (isEnName() ? ' · selected ' : ' · 选中 ') + gal.selected.size : '') + (gal.root ? ' · ' + gal.root : '');
  }
  if ($('#galMore')) $('#galMore').classList.toggle('hidden', gal.items.length >= gal.total);
  if ($('#galDelete')) {
    $('#galDelete').classList.toggle('hidden', !gal.picking || !gal.selected.size);
    $('#galDelete').textContent = gal.selected.size
      ? (isEnName() ? `Delete ${gal.selected.size}` : `删除选中（${gal.selected.size}）`)
      : (isEnName() ? 'Delete selected' : '删除选中');
  }
  if ($('#galMove')) {
    $('#galMove').classList.toggle('hidden', !gal.picking || !gal.selected.size);
    $('#galMove').textContent = gal.selected.size
      ? (isEnName() ? `Move… (${gal.selected.size})` : `移到…（${gal.selected.size}）`)
      : (isEnName() ? 'Move…' : '移到…');
  }
  if ($('#galSelectMode')) {
    $('#galSelectMode').textContent = gal.picking
      ? (isEnName() ? 'Done' : '退出选择')
      : (isEnName() ? 'Select' : '选择');
  }
}

async function loadGallery(reset = true) {
  /* 用请求序号代替 loading 锁：切目录 / 换排序时上一次还没回来也能立刻重发，
     回来的旧响应直接丢掉，不会把新结果盖掉（以前会卡在旧目录上） */
  const seq = ++gal.seq;
  if (reset) { gal.offset = 0; gal.items = []; }
  const kind = gal.kind;
  const sort = gal.sort;
  const q = gal.q;
  const offset = gal.offset;
  try {
    const r = await api(`/api/gallery?root=${kind}&limit=${GAL_PAGE}&offset=${offset}&sort=${sort}&q=${encodeURIComponent(q)}`);
    if (seq !== gal.seq) return;
    gal.root = r.root || '';
    gal.total = Number(r.total) || 0;
    const items = r.items || [];
    gal.items = reset ? items : gal.items.concat(items);
    gal.offset = offset + items.length;
    /* 选中的图如果被删了/换页了，从选中集合里剔掉 */
    const alive = new Set(gal.items.map((x) => x.rel));
    for (const n of [...gal.selected]) if (!alive.has(n)) gal.selected.delete(n);
  } catch (e) {
    if (seq !== gal.seq) return;
    toast((isEnName() ? 'Failed to load gallery: ' : '读图库失败：') + e.message, true);
    gal.items = [];
  }
  renderGallery();
}

async function deleteSelectedImages() {
  const names = [...gal.selected];
  if (!names.length) return;
  if (!window.confirm(isEnName() ? `Delete ${names.length} image(s) from disk? This skips the recycle bin.` : `从硬盘删掉 ${names.length} 张图？删了不进回收站。`)) return;
  try {
    const r = await write('/api/gallery', { root: gal.kind, names }, 'DELETE');
    toast(isEnName()
      ? `Deleted ${r.removed || 0}` + (r.errors && r.errors.length ? `, ${r.errors.length} failed` : '')
      : `删了 ${r.removed || 0} 张` + (r.errors && r.errors.length ? `，${r.errors.length} 个没删成` : ''));
    gal.selected.clear();
    gal.picking = false;
    await loadGallery(true);
  } catch (e) {
    toast('删除失败：' + e.message, true);
  }
}

/* 移动 / 整理：搬到成品区、出图目录或某个子文件夹；填新名字就是新建 */
function galKindLabel(kind) {
  return kind === 'samples'
    ? (isEnName() ? 'Samples' : '成品区')
    : (isEnName() ? 'Output folder' : '出图目录');
}

async function loadGalleryDirs(kind) {
  const list = $('#galDirList');
  if (!list) return;
  list.innerHTML = '';
  try {
    const r = await api(`/api/gallery/dirs?root=${kind}`);
    list.innerHTML = (r.dirs || [])
      .map((d) => `<option value="${esc(d.rel)}">${esc(d.rel)}${d.count ? ' · ' + d.count : ''}</option>`)
      .join('');
  } catch {
    /* 目录列不出来就不给建议，手填照样能搬 */
  }
}

function openGalleryMove() {
  if (!gal.selected.size) return;
  const box = $('#galMoveModal');
  if (!box) return;
  const to = gal.kind === 'samples' ? 'output' : 'samples';
  $('#galMoveTo').value = to;
  $('#galMoveTarget').value = '';
  $('#galMoveHint').textContent = isEnName()
    ? `Moving ${gal.selected.size} image(s) out of ${galKindLabel(gal.kind)}. Blank folder = root; a new name creates it.`
    : `把 ${gal.selected.size} 张图从「${galKindLabel(gal.kind)}」搬走。文件夹留空 = 根目录；写个新名字就是新建。`;
  box.classList.remove('hidden');
  loadGalleryDirs(to);
  setTimeout(() => { const t = $('#galMoveTarget'); if (t) { t.focus(); t.select(); } }, 30);
}

async function doGalleryMove() {
  const names = [...gal.selected];
  if (!names.length) return;
  const to = $('#galMoveTo').value === 'output' ? 'output' : 'samples';
  const target = String($('#galMoveTarget').value || '').trim();
  const btn = $('#galMoveOk');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = isEnName() ? 'Moving…' : '搬着…'; }
  try {
    const r = await write('/api/gallery/move', { root: gal.kind, to, names, target });
    $('#galMoveModal').classList.add('hidden');
    gal.selected.clear();
    gal.picking = false;
    const errs = r.errors || [];
    const where = galKindLabel(to) + (r.target ? ' / ' + r.target : '');
    if (!r.moved && errs.length) {
      toast((isEnName() ? 'Move failed: ' : '没搬成：') + errs[0], true);
    } else {
      toast((isEnName()
        ? `Moved ${r.moved || 0} → ${where}`
        : `搬了 ${r.moved || 0} 张 → ${where}`) + (errs.length ? (isEnName() ? `, ${errs.length} skipped` : `，${errs.length} 个没搬`) : ''));
    }
    await loadGallery(true);
  } catch (e) {
    toast((isEnName() ? 'Move failed: ' : '移动失败：') + e.message, true);
  }
  if (btn) { btn.disabled = false; btn.textContent = label; }
}

function initGallery() {
  if (gal.bound) return;
  gal.bound = true;
  const q = $('#galQ');
  if (q) q.addEventListener('input', debounce(() => { gal.q = q.value.trim(); loadGallery(true); }, 260));
  if ($('#galRoot')) $('#galRoot').onchange = () => { gal.kind = $('#galRoot').value; gal.selected.clear(); loadGallery(true); };
  if ($('#galSort')) $('#galSort').onchange = () => { gal.sort = $('#galSort').value; loadGallery(true); };
  if ($('#galMore')) $('#galMore').onclick = () => loadGallery(false);
  if ($('#galOpen')) $('#galOpen').onclick = () => { const kind = gal.kind === 'samples' ? 'samples' : 'output'; if (desk && desk.openDir) desk.openDir(kind); else toast('网页版没有这个功能', true); };
  if ($('#galSelectMode')) {
    $('#galSelectMode').onclick = () => {
      gal.picking = !gal.picking;
      if (!gal.picking) gal.selected.clear();
      renderGallery();
    };
  }
  if ($('#galDelete')) $('#galDelete').onclick = deleteSelectedImages;
  if ($('#galMove')) $('#galMove').onclick = openGalleryMove;
  if ($('#galMoveOk')) $('#galMoveOk').onclick = doGalleryMove;
  if ($('#galMoveCancel')) $('#galMoveCancel').onclick = () => $('#galMoveModal').classList.add('hidden');
  if ($('#galMoveTarget')) $('#galMoveTarget').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doGalleryMove(); } };
  if ($('#galMoveTo')) {
    $('#galMoveTo').onchange = () => loadGalleryDirs($('#galMoveTo').value === 'output' ? 'output' : 'samples');
  }
  if ($('#galMoveModal')) {
    $('#galMoveModal').onclick = (e) => { if (e.target.id === 'galMoveModal') $('#galMoveModal').classList.add('hidden'); };
  }
  if ($('#galGrid')) {
    $('#galGrid').onclick = (e) => {
      const card = e.target.closest('.gal-card');
      if (!card) return;
      const rel = card.dataset.rel;
      if (gal.picking) {
        if (gal.selected.has(rel)) gal.selected.delete(rel);
        else gal.selected.add(rel);
        renderGallery();
        return;
      }
      const item = gal.items.find((x) => x.rel === rel);
      if (item) openImageViewer(galUrl(item), gal.items.map(galUrl));
    };
  }
}

/* ---------------- health / api ---------------- */

async function openHealth() {
  $('#healthModal').classList.remove('hidden');
  $('#healthBody').textContent = '算着呢…';
  try {
    const [rep, dups] = await Promise.all([api('/api/health-report'), api('/api/duplicates')]);
    const rows = [
      ['总数', rep.total], ['正常', rep.ok], ['文件丢失', rep.missing], ['从未出图', rep.unused],
      ['没预览图', rep.noImage], ['没预览但能补', rep.noImageCapable], ['词或地址不全', rep.missingMeta],
      ['名字还是文件名', rep.noName], ['重复组', (dups || []).length],
    ];
    $('#healthBody').innerHTML = `<div class="health-grid">${rows.map(([k, v]) =>
      `<div class="health-cell"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>`;
    state.healthDups = dups || [];
    renderHealthDups();
  } catch (e) { $('#healthBody').textContent = '体检失败：' + e.message; }
}

function renderHealthDups() {
  const box = $('#healthDups');
  if (!box) return;
  const dups = state.healthDups || [];
  if (!dups.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="hint" style="margin-top:8px">同 hash 重复 ${dups.length} 组</div>` +
    dups.map((g, i) => `<div class="health-dup">
      <b>${g.count} 份</b> · 浪费 ${fmtMB(g.wasteBytes || 0)} · keep：${esc(g.keep ? g.keep.name : '')}
      <div class="names">${(g.items || []).map((it) =>
        `<button class="mini" data-dup-id="${it.id}" style="margin:2px 3px 0 0">${esc(it.name)}${it.runs ? ` (${it.runs})` : ''}</button>`).join('')}</div>
      <button class="mini" data-dup-clean="${i}" style="margin-top:4px">删其余 ${Math.max(0, g.count - 1)} 条记录</button>
    </div>`).join('');
}

const HEALTH_BTNS = ['#fillMeta', '#fillPreviews', '#enrichCiv', '#translateZh', '#syncSamples', '#hashSame', '#tagKinds', '#cleanMissing', '#cleanDups'];

function setHealthBusy(on) {
  state.healthBusy = !!on;
  for (const id of HEALTH_BTNS) {
    const b = $(id);
    if (b) b.disabled = !!on;
  }
}

async function runHealthJob(label, path, body) {
  if (state.healthBusy) return;
  setHealthBusy(true);
  $('#healthJob').textContent = label + '…';
  try {
    const r = await write(path, body || {});
    if (!r.jobId) throw new Error('没拿到任务 id');
    for (let i = 0; i < 1200; i++) {
      const j = await api('/api/jobs/' + r.jobId);
      if (j.status === 'running') {
        const last = (j.log || []).slice(-1)[0];
        $('#healthJob').textContent = `${label} · ${j.done || 0}/${j.total || '?'}${last ? ' · ' + String(last).slice(0, 100) : ''}`;
        await new Promise((x) => setTimeout(x, 1200));
        continue;
      }
      if (j.status === 'error') {
        $('#healthJob').textContent = `${label} 失败：${j.error || '未知错误'}`;
        toast(`${label} 失败`, true);
        break;
      }
      $('#healthJob').textContent = `${label}完成 · 成功 ${j.ok || 0}${j.fail ? ' · 失败 ' + j.fail : ''}`;
      toast(`${label}完成`);
      break;
    }
    await openHealth();
    await loadFacets();
    await loadLibrary(true);
  } catch (e) {
    $('#healthJob').textContent = `${label}失败：${e.message}`;
    toast(e.message, true);
  } finally {
    setHealthBusy(false);
  }
}

async function deleteDupRecords(groups, label) {
  if (state.healthBusy) return;
  const total = groups.reduce((s, g) => s + Math.max(0, (g.items || []).length - 1), 0);
  if (!total) { toast('没有可清的重复记录'); return; }
  if (!window.confirm(`${label}\n会删 ${total} 条重复的库记录，保留每组最常用的那一支。\n只删记录，不删磁盘文件。`)) return;
  setHealthBusy(true);
  let deleted = 0;
  const errors = [];
  $('#healthJob').textContent = `清重复记录… 0/${total}`;
  try {
    for (const g of groups) {
      const keep = g.keep ? g.keep.id : (g.items[0] && g.items[0].id);
      for (const it of g.items || []) {
        if (it.id === keep) continue;
        try {
          await write('/api/loras/' + it.id, {}, 'DELETE');
          deleted++;
          $('#healthJob').textContent = `清重复记录… ${deleted}/${total}`;
        } catch (e) { errors.push(e.message); }
      }
    }
    toast(`删了 ${deleted} 条重复记录${errors.length ? `，失败 ${errors.length}` : ''}`);
    $('#healthJob').textContent = `清重复完成 · 删了 ${deleted} 条${errors.length ? ` · 失败 ${errors.length}` : ''}`;
    await openHealth();
    await loadFacets();
    await loadLibrary(true);
  } finally {
    setHealthBusy(false);
  }
}

async function cleanMissing() {
  if (state.healthBusy) return;
  if (!window.confirm('删掉所有「文件不在磁盘上」的记录？只删记录，不动文件。')) return;
  setHealthBusy(true);
  try {
    const r = await write('/api/loras/missing', {}, 'DELETE');
    toast(`清了 ${r.deleted} 条记录`);
    $('#healthJob').textContent = `清了 ${r.deleted} 条丢失记录`;
    await openHealth();
    await loadLibrary(true);
  } catch (e) {
    toast(e.message, true);
  } finally {
    setHealthBusy(false);
  }
}

async function openApi() {
  $('#apiModal').classList.remove('hidden');
  if (!state.cfg) {
    try { state.cfg = await api('/api/config'); state.token = state.cfg.token || state.token; } catch { /* ignore */ }
  }
  $('#apiToken').value = (state.cfg && state.cfg.token) || state.token || '';
  const base = 'http://127.0.0.1:8787';
  $('#apiBody').innerHTML = `
    <div class="civ-d-words">写操作需要 <code>X-API-Token</code>。</div>
    <div class="civ-d-words">GET ${base}/api/loras<br>GET ${base}/api/gen/options<br>POST ${base}/api/generate<br>GET ${base}/api/jobs/&lt;id&gt;<br>GET ${base}/api/civitai/search?q=&lt;词&gt;<br>POST ${base}/api/civitai/download-by-url<br>GET ${base}/api/openapi.json</div>`;
}

/* ---------------- settings ---------------- */

async function fillSettings() {
  if (!state.cfg) {
    try { state.cfg = await api('/api/config'); state.token = state.cfg.token || ''; } catch { /* ignore */ }
  }
  if (!state.cfg) return;
  const c = state.cfg;
  $('#cfgComfy').value = c.comfyUrl || '';
  $('#cfgComfyDir').value = c.comfyDir || '';
  $('#cfgComfyLaunch').value = c.comfyLaunch || '';
  if ($('#cfgUpdate')) $('#cfgUpdate').value = c.updateUrl || '';
  $('#cfgCivToken').value = c.civitaiToken || '';
  $('#cfgLoras').value = c.lorasRoot || '';
  $('#cfgExtra').value = (c.lorasRoots || []).filter((x) => String(x).toLowerCase() !== String(c.lorasRoot || '').toLowerCase()).join('\n');
  $('#cfgOut').value = (c.gen && c.gen.outputRoot) || '';
  $('#cfgSamples').value = c.samplesRoot || '';
  const mr = c.modelRoots || {};
  $('#cfgMRunet').value = (mr.unet || [])[0] || '';
  $('#cfgMRclip').value = (mr.clip || [])[0] || '';
  $('#cfgMRvae').value = (mr.vae || [])[0] || '';
  $('#cfgMRckpt').value = (mr.checkpoint || [])[0] || '';
  if (c.updateUrl && !updateUi.info) checkAppUpdate(true);
}

async function saveSettings() {
  const lines = (sel) => String($(sel).value || '').split(/[\r\n;]+/).map((s) => s.trim()).filter(Boolean);
  const body = {
    lorasRoot: $('#cfgLoras').value.trim(),
    lorasRoots: lines('#cfgExtra'),
    samplesRoot: $('#cfgSamples').value.trim(),
    comfyUrl: $('#cfgComfy').value.trim(),
    comfyDir: $('#cfgComfyDir').value.trim(),
    comfyLaunch: $('#cfgComfyLaunch').value.trim(),
    updateUrl: $('#cfgUpdate') ? $('#cfgUpdate').value.trim() : '',
    civitaiToken: $('#cfgCivToken').value.trim(),
    gen: { outputRoot: $('#cfgOut').value.trim() },
    modelRoots: {
      unet: lines('#cfgMRunet'),
      clip: lines('#cfgMRclip'),
      vae: lines('#cfgMRvae'),
      checkpoint: lines('#cfgMRckpt'),
    },
  };
  if (!body.lorasRoot) { toast('LoRA 根目录得填', true); return; }
  try {
    const r = await write('/api/config', body);
    state.cfg = await api('/api/config');
    state.token = state.cfg.token || state.token;
    $('#saveHint').textContent = r.scan ? `保存了，扫到 ${r.scan.total} 支` : '保存了';
    state.options = null;
    await loadOptions();
    await loadChars();
    toast('保存了');
  } catch (e) { toast(e.message, true); }
}

async function startComfy() {
  const btn = $('#startComfy');
  const stateEl = $('#startComfyState');
  if (btn) { btn.disabled = true; btn.textContent = '启动中…'; }
  if (stateEl) stateEl.textContent = '发启动命令…';
  try {
    const r = await write('/api/comfy/start', {});
    if (stateEl) stateEl.textContent = r.already ? 'ComfyUI 已经在跑' : `已发启动命令（pid ${r.pid}），等它加载`;
    toast(r.already ? 'ComfyUI 已经在跑' : '已启动 ComfyUI，等 10 秒再出图');
    setTimeout(async () => {
      state.options = null;
      await loadOptions();
      setStatus();
    }, 6000);
  } catch (e) {
    if (stateEl) stateEl.textContent = '启动失败：' + e.message;
    toast(e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '启动 ComfyUI'; }
  }
}

async function testComfy() {
  const url = $('#cfgComfy').value.trim();
  $('#testResult').textContent = '正在连…';
  try {
    const r = await write('/api/comfy/test', { url });
    if (!r.ok) { $('#testResult').textContent = `连接失败：${r.error || r.stage}`; return; }
    const c = r.counts || {};
    $('#testResult').textContent = `连接成功 · ${r.latency_ms} ms · ComfyUI ${r.version || ''} · checkpoint ${c.checkpoints ?? '-'} / unet ${c.unets ?? '-'} / LoRA ${c.loras ?? '-'}`;
  } catch (e) { $('#testResult').textContent = '测试失败：' + e.message; }
}

/* ---------------- boot ---------------- */

/* 成人内容开关（设置页）：默认关，开了才放成人词池；开之前要过一遍免责协议 */
function bindR18() {
  const gate = $('#r18Gate');
  const toggle = $('#r18Toggle');
  const agree = $('#r18Agree');
  const enter = $('#r18Enter');
  const agreeRow = $('#r18AgreeRow');
  const cancel = $('#r18Cancel');
  const readActions = $('#r18ReadActions');

  const openGate = (readonly) => {
    if (!gate) return;
    if (agreeRow) agreeRow.classList.toggle('hidden', !!readonly);
    if (cancel) cancel.classList.toggle('hidden', !!readonly);
    if (enter) { enter.classList.toggle('hidden', !!readonly); enter.disabled = true; }
    if (readActions) readActions.classList.toggle('hidden', !readonly);
    if (agree) agree.checked = false;
    gate.classList.remove('hidden');
  };
  const closeGate = () => {
    if (!gate) return;
    gate.classList.add('hidden');
    renderMode();
  };

  if (toggle) {
    toggle.onchange = () => {
      // 打开只是「申请」：真的开启要等免责协议确认完，取消就由 renderMode 拨回关
      if (toggle.checked) { openGate(false); return; }
      setMode(false);
      toast('已关闭成人内容，回到正常模式');
    };
  }
  if (agree && enter) agree.onchange = () => { enter.disabled = !agree.checked; };
  if (enter) {
    enter.onclick = () => {
      if (!agree || !agree.checked) return;
      closeGate();
      setMode(true);
      toast('已开启成人内容（18+）');
    };
  }
  if (cancel) cancel.onclick = closeGate;
  if (readActions) $('#r18ReadClose').onclick = closeGate;
  if ($('#r18TermsBtn')) $('#r18TermsBtn').onclick = () => openGate(true);
  if (gate) gate.onclick = (e) => { if (e.target === gate) closeGate(); };
}

async function boot() {
  bindR18();
  bindTagPicker();
  bindLoraPicker();
  initFirstRun();
  try {
    state.cfg = await api('/api/config');
    state.token = state.cfg.token || '';
  } catch { /* ignore */ }
  loadCreate();
  loadFacets();
  loadSetup();
  loadAbout();
  loadHistory();
  /* 填了更新清单地址就在后台静默查一次，有新版再吭声 */
  if (state.cfg && state.cfg.updateUrl) setTimeout(() => { if (!updateUi.info) checkAppUpdate(true); }, 1200);

  for (const b of $$('.railbtn')) b.onclick = () => switchPage(b.dataset.nav);
  for (const b of $$('[data-page]')) {
    b.onclick = (e) => {
      const pc = e.target.closest('[data-preset]');
      if (pc) { pickPreset(pc.dataset.preset); return; }
      const c = e.target.closest('[data-char]');
      if (c) pickChar(c.dataset.char);
    };
  }
  $('#randomChar').onclick = () => pickChar('__random__');
  const charSearch = $('#charSearch');
  if (charSearch) {
    charSearch.addEventListener('input', () => {
      clearTimeout(charSearch._t);
      charSearch._t = setTimeout(() => loadChars(charSearch.value.trim()), 250);
    });
    charSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { clearTimeout(charSearch._t); loadChars(charSearch.value.trim()); }
    });
  }
  const charExpand = $('#charExpand');
  if (charExpand) {
    charExpand.onclick = () => {
      const rail = $('#charRail');
      if (!rail) return;
      const on = rail.classList.toggle('expanded');
      charExpand.textContent = on ? '收起' : '展开';
    };
  }
  $('#autoSetup').onclick = autoSetup;
  $('#createBtn').onclick = generate;
  $('#stageSeqBtn').onclick = () => generate('stage');
  $('#randomCreate').onclick = randomAll;
  $('#sixGrid').onclick = (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b || b.disabled) return;
    if (b.dataset.pick === 'undress') { openUndressModal(); return; }
    openPicker(b.dataset.pick);
  };
  $$('.model-tech .six-card').forEach((el) => {
    el.onclick = () => openPicker(el.dataset.pick);
  });
  const undressGate = $('#undressModal');
  if (undressGate) {
    $('#undressClose').onclick = closeUndressModal;
    undressGate.onclick = (e) => { if (e.target === undressGate) closeUndressModal(); };
    $('#undressParts').onclick = (e) => {
      const b = e.target.closest('[data-undress-part]');
      if (!b) return;
      state.undressParts[b.dataset.undressPart] = b.dataset.undressVal;
      renderUndressParts();
      renderSix();
    };
    $$('[data-undress-preset]', undressGate).forEach((b) => {
      b.onclick = () => {
        const kind = b.dataset.undressPreset;
        if (kind === 'clear') state.undressParts = {};
        else if (kind === 'all') for (const p of UNDRESS_PARTS) state.undressParts[p.key] = 'keep';
        else if (kind === 'nude') for (const p of UNDRESS_PARTS) state.undressParts[p.key] = 'off';
        else if (kind === 'socks') {
          for (const p of UNDRESS_PARTS) state.undressParts[p.key] = 'off';
          state.undressParts.socks = 'keep';
        }
        pruneUndressParts();
        renderUndressParts();
        renderSix();
      };
    });
  }
  $('#useProps').onchange = (e) => {
    state.useProps = !!e.target.checked;
    renderSix();
    if (!state.useProps && $('#createHint')) $('#createHint').textContent = '这张不带道具';
  };
  $('#quickStyles').onclick = (e) => {
    const b = e.target.closest('[data-quick]');
    if (b) applyQuick(b.dataset.quick);
  };
  $('#pickerClose').onclick = closePicker;
  const outfitClear = $('#outfitLoraClear');
  if (outfitClear) outfitClear.onclick = () => {
    state.outfitLora = null;
    if (state.outfit === 'LORA') state.outfit = '';
    renderSix();
  };
  const actionClear = $('#actionLoraClear');
  if (actionClear) actionClear.onclick = () => {
    state.actionLora = null;
    renderSix();
  };
  const auxAdd = $('#moreAuxAdd');
  if (auxAdd) auxAdd.onclick = () => {
    if (state.auxLoras.length >= 8) { toast('最多 8 支', true); return; }
    state.auxLoras.push(null);
    renderSix();
  };
  const auxRows = $('#moreAuxRows');
  if (auxRows) auxRows.onclick = (e) => {
    const del = e.target.closest('[data-auxdel]');
    if (del) {
      state.auxLoras.splice(Number(del.dataset.auxdel), 1);
      renderSix();
      return;
    }
    const pick = e.target.closest('[data-aux]');
    if (pick) { state.auxIndex = Number(pick.dataset.aux); openPicker('auxSlot'); }
  };
  const variantClose = $('#variantClose');
  if (variantClose) variantClose.onclick = closeVariantModal;
  const variantOptions = $('#variantOptions');
  if (variantOptions) variantOptions.onclick = (e) => {
    const b = e.target.closest('[data-variant]');
    if (b) applyLoraVariant(b);
  };
  const viewerGate = $('#imgViewer');
  if (viewerGate) viewerGate.onclick = (e) => {
    if (e.target === viewerGate || (e.target.classList && e.target.classList.contains('viewer-card'))) closeImageViewer();
  };
  const vImg = $('#viewerImg');
  if (vImg) {
    vImg.addEventListener('wheel', (e) => {
      e.preventDefault();
      setViewerZoom(viewer.scale * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX, e.clientY);
    }, { passive: false });
    vImg.addEventListener('mousedown', (e) => {
      e.preventDefault();
      viewer.drag = { sx: e.clientX, sy: e.clientY, x: viewer.x, y: viewer.y };
      vImg.classList.add('grabbing');
    });
    vImg.addEventListener('dblclick', () => { if (viewer.scale === 1) setViewerZoom(2); else resetViewer(); });
  }
  window.addEventListener('mousemove', (e) => {
    if (!viewer.drag) return;
    viewer.x = viewer.drag.x + e.clientX - viewer.drag.sx;
    viewer.y = viewer.drag.y + e.clientY - viewer.drag.sy;
    applyViewerTransform();
  });
  window.addEventListener('mouseup', () => {
    if (!viewer.drag) return;
    viewer.drag = null;
    if (vImg) vImg.classList.remove('grabbing');
  });
  const vIn = $('#viewerZoomIn');
  if (vIn) vIn.onclick = () => setViewerZoom(viewer.scale * 1.25);
  const vOut = $('#viewerZoomOut');
  if (vOut) vOut.onclick = () => setViewerZoom(viewer.scale / 1.25);
  const vReset = $('#viewerReset');
  if (vReset) vReset.onclick = resetViewer;
  const vClose = $('#viewerClose');
  if (vClose) vClose.onclick = closeImageViewer;
  const vPrev = $('#viewerPrev');
  if (vPrev) vPrev.onclick = () => viewerStep(-1);
  const vNext = $('#viewerNext');
  if (vNext) vNext.onclick = () => viewerStep(1);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeImageViewer(); return; }
    const gate = $('#imgViewer');
    if (!gate || gate.classList.contains('hidden')) return;
    if (e.key === '+' || e.key === '=') setViewerZoom(viewer.scale * 1.25);
    else if (e.key === '-') setViewerZoom(viewer.scale / 1.25);
    else if (e.key === '0') resetViewer();
    else if (e.key === 'ArrowLeft') { e.preventDefault(); viewerStep(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); viewerStep(1); }
  });
  const pickerSearch = $('#pickerSearch');
  if (pickerSearch) {
    pickerSearch.addEventListener('input', () => {
      const q = pickerSearch.value.trim().toLowerCase();
      $$('#pickerOptions .picker-opt').forEach((b) => {
        b.style.display = (!q || b.textContent.toLowerCase().includes(q)) ? '' : 'none';
      });
    });
  }
  $('#pickerRandom').onclick = () => {
    const field = state.pickerField;
    if (!field) return;
    /* 纹身位置 / 图案：底部按钮真的随机抽一个，不是清空 */
    if (field === 'tattoo' || field === 'tattooPattern') {
      const opts = pickerOptionsFor(field).filter((o) => o.tag);
      if (opts.length) {
        setPick(field, opts[Math.floor(Math.random() * opts.length)].tag);
        return;
      }
    }
    setPick(field, '');
    closePicker();
  };
  $('#pickerOptions').onclick = (e) => {
    const b = e.target.closest('[data-pick-val]');
    if (b && state.pickerField) setPick(state.pickerField, b.dataset.pickVal);
  };
  $('#simpleCount').onchange = (e) => {
    const m = /^r(\d+)$/.exec(e.target.value);
    state.simpleCount = m ? Number(m[1]) : (Number(e.target.value) || 1);
  };
  $('#advOpen').onclick = openAdvanced;
  $('#advClose').onclick = () => $('#advPanel').classList.add('hidden');
  $('#advRun').onclick = advancedGenerate;
  const advNegDefault = $('#advNegDefault');
  if (advNegDefault) advNegDefault.onclick = () => { $('#advNeg').value = DEFAULT_NEG; };
  const advNegEmpty = $('#advNegEmpty');
  if (advNegEmpty) advNegEmpty.onclick = () => { $('#advNeg').value = ''; };
  const advSampler = $('#advSampler');
  if (advSampler) advSampler.onchange = () => { advSampler.dataset.touched = '1'; };
  const advScheduler = $('#advScheduler');
  if (advScheduler) advScheduler.onchange = () => { advScheduler.dataset.touched = '1'; };
  const expRun = $('#expRun');
  if (expRun) expRun.onclick = expertGenerate;
  const expAddAux = $('#expAddAux');
  if (expAddAux) expAddAux.onclick = () => {
    if (!Array.isArray(state.expAuxRows)) state.expAuxRows = [];
    state.expAuxRows.push({ rel: '', w: '' });
    renderExpAuxRows();
  };
  const wfManage = $('#expWorkflowManage');
  if (wfManage) wfManage.onclick = openWorkflowManager;
  const wfClose = $('#wfModalClose');
  if (wfClose) wfClose.onclick = () => $('#wfModal').classList.add('hidden');
  const expNegDefault = $('#expNegDefault');
  if (expNegDefault) expNegDefault.onclick = () => { $('#expNeg').value = DEFAULT_NEG; };
  const expNegEmpty = $('#expNegEmpty');
  if (expNegEmpty) expNegEmpty.onclick = () => { $('#expNeg').value = ''; };
  const expSize = $('#expSize');
  if (expSize) expSize.onchange = () => {
    const box = $('#expCustomSize');
    if (box) box.classList.toggle('hidden', expSize.value !== 'custom');
  };
  const expModel = $('#expModel');
  if (expModel) expModel.onchange = () => { expModel.dataset.touched = '1'; loadExpertSlots(); };
  const expModel2 = $('#expModel2');
  if (expModel2) expModel2.onchange = () => { expModel2.dataset.touched = '1'; };
  const expSampler = $('#expSampler');
  if (expSampler) expSampler.onchange = () => { expSampler.dataset.touched = '1'; };
  const expScheduler = $('#expScheduler');
  if (expScheduler) expScheduler.onchange = () => { expScheduler.dataset.touched = '1'; };
  const advSize2 = $('#advSize');
  if (advSize2) advSize2.onchange = () => {
    const box = $('#advCustomSize');
    if (box) box.classList.toggle('hidden', advSize2.value !== 'custom');
  };
  $('#topCreate').onclick = () => switchPage('create');
  $('#libQ').oninput = debounce(() => { state.lib.q = $('#libQ').value.trim(); loadLibrary(true); }, 260);
  $('#libCats').onclick = (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.lib.category = b.dataset.cat;
    state.lib.work = '';
    state.lib.tag = '';
    renderFacets();
    loadLibrary(true);
  };
  $('#libWorks').onclick = (e) => {
    const b = e.target.closest('[data-work]');
    if (!b) return;
    state.lib.work = b.dataset.work;
    renderFacets();
    loadLibrary(true);
  };
  $('#libTags').onclick = (e) => {
    const b = e.target.closest('[data-tag]');
    if (!b) return;
    state.lib.tag = state.lib.tag === b.dataset.tag ? '' : b.dataset.tag;
    renderFacets();
    loadLibrary(true);
  };
  $('#libSort').onchange = () => { state.lib.sort = $('#libSort').value; loadLibrary(true); };
  $('#libPreview').onchange = () => { state.lib.preview = $('#libPreview').value; loadLibrary(true); };
  $('#libVariants').onchange = () => { state.lib.variants = $('#libVariants').checked; loadLibrary(true); };
  $('#libDownload').onclick = openDownload;
  $('#dlClose').onclick = closeDownload;
  $('#dlClose2').onclick = closeDownload;
  $('#dlStart').onclick = startDownload;
  $('#dlQueue').onclick = async (e) => {
    const b = e.target.closest('[data-dlact]');
    const card = e.target.closest('[data-dlid]');
    if (!b || !card) return;
    try {
      await write(`/api/downloads/${card.dataset.dlid}/${b.dataset.dlact}`);
      await refreshDownloads(false);
    } catch (e2) { toast(e2.message, true); }
  };
  $('#dlPauseAll').onclick = async () => {
    try { await write('/api/downloads/pause-all'); await refreshDownloads(false); } catch (e) { toast(e.message, true); }
  };
  $('#dlResumeAll').onclick = async () => {
    try { await write('/api/downloads/resume-all'); await refreshDownloads(false); } catch (e) { toast(e.message, true); }
  };
  $('#dlClear').onclick = async () => {
    try { await write('/api/downloads/clear'); await refreshDownloads(false); } catch (e) { toast(e.message, true); }
  };
  $('.dl-tabs').onclick = (e) => {
    const b = e.target.closest('[data-dltab]');
    if (b) switchDlTab(b.dataset.dltab);
  };
  $('#civSearchBtn').onclick = () => searchCivitai(true);
  if ($('#civMore')) $('#civMore').onclick = () => searchCivitai(false);
  if ($('#civDlSel')) $('#civDlSel').onclick = downloadSelectedCiv;
  if ($('#civQ')) $('#civQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchCivitai(true); });
  for (const el of $$('.adv-q')) {
    el.oninput = () => {
      clearTimeout(el._qTimer);
      el._qTimer = setTimeout(() => filterAdvSelect(el.dataset.qTarget, el.dataset.qSlot, el.value), 120);
    };
  }
  $('#civQ').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); searchCivitai(); } };
  $('#libAddCat').onclick = async () => {
    const name = prompt('新建一级分类的名字');
    if (!name || !name.trim()) return;
    try {
      await write('/api/loras/dirs', { name: name.trim() });
      toast('分类已建');
      await loadFacets();
    } catch (e) { toast(e.message, true); }
  };
  $('#scanLib').onclick = async () => {
    const btn = $('#scanLib');
    btn.disabled = true;
    btn.textContent = '扫描中…';
    try {
      const r = await write('/api/scan', { read_meta: false });
      toast(`扫描完成，共 ${r.total ?? '?'} 支`);
      await loadFacets();
      await loadLibrary(true);
    } catch (e) { toast(e.message, true); }
    finally { btn.disabled = false; btn.textContent = '扫描磁盘'; }
  };
  $('#libGrid').onclick = (e) => {
    const card = e.target.closest('[data-id]');
    if (card) openDetail(card.dataset.id);
  };
  $('#libMoreBtn').onclick = () => loadLibrary(false);
  $('#recQ').oninput = debounce(() => searchRecords($('#recQ').value), 260);
  $('#detailClose').onclick = () => $('#detail').classList.add('hidden');
  $('#healthDups').onclick = (e) => {
    const cl = e.target.closest('[data-dup-clean]');
    if (cl) {
      const g = (state.healthDups || [])[Number(cl.dataset.dupClean)];
      if (g) deleteDupRecords([g], '清这一组重复记录？');
      return;
    }
    const b = e.target.closest('[data-dup-id]');
    if (!b) return;
    $('#healthModal').classList.add('hidden');
    switchPage('library');
    openDetail(b.dataset.dupId);
  };
  $('#history').onclick = (e) => {
    const open = e.target.closest('[data-hopen]');
    if (open) {
      if (open.dataset.hopen) {
        const list = (state.history || []).map((h) => shotUrl(h.o)).filter(Boolean);
        openImageViewer(open.dataset.hopen, list);
      }
      return;
    }
    const b = e.target.closest('[data-hact]');
    if (!b) return;
    const card = b.closest('[data-hidx]');
    if (!card) return;
    const i = Number(card.dataset.hidx);
    if (b.dataset.hact === 'keep') historyRate(i, 1);
    else if (b.dataset.hact === 'drop') historyRate(i, -1);
    else if (b.dataset.hact === 'again') {
      const h = state.history[i];
      if (!h || !h.spec) return;
      runGeneration({ ...h.spec.body, seed: -1 }, h.spec.mode, { ...h.spec, body: { ...h.spec.body, seed: -1 } });
    } else if (b.dataset.hact === 'seed') {
      const h = state.history[i];
      if (!h || !h.spec || !h.spec.body) return;
      const seed = Number(h.o && h.o.seed);
      if (!Number.isFinite(seed) || seed < 0) return;
      const body = { ...h.spec.body, seed, count: 1 };
      runGeneration(body, h.spec.mode || 'simple', { ...h.spec, body });
    }
  };
  $('#stageActions').onclick = (e) => {
    const rr = e.target.closest('[data-reroll]');
    if (rr) { rerollField(rr.dataset.reroll); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'keep') rate(1);
    else if (act === 'drop') rate(-1);
    else if (act === 'again') {
      if (state.lastMode === 'advanced') advancedGenerate();
      else generate();
    } else if (act === 'seedagain') {
      rerunSeed(state.result && state.result.seed);
    } else if (act === 'same') {
      const spec = state.lastSpec;
      if (spec) {
        const body = { ...spec.body, seed: -1 };
        runGeneration(body, spec.mode, { ...spec, body });
      }
    } else if (act === 'next') { randomAll(); }
    else if (act === 'copy') {
      const prompt = $('#stageActions').dataset.prompt || '';
      navigator.clipboard.writeText(prompt).then(() => toast('已复制词')).catch(() => toast('复制失败', true));
    }
  };
  $('#saveCfg').onclick = saveSettings;
  if ($('#historyClear')) $('#historyClear').onclick = clearHistoryWall;
  for (const b of $$('.folder-clear')) {
    b.onclick = (e) => {
      e.preventDefault();
      const el = $('#' + b.dataset.target);
      if (el) el.value = '';
    };
  }
  for (const b of $$('.folder-pick')) {
    b.onclick = async (e) => {
      e.preventDefault();
      const el = $('#' + b.dataset.target);
      if (!el) return;
      if (!(window.desktop && window.desktop.pickFolder)) {
        toast('浏览器里选不了文件夹，用桌面版', true);
        return;
      }
      const cur = (el.value || '').split('\n').map((s) => s.trim()).filter(Boolean).pop() || '';
      const picked = await window.desktop.pickFolder({ title: '选文件夹', defaultPath: cur });
      if (!picked) return;
      if (el.tagName === 'TEXTAREA') {
        const lines = (el.value || '').split('\n').map((s) => s.trim()).filter(Boolean);
        if (!lines.includes(picked)) lines.push(picked);
        el.value = lines.join('\n');
      } else {
        el.value = picked;
      }
    };
  }
  $('#testComfy').onclick = testComfy;
  $('#startComfy').onclick = startComfy;
  $('#openHealth').onclick = openHealth;
  $('#openApi').onclick = openApi;
  $('#backupNow').onclick = backupNow;
  const modelCardBtn = $('#modelCardBtn');
  if (modelCardBtn) modelCardBtn.onclick = () => openPicker('model');
  const setDefaultModel = $('#setDefaultModel');
  if (setDefaultModel) {
    setDefaultModel.onclick = async () => {
      const base = pickModel();
      const chosen = state.model || (base && base.model) || '';
      if (!chosen) { toast('没有可选模型', true); return; }
      const isUnet = chosen.startsWith('unet:');
      const name = chosen.replace(/^(unet|checkpoint):/, '');
      const comp = modelCompanions(chosen, base);
      if (isUnet && state.clip) comp.clip = state.clip;
      if (isUnet && state.vae) comp.vae = state.vae;
      const gen = {
        unet: isUnet ? name : '',
        checkpoint: isUnet ? '' : name,
        clip: isUnet ? comp.clip : '',
        vae: isUnet ? comp.vae : '',
      };
      try {
        await write('/api/config', { gen });
        state.model = '';
        await loadOptions(true);
        renderSix();
        loadChars(($('#charSearch') && $('#charSearch').value || '').trim());
        loadLoraSlot('outfit');
        loadLoraSlot('aux');
        toast('默认模型：' + name);
      } catch (e) { toast('保存失败：' + e.message, true); }
    };
  }
  $('#backupOpen').onclick = () => write('/api/backups/open', {}).catch((e) => toast(e.message, true));
  if ($('#modelsRefresh')) $('#modelsRefresh').onclick = () => loadModelsPage();
  const modelsBody = $('#modelsBody');
  if (modelsBody) {
    modelsBody.onclick = async (e) => {
      const b = e.target.closest('[data-mact]');
      if (!b) return;
      const row = b.closest('.model-row');
      if (!row) return;
      const kind = row.dataset.kind;
      const name = row.dataset.name || '';
      const act = b.dataset.mact;
      try {
        if (act === 'copy') {
          try { await navigator.clipboard.writeText(name); toast('复制了：' + name); }
          catch { toast('复制失败，手动选吧：' + name, true); }
          return;
        }
        if (act === 'default') {
          await setModelDefault(kind, row.dataset.rel || name);
          return;
        }
        if (act === 'delete') {
          if (!confirm(`删掉 ${name}？\n这会真删磁盘文件，不只是记录。`)) return;
          await api('/api/models', { method: 'DELETE', body: JSON.stringify({ kind, path: row.dataset.path }) });
          toast('删了：' + name);
          await loadModelsPage();
        }
      } catch (err) { toast(err.message || String(err), true); }
    };
  }
  if ($('#bodyOverride')) {
    $('#bodyOverride').checked = !!state.bodyOverride;
    $('#bodyOverride').onchange = () => {
      state.bodyOverride = !!$('#bodyOverride').checked;
      try { localStorage.setItem('v2-body-override', state.bodyOverride ? '1' : '0'); } catch { /* ignore */ }
      renderSix();
      if (state.char || state.charPreset) toast(state.bodyOverride ? '会叠加体型词，可能和角色原设打架' : '体型回到角色原装');
    };
  }
  if ($('#updateCheck')) $('#updateCheck').onclick = () => checkAppUpdate(false);
  if ($('#updateGo')) $('#updateGo').onclick = onUpdateGo;
  $('#fillMeta').onclick = () => runHealthJob('补词和地址', '/api/jobs/fill-meta', { limit: 500 });
  $('#fillPreviews').onclick = () => runHealthJob('补预览图', '/api/jobs/fill-previews', { limit: 200 });
  $('#enrichCiv').onclick = () => runHealthJob('C站补全', '/api/jobs/enrich-civitai', { limit: 1000 });
  $('#translateZh').onclick = () => runHealthJob('补中文名', '/api/jobs/translate-zh', { limit: 300 });
  $('#syncSamples').onclick = () => runHealthJob('同步台账', '/api/jobs/sync-samples', {});
  $('#hashSame').onclick = () => runHealthJob('算 hash', '/api/jobs/hash', { scope: 'same-size' });
  $('#tagKinds').onclick = () => runHealthJob('标签归类', '/api/jobs/tag-kinds', {});
  $('#cleanMissing').onclick = cleanMissing;
  $('#cleanDups').onclick = () => deleteDupRecords(state.healthDups || [], '清全部重复记录？');
  $('#healthClose').onclick = () => $('#healthModal').classList.add('hidden');
  $('#apiClose').onclick = () => $('#apiModal').classList.add('hidden');
  const hash = (location.hash || '').replace('#', '');
  switchPage(['create', 'library', 'records', 'settings'].includes(hash) ? hash : 'library', false);
  window.addEventListener('hashchange', () => switchPage((location.hash || '#create').replace('#', ''), false));
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

boot();

/* 自定义窗口外框（仅在 Electron 桌面端显示） */
(function initTitlebar() {
  const desk = window.desktop;
  if (!desk || !desk.isDesktop) return;
  document.body.classList.add('desktop');
  if (desk.isDev) {
    document.body.classList.add('dev-build');
    document.title = '洛栈 · 开发';
    const brand = $('.tb-brand');
    if (brand) brand.insertAdjacentHTML('beforeend', '<span class="tb-dev">开发</span>');
  }
  const tb = $('#titlebar');
  if (tb) tb.classList.remove('hidden');
  const min = $('#tbMin');
  const max = $('#tbMax');
  const close = $('#tbClose');
  if (min) min.onclick = () => desk.minimize();
  if (max) max.onclick = () => desk.maximize();
  if (close) close.onclick = () => desk.close();
  if (desk.onWinState) desk.onWinState((m) => { if (max) max.textContent = m ? '❐' : '□'; });
  if (desk.isMaximized) desk.isMaximized().then((m) => { if (max) max.textContent = m ? '❐' : '□'; }).catch(() => {});
  const menus = {
    file: [
      ['打开数据目录', () => desk.openDir('data')],
      ['打开 LoRA 目录', () => desk.openDir('loras')],
      ['打开出图目录', () => desk.openDir('output')],
      ['打开预览图目录', () => desk.openDir('samples')],
      ['重新加载', () => desk.reload()],
    ],
    view: [
      ['放大', () => desk.zoom(0.1)],
      ['缩小', () => desk.zoom(-0.1)],
      ['实际大小', () => desk.zoomReset()],
      ['开发者工具', () => desk.devtools()],
    ],
    help: [
      ['接口文档', () => desk.openApi()],
      ['打开日志', () => desk.openLog()],
      ['关于', () => desk.about()],
    ],
  };
  const box = $('#tbMenuBox');
  const closeMenu = () => { if (box) { box.classList.add('hidden'); box.dataset.open = ''; } };
  $$('.tb-menus button').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const key = b.dataset.menu;
      if (box.dataset.open === key) { closeMenu(); return; }
      box.innerHTML = (menus[key] || []).map((m, i) => `<button data-mi="${key}:${i}">${m[0]}</button>`).join('');
      const r = b.getBoundingClientRect();
      box.style.left = Math.round(r.left) + 'px';
      box.style.top = '40px';
      box.classList.remove('hidden');
      box.dataset.open = key;
    };
  });
  if (box) {
    box.onclick = (e) => {
      const b = e.target.closest('[data-mi]');
      if (!b) return;
      const [key, idx] = b.dataset.mi.split(':');
      const act = menus[key] && menus[key][Number(idx)];
      closeMenu();
      if (act) act[1]();
    };
  }
  document.addEventListener('click', closeMenu);
  document.addEventListener('dblclick', (e) => {
    if (e.target.closest('.tb-drag') || e.target.closest('.tb-brand')) desk.maximize();
  });
})();
