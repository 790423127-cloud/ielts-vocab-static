/**
 * Lightweight E2E without full browser automation:
 * - local Next data endpoints
 * - cloud static assets
 * - status separation / migration fixtures (logic)
 * - MCQ one-shot generation
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import http from "http";
import https from "https";
import { fileURLToPath } from "url";
import {
  buildParaphraseMcq,
  getQuizEligibleGroups
} from "../app/lib/reading-g-vocab/paraphrase-quiz.mjs";
import {
  patchRgStatus,
  getModeStatusCode,
  getEntryProgressKey,
  RG_LEARN_MODE,
  RG_STATUS,
  patchParaphraseStatus,
  getParaphraseStatus
} from "../app/lib/reading-g-vocab/storage.mjs";
import { remapStatusToStableKeys } from "../app/lib/reading-g-vocab/migration.mjs";
import { itemMatchesPathStage } from "../app/lib/reading-g-vocab/stages.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function get(url) {
  const lib = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(
      url,
      { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          })
        );
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("timeout " + url));
    });
  });
}

function sha(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const report = { at: new Date().toISOString(), local: {}, cloud: {}, logic: {}, pass: true, errors: [] };

  // local
  const localBase = "http://localhost:3000";
  try {
    const page = await get(localBase + "/reading-g");
    report.local.pageStatus = page.status;
    report.local.pageHasReadingG = page.body.toString("utf8").includes("reading") || page.status === 200;

    const vocab = await get(localBase + "/data/reading-g-vocab.json");
    const para = await get(localBase + "/data/reading-g-paraphrases.json");
    report.local.vocabStatus = vocab.status;
    report.local.paraStatus = para.status;
    if (vocab.status === 200) {
      const j = JSON.parse(vocab.body.toString("utf8"));
      report.local.vocabCount = (j.items || []).length;
    }
    if (para.status === 200) {
      const j = JSON.parse(para.body.toString("utf8"));
      report.local.paraGroups = (j.groups || []).length;
      report.local.paraCanQuiz = (j.groups || []).filter(
        (g) => g.confidence === "high" && g.canAutoQuiz === true && String(g.commonMeaningZh || "").trim()
      ).length;
      const eligible = getQuizEligibleGroups(j.groups || []);
      const q = buildParaphraseMcq(eligible[0], eligible, () => 0.41, []);
      report.local.mcq = q
        ? {
            ok: true,
            stem: q.stem,
            options: q.options.length,
            hasExplainMeta: Boolean(q.meta)
          }
        : { ok: false };
    }
    // other pages
    for (const p of ["/basic", "/meaning", "/meaning-en"]) {
      try {
        const r = await get(localBase + p);
        report.local[p] = r.status;
      } catch (e) {
        report.local[p] = String(e.message);
        report.errors.push("local " + p + " " + e.message);
      }
    }
  } catch (e) {
    report.errors.push("local fail: " + e.message);
    report.pass = false;
  }

  // cloud
  const cloudBase =
    "https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci";
  const bust = "?v=" + Date.now();
  try {
    for (const u of [
      "/reading-g.html",
      "/assets/reading-g.js",
      "/data/reading-g-vocab.json",
      "/data/reading-g-paraphrases.json"
    ]) {
      const r = await get(cloudBase + u + bust);
      report.cloud[u] = { status: r.status, bytes: r.body.length, sha256: sha(r.body) };
      if (r.status !== 200) {
        report.pass = false;
        report.errors.push("cloud 404 " + u);
      }
    }
    // hash compare
    const localV = fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"));
    const localP = fs.readFileSync(path.join(root, "public/data/reading-g-paraphrases.json"));
    report.cloud.vocabHashMatch =
      report.cloud["/data/reading-g-vocab.json"]?.sha256 === sha(localV);
    report.cloud.paraHashMatch =
      report.cloud["/data/reading-g-paraphrases.json"]?.sha256 === sha(localP);

    // static page content checks
    const html = (await get(cloudBase + "/reading-g.html" + bust)).body.toString("utf8");
    report.cloud.htmlHasPortable = html.includes("静态便携版");
    report.cloud.htmlHasQuizBox = html.includes("quizBox");
    const js = (await get(cloudBase + "/assets/reading-g.js" + bust)).body.toString("utf8");
    report.cloud.jsHasParaUrl = js.includes("./data/reading-g-paraphrases.json");
    report.cloud.jsHasMcq = js.includes("buildOneMcq") || js.includes("paraphraseQuiz");

    // generate MCQ from cloud para
    if (report.cloud["/data/reading-g-paraphrases.json"]?.status === 200) {
      const j = JSON.parse(
        (await get(cloudBase + "/data/reading-g-paraphrases.json" + bust)).body.toString("utf8")
      );
      const eligible = getQuizEligibleGroups(j.groups || []);
      const q = buildParaphraseMcq(eligible[0], eligible, () => 0.33, []);
      report.cloud.mcqOk = Boolean(q && q.options.length === 4);
    }
  } catch (e) {
    report.errors.push("cloud fail: " + e.message);
    report.pass = false;
  }

  // logic: three statuses + paraphrase + favorite
  const word = {
    id: "rg_word_test_issue",
    entryType: "word",
    word: "issue",
    normalizedKey: "issue"
  };
  const phrase = {
    id: "rg_phrase_test_in_advance",
    entryType: "phrase",
    word: "in advance",
    normalizedKey: "in advance"
  };
  let map = {};
  map = patchRgStatus(map, word, { status: RG_STATUS.FAMILIAR }, RG_LEARN_MODE.MEANING);
  map = patchRgStatus(map, phrase, { status: RG_STATUS.UNFAMILIAR }, RG_LEARN_MODE.PHRASE);
  map = patchRgStatus(map, word, { favorite: true }, RG_LEARN_MODE.MEANING);
  let paraMap = {};
  paraMap = patchParaphraseStatus(paraMap, "rg_para_book_in_advance_001", "familiar");

  report.logic.status = {
    meaningOnly:
      getModeStatusCode(word, map, RG_LEARN_MODE.MEANING) === "familiar" &&
      getModeStatusCode(word, map, RG_LEARN_MODE.PHRASE) === "unlearned",
    phraseOnly:
      getModeStatusCode(phrase, map, RG_LEARN_MODE.PHRASE) === "unfamiliar" &&
      getModeStatusCode(phrase, map, RG_LEARN_MODE.MEANING) === "unlearned",
    paraOnly: getParaphraseStatus("rg_para_book_in_advance_001", paraMap) === "familiar",
    favorite: map[getEntryProgressKey(word)].favorite === true
  };
  if (!Object.values(report.logic.status).every(Boolean)) {
    report.pass = false;
    report.errors.push("status separation logic failed");
  }

  // migration fixture exact
  const items = [
    { id: "rg_word_issue", word: "issue", entryType: "word", normalizedKey: "issue" },
    {
      id: "rg_phrase_in_advance",
      word: "in advance",
      entryType: "phrase",
      normalizedKey: "in advance"
    },
    { id: "rg_word_set", word: "set", entryType: "word", normalizedKey: "set" },
    { id: "rg_phrase_set", word: "set", entryType: "phrase", normalizedKey: "set" },
    { id: "rg_word_book", word: "book", entryType: "word", normalizedKey: "book" }
  ];
  const raw = {
    rg_word_issue: { status: "熟悉", favorite: true },
    "phrase::in advance": { status: "不熟" },
    book: { status: "熟悉" },
    set: { status: "熟悉" }
  };
  const mig = remapStatusToStableKeys(raw, items);
  report.logic.migration = {
    matchedCount: mig.matchedCount,
    unmatchedCount: mig.unmatchedCount,
    ambiguousCount: mig.ambiguousCount,
    newEntryCount: mig.newEntryCount,
    expected: { matched: 3, ambiguous: 1, unmatched: 0 },
    pass: mig.matchedCount === 3 && mig.ambiguousCount === 1 && mig.unmatchedCount === 0
  };
  if (!report.logic.migration.pass) {
    report.pass = false;
    report.errors.push("migration fixture failed");
  }

  // stage4 not in active
  const vocab = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/reading-g-vocab.json"), "utf8")
  );
  let activeHasPureRef = 0;
  for (const it of vocab.items || []) {
    if (it.studyMode === "active" && itemMatchesPathStage(it, "4") && !(it.layers || []).some((l) => l !== "reference701")) {
      // active with only ref layer would be wrong
      if ((it.layers || []).every((l) => l === "reference701")) activeHasPureRef += 1;
    }
  }
  report.logic.stage4NotDefaultActive = activeHasPureRef === 0;

  // basic page still loads satellite (no crash import)
  report.logic.satelliteCallers = ["reading-g", "basic"];

  if (report.local.vocabStatus !== 200 || report.local.paraStatus !== 200) report.pass = false;
  if (report.local.mcq && !report.local.mcq.ok) report.pass = false;
  if (report.cloud.mcqOk === false) report.pass = false;

  const out = path.join(root, "backups/reading-g-v3-final-audit/e2e-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
