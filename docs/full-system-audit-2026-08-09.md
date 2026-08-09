# IELTS 词库网站全系统审计报告（2026-08-09）

> 依据：`IELTS-词汇网站-系统审计.md`
> 模式：**只读审计**（未改正式词库、未改 IndexedDB/用户状态、未调用付费 AI、未提交/部署）
> 结构化数据：`docs/full-system-audit-2026-08-09.json`
> 质量门禁明细：`reports/core-vocab-quality-audit.json`

---

## 1. 项目现状总论

### 结论

- **未发现 P0**（整站不可用、稳定 ID 大面积重复/漂移、密钥明文泄漏、用户进度被无守护写接口覆盖）。
- 本地 Next 服务可用：`http://127.0.0.1:3000/` → **HTTP 200**；`/reading-g` → **HTTP 200**。
- **生产依赖漏洞：0**（`npm run audit:dependencies`）。
- **词库同步校验通过**：`npm run lexicon:check` ok；`public/data/words.json` 与 `.static-export-cache/words.json` **哈希一致**。
- **质量门禁未通过**（正式主词库数据问题，不是本轮代码崩溃）：
  - `invalid difficulty: 21`
  - `required field missing: 20`
  - `phrase entries in words: 5`
- **默认 `npm test`：373 通过 / 7 失败**；失败项主要绑定「主词库计数/形态审计元数据/质量基线」与少量阅读 G 示例质量断言，需人工处置数据，不宜在审计中自动写回。
- 工作区存在**大量未提交改动**（G 类扩展、字体统一、静态资源、删除链路等）。本报告描述的是**当前工作区快照**，不是干净 `main` 发布态。

### 实际运行链（已确认）

```text
用户浏览器
→ Next 路由 /app/*/page.jsx 或 public/*.html 静态页
→ hooks / SatelliteLexiconFlashcard / 拼写引擎
→ public/data/*.json 或 /api/*（写操作需 requireLocalAdmin）
→ 浏览器 localStorage / IndexedDB（学习进度）
→ 可选 export-static → ZIP / 静态资源
```

并行实现存在：

| 面 | 入口 | 说明 |
|----|------|------|
| 正式 Next | `next dev/start :3000` | 主维护面 |
| 静态导出 | `public/*.html` + `public/assets/*` | 腾讯云/离线；与 Next 并行 |
| 主词库双份 | `public/data/words.json` + `.static-export-cache/words.json` | 当前字节与 SHA 一致 |

---

## 2. 结构盘点

| 类别 | 数量 | 备注 |
|------|------|------|
| Next 页面 | **13** | `/`、`/basic`、`/reading-g`、`/reading-words`、`/reading-paraphrases`、`/reading-sync`、`/ielts-538`、`/meaning`、`/meaning-en`、`/expressions`、`/spelling`、`/spelling-words`、`/spelling-phrases` |
| API 路由 | **24** | 含 reading-g 删除/补全、export-static、音频、生成等 |
| 写类 API 缺本地管理员守卫 | **0** | 扫描 `POST/写盘` 路由均含 `requireLocalAdmin` |

---

## 3. 正式词库与数据一致性

### 3.1 主词库 `public/data/words.json`

| 指标 | 数值 |
|------|------|
| 物理记录 | **13433** |
| 稳定 ID 唯一 | **是**（0 重复） |
| 标准化词头唯一 | **是**（0 重复） |
| 约可刷独立单词 | **~12033**（粗算：非空格词头、非 phrase） |
| 缺释义 | **20** |
| 缺词性 | **20** |
| 缺难度 | **21** |
| 缺例句 | **20** |
| 单词层疑似词组/碎片 | **5** |
| 与 static-export-cache 哈希 | **一致** `1ef9cb80…e4d782` |

#### P1 主词库质量门禁失败（需人工处置）

**A. 截断/脏词头（优先）**

| 词头 | 问题 |
|------|------|
| `suggests t` | 截断；缺难度；被计为 phrase_in_words |
| `emselves in difficult circumstan` | 截断碎片；缺释义/词性/例句/难度 |

**B. 缺核心字段（reading-coach 导入一批，约 20 条）**
示例：`seniority`、`dependants`、`rucksacks`、`polycarbonate`、`indulgent`、`investing`、`Trimmed`…
证据：`required_field_missing` / `invalid_difficulty`（difficulty=undefined）。

**C. 单词层短语型条目（5）**

- `suggests t`
- `nominated beneficiary`
- `emselves in difficult circumstan`
- `primarily intended`
- `appraisal comment`

