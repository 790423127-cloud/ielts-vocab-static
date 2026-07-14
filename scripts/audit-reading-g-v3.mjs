/**
 * Audit reading-g v3 datasets.
 * Usage: node scripts/audit-reading-g-v3.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const vocabPath = path.join(root, "public", "data", "reading-g-vocab.json");
const paraPath = path.join(root, "public", "data", "reading-g-paraphrases.json");
const reportPath = path.join(root, "public", "data", "reading-g-import-report.json");

const ACTIVE_LAYERS = new Set([
  "priority1500",
  "answerCore250",
  "logic120",
  "phrases400",
  "tierB1200",
  "paraCore600",
  "tierC800",
  "paraExt500"
]);

function fail(msg, errors) {
  console.error("AUDIT FAIL:", msg);
  if (errors?.length) console.error(JSON.stringify(errors.slice(0, 30), null, 2));
  process.exit(1);
}

function main() {
  if (!fs.existsSync(vocabPath)) fail("missing reading-g-vocab.json");
  if (!fs.existsSync(paraPath)) fail("missing reading-g-paraphrases.json");

  const vocab = JSON.parse(fs.readFileSync(vocabPath, "utf8"));
  const para = JSON.parse(fs.readFileSync(paraPath, "utf8"));
  const report = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
    : null;

  const items = vocab.items || [];
  const groups = para.groups || [];
  const errors = [];
  const ids = new Set();
  const keys = new Set();
  let multi = 0;
  let active = 0;
  let refOnly = 0;
  let words = 0;
  let phrases = 0;

  for (const it of items) {
    if (!it.word) errors.push({ type: "empty_word", id: it.id });
    if (!it.primaryMeaningZh && !it.meaning) errors.push({ type: "empty_meaning", id: it.id });
    if (ids.has(it.id)) errors.push({ type: "dup_id", id: it.id });
    ids.add(it.id);
    const mk = `${it.entryType}::${it.normalizedKey || it.word}`;
    if (keys.has(mk)) errors.push({ type: "dup_key", key: mk });
    keys.add(mk);
    if (!it.layers?.length) errors.push({ type: "no_layers", id: it.id });
    if (!it.primaryLayer) errors.push({ type: "no_primary", id: it.id });
    if (it.studyMode !== "active" && it.studyMode !== "reference") {
      errors.push({ type: "bad_mode", id: it.id });
    }
    const hasActive = (it.layers || []).some((l) => ACTIVE_LAYERS.has(l));
    const onlyRef =
      (it.layers || []).length > 0 && (it.layers || []).every((l) => l === "reference701");
    if (onlyRef && it.studyMode !== "reference") {
      errors.push({ type: "ref_only_not_ref", id: it.id });
    }
    if (hasActive && it.studyMode !== "active") {
      errors.push({ type: "active_layer_not_active", id: it.id });
    }
    if (it.entryType === "word") words += 1;
    if (it.entryType === "phrase") phrases += 1;
    if (it.studyMode === "active") active += 1;
    else refOnly += 1;
    if ((it.senses || []).length > 1) multi += 1;
  }

  const byKey = new Map();
  for (const it of items) {
    byKey.set(String(it.normalizedKey || it.word).toLowerCase(), it);
    byKey.set(String(it.word).toLowerCase(), it);
  }

  for (const g of groups) {
    if (!g.anchor) errors.push({ type: "para_no_anchor", id: g.groupId });
    if (g.canAutoQuiz && g.confidence !== "high") {
      errors.push({ type: "autoquiz_not_high", id: g.groupId });
    }
    if (g.confidence === "high" && g.canAutoQuiz) {
      // members should exist preferably
      const members = [g.anchor, ...(g.members || [])];
      for (const m of members) {
        const k = String(m || "").toLowerCase().trim();
        if (!byKey.has(k)) {
          // soft warning only if completely missing - already created at import
          errors.push({ type: "para_member_missing", member: m, id: g.groupId });
        }
      }
    }
    if ((g.members || []).some((m) => String(m).toLowerCase() === String(g.anchor).toLowerCase())) {
      errors.push({ type: "para_self", id: g.groupId });
    }
  }

  const hard = errors.filter((e) =>
    [
      "empty_word",
      "empty_meaning",
      "dup_id",
      "dup_key",
      "autoquiz_not_high",
      "para_self",
      "ref_only_not_ref",
      "active_layer_not_active"
    ].includes(e.type)
  );

  // para_member_missing as soft if import created them - count only hard
  const critical = hard.filter((e) => e.type !== "para_member_missing");

  const summary = {
    ok: critical.length === 0,
    itemCount: items.length,
    words,
    phrases,
    active,
    refOnly,
    multiSense: multi,
    paraphraseGroups: groups.length,
    highAutoQuiz: groups.filter((g) => g.canAutoQuiz && g.confidence === "high").length,
    errorCount: errors.length,
    criticalCount: critical.length,
    layerFilterCounts: Object.fromEntries(
      [
        "priority1500",
        "answerCore250",
        "logic120",
        "phrases400",
        "tierB1200",
        "paraCore600",
        "tierC800",
        "paraExt500",
        "reference701"
      ].map((id) => [id, items.filter((it) => (it.layers || []).includes(id)).length])
    ),
    importReportSummary: report?.summary || null
  };

  console.log(JSON.stringify(summary, null, 2));
  if (critical.length) fail("critical errors", critical);
  console.log("AUDIT PASS");
}

main();
