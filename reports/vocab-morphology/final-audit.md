# IELTS 总词库词形与词族全面审计

## 1. 审计结论

本次审计覆盖当前正式词库的 **13,757 个词条**。  
其中 **2,135 个词条（15.52%）** 能与同库中的某个基词建立规则或不规则词形关系。

这不表示这 2,135 个词都应删除。审计把它们分成五类：

| 处理类别 | 数量 | 建议 |
|---|---:|---|
| 可安全归并到 `forms` | 170 | 第一批自动处理，但不物理删除 |
| 高置信归并候选 | 722 | 小批量复核后归并 |
| 混合词形且有独立义项 | 77 | 保留独立词条，同时挂到基词下 |
| 已词汇化或有独立学习价值 | 452 | 保留，并建立 `wordFamily` |
| 关系有歧义或可能是假匹配 | 714 | 禁止自动归并 |

### 可以立即得到的效果

- 第一阶段可把 **170** 个明确语法词形移出默认阅读刷词队列。
- 第二阶段复核通过后，最多再处理 **722** 个。
- 因此默认阅读刷词队列的潜在去重范围是 **892 个**。
- 数据库物理词条数第一阶段仍保持 **13,757**，避免破坏稳定 ID、收藏、状态和 SRS 进度。

## 2. 原始后缀分布

后缀本身不能作为删除依据，因为很多正常单词也以这些字母结尾。

| 后缀外形 | 词条数 |
|---|---:|
| 以 -s 结尾 | 1,549 |
| 以 -ing 结尾 | 670 |
| 以 -ed 结尾 | 689 |
| 以 -er 结尾 | 828 |
| 以 -est 结尾 | 49 |

通过“由基词正向生成词形，并确认基词和变化形式都存在于词库”的方式，最终得到 **2,135 个有效关系候选**。  
关系记录包括：

| 关系 | 记录数 |
|---|---:|
| 名词复数 | 974 |
| 动词过去式/过去分词 | 593 |
| `-ing` 形式 | 438 |
| 第三人称单数 | 207 |
| 比较级 | 52 |
| 最高级 | 15 |

同一个词可能同时匹配两种关系，例如 `leaves` 既可能是 `leaf` 的复数，也可能是 `leave` 的第三人称单数，所以关系记录数会高于唯一词条数。

## 3. 五类处理规则

### A. 可安全归并到 `forms`：170

特征：

- 释义或词性明确写着“复数、过去式、过去分词、现在分词、第三人称单数、比较级或最高级”；
- 同库存在明确基词；
- 没有需要单独保留的词汇化义项。

典型例子：

- `cried → cry`
- `drove → drive`
- `bones → bone`
- `knows → know`
- `met → meet`
- `ran → run`

处理方式：

```json
{
  "word": "cry",
  "forms": [
    {
      "word": "cried",
      "type": "past tense / past participle",
      "sourceEntryId": "原 cried 稳定ID"
    }
  ]
}
```

原 `cried` 记录不删除，改为：

```json
{
  "entryType": "inflected-form",
  "baseWord": "cry",
  "baseWordId": "cry 的稳定ID",
  "studyMode": "reference",
  "readingPriority": false
}
```

### B. 高置信归并候选：722

特征：

- 正向词形规则成立；
- 词性兼容；
- 中文核心义与基词高度重合；
- 但当前字段没有明确写出“这是某个词形”。

典型例子：

- `antibiotics → antibiotic`
- `flowers → flower`
- `laughed → laugh`
- `emitting → emit`
- `things → thing`

这些不能一次性自动处理。建议每批 100–150 个，先生成差异报告，再由规则和人工共同确认。

### C. 混合词形且有独立义项：77

这些词既是语法词形，又已经拥有独立形容词、名词或固定用法。

典型例子：

- `grown → grow`
- `insured → insure`
- `belonging → belong`
- `tailored → tailor`
- `forgotten → forget`

处理方式：

- 保留独立词条；
- 同时把它登记到基词的 `forms`；
- 独立义项通过 `wordFamily` 或 `meaningsZh` 保留；
- 默认阅读刷词是否展示，按独立义项的频率决定。

### D. 已词汇化或有独立学习价值：452

这些外形像复数、过去分词或 `-ing`，但已经是独立词汇。

典型例子：

- `meeting`
- `building`
- `housing`
- `accounting`
- `customs`
- `premises`
- `news`
- `earnings`
- `running`

处理方式：

- 保留独立卡片；
- 不放进基词的纯语法 `forms` 后就隐藏；
- 建立 `wordFamily` 或双向关系；
- 保留自己的释义、例句、拼写训练和雅思标签。

### E. 歧义或假匹配：714

典型问题：

