from pathlib import Path

path = Path("app/lib/vocab/__tests__/admin-ai-batch-plan.test.mjs")
text = path.read_text(encoding="utf-8")

before = '''  buildCleanWordsPlan,
  buildFastCompletionPlan,'''
after = '''  buildCleanWordsPlan,
  buildEnrichmentPlan,
  buildFastCompletionPlan,'''
if text.count(before) != 1:
    raise RuntimeError("Could not patch enrichment import")
text = text.replace(before, after, 1)

replacements = {
    '''  assert.deepEqual(buildSlowCompletionPlan(words).targets.map(({ i }) => i), [3, 4]);''':
    '''  assert.deepEqual(buildSlowCompletionPlan(words).targets.map(({ i }) => i), [3]);''',
    '''  assert.deepEqual(wrongRepair.targets.map(({ i }) => i), [3, 4]);''':
    '''  assert.deepEqual(wrongRepair.targets.map(({ i }) => i), [3]);''',
    '''  assert.deepEqual(buildAnomalyRepairPlan(words).targets.map(({ i }) => i), [3, 4]);''':
    '''  assert.deepEqual(buildAnomalyRepairPlan(words).targets.map(({ i }) => i), [3]);'''
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise RuntimeError(f"Could not patch expected repair target: {old}")
    text = text.replace(old, new, 1)

anchor = '''test("optional enrichment fields and a legacy profile marker do not create a paid backlog", () => {'''
new_test = '''test("enrichment plan selects ready thin words, prioritizes favorites and excludes invalid queues", () => {
  const thin = completeWord("thin");
  const favorite = completeWord("favorite", { favorite: true });
  const rich = completeWord("rich", {
    collocations: Array.from({ length: 4 }, (_, index) => ({ phrase: `rich common ${index}`, chinese: `常见${index}` })),
    phraseCollocations: Array.from({ length: 4 }, (_, index) => ({ phrase: `rich phrase ${index}`, chinese: `短语${index}` }))
  });
  const invalid = completeWord("invalid", { otherMeanings: [{ meaningZh: "残缺" }] });
  const unclassified = completeWord("unclassified-enrichment", { topics: [] });

  const plan = buildEnrichmentPlan([thin, favorite, rich, invalid, unclassified]);
  assert.deepEqual(plan.targets.map(({ w }) => w.word), ["favorite", "thin"]);
  assert.equal(plan.chunks.length, 1);
  assert.equal(plan.workerCount, 1);

  const capped = buildEnrichmentPlan([thin, favorite], { maxTargets: 1 });
  assert.deepEqual(capped.targets.map(({ w }) => w.word), ["favorite"]);
});

'''
if text.count(anchor) != 1:
    raise RuntimeError("Could not insert enrichment plan test")
text = text.replace(anchor, new_test + anchor, 1)

path.write_text(text, encoding="utf-8")
print("Enrichment plan tests patched.")
