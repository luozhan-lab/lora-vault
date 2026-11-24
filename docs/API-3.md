# 开放接口 · 第三批

名字汉化、版本族、出图、配方。

> **2026-11-22：出图 / 配方 / 自己的工作流已从软件移除。**
> `/api/generate`、`/api/recipes`、`/api/workflows`、`/api/comfy*`、`/api/upload-image`、`/api/jobs/auto-previews` 都已删掉，`lib/generate.mjs` / `lib/native-gen.mjs` / `lib/workflow.mjs` 也删了。
> 下面第三、四、六节保留作历史记录；**仍然有效**的是版本族、名字汉化、出图记录（从 `gen-log.jsonl` 同步）、图库和设置。

---

## 一、版本族

同一支的各种轮次 / 导出（`xi-lora-v7-000001`、`xxx_comfy`、`xxx-e10`）算一族，列表里只显示一支，其余折叠。

```
GET /api/loras                     默认 is_variant = 0，只看主力
GET /api/loras?variants=1          连其它版本一起看
```

族键 = 文件名去掉轮次尾巴（跨目录算同一族，`_v7-epochs` 里的也算）。

**谁当主力**：用过次数最多 → 不是中间轮次 → `角色\` 目录优先 → 文件更新。

详情接口多一个 `siblings`：

```json
{ "id": 280, "name": "汐 v7", "family": "xi-lora-v7.safetensors",
  "siblings": [ { "id": 281, "name": "汐 v7 · 第1轮", "is_variant": 1, "runs": 1 } ] }
```

现在：1111 支 → **1034 条主记录 + 77 个折叠版本**。

重算（扫描磁盘时会自动跑一遍）：

```powershell
node -e "import('./lib/loras.mjs').then(m=>console.log(m.recomputeFamilies()))"
```

---

## 二、名字汉化

`scripts/name-unnamed.mjs` 只处理「文件名是纯英文、名字还是文件名」的那批：

- 内置基名表（`tushanhonghong → 涂山红红`、`hxy28 → 黄小燕` …）
- 版本尾巴转中文：`-000003` → `第3轮`，`-e5` → `e5`
- 认不出来的，整理成 `Pretty Name（作品）`

跑一次：`node scripts\name-unnamed.mjs`

结果：**106 支英文文件名 → 中文名 + 版本**。剩 3 支是 `Z23 / Z46 / Z52`，本来就是这叫法。

---

## 三、出图

### 简单模式（界面默认）

不用写 prompt。界面按七项拼：

| 项 | 取值 |
|---|---|
| 谁 | 选一支 LoRA，触发词 + 特征词 + 原装服装自动带上 |
| 挂辅助支 | 任意加，各带权重（动作/道具/视角那种），跟主支一起挂 |
| 穿什么 | 原装 内衣 泳装 校服 女仆 护士 兔女郎 婚纱 和服 旗袍 睡衣 围裙 OL 修女 军装 运动装 皮衣 蕾丝 浴衣 浴巾 空姐 女警 水手服 啦啦队 裸围裙 比基尼 卫衣 和风便服（28） |
| 怎么脱 | 露肩 不穿内衣 露胸 掀裙 不穿内裤 内裤拉一边 扯破 只剩内衣 全裸（9，**可多选**，不选 = 穿好） |

互斥（点了会自动换掉另一个）：

- **不穿内衣 ↔ 露胸** —— `no bra` 和 `bra pulled down` 同时写会打架
- **不穿内裤 ↔ 内裤拉一边** —— `panties aside` 要求内裤还在
- **全裸 / 只剩内衣** 是整身换掉，选它等于清空其它
| 动作 | 站 坐 躺 趴 跪 蹲 盘腿 二郎腿 抱膝 自拍 举手 比V 背手 撑脸 伸懒腰 张腿 抬腿 M字腿 跪趴 翘臀 侧躺 抱 接吻 手伸进衣服 抓胸 摸自己 睡 摔倒（28，可多选） |
| 玩法 | 正常位 后入 骑乘 口交 深喉 乳交 手交 足交 舔阴 肛交 双插 群交 触手 调教 露出 睡奸 69 骑脸 舔蛋 乳首玩弄 口内射 双女一男 多女（23，可多选） |
| 在哪 | 31 个：白底 卧室 床上 沙发 浴室 浴缸 淋浴 温泉 教室 走廊 天台 图书馆 医务室 办公室 酒吧 咖啡店 街道 小巷 公园 海滩 森林 神社 城堡 废墟 泳池 更衣室 车内 电梯 厨房 夜晚街道 雨夜 酒店房 健身房 商场 地铁 屋顶 车厢（可多选） |
| 表情 | 22 + 高潮脸 无表情 坏笑 苦笑（26） |
| 体型 | 小体型 娇小 高挑 纤细 骨感 微胖 丰满 软肉 肌肉 健壮 平胸 小乳 中乳 大乳 巨乳 爆乳 小臀 宽臀 巨臀 翘臀 细腰 腹肌 短腿 长腿 细腿 粗腿 孕肚（27，**可多选**，不选 = 常规） |
| 肤色 | 白皙 小麦色 黑皮 苍白 |
| 取景 | 半身 全身 特写 脸部特写 背影 俯视 仰视 侧面 过肩 |
| 光线（折叠） | 自然光 暖光 冷光 逆光 霓虹 烛光 月光 柔光 |
| 视线（折叠） | 看镜头 看对方 看别处 低头 抬头 回头 |
| 状态（折叠） | 出汗 湿身 潮红 发抖 泪 爱液 精液 里面 拉丝 汗湿头发 潮吹 痉挛 红肿 满身白浊 汗珠 体液 唇光 泛红（可多选） |
| 道具（折叠） | 假具 跳蛋 肛塞 拉珠 口塞 绳子 项圈 眼罩 手铐 皮鞭 蜡烛 避孕套 手机 眼镜 烟 皮具 颈链 尾巴塞 按摩棒（可多选） |
| 机位（折叠） | 平视 第一人称 门缝 偷拍 镜子 分格 手机拍摄 低角度 极近 广角 |

**「穿什么」和「脱到哪」是两件事**，可以叠：

```
婚纱 + 露肩   → (wedding dress:1.25), bridal veil, white wedding skirt, (clothes off shoulder:1.3), (dress pulled down:1.2)
婚纱 + 只剩内衣 → (underwear only:1.3), bra, panties      ← 婚纱整串自动撤掉
OL  + 内裤拉一边 → (office lady:1.2), white blouse, (panties aside:1.4), (skirt lift:1.3), (pussy:1.35), (spread legs:1.15), lower body
                  ↑ pencil skirt / pantyhose 被撤掉，取景也从「半身」自动换成「下半身」