**D. 复合词未标记（门禁相关）**

- `immune system`：内容完整，仍在单词层；若保留应标记 `lexicalizedCompound` 或迁到词组层。

**E. 相对 2026-08-01 审计的变化**

- 旧项 `excluding`：现已有词性/释义/难度/例句 → **不再是空壳**。
- meaning-6000 悬空 `e` / `n`：主库中 **已不存在**；本轮 meaning→master 悬空计数 **0**（较上期改善）。

### 3.2 词组库

- `quality:phrases` 门禁：**通过**（errorTotal 0）。

### 3.3 G 类阅读 `reading-g-vocab.json`

| 指标 | 数值 |
|------|------|
| 条目 | **7302**（meta.count 一致） |
| 单词 / 词组 | **6629 / 673** |
| active 单词（可刷） | **6198** |
| reference 单词 | **431** |
| ID 重复 | **0** |
| 缺释义 / 缺例句 | **0 / 0** |
| forms 行 / family 行 | **3425 / 3166** |
| 独立词头又出现在他人 forms | **469**（形态合并候选，非自动删除依据） |

注意：用户界面「单词」常显示 **wordCount（含 reference）**；「默认可刷 active 单词」更接近 **6198**，二者不要混谈。

### 3.4 meaning-6000

- 规模 **6000**。
- 相对主词库 ID 悬空：**0**（本轮快照）。

### 3.5 临时文件卫生（P2）

- 残留：`public/data/reading-g-vocab.json.tmp-25816-1785990170518`（约 24.7MB，2026-08-06）
- 风险：误用/误提交；正式加载若未引用则无运行时影响。
- 建议：确认无进程占用后删除临时文件（需用户确认后再动数据目录）。

---

## 4. 学习状态 / 删除 / 键盘（抽样）

| 检查 | 结果 |
|------|------|
| 删除导航纯函数与整理删除链路测试 | 相关用例 **通过** |
| 本地管理员边界测试 | **通过** |
| AI 本地边界（不越权清内容）测试 | **通过** |
| 删除快捷键守卫（input/textarea） | reading-g / study-keyboard 存在 tag 判断 |
| G 类删除 | `/api/reading-g/delete-entry` 有 `requireLocalAdmin` + 批量写盘 |

未在本轮做完整 IndexedDB 浏览器录制回放；状态隔离依赖既有键名（G 类 `ielts_reading_g_*` 与主库分离）。若需 P0 级进度隔离证明，应补 Playwright 多库互不覆盖用例。

---

## 5. 静态导出 / 缓存

| 检查 | 结果 |
|------|------|
| 主词库 public vs export-cache | **同哈希、同字节** |
| 静态 HTML 面 | 存在 `public/reading-g.html`、`basic.html`、`spelling.html`、`meaning.html`、`ielts-538.html`、`reading-words.html` 等 |
| 废弃声明 | PRODUCT：`public/spelling.html` 为遗留兼容面 |
| 未提交静态资源变更 | 工作区大量 `public/assets/*` 与 html 已改，发布前需整包 export 再验收，避免「半套静态」 |

---

## 6. AI / 写回边界

| 检查 | 结果 |
|------|------|
| 生成/补全/删除/导出等写 API | 均挂 `requireLocalAdmin` |
| 本轮审计付费 AI 调用 | **0** |
| DeepSeek 相关路由 | 存在但默认不应在审计中实打 |

---

## 7. 测试与门禁实测

| 命令 | 结果 |
|------|------|
| `npm run lexicon:check` | **通过** |
| `npm run audit:dependencies` | **0 high+ 生产漏洞** |
| `npm run quality:gate` | **失败**（见 §3.1） |
| `npm run quality:phrases` | **通过** |
| `npm run test`（package 默认子集） | **373 pass / 7 fail** |
| 本地服务首页 + reading-g | **200** |
| 安全/删除导航定向测试 25 项 | **25 pass** |

### 失败测试归类（勿用改测试数字掩盖数据问题）

1. `word-runtime-quality`：illegal difficulty 未清零 → 对应 21 条缺难度。
2. `word-study-eligibility`：形态审计元数据计数漂移；`venue → venues` 悬空物理变形；主库计数断言 13374≠13433。
3. `phrase-flashcard`：与质量基线相关断言。
4. `reading-g-example-quality`：示例质量期望与当前 G 库内容不一致（需内容侧确认）。

---

## 8. 问题清单（按审计模板）