- `leaves`：可能来自 `leaf`，也可能来自 `leave`；
- `means`：既可能是 `mean` 的第三人称单数，也有独立名词“方法、手段”；
- `lower`：既可能是 `low` 的比较级，也可以是动词“降低”；
- `accused`：可以是过去分词，也可以作名词“被告”；
- `according`：外形像 `accord + ing`，但实际主要出现在固定结构 `according to`；
- `caves` 之类还可能产生拼写上的错误基词匹配。

这些词禁止按后缀自动删除或隐藏。

## 4. 推荐的数据模型

### 基词

```json
{
  "id": "base-id",
  "word": "conduct",
  "entryType": "headword",
  "forms": [
    {
      "word": "conducts",
      "type": "third-person singular",
      "sourceEntryId": "old-form-id"
    },
    {
      "word": "conducted",
      "type": "past tense / past participle",
      "sourceEntryId": "old-form-id"
    },
    {
      "word": "conducting",
      "type": "present participle / gerund",
      "sourceEntryId": "old-form-id"
    }
  ]
}
```

### 纯词形记录

```json
{
  "id": "保留原稳定ID",
  "word": "conducted",
  "entryType": "inflected-form",
  "baseWord": "conduct",
  "baseWordId": "base-id",
  "relationType": "past-or-participle",
  "studyMode": "reference",
  "readingPriority": false,
  "redirectToWord": "conduct"
}
```

### 独立派生词

```json
{
  "word": "accounting",
  "entryType": "headword",
  "wordFamily": [
    {
      "word": "account",
      "relation": "derived-from",
      "wordId": "account-id"
    }
  ]
}
```

## 5. 实施顺序

### 阶段 1：只处理 170 个安全项

- 只增加关系字段；
- 不删除物理记录；
- 从默认阅读刷词队列排除；
- 搜索这些词时打开基词，并显示用户搜索的原形式；
- 保留原 ID、收藏、状态和 SRS 数据。

### 阶段 2：复核 722 个高置信候选

每批 100–150 个，逐批输出：

- 基词；
- 变化形式；
- 两边词性；
- 两边释义；
- 建议动作；
- 证据；
- 拒绝原因。

只有审核结果为 `MERGE_FORM` 的词才进入 `forms`。

### 阶段 3：处理 77 个混合词

- 语法关系登记在 `forms`；
- 独立义项保留在当前词条；
- 根据雅思频率决定是否继续进入默认刷词。

### 阶段 4：为 452 个独立词建立词族

- 保留独立词条；
- 补 `wordFamily`；
- 不降低学习优先级，除非它本身是低频参考词。

### 阶段 5：人工处理 714 个歧义项

优先级：

1. G 类真题出现词；
2. 阅读填空答案词；
3. 当前阶段 1/2 核心词；
4. 默认刷词队列中的词；
5. 低频参考词最后处理。

## 6. 页面与学习模式

### 阅读刷词

- 默认只出现基词和真正独立词；
- 纯复数、时态、分词不单独占一张阅读卡；
- 基词卡下方展示“词形”区域。

### 拼写训练

纯词形仍有价值，应进入专门的：

- 单复数拼写；
- 过去式和过去分词；
- `-ing` 拼写；
- 不规则词形；
- 阅读填空答案词形训练。

### 搜索

搜索 `conducted` 时：

1. 找到原 `conducted` 稳定 ID；
2. 显示“这是 conduct 的过去式/过去分词”；
3. 打开 `conduct` 主卡；
4. 仍允许播放 `conducted` 的发音和进行拼写练习。

## 7. 验收标准

- 总物理词条数第一阶段仍为 13,757；
- 默认阅读队列减少 170 个明确重复词形；
- 完成第二阶段后，累计去重不超过 892 个；
- 稳定 ID 变化 0；
- 收藏、状态、SRS 变化 0；
- 纯词形搜索成功率 100%；
- 基词 `forms` 双向关系完整；
- `news`、`customs`、`premises`、`housing`、`accounting` 等词汇化形式不会被误归并；
- 脚本第二次执行修改 0；
- cache 与 public 数据一致；
- 全量单元测试、构建和 E2E 通过。

## 8. 审计方法与限制

本次使用的是保守审计：

1. 从正式 V2 词库头词集合建立索引；
2. 从基词正向生成规则词形；
3. 加入常见不规则复数、过去式和过去分词；
4. 只有变化形式和基词同时存在于词库才进入候选；
5. 再结合词性、中文释义重合度和明确词形标记分类；
6. 没有调用付费 API，也没有逐词在线查询。

自动分类不能代替全部人工语义判断，因此只有 `SAFE_FORM_MERGE` 可以作为第一批自动处理对象，其余必须按分类复核。
