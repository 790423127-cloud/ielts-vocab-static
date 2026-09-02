import test from "node:test";
import assert from "node:assert/strict";

import { shouldKeepReadingWordLocal } from "../main-lexicon-sync.mjs";

test("personal-reading phrases stay local instead of becoming master word cards", () => {
  assert.equal(shouldKeepReadingWordLocal({ word: "primarily intended", pos: "phrase" }), true);
  assert.equal(shouldKeepReadingWordLocal({ word: "nominated beneficiary", pos: "noun phrase" }), true);
  assert.equal(shouldKeepReadingWordLocal({ word: "ordinary", pos: "adjective" }), false);
});
