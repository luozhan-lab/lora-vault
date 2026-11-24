# 开放接口

服务地址：`http://127.0.0.1:8787`
写操作需要 token：请求头 `X-API-Token: <token>`，或查询参数 `?token=<token>`。
token 在界面上「接口」按钮里，也在 `data/config.json` 的 `token` 字段。

读操作不需要 token。

---

## POST /api/loras —— 录入 / 更新一支

按文件路径去重，重复调用只会更新，不会插两条。
文件在磁盘上时，会自动读 safetensors 头部：训练标签、底模、训练轮数、数据集。
如果没给 `trigger` / `feature_words` / `outfit_words`，会从训练标签里自动分出来。

请求体（只有 `path` 或 `filename` 是必需的）：

```json
{
  "path": "角色\\原神\\genshin-3014738.safetensors",
  "name": "可莉",
  "name_en": "Klee",
  "category": "角色",
  "work": "原神",
  "trigger": "klee (genshin impact)",
  "feature_words": "blonde hair, red eyes, twintails, ahoge, pointy ears",
  "outfit_words": "red coat, white dress, brown gloves, cabbie hat",
  "body_words": "small body, small breasts",
  "negative": "",
  "weight": 0.85,
  "source_url": "https://civitai.com/models/123456",
  "download_url": "https://civitai.com/api/download/models/789",
  "model_id": "123456",
  "version_id": "789",
  "note": "自己备注",
  "preview": "samples/服装/babydoll.png",
  "tags": ["klee", "twintails"]
}
```

`path` 三种写法都收：

- 相对路径 `角色\原神\xxx.safetensors`
- 绝对路径 `D:\AI资产库\loras\角色\原神\xxx.safetensors`
- 只给文件名 `xxx.safetensors`（服务器自己去磁盘索引里找）

返回：

```json
{ "ok": true, "id": 782, "created": true, "rel_path": "角色\\原神\\genshin-3014738.safetensors" }
```

批量：`POST /api/loras/batch`，body 是 `{"items": [ ...同上... ]}`，返回 207 和逐条结果。

---

## 预览图

### 传图（原始字节）

```
POST /api/loras/{id}/preview
Content-Type: image/png
X-API-Token: <token>

<PNG 原始字节>
```

### 传图（base64）

```json
POST /api/loras/{id}/preview
{ "base64": "iVBORw0...", "ext": ".png" }
```

### 给远程地址

```json
POST /api/loras/{id}/preview
{ "url": "https://image.civitai.com/xxx.jpeg" }
```

上传后自动生成 560px 缩略图（ImageMagick）。取图：

- `GET /media/{id}/thumb` 缩略图
- `GET /media/{id}/full` 原图
- `DELETE /api/loras/{id}/preview` 清空

---

## 查询

```
GET /api/loras?q=可莉&category=角色&work=原神&tag=twintails&sort=used&limit=60&offset=0
```

| 参数 | 说明 |
|---|---|
| `q` | 关键词，空格分隔多个词，全部命中才返回。搜名字 / 英文名 / 触发词 / 特征词 / 服装词 / 备注 / 路径 / 标签 |
| `category` | 分类，如 `角色` `服装` `滑块` `背景与场景` |
| `work` | 作品，如 `原神` `碧蓝航线` |
| `tag` | 单个训练标签，精确匹配 |
| `status` | `ok` / `missing` |
| `hasPreview` | `1` 有图 / `0` 没图 |
| `sort` | `name` `recent` `used` `size` `work` |
| `limit` / `offset` | 分页，默认 60 |

返回 `{ total, limit, offset, items: [...] }`，`items` 里每项带 id、名字、分类、作品、触发词、预览状态、大小、用过几次。

```
GET /api/loras/{id}        # 全字段 + tags[] + meta{} + runs
GET /api/stats             # 统计
GET /api/facets            # 分类 / 作品 / 标签的计数，给筛选栏用
GET /api/locate?name=xxx   # 查这支在不在，返回相对路径和绝对路径
GET /api/events?limit=50   # 操作记录
GET /api/openapi.json      # 完整定义
```

---

## 维护

### 扫描磁盘

```
POST /api/scan
{ "read_meta": true }
```

返回：

```json
{ "total": 1111, "added": 2, "changed": 0, "moved": 1, "ok": 1108, "missing": 0, "diskFiles": 1111 }
```

- `added` 新文件入库
- `changed` 文件被替换（大小或时间变了）
- `moved` 换了目录，按文件名接回原记录
- `missing` 磁盘上找不到了，标 `missing`，不删记录

每天开软件时会自动扫一次（不读元数据）。

### 记一次使用

```
POST /api/usage
{ "loras": ["角色\\原神\\genshin-3014738.safetensors:0.85"], "image": "D:\\...\\out.png" }
```

### 刷新缩略图

```
POST /api/loras/{id}/thumb
```

### 定位文件

```
POST /api/reveal     { "id": 782 }        # 资源管理器里选中
```

### 导出

```
GET /api/export?format=json
GET /api/export?format=csv
```

---

## 改字段

```
PATCH /api/loras/{id}
Content-Type: application/json
X-API-Token: <token>

{ "trigger": "klee \\(genshin impact\\)", "weight": 0.9 }
```

字段名同录入接口。`DELETE /api/loras/{id}` 只删记录，不动磁盘文件。

---

## 命令行（不走 HTTP）

```powershell
node cli\lora.mjs add --file "角色\原神\genshin-3014738.safetensors" --name 可莉 `
  --trigger "klee (genshin impact)" --feature "blonde hair, red eyes, twintails" `
  --outfit "red coat, white dress" --url "https://civitai.com/models/xxx" --preview "D:\图.png"
node cli\lora.mjs find 可莉
node cli\lora.mjs show 782
node cli\lora.mjs stats
node cli\lora.mjs scan
node cli\lora.mjs locate genshin-3014738.safetensors
```

---

## 自动分词规则

从 `ss_tag_frequency` 里取，按出现频次降序：

- **触发词**：频次 ≥ 最高频次 90%、词数 ≤ 6、不在停用词表里 → 取前 3 个
- **服装词**：命中服装词表（dress / skirt / boots / gloves / kimono / hat / scarf / armor …）
- **身体词**：命中体型词表（breasts / hips / navel / thighs …）
- **特征词**：命中特征词表（hair / eyes / ears / horns / tail / mole / tattoo …）
- 姿势词（standing / sitting / looking / hands …）直接跳过

自动分出来的只是初稿，界面里能改。**自动分不出准确的中文名和下载页，这两样得人或者 AI 给。**

---

## 第二批接口

Civitai 补全、体检 / 查重、出图回写、后台任务，见 [API-2.md](API-2.md)。
