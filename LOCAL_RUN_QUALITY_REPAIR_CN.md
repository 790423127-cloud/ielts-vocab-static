# 本地运行：精准修复词库

本分支已经把词库质量分为四个独立队列：

- **必须补全**：缺少词头、词性、中文释义、英文定义、例句或例句翻译。
- **结构异常**：其他义项结构损坏、占位符、明显异常内容或词头异常。
- **仅缺分类**：只缺少 IELTS 用途、主题或难度。
- **可选丰富**：词条已经可以学习，只是搭配数量未达到对应等级的丰富目标。

默认付费 AI 操作不会处理“可选丰富”。

## 1. 环境要求

- Node.js 20.9 或更高版本。
- 已配置可用的 DeepSeek API Key。
- Windows、macOS 或 Linux 均可。

## 2. 安装

在项目文件夹中打开 PowerShell 或终端：

```powershell
node -v
npm install
```

## 3. 配置 DeepSeek

在项目根目录新建 `.env.local`：

```text
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-v4-flash
```

不要把 `.env.local` 提交到 Git。

## 4. 启动

```powershell
npm run dev
```

浏览器打开：

```text
http://127.0.0.1:3000
```

## 5. 正确操作顺序

1. 先点击 **下载完整词库备份**。
2. 打开 **AI工具（会扣费）**，确认页面显示的实际数量。
3. 点击 **修复结构异常 · 最多100词**。
4. 打开 **高级修复与分类**，点击 **AI仅补分类 / 难度**。
5. 只有“必须补全”大于 0 时，才点击 **修复必须项 · 最多100词**。
6. 不要为了减少数字而批量运行“可选丰富”；它不是损坏队列。
7. 词族复核和独立词候选只用于检查，不自动新增或删除单词。

GitHub 当前正式数据的基线是：

- 必须补全：0
- 结构异常：8
- 仅缺分类：177
- 可选丰富：6895

浏览器本地缓存可能与 GitHub 文件不同，因此以页面加载后的数量为准。

## 6. 停止和继续

连续任务运行时可以点击 **停止连续补全**。已经成功的内容会保留。下次再次启动项目后，可以从剩余队列继续。

## 7. 完成后验证

先按 `Ctrl+C` 停止开发服务器，然后运行：

```powershell
npm run lint:errors
node --test app/lib/vocab/__tests__/word-quality-status.test.mjs app/lib/vocab/__tests__/admin-ai-batch-plan.test.mjs app/lib/vocab/__tests__/admin-ai-continuous-runner.test.mjs
npm run audit:vocab-manual-queue -- --out-dir reports/revised-quality-audit
npm run lexicon:check
npm run build
```

审计摘要位于：

```text
reports/revised-quality-audit/summary.json
```

重点检查：

- `requiredRepairCount` 是否为 0；
- `classificationCount` 是否为 0；
- `duplicateHeadwordGroups` 是否为 0；
- `optionalEnrichmentCount` 不需要归零；
- 原单词 ID、收藏和学习状态没有改变。

## 8. 注意事项

- 不要运行 `npm audit fix --force`，除非先审查依赖变更。
- 不要同时打开两个本地 AI 修复任务。
- 不要删除 `.ai-cache`，它用于避免重复付费。
- 测试失败时不要发布或覆盖线上词库。
- 本分支仍是草稿 PR，尚未合并到 `main`。
