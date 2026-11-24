# 开放接口 · 第四批

别名、成片打分、词库、自动补预览图。

---

## 一、别名

`lora.aliases` —— 逗号分隔的口语叫法。搜索（`/api/loras?q=`）和 `/api/locate` 都会过一遍。

已灌进去的（`scripts/aliases.mjs`，124 支）：

| 库里叫什么 | 也能搜到 |
|---|---|
| 卡芙卡 | 卡夫卡、kafka |
| 纳西妲 | 草神、纳西达 |
| 艾莲·乔 | 艾莲乔、鲨鱼 |
| 甘雨 | 椰羊 |
| 康娜卡姆依 | 康纳、康娜、龙女仆 |
| 雷电将军 | 雷神、影 |
| 芙宁娜 | 水神 |

结果：

```
卡夫卡 -> 1 条  卡芙卡
草神   -> 1 条  纳西妲
鲨鱼   -> 1 条  艾莲·乔
```

`/api/locate` 找不到文件时会回落到名字/别名搜，返回 `matches`：

```json
{ "found": false, "asked": "卡夫卡",
  "matches": [{ "id": 592, "name": "卡芙卡", "rel_path": "角色\\星穹铁道\\…" }] }
```

自己加：`PATCH /api/loras/{id}` 里带 `aliases: "卡夫卡,kafka"`，或者界面上「编辑 → 别名」。

---

## 二、成片打分

```
PATCH /api/samples/{id}
{ "rating": 1 }     // 1 可用 / -1 废片 / 0 取消
```

`GET /api/loras/{id}` 多两个字段：`good`、`bad`（好/废的样张数）。

界面上：详情页「出过的图」每张悬停出 `✗ / ✓`，点了立刻生效、边框变色。

用处：941 支现在只有「用了几次」，加上这个才有「成了几张」——决定留谁删谁看这个。

---

## 三、词库

25533 个标签归成七类，`tag.kind`：

| 类 | 数量 |
|---|---|
| 其他 | 14373 |
| 服装 | 5983 |
| 角色（含特征词） | 2701 |
| 动作 | 1098 |
| 场景 | 628 |
| 身体 | 545 |
| 画风质量 | 205 |

```
GET /api/tags?q=袜&kind=服装&limit=200
```

```json
{
  "items": [{ "name": "long sleeves", "kind": "服装", "count": 417 }],
  "kinds": [{ "kind": "服装", "n": 5983 }]
}
```

重算（服务启动时发现空的会自动跑，也可以手动）：

```
POST /api/jobs/tag-kinds
```

界面上顶栏 **词库**：搜 / 按类筛 / 点一下直接筛那批支 / 旁边 ⧉ 复制进 prompt。

---

## 四、补预览图

### 从下载页补（现在用这个）

```
POST /api/jobs/fill-previews
{ "limit": 100 }
```

- 只挑没图的支：`preview = ''`，或 `preview` 有值但按磁盘实际文件找不到（老库改名 / 删图）。角色优先
- 有 `model_id` / Civitai 链接：直接读下载页，抓一张官方样张
- 没来源：拿名字 / 文件名去 C 站搜一次，命中（score ≥ 2）就把 `model_id` / `version_id` / `source_url` 写回去，再抓图
- 只补空图，不覆盖已有预览；文字字段也只补空的（复用 `enrichOne`）
- 图存 `data/previews/{id}-civitai.*`，自动生成缩略图
- 走任务系统，能取消；一次 100 支，补完再点接着补
- 结果里带 `filled / guessed / failed / noSource`

界面上：顶栏「体检」→「从下载页补预览图（没有的 N 支）」。

### 补词和下载地址

```
POST /api/jobs/fill-meta
{ "limit": 100 }
```

- 筛缺 `trigger` / `feature_words` / `outfit_words` / `download_url` / `source_url` 的支
- 先拿 `lora_tag`（训练标签）补词；标签空的读 `.safetensors` 头部
- 没来源的：有 `modelVersionId` 先用 `/api/v1/model-versions/{id}` 反查 `model_id`，否则按名字去 C 站猜
- Civitai 补官方触发词（`trainedWords`）和 `downloadUrl`；只补空字段，不覆盖
- 不下载图片（图走 `fill-previews`）
- 7 天内试过的支跳过（`event.action = 'auto-meta-try'`），重跑会接着往后推进
- 结果里带 `tagFilled / fileFilled / civitaiFilled / guessed / failed / noSource`

界面上：顶栏「体检」→「补词和下载地址（N 支）」。

### 自己出一张（历史方案，已移除）

> 2026-11-22 出图功能移除时，`/api/jobs/auto-previews` 一起删了。现在出图功能回来了，但补预览优先走下载页，不再拿自己的图占样张位。

没预览图的支，用现成的出图管线跑一张标准样张：`触发词 + 前 6 个特征词 + 上半身白底`，24 步、832x1216（可改）。

```
POST /api/jobs/auto-previews
{ "steps": 20, "size": "768x1024", "limit": 200 }
```

- 只挑 `preview = ''` 且至少有触发词或特征词的
- `角色` 类排前面
- 出完拷进 `data/previews`，`preview_kind` 标成 `auto`，界面上显示「自出图」
- 走任务系统，能取消、能看进度；重跑只会补还没图的

**这是自出的图，不是官方样张**，所以打了标。想换的，详情页点预览图重新传一张就行。

---

## 五、坐标

| 东西 | 在哪 |
|---|---|
| 别名种子 | `scripts/aliases.mjs` |
| 标签分类规则 | `lib/tags.mjs` 里几个词表 |
| 打分 | `sample.rating` |
| 自出图 | `lora.preview_kind = 'auto'` |

---

## C 站链接下载

```
POST /api/civitai/download-by-url
{ "text": "https://civitai.com/models/123456?modelVersionId=789012", "subdir": "未分类" }
```

`text` 支持：

- 模型页网址（带 `modelVersionId`）
- `https://civitai.com/api/download/models/{versionId}`
- `civitai:123456@789012`
- `urn:air:...:civitai:123456@789012`
- 纯版本号 `789012`
- 只给模型页（没版本号）时取第一个版本

走 `config.civitaiToken`（设置里绑的 C站 API Key），下载后和 `/api/civitai/download` 一样：落文件、入库、抓预览图、写 `meta.civitai`。返回 `{ jobId }`，进度看 `/api/jobs/{id}`。

---

## 分类目录

```
GET /api/loras/dirs
→ { "dirs": ["角色", "角色\\原神", "功能", "功能\\服装", ...] }

POST /api/loras/dirs
{ "parent": "功能", "name": "辅助" }
→ { "path": "功能\\辅助" }
```

`parent` 为空就是一级分类；已存在也返回路径。名字里不能有 `\ / : * ? " < > |` 和 `..`。

---

## 移动分类（文件联动）

```
POST /api/loras/{id}/move
{ "category": "角色\\原神" }
```

把 LoRA 文件移到 `lorasRoot` 下的目标目录（不存在会新建），同时更新库里的 `rel_path` / `category` / `work`。重名自动加 `-1`；源文件不在磁盘上会报错。返回 `{ id, rel_path, filename, category, work }`。

---

## 中文名翻译

```
POST /api/translate
{ "text": "Klee (Genshin Impact)" }
→ { "text": "可莉（《原神》）" }
```

先走 Google 翻译（非官方接口），失败再走 MyMemory。翻译结果只用来填编辑页的「中文名」框，用户可自己改。
