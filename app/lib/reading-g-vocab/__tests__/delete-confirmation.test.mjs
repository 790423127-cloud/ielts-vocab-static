import assert from "node:assert/strict";
import test from "node:test";
import { confirmReadingGDelete } from "../delete-confirmation.mjs";

test("cancel keeps the G 类 deletion blocked", () => {
  let prompts = 0;
  const confirmed = confirmReadingGDelete("warning", {
    confirmAction() {
      prompts += 1;
      return false;
    }
  });

  assert.equal(confirmed, false);
  assert.equal(prompts, 1);
});

test("each G 类 deletion requires its own confirmation", () => {
  let prompts = 0;
  const confirmAction = () => {
    prompts += 1;
    return true;
  };

  assert.equal(confirmReadingGDelete("warning", { confirmAction }), true);
  assert.equal(confirmReadingGDelete("warning", { confirmAction }), true);
  assert.equal(prompts, 2);
});