```

服装是拆开写的：每套都有 `top` 和 `bottom`。「内裤拉一边」会把**下半身整段撤掉**——裙子还在的话，画出来就是裙子挡着，看不到拨开的样子。同理，取景是半身/特写时会自动换成下半身取景。

**一支里好几个角色**：接口 `GET /api/loras/{id}` 多一个 `candidates`，是从 trigger 里拆出来的候选名字（去掉了 `1girl` 这种噪音、也去掉了互相包含的重复项）。

```json
{ "candidates": ["nozomi (kujibikido) (blue archive)", "hikari (kujibikido) (blue archive)"] }
```

`candidates.length >= 2` 时界面会多一行「这支里装了好几个，画哪个」。选一个 → 触发词换成那一个；不选 = 全都要（用原来的整段 trigger）。
**注意**：特征词还是所有人混在一起的，选了之后建议用「补一句」写清那个人的特征。

**「补一句」**：一行自由输入，接在 prompt 最后。专门对付「这支里没有的词」——比如某个角色的服装变体。

「随机一套」按钮会随机抽一支角色 + 随机搭配，只填表不直接出图。

负面词固定用通用那串；选「小体型」或识别到 `small breasts / loli / petite` 会自动追加压胸负面。

拼出来的词在界面右侧实时可见。**直接调接口也认这两套参数**：

```
POST /api/generate
{ "loras": [{"id": 444, "weight": 0.9}],
  "prompt": "…", "negative": "…",
  "size": "832x1216", "steps": 28, "cfg": 4, "seed": -1, "count": 1,
  "chars": "可莉", "mode": "simple",
  "simple": { "id": 444, "outfit": "原装", "pose": ["躺"], "scene": ["床上"],
              "expr": "害羞", "build": "小体型", "frame": "半身",
              "size": "832x1216", "count": 1 } }
```

`mode` / `simple` 只是给配方用的，服务端不读。

### 高级模式

手写 prompt / 多挂载 / 权重 / seed，见下。

```
POST /api/generate
X-API-Token: <token>
Content-Type: application/json

{
  "loras": [{"id": 444, "weight": 0.9}, {"id": 213, "weight": 0.8}],
  "prompt": "...",
  "negative": "...",
  "size": "832x1216",
  "steps": 28,
  "cfg": 4,
  "seed": -1,
  "count": 1,
  "chars": "可莉",
  "note": ""
}
```

返回 `{ jobId, count }`，走任务系统看进度。

服务端会调 `<ComfyUI 安装目录>\studio\tools\comfy\gen.mjs`：

```
node gen.mjs --unet ... --clip ... --vae ...
  --lora "角色\原神\genshin-3014738.safetensors:0.9"
  --prompt ... --negative ... --size 832x1216 --steps 28 --cfg 4 --seed -1
  --kind 作品 --chars 可莉 --by app
