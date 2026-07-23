import test from "node:test";
import assert from "node:assert/strict";
import { getMeaningDisplay } from "../meaning-display.mjs";

test("meaning display hides copied, generic and placeholder details", () => {
  assert.equal(getMeaningDisplay({ word: "cat", meaning: "猫", meaningDetailedZh: "猫" }).detail, "");
  assert.equal(getMeaningDisplay({ word: "cat", meaning: "猫", meaningDetailZh: "“cat”常见含义为：猫。" }).detail, "");
  assert.equal(getMeaningDisplay({ word: "cat", meaning: "猫", meaningDetailedZh: "待完善" }).detail, "");
  assert.equal(getMeaningDisplay({ word: "cat", meaning: "猫", meaningDetailedZh: "“cat”常见含义为：猫" }).detail, "");
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