### P0 无

（本轮未证实整站崩溃、ID 全局重复、密钥提交、无守卫写用户进度。）

### P1

#### P1-1 主词库质量门禁失败（脏词头 + 缺字段 + 词组混层）

- **证据**：`npm run quality:gate`；`reports/core-vocab-quality-audit.json`（invalid_difficulty 21 / required_field_missing 20 / phrase_in_words 5）。
- **用户影响**：整理/质量队列噪音；极端脏词头进入刷词会损害体验。
- **建议**：人工确认删除或修复 `suggests t`、`emselves…`；补全 reading-coach 空字段批；复合短语迁层或打标。
- **是否自动修**：否（正式数据，需确认）。
- **验证**：`quality:gate` 转绿 + 抽样刷词。

#### P1-2 形态审计 / 测试基线与主库不同步

- **证据**：`venue -> venues` 失败；stored-form 期望 1777 等与现网不一致；计数 13374 vs 13433。
- **用户影响**：CI/本地 test 红，发布信心下降；不一定直接影响刷词。
- **建议**：复核悬空 form 链接后重建 morphologyAudit；再更新测试基线。
- **是否自动修**：否。

#### P1-3 工作区「半发布」风险（大量未提交双面改动）

- **证据**：`git status` 同时改 Next、public 静态、words.json、reading-g-vocab。
- **用户影响**：若只上传部分文件，静态站与 Next 行为分裂。
- **建议**：发布前完整 `export-static` + 静态冒烟；或明确只发布 Next。

### P2

#### P2-1 `public/data` 残留 tmp 词库文件

- **证据**：`reading-g-vocab.json.tmp-25816-1785990170518`。
- **建议**：确认无锁后删除。

#### P2-2 G 类「独立词头 ∩ forms 成员」重叠约 469

- **证据**：审计脚本 `standaloneAlsoForm`。
- **影响**：可刷量偏大、重复学变形。
- **建议**：按产品规则合并纯变形；独立义项保留（勿一刀切）。

#### P2-3 双实现维护成本

- Next `app/**` 与 `public/assets/*.js` 并行；字体/删除等需两边对齐。
- **建议**：改交互时强制静态回归清单。

#### P2-4 专名/品牌人工复核队列 49

- **证据**：quality 报告 `proper_name_or_brand_review`。
- **建议**：进入既有 manual queue，不阻塞上线。

### P3

- 核心词缺音标 18（不代表应删）。
- 词根变体重叠提示 2776（低风险，多数建议保留）。
- PRODUCT.md 数量口径与当前 13433 可能不同步，对外话术应以运行时 meta 为准。

---

## 9. 优先修复顺序（推荐）

1. **处置脏词头**：`suggests t`、`emselves in difficult circumstan`（删或修）。
2. **补全/删除** reading-coach 缺字段批（约 20）。
3. **5 条 phrase_in_words** 迁层或删碎片。
4. **形态图**：`venue→venues` 等悬空 form + 重建 morphologyAudit。
5. 清理 **tmp** 文件；确认后可选音频 0 字节清理。
6. 发布前 **静态整包导出 + smoke**。

---

## 10. 可合并修复组

| 组 | 内容 |
|----|------|
| G1 主库卫生 | P1-1 脏词头 + 缺字段 + phrase_in_words |
| G2 形态元数据 | P1-2 悬空 form + morphologyAudit + 测试基线 |
| G3 发布卫生 | P1-3 半套静态 + P2-1 tmp |

---

## 11. 本轮实际执行的检查

- 数据只读扫描脚本：`scripts/tmp-full-system-audit-2026-08-09.mjs`
- `npm run lexicon:check`
- `npm run quality:gate` / `quality:phrases`
- `npm run audit:dependencies`
- `npm run test`（默认子集）
- 定向 node:test（admin guard / AI boundary / delete nav / reading-g loader）
- HTTP 探测 `:3000/` 与 `/reading-g`

**未跑**：完整 Playwright e2e 全量、生产 build 全量（耗时；服务已在跑通首页）。

---

## 12. 审计边界声明

本轮 **没有**：

- 修改正式词库 JSON（审计过程只读；工作区原有未提交改动保持不动）；
- 修改真实用户 IndexedDB；
- 调用真实付费 AI；
- git commit / push / 部署；
- 删除正式缓存包。

---

## 13. 回退

本轮审计本身无代码写入义务；若清理 tmp 或修主库，应先备份 `public/data/words.json` / `reading-g-vocab.json` 再改。
