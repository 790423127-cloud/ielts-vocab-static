import test from "node:test";
import assert from "node:assert/strict";
import {
  describeMeaningDetailIssue,
  getMainMeaningDetailDisplay,
  getMeaningDisplay,
  isMeaningDetailInformative
} from "../meaning-display.mjs";

test("meaning display hides copied, generic and placeholder details", () => {
  assert.equal(getMeaningDisplay({ word: "cat", meaning: "猫", meaningDetailedZh: "猫" }).detail, "");
  assert.equal(getMeaningDisplay({ word: "cat", meaning: "猫", meaningDetailZh: "“cat”常见含义为：猫。" }).detail, "");
  assert.equal(getMeaningDisplay({ word: "cat", meaning: "猫", meaningDetailedZh: "待完善" }).detail, "");
  assert.equal(getMeaningDisplay({ word: "cat", meaning: "猫", meaningDetailedZh: "“cat”常见含义为：猫" }).detail, "");
  assert.equal(
    getMeaningDisplay({ word: "fortnight", meaning: "两星期，十四天", meaningDetailZh: "“fortnight”在雅思听力中的常用含义是：两星期，十四天。" }).detail,
    ""
  );
  assert.equal(
    getMeaningDisplay({ word: "unbeatable", meaning: "无敌的", meaningDetailZh: "“unbeatable”的核心意思是“无敌的”。本词条按 adjective 使用。" }).detail,
    ""
  );
  assert.equal(
    getMeaningDisplay({ word: "access", meaning: "使用权", meaningDetailZh: "“access”在当前词条中作noun 名词使用，主要表示“使用权”。" }).detail,
    ""
  );
});

test("main meaning detail never substitutes morphology or family notes for a semantic explanation", () => {
  assert.equal(
    getMainMeaningDetailDisplay({
      word: "fortnight",
      pos: "noun",
      meaning: "两星期，十四天",
      meaningDetailZh: "“fortnight”在雅思听力中的常用含义是：两星期，十四天。",
      forms: [{ word: "fortnights", type: "复数形式" }],
      wordFamily: [{ word: "fortnightly", meaning: "每两周的/地" }]
    }, { posLabel: "noun 名词" }),
    "现有资料只确认了主释义，语义范围和实际用法仍待补充。"
  );
  assert.equal(
    getMainMeaningDetailDisplay({
      word: "anchor",
      meaning: "锚点",
      meaningDetailZh: "在登山语境中，指用于固定绳索或保护点的位置。"
    }),
    "在登山语境中，指用于固定绳索或保护点的位置。"
  );
  assert.equal(
    getMainMeaningDetailDisplay({ word: "unknown", meaning: "未知的" }),
    "现有资料只确认了主释义，语义范围和实际用法仍待补充。"
  );
  assert.doesNotMatch(
    getMainMeaningDetailDisplay({ word: "unknown", meaning: "未知的", pos: "adjective" }),
    /作.*使用，主要表示/u
  );
});

test("legacy form-only detail remains visibly incomplete instead of masquerading as a semantic explanation", () => {
  const entry = {
    word: "modifications",
    meaning: "修改；变更；改进",
    meaningDetailZh: "modifications: 修改；变更；改进；“modification”的复数；",
    collocations: [{ phrase: "make modifications", chinese: "进行修改" }]
  };
  assert.equal(isMeaningDetailInformative(entry), false);
  assert.equal(
    describeMeaningDetailIssue(entry),
    "只有词形、搭配或例句复述，没有解释主释义的语义范围或实际用法"
  );
  assert.equal(
    getMainMeaningDetailDisplay(entry),
    "现有资料只确认了主释义，语义范围和实际用法仍待补充。"
  );
});

