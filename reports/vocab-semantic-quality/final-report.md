# 总词库语义质量最小成本修复 V1

## 执行结论

- 正式词条：13,758 → 13,757；仅删除来源噪声 `neff` 1 条。
- P0：原始扫描 622 个告警（449 个词条，含待校准假阳性）→ 确认口径 0。
- 例句关系候选：1,286；词形归一化后 1,141 条合法，最终 106 条仍需人工关系复核。
- 补丁第二次独立执行：新增 0、修改 0、删除 0、哈希拒绝 0。
- `paidApiCalls = 0`；`externalPerWordLookups = 0`。

## 修改统计

| 项目 | 数量 |
| --- | ---: |
| 最终 P0 补丁词条 | 464 |
| 例句字段确认变化 | 424 |
| 仅补 forms/wordFamily、未更换例句 | 5 |
| 确认修复中文翻译/占位/内容冲突 | 35 |
| 明确数字冲突 | 1 |
| 新增有效详细释义的核心词 | 19 |
| 本批新增 meaningsZh 义项 | 45 |
| 本批新增高置信 quizSenses | 45 |
| 删除 | 1 |
| 降为 reference | 0 |
| 低置信例句关系 defer | 105 |
| 稳定 ID 变化 | 0 |
| status/favorite/复习统计变化 | 0 |

## 重点修复

- 修复 385 条句号前异常空格，并对自动补尾中不够自然的 74 条再次人工语义复核。
- 逐条处理 28 条主题占位中文；修复 `payload`、`janitor`、`arrears`、`hotline`、`prestige` 等已知冲突。
- `claimform / byproduct / dropoff / dutyfree` 登记标准空格或连字符形式；`prestige` 登记 `prestigious` 词族关系。
- 19 个 G 类阶段 1/2 核心多义词新增真正英文定义、20–80 字中文详细释义和高置信结构化义项。
- WordFlashcardView 仅在有效时显示详细释义和最多 3 个高置信义项；空例句改为“例句待补全”。

## 验证

- 专项测试：9/9 通过。
- 全量测试：205/205 通过。
- ESLint errors：0。
- `npm run build`：成功；34 个页面生成完成。构建仍报告仓库既有 warnings，本批未新增 warning。
- Playwright E2E：1/1 通过；桌面切换到 `account` 成功，390×844 无横向溢出，控制台错误 0。
- cache/public：字节完全一致。

## 未解决与后续

- P1/P2 backlog 仍有 13743 个唯一词条，主要是旧中文 definition、机械 meaningDetailZh、核心外多义结构缺失；本轮按要求不批量模板化填充。
- 106 条词形归一化后仍未命中的例句关系需要后续每批 100–200 条人工复核，不应自动重写。
- 历史 `quizSenses` 中仍有 `confidence=derived` 的旧义项；新 UI 只展示 high，本轮未删除旧用户可见数据。
- 旧 GT prebuild 会在 4 个核心词上先恢复旧详情，新语义补丁随后确定性恢复最终值；结果稳定且构建成功，但后续可让旧脚本尊重 `semanticQualityPatch` 标记以减少重复写入。
