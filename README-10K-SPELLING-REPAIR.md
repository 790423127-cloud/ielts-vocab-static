# 10k 拼写词库修复包

## 修复内容

1. `.static-export-cache/words.json` 已修复为 10,000 个唯一单词词头。
2. `app/spelling/page.jsx` 新增独立拼写入口：本地开发访问 `/spelling`。
3. `app/api/vocab-data/route.js` 提供开发环境词库读取接口。
4. 拼写模块改为优先读取当前发布的词库，而不是优先使用浏览器中可能遗留的 9,439 条 IndexedDB 缓存。
5. `public/data/phrases.json` 恢复 1,280 条独立短语层；短语不计入 10,000 单词。
6. 静态导出后可访问 `spelling.html`，并会同时导出 `data/words.json` 与 `data/phrases.json`。

## 应用方式

1. 先完整备份你的项目目录。
2. 解压本包到项目根目录，选择“覆盖同名文件”。
3. 本地运行 `npm run dev`，打开 `http://localhost:3000/spelling`。
4. 在拼写页面选择“单词”，页面应从当前 10,000 单词主词库读取候选词；选择“短语”可训练 1,280 条短语。
5. 运行 `node --test app/lib/spelling/__tests__/*.test.mjs`。
6. 执行你原有的 `publish-tencent.cmd` 或静态导出流程。线上静态拼写入口是 `spelling.html`。

## 重要质量说明

原项目保留了 V1 报告的 1,891 个新增词的词头、来源和类别，但没有保留这些新增条目的完整富文本字段。为了恢复可运行的 10,000 词主词库，本包依据报告重建了这些条目，并将它们标记为 `entryQuality: reconstructed_from_v1_audit_report_needs_editorial_review`。

这修复了“拼写系统仍读取 9,439 条旧词库”的功能问题；后续仍建议优先人工精修这些标记词条的中文释义、音标和例句。
