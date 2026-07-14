import test from "node:test";
import assert from "node:assert/strict";
import { getLegalQuizDirections, getRecallDirections, PARA_DIRECTION } from "../paraphrase-review.mjs";

test("missing direction allows two-sided recall but only safe anchor-to-member quiz", () => {
  const group = { anchor: "a", members: ["b"], relationType: "near_synonym" };
  assert.deepEqual(getRecallDirections(group), [PARA_DIRECTION.ANCHOR_TO_MEMBER, PARA_DIRECTION.MEMBER_TO_ANCHOR]);
  assert.deepEqual(getLegalQuizDirections(group), [PARA_DIRECTION.ANCHOR_TO_MEMBER]);
  assert.deepEqual(getLegalQuizDirections({ ...group, direction: "both" }), [PARA_DIRECTION.ANCHOR_TO_MEMBER, PARA_DIRECTION.MEMBER_TO_ANCHOR]);
});
