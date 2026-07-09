# 产品口径说明（IELTS Vocab）

> 版本：v2026-07-10.6  
> 目的：避免把多个词库/模块的数量混成「一个总数」。

## 主产品模块（分别计数，不要相加对外乱说）

| 模块 | 路径 / 数据 | 约数量 | 说明 |
|---|---|---|---|
| 主词库（刷词 + 拼写底座） | `.static-export-cache/words.json` / `public/data/words.json` | **13808** | 扩展向 G 类词库，**不是**单纯 4000 |
| 词组刷词 / 拼写短语层 | `public/data/phrases.json` | **2971** | 短语层，单独计数 |
| 看词选中文义 | `public/data/meaning-4500.json` | **4500** | 训练子集 |
| meaning-4000（遗留/对照） | `public/data/meaning-4000.json` | **4000** | 勿与主库混谈 |
| 口语写作表达 | `public/data/speaking-writing-phrases-700.json` | **700** | Expressions 模式 |
| 听读同义替换 | `public/data/listening-reading-synonyms.json` | **2026 组** | 按「组」计，不是词条 |
| 爱听写 | `public/data/idictation-frequency.json` | 听力/阅读分源 | 按需加载，不进首页首包 |

## 对外建议口径

1. **学习站能力**：多模式雅思词汇训练（刷词 / 拼写 / 选义 / 表达 / 同义替换）。  
2. **主词库规模**：以运行时 `vocab-meta.count` 为准（当前 **13808**）。  
3. 若宣传「G 类保底 5 分 5200」：必须明确是**精选子集目标**，当前仓库**尚未**把 UI/发布收敛为仅 5200；在收敛前不要写死 5200=全库。  
4. **拼写扩展**：与主词库同源大库；不要再单独发明「另一个 10k 数字」而不对 hash。

## 静态拼写页

- 正式入口：`/spelling-words`、`/spelling-phrases`（React）。  
- `public/spelling.html`：**遗留静态页，已标记废弃**，仅兼容旧链接/导出，不再作为主维护面。

## 音频

- 运行时优先真人缓存（`.audio-cache`），缺失时 Edge 兜底。  
- 不把整包 `.audio-cache` 纳入 git 或 GPT zip。
