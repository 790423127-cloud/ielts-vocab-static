# IELTS Meaning Modules — 6000 词修复版

## 内容

这是两个词义训练模块的可覆盖代码包：

- `/meaning`：看英文选中文义
- `/meaning-en`：看中文选英文

两个模式统一读取：

- `public/data/meaning-6000.json` — 6000 条训练词
- `public/data/words.json` — 13808 条只读主词库

`meaning-4000.json` 和 `meaning-4500.json` 仅作为历史对照与旧版筛选基准，不再作为页面运行数据。

## 本次完成的修复

1. 从 13808 条主词库筛选并生成 6000 条 G 类 IELTS 训练词。
2. 保留原 4500 库中的 4182 条，替换 318 条低质量、重复词形、专名或异常释义词，并新增 1818 条。
3. 重建例句、词性、语义、义项关系和目标释义索引，全部覆盖 6000 条。
4. 修复混合词性识别，例如 `n./v.`、`adj./adv.`。
5. 修复仅凭 `-s/-ed/-ing` 后缀误删独立词条的问题。
6. 修复旧人工近义词对使用单词文本、新系统使用稳定 `wordId` 时的兼容问题。
7. 增加同词性语义回退层：关系目录不足时仍可生成可追溯的 P2/B 干扰项，不跨词性、不使用重复中文义项。
8. 修复干扰项之间中文义项重复的问题。
9. 保留旧 localStorage key，避免升级后用户学习进度丢失。

## 关键文件

- 训练库：`public/data/meaning-6000.json`
- 主词库：`public/data/words.json`
- 静态导出缓存：`.static-export-cache/words.json`
- 筛选脚本：`scripts/build_meaning_bank.py`
- 全量可训练性审计：`scripts/audit_meaning_6000.mjs`
- 筛选报告：`reports/meaning-bank-selection-report.json`
- 最终审计：`reports/meaning-6000-final-audit.json`
- 前向逻辑：`app/lib/meaning-mode/`
- 反向逻辑：`app/lib/meaning-en/`

## 重建流程

先安装 Python 构建依赖：

```bash
python -m pip install -r requirements-meaning.txt
```

生成 6000 训练库：

```bash
python scripts/build_meaning_bank.py
```

重建所有生成索引：

```bash
node app/lib/meaning-mode/build-example-index.mjs
node app/lib/meaning-mode/build-semantic-distractor-index.mjs
node app/lib/meaning-mode/build-sense-catalog.cjs
node app/lib/meaning-mode/build-sense-relation-catalog.cjs
node app/lib/meaning-mode/scripts/build-meaning-target-gloss-index.cjs
```

运行审计和测试：

```bash
node scripts/audit_meaning_6000.mjs
node --test app/lib/meaning-mode/__tests__/*.test.mjs app/lib/meaning-en/__tests__/*.test.mjs
```

## 当前验证结果

- 训练词：6000 / 6000
- 主词库：13808，未修改
- 完整训练释义：6000 / 6000
- 合法词性：6000 / 6000
- 每个目标至少 3 个安全同词性干扰项：6000 / 6000
- 1000 题连续会话模拟：1000 题成功生成
- 自动测试：105 项全部通过

## 接入说明

此压缩包是模块覆盖包，不是完整的独立 Next.js 仓库。它没有父项目的 `package.json`、Next.js 配置、全站组件和部署配置。请覆盖到原完整项目的同名路径后运行；不要直接把本包当作一个可单独 `npm run dev` 的完整网站。

页面发音仍使用浏览器 SpeechSynthesis。主词库应保持只读；需要修正或补充训练释义时，优先写入 `meaning-6000.json` 的生成规则或人工修正规则。
