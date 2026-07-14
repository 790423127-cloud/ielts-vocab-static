# 产品口径说明（IELTS Vocab）

> 版本：v2026-07-10.7  
> 目的：避免把多个词库/模块的数量混成「一个总数」。

## 主产品模块（分别计数，不要相加对外乱说）

| 模块 | 路径 / 数据 | 约数量 | 说明 |
|---|---|---|---|
| 主词库（刷词 + 拼写底座） | `.static-export-cache/words.json` / `public/data/words.json` | **13808** | 扩展向 G 类词库，**不是**单纯 4000 |
| **零基础启蒙词库** | `public/data/basic-words.json` · 入口 `/basic` | **1500** | 完全不懂英文的 Pre-A1/A1 生存词；**独立词库、独立进度**，勿与主库「基础高频」混淆 |
| **G类阅读提升（v3）** | `public/data/reading-g-vocab.json` + `reading-g-paraphrases.json` · 入口 `/reading-g`（正式）· `reading-g.html`（腾讯云静态） | **以导入报告动态计数为准**（分层 active + reference；含词组400；高可信同义关系 300 组独立成库） | 正式站 React 完整页；静态版 `public/reading-g.html` + `assets/reading-g.js` 已纳入 export-static；进度键 `ielts_reading_g_*_v3` 对齐；**独立词库** |
| 词组刷词 / 拼写短语层 | `public/data/phrases.json` | **2971** | 短语层，单独计数 |
| 看词选中文义 + 中文选英文 | `public/data/meaning-6000.json` · 入口 `/meaning`、`/meaning-en` | **6000** | 两个模式共享同一训练子集与生成索引 |
| meaning-4000（遗留/对照） | `public/data/meaning-4000.json` | **4000** | 勿与主库混谈 |
| 口语写作表达 | `public/data/speaking-writing-phrases-700.json` | **700** | Expressions 模式 |
| 听读同义替换 | `public/data/listening-reading-synonyms.json` | **2026 组** | 按「组」计，不是词条 |
| 爱听写 | `public/data/idictation-frequency.json` | 听力/阅读分源 | 按需加载，不进首页首包 |

## 对外建议口径

1. **学习站能力**：多模式雅思词汇训练（刷词 / 拼写 / 选义 / 表达 / 同义替换）。  
2. **主词库规模**：以运行时 `vocab-meta.count` 为准（当前 **13808**）。  
3. **选义训练规模**：当前正式口径为 **6000 词**；不要再将旧的 4000、4500 或计划中的 5200 当作当前运行数量。  
4. **拼写扩展**：与主词库同源大库；不要再单独发明「另一个 10k 数字」而不对 hash。

## 静态拼写页

- 正式入口：`/spelling-words`、`/spelling-phrases`（React）。  
- `public/spelling.html`：**遗留静态页，已标记废弃**，仅兼容旧链接/导出，不再作为主维护面。

## 音频

- **统一规则：仅 Edge 兜底发音**（单词 / 词组 / 例句同一 voice + rate）。  
- 真人发音（Lingua Libre 等）已停用，避免 real/edge 混用导致播放规则混乱。  
- 不把整包 `.audio-cache` 纳入 git 或 GPT zip。
