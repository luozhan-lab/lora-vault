# 开放接口 · 第五批（出图）

2026-11-23 重做的出图。前端面板走的就是这三条，命令行 / 别的 AI 也能直接调。

出图直连 `data/config.json` 里的 `comfyUrl`（默认 `http://127.0.0.1:8188`），**不依赖外面的 `gen.mjs`**，也不要求 ComfyUI 开着别的服务。

---

## 一、可用模型

```
GET /api/gen/options
```

```json
{
  "online": true,
  "comfyUrl": "http://127.0.0.1:8188",
  "checkpoints": ["anime\\anima-base-v1.0.safetensors", "..."],
  "unets": ["reedAnimaXXX_v14.safetensors", "..."],
  "clips": ["qwen_3_06b_base.safetensors", "..."],
  "vaes": ["qwen_image_vae.safetensors", "..."],
  "defaults": {
    "unet": "reedAnimaXXX_v14.safetensors",
    "clip": "qwen_3_06b_base.safetensors",
    "vae": "qwen_image_vae.safetensors",
    "clipType": "stable_diffusion",
    "outputRoot": "D:\\Comfy-Desktop\\ComfyUI-Shared\\output"
  },
  "counts": { "checkpoints": 8, "unets": 11, "clips": 3, "vaes": 3 }
}
```

`online: false` 时列表是磁盘扫描出来的兜底值，ComfyUI 认不认要等下一次提交。

`?force=1` 跳过 20 秒缓存。

---

## 二、四类槽位的候选

```
GET /api/gen/loras?slot=char&q=可莉&base=anima&limit=30
```

| slot | 取哪些分类 |
|---|---|
| `char` | 角色 / AI娘 / 自己的 |
| `aux` | 除角色、服装、画风、归档以外的全部（动作 / 视角 / 表情 / 质感 / 状态…） |
| `outfit` | 分类里带「服装」的 |
| `style` | 分类里带「画风」的 |

`base` 可选 `anima` / `sdxl`，按 `lora.base_model` 过滤（空底模的也留着）。不传就全给。

```json
{
  "slot": "char",
  "label": "角色",
  "total": 1,
  "defaultWeight": 0.9,
  "items": [{
    "id": 8, "name": "可莉",
    "trigger": "klee, klee (genshin impact)",
    "feature_words": "long hair, bangs, red eyes, …",
    "outfit_words": "…",
    "rel_path": "角色\\原神\\genshin-3014738.safetensors",
    "base_model": "Anima", "category": "角色",
    "preview": "…", "weight": 0.85, "runs": 31
  }]
}
```

排序：用过次数多的在前，然后按名字。空搜索就是推荐（热门 / 用过的）。

---

## 三、出图

```
POST /api/generate
X-API-Token: <token>
```

```json
{
  "model": "unet:reedAnimaXXX_v14.safetensors",
  "clip": "qwen_3_06b_base.safetensors",
  "vae": "qwen_image_vae.safetensors",
  "clipType": "stable_diffusion",

  "char":   { "path": "角色\\原神\\genshin-3014738.safetensors", "weight": 0.9,
              "trigger": "klee (genshin impact)", "feature": "long hair, red eyes, twintails, …" },
  "aux":    [{ "path": "功能\\表情与姿势\\Covering_Privates_Anima.safetensors", "weight": 0.7 }],
  "outfit": { "path": "功能\\服装\\bathrobe-anima.safetensors", "weight": 0.75 },
  "style":  { "path": "功能\\画风\\vanripperart-anima-basev10.safetensors", "weight": 0.8 },

  "scene": "1girl, classroom, sunlight, looking at viewer",
  "negative": "",
  "keepOriginalClothes": true,

  "size": "832x1216",
  "steps": 28,
  "cfg": 4,
  "seed": -1,
  "count": 1
}
```

### 模型

| 写法 | 走哪个节点 | 还要什么 |
|---|---|---|
| `unet:xxx.safetensors` | `UNETLoader` + `CLIPLoader` + `VAELoader` | `clip` / `vae` / `clipType`（不给就用 `config.gen` 里的默认） |
| `checkpoint:anime\\xxx.safetensors` | `CheckpointLoaderSimple`（自带 CLIP + VAE） | 无 |

模型名必须是 ComfyUI 认的名字（等于 `object_info` 里那个列表）；LoRA 的 `path` 用库里的相对路径，后端会对着 `LoraLoader` 的列表核一遍，认不出就报错，不会闷头出一张废片。

### 每支 LoRA 的词

`char` / `outfit` / `style` / `twoPass.style` 和 `aux[]` 的每一项都能带：

| 字段 | 说明 |
|---|---|
| `trigger` | 这次用的触发词。不传 = 只用库里的第一个触发词（角色 / 服装；辅助和画风仍用整串）；传空字符串 = 这次不写触发词 |
| `feature` | 这次用的特征词（角色支）。不传 = 库里的前 8 个；传空字符串 = 不写 |

前端「选词」面板（chip 上的 ✎）就是逐个勾选这两组词，再拼成字符串传过来。服装支的 `outfit_words` 也会列出来，勾了会并进 `trigger`。