```

图生图会多 `--init-image <ComfyUI input 里的名字> --denoise 0.55`；采样器/调度器走 `--sampler` / `--scheduler`（默认 euler / normal）。

参数在 `data/config.json` 的 `gen` 里改：

```json
{
  "script": "D:\\Comfy-Desktop\\studio\\tools\\comfy\\gen.mjs",
  "cwd": "D:\\Comfy-Desktop\\studio",
  "unet": "reedAnimaXXX_v14.safetensors",
  "clip": "qwen_3_06b_base.safetensors",
  "vae": "qwen_image_vae.safetensors",
  "outputRoot": "D:\\Comfy-Desktop\\ComfyUI-Shared\\output"
}
```

任务完成后 `job.outputs` 里是每张的 `{ out, seed, warns }`。出图会自动写台账，台账监听再把它收成样张 —— 所以详情页的「出过的图」里马上就有。

看结果图：

```
GET /api/localfile?path=<urlencoded 绝对路径>
```

只允许 `outputRoot` / `samplesRoot` / `data/previews` 底下的文件，别的 403。

---

## 四、配方

```json
GET    /api/recipes              列表（按用过的次数排）
POST   /api/recipes              { "name": "可莉·正面半身", "payload": {...} }
POST   /api/recipes/{id}         记一次使用，uses +1
DELETE /api/recipes/{id}
```

`payload` 形状和 `/api/generate` 的请求体一样（`loras` 里带 `id` / `name` / `weight`）。界面上「存成配方」和「载入配方」用的就是它。

---

## 五、界面

- 顶栏 **出图** → 打开出图面板
- 任意一支的详情页 → **出图**（自动带上它的触发词和特征词，打开就是可用的 prompt）
- 出图面板左上 **载入配方…** → 套用以前存过的组合
- 列表右上 **其它版本** 勾上 → 看折叠掉的轮次

---

## 六、出图增强（2026-11-22）

### 图生图

出图面板顶部「底图」：选一张本地图，或点结果卡下面的「做底图」。底图先传到 ComfyUI 的 `input`，再按重绘幅度接着画。

```json
POST /api/generate
{
  "loras": [{"id": 444, "weight": 0.9}],
  "prompt": "...", "negative": "...",
  "initImage": "app-init-1760000000000.png",
  "denoise": 0.55,
  "size": "832x1216", "steps": 28, "cfg": 4, "seed": -1, "count": 1,
  "chars": "可莉"
}
```

- `initImage` 是 ComfyUI `input` 里的文件名（**先调上传接口**）
- `denoise` 0.3～0.45 小改，0.5～0.65 同一个人换表情/动作，0.75 以上基本重画
- 有底图时**画幅按底图走**，`size` 不生效
- 两种引擎都支持：脚本走 `gen.mjs --init-image`；内置走 `LoadImage → VAEEncode → KSampler`
- 用自己的工作流时底图参数不生效（日志里会提示）

### 底图上传

```json
POST /api/upload-image      （原始 image/* 字节，?name=xxx.png）
POST /api/upload-image      （JSON {"path": "D:\\...\\图.png"}）
```

返回 `{ ok, name, subfolder, image }`，`image` 就是可以填进 `initImage` 的名字。
JSON 路径只允许出图目录 / 样张目录 / `data/previews` 底下。

### 采样器 / 调度器

```
GET /api/comfy-settings
```

返回 ComfyUI 当前认的 `samplers` / `schedulers` 和配置里的默认值。`/api/generate` 收 `sampler` / `scheduler`，内置和脚本都传。

### 结果卡操作

出图结果下面：**再来一张**（同一套参数，seed -1）、**做底图**（转成图生图）、**抄 prompt**。

---

## 七、依赖

- `undici`（Civitai 补全走代理用）
- `gen.mjs` 本身依赖 ComfyUI 在 8188 上跑着

---

## 八、出图检修记录（2026-11-22）

查出来并修掉的：

1. **高级模式没带底模 / 工作流** —— 标题栏那两个下拉在高级模式下不生效（`collectGen` 没往请求里放 `model` / `workflow`）。现在两种模式都带。
2. **整包 checkpoint 被脚本引擎吞掉** —— 请求里 `model=checkpoint:xxx` 时，服务端把 `unet` 置空传给 `gen.mjs`，脚本回落到配置里的默认 unet，出来的图是错的底模，日志也不提。现在：checkpoint / 自己的工作流一律交给内置引擎（`gen.mjs` 本来就不支持这两样）；设置里钉死「外部脚本」时直接 400 说清楚。
3. **取消只立 flag** —— 任务进入 `cancelled` 前，正在跑的那张要一直等到 300 秒超时。现在取消会停掉 `gen.mjs` 子进程，一两秒内结束（ComfyUI 里那一张可能还会跑完）。
4. **任务日志混进 JSON 碎片** —— `gen.mjs` 结尾那段多行 JSON 只滤掉了以 `{` 开头的第一行。现在从行首 `{` 起整段不进日志，stdout 也按行缓冲，不会把一个 JSON 行劈成两半。
5. **内置引擎出的图不写台账** —— 出图记录 / 样张墙看不到，`usage` 也不涨。现在内置出图也补一行 `gen-log.jsonl`（多一个 `checkpoint` 字段）。
6. **补预览图钉死用脚本** —— 没有 `gen.mjs` 的机器上这个功能整批失败。现在跟出图面板走同一个引擎选择。

内置 / 外置两条链路都实跑过：同一 prompt、同 seed 出的图像素一致；checkpoint 走内置后 PNG 里的 `UNETLoader` 是对的那支。