test("collocation plus English morphology label is rejected as a fake detailed meaning", () => {
  const entry = {
    word: "growing",
    meaning: "增长的；成长的",
    meaningDetailZh: "常见搭配“grow up”表示“长大”；present participle为“growing”。"
  };

  assert.equal(isMeaningDetailInformative(entry), false);
  assert.equal(
    describeMeaningDetailIssue(entry),
    "只有词形、搭配或例句复述，没有解释主释义的语义范围或实际用法"
  );
  assert.equal(
    getMainMeaningDetailDisplay(entry),
    "现有资料只确认了主释义，语义范围和实际用法仍待补充。"
  );
});

test("collocations may supplement a semantic explanation but cannot qualify on their own", () => {
  const collocationOnly = {
    word: "advertise",
    meaning: "做广告；宣传",
    meaningDetailZh: "常见搭配有“advertise on TV”、“advertise for staff”。"
  };
  const semanticWithCollocations = {
    ...collocationOnly,
    meaningDetailZh: "指通过媒体向公众宣传产品或服务，以吸引消费者。也可用于宣传活动、职位等。常见搭配有“advertise on TV”、“advertise for staff”。"
  };

  assert.equal(isMeaningDetailInformative(collocationOnly), false);
  assert.equal(isMeaningDetailInformative(semanticWithCollocations), true);
  assert.match(getMainMeaningDetailDisplay(semanticWithCollocations), /advertise for staff/u);
});

test("a translated example is not accepted as a detailed meaning", () => {
  const entry = {
    word: "affairs",
    meaning: "事务；私事",
    exampleCn: "她管理公司的财务事务。",
    meaningDetailZh: "“affairs”的核心意思是“事务；私事”。本词条按“noun”使用。例句提示：她管理公司的财务事务。"
  };
  assert.equal(isMeaningDetailInformative(entry), false);
  assert.equal(getMeaningDisplay(entry).detail, "");
  assert.equal(
    describeMeaningDetailIssue(entry),
    "只有词形、搭配或例句复述，没有解释主释义的语义范围或实际用法"
  );
});

test("semantic scope and usage boundaries qualify as informative details", () => {
  const advertise = {
    word: "advertise",
    meaning: "做广告；宣传",
    meaningDetailZh: "指通过媒体（如电视、网络、报纸）向公众宣传产品或服务，以吸引消费者；也可用于宣传活动、职位等。常见搭配有“advertise on TV”、“advertise for staff”。"
  };
  const admittedly = {
    word: "admittedly",
    meaning: "诚然；公认地",
    meaningDetailZh: "用于承认某事是真实的，尽管可能与其他说法相反。"
  };

  assert.equal(isMeaningDetailInformative(advertise), true);
  assert.equal(isMeaningDetailInformative(admittedly), true);
  assert.equal(describeMeaningDetailIssue(advertise), "");
  assert.match(getMeaningDisplay(advertise).detail, /媒体/u);
  assert.match(getMeaningDisplay(admittedly).detail, /尽管/u);
});

test("meaning display returns useful detail and at most three high-confidence senses", () => {
  const result = getMeaningDisplay({
    meaning: "账户；说明",
    meaningDetailedZh: "常指银行或网络账户；在阅读中也可表示对事件的叙述或说明。",
    meaningsZh: [
      { gloss: "账户", confidence: "high" }, { gloss: "说明", confidence: "high" },
      { gloss: "叙述", confidence: "high" }, { gloss: "旧义", confidence: "medium" },
      { gloss: "第四义", confidence: "high" }
    ]
  });
  assert.match(result.detail, /银行/u);
  assert.deepEqual(result.senses.map((sense) => sense.gloss), ["账户", "说明", "叙述"]);
});

test("meaning display exposes only a real English definition", () => {
  assert.equal(getMeaningDisplay({ meaning: "账户", definition: "账户" }).definition, "");
  assert.equal(
    getMeaningDisplay({ meaning: "账户", definition: "an arrangement with a bank for keeping money" }).definition,
    "an arrangement with a bank for keeping money"
  );
});