同一支整合包 LoRA 靠不同触发词画不同角色，就在这里切换。

### 触发词样张

多触发词的支，可以给每个词记一张小图，选词时直接看见这个词长什么样：

```
GET  /api/loras/{id}/trigger-shots
POST /api/loras/{id}/trigger-shots
{ "trigger": "fischl (genshin impact)", "image": "D:\\Comfy-Desktop\\ComfyUI-Shared\\output\\xxx.png" }
```

- `image` 必须在 `outputRoot` / `samplesRoot` / `data/previews` 里
- 图会复制成 `data/previews/trigger-{id}-{hash}.ext`，写进 `meta.triggerShots`
- GET 返回 `{ "<trigger>": "/api/localfile?path=..." }`
- 前端「选词」面板的每个触发词旁边有「试」：用这个词 + 当前模型出一张白底半身，出完自动存成这个词的样张
- 服装支的 `outfit_words` 如果带 `1) 2) …` 编号（整合包），前端会拆成「套装 1～N」单选，点哪套就把那套完整描述写进 `trigger`
- 「全部试」会按列出来的触发词 / 套装挨个跑一遍，串行出图、逐个存样张；再点一次可以停

### 词怎么拼（不用自己抄触发词）

后端按顺序拼正面词：

```
1girl, solo（scene 里已经有性别词就不加）
角色触发词, 角色特征词
服装触发词（没有就用服装词前 3 个）
辅助触发词 × 最多 2 支
画风触发词
scene
```

负面 = 通用负面（质量 / 解剖 / 扶她）+ 角色自带的负面 + 请求里的 `negative`。

`keepOriginalClothes: false` 会把**角色特征词里的服装词剔掉**，让服装 LoRA 说话（角色标志物不剔）。

### 两段式：换模型转画风

```json
"twoPass": {
  "enable": true,
  "model": "checkpoint:anime\\anima-base-v1.0.safetensors",
  "style": { "path": "功能\\画风\\painterly-impasto-v2.safetensors", "weight": 0.8 },
  "strength": "mid",
  "scene": "oil painting, thick brush strokes",
  "steps": 28,
  "cfg": 4
}
```

- 第一段正常出图
- 第二段把第一段结果通过 `/upload/image` 塞回 ComfyUI input，`VAEEncode` → `KSampler` 低 denoise 重绘
- 第二段模型可换整包也可换分离式；第一段画风词不带过来，换成 `twoPass.style`
- `strength`：`light` = 0.45 / `mid` = 0.6 / `strong` = 0.75

### 返回

```json
{ "jobId": "a1b2c3d4e5f6" }
```

轮询：

```
GET /api/jobs/{jobId}
```

```json
{
  "status": "done",
  "outputs": [{
    "out": "D:\\Comfy-Desktop\\ComfyUI-Shared\\output\\可莉-20261123231534-1_00001_.png",
    "file": "可莉-20261123231534-1_00001_.png",
    "seed": 3903846849,
    "elapsed_s": 22.7,
    "twoPass": false,
    "prompt": "1girl, solo, klee, …"
  }],
  "log": ["模型：…", "第 1/1 张 · 第一段出图…", "…"]
}
```

`status`：`running` / `done` / `error` / `cancelled`。`error` 里的文案是给人看的（ComfyUI 没开、模型不在、LoRA 不在，各有一句）。

取消：`POST /api/jobs/{jobId}/cancel`。

### 台账

每张图出完追加一行到 `config.genLogPath`（默认 `studio\docs\gen-log.jsonl`），字段和旧 `gen.mjs` 一致，另外多一个 `pass2`：

```json
{
  "t": "...", "by": "app", "file": "…png", "kind": "作品",
  "unet": "reedAnimaXXX_v14.safetensors",
  "clip": "qwen_3_06b_base.safetensors",
  "vae": "qwen_image_vae.safetensors",
  "lora": ["角色\\…:0.9", "功能\\服装\\…:0.75"],
  "steps": 28, "cfg": 4, "size": "832x1216", "seed": 123,
  "prompt": "…", "negative": "…", "elapsed_s": 22.7,
  "pass2": {
    "model": "anime\\anima-base-v1.0.safetensors",
    "loras": [{ "name": "功能\\画风\\…", "weight": 0.8 }],
    "denoise": 0.6
  }
}
```

所以出完图，样张墙、`usage`、`/api/prompts` 反查都会自动跟上，不用再调 `/api/usage`。

---

## 四、坐标

| 东西 | 在哪 |
|---|---|
| 引擎 | `lib/generate.mjs` |
| 槽位分类规则 | `lib/generate.mjs` 里 `SLOT` |
| 拼词 | `buildPrompt()` / `buildNegative()` |
| 默认负面 | `DEFAULT_NEG` |
| 两段式 | `runGenerate()` 里 `twoPass` 分支 |
| 前端面板 | `public/index.html` 的 `#genModal` + `public/app.js` 的「出图」段 |
| 中文 → tag | `public/app.js` 的 `ZH_TAGS` |
| 快捷词（场景 / 表情 / 状态 / 服装 / 穿脱） | `public/app.js` 的 `GEN_QUICK` |
