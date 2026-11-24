# 开放接口 · 第二批

新增的三块：Civitai 补全、体检 / 查重、出图回写。

---

## 一、后台任务

补全和算 hash 都要跑几分钟，所以统一走任务：

```
POST /api/jobs/enrich-civitai   启动 Civitai 补全
POST /api/jobs/hash             启动算 hash
POST /api/jobs/sync-samples     重读一遍出图台账
GET  /api/jobs                  最近的任务
GET  /api/jobs/{id}             单任务进度
POST /api/jobs/{id}/cancel      取消
```

任务对象：

```json
{
  "id": "a4ee7e154ad0",
  "name": "Civitai 补全 · 409 支",
  "status": "running",          // running | done | cancelled | error
  "total": 409, "done": 37, "ok": 37, "fail": 0,
  "startedAt": "2026-11-21T21:00:00.000Z",
  "finishedAt": null,
  "log": ["#3 亮度滑块 · preview/base_model", "..."],
  "error": ""
}
```

**任务只在内存里**：服务一停就没了。已经补过的字段不会重复补，重开一次任务会跳过它们。

### Civitai 补全

```
POST /api/jobs/enrich-civitai
X-API-Token: <token>
Content-Type: application/json

{ "ids": [3, 7], "overwrite": false, "downloadImage": true }
```

| 字段 | 说明 |
|---|---|
| `ids` | 指定哪几支。不给就自动挑：有 model_id / civitai 链接的全部（约 409 支） |
| `overwrite` | 默认 false = **只补空字段**，不覆盖你手填的 |
| `downloadImage` | 默认 true，把 Civitai 首图下到本地并生成缩略图 |

补的字段：`name_en`、`trigger`（原版触发词）、`base_model`、`source_url`、`download_url`、`preview`、`note`。
名字只在「名字 == 文件名」时才替换。
Civitai 的附带信息（作者、标签、版本名、点赞数）落在 `meta.civitai`，不动显示字段。

**限速**：1.2 秒一次请求，429/5xx 自动退避重试，连续失败 10 次自动停。
**代理**：Node 默认不走系统代理，这里会读注册表 `ProxyServer` 自动挂上（这台机器上有）。

### 算 hash / 查重

```
POST /api/jobs/hash
{ "scope": "same-size" }     // same-size（默认，只算同大小的组）| all（全算，很慢）
```

算完：

```
GET /api/duplicates
```

```json
[{
  "sha256": "6728b8c55154...",
  "count": 2,
  "totalBytes": 367001600,
  "wasteBytes": 183500800,
  "keep": { "id": 280, "name": "xi-lora-v7", "runs": 158, ... },
  "items": [
    { "id": 280, "rel_path": "自己的\\汐\\xi-lora-v7.safetensors", "runs": 158 },
    { "id": 292, "rel_path": "自己的\\汐\\_v7-epochs\\xi-lora-v7.safetensors", "runs": 1 }
  ]
}]
```

`keep` 挑的是「用过次数最多、再按文件时间」的那一份。
**只认出来，不删文件**——要删自己去资源管理器删，删完点「扫描磁盘」记录会退场。

### 体检汇总

```
GET /api/health-report
```

```json
{
  "total": 1111, "ok": 1111, "missing": 0,
  "unused": 170, "noImage": 321, "noName": 453, "noSource": 700,
  "civitaiCapable": 409, "hashed": 256,
  "sameSizeGroups": 55, "dupGroups": 6, "dupWasteBytes": 815000000,
  "samples": 4570, "sampledLoras": 941, "bytes": 104054878697
}
```

---

## 二、出图回写

服务启动后会盯着 `<ComfyUI 安装目录>\studio\docs\gen-log.jsonl`，每 10 秒看一次文件有没有变，变了就把新行拆成样张。

- 每行台账 → 每个挂载的 LoRA 一条 `sample`
- 去重靠 `uid = 时间 + 出图路径`，同一行读一百遍也只入一次
- 每次同步完**用样张表重算** `usage`（用过几次 / 最后一次 / 最后一张图），所以数字永远和台账一致
- 台账路径和开关在 `data/config.json`：`genLogPath` / `watchGenLog` / `watchIntervalMs`

手动重读一遍：

```
POST /api/jobs/sync-samples
```

### 某支出过哪些图

```
GET /api/loras/{id}/samples?limit=40
```

```json
{ "items": [ { "id": 4564, "image_path": "D:\\...\\可莉.png", "prompt": "...", "seed": "2026112209", "size": "832x1216", "created_at": "2026-11-21T20:45:06.556Z" } ] }
```

取图：

```
GET /api/samples/{id}/thumb     420px 缩略图（第一次请求时现做，之后走缓存）
GET /api/samples/{id}/full      原图
```

### 反查 prompt

```
GET /api/prompts?q=twintails&limit=40
```

在全部出图 prompt 里搜，返回：

```json
{ "items": [ { "sample_id": 4564, "image_path": "...", "prompt": "...", "created_at": "...", "lora_names": "可莉" } ] }
```

`q` 同时匹配 prompt 和 LoRA 名字。

---

## 三、列表新增筛选

`GET /api/loras` 多一个 `flag`：

| flag | 含义 |
|---|---|
| `unused` | 从没被用来出过图 |
| `noimage` | 没有预览图 |
| `noname` | 名字还是文件名 |
| `nosource` | 没有下载页也没有 model_id |

```powershell
curl "http://127.0.0.1:8787/api/loras?flag=noimage&limit=50"
```

---

## 四、依赖

`lib/civitai.mjs` 用 `undici` 的 `ProxyAgent` 走系统代理（系统直连 civitai 会超时）。
`npm install` 过一次就够了，`node_modules` 在项目根。
