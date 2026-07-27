import fs from "node:fs";

const ROOT = process.cwd();

function replaceRequired(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Expected text not found in ${path}: ${before.slice(0, 140)}`);
  fs.writeFileSync(path, source.replace(before, after), "utf8");
}

const readingPage = `${ROOT}/app/reading-words/page.jsx`;
replaceRequired(
  readingPage,
  '  const aiControlRef = useRef({ controller: null, stopped: false });\n  const mainLexiconRef = useRef({ words: [], meta: {}, index: new Map() });',
  '  const aiControlRef = useRef({ controller: null, stopped: false });\n  const aiConfirmRef = useRef(null);\n  const mainLexiconRef = useRef({ words: [], meta: {}, index: new Map() });'
);
replaceRequired(
  readingPage,
  '  const runAiCompletion = async () => {\n    if (aiRunning || !aiConfirmed) return;',
  '  const runAiCompletion = async () => {\n    if (aiRunning) return;\n    if (!aiConfirmed) {\n      setAiRun({\n        status: "confirm-required",\n        processed: 0,\n        total: aiTargetWords.length,\n        filled: 0,\n        failed: 0,\n        message: "请先勾选付费确认，再开始处理；未确认前不会发起 AI 请求。"\n      });\n      aiConfirmRef.current?.focus();\n      return;\n    }'
);
replaceRequired(
  readingPage,
  '<input type="checkbox" checked={aiConfirmed} onChange={(event) => setAiConfirmed(event.target.checked)} disabled={aiRunning} />',
  '<input ref={aiConfirmRef} type="checkbox" checked={aiConfirmed} onChange={(event) => setAiConfirmed(event.target.checked)} disabled={aiRunning} />'
);
replaceRequired(
  readingPage,
  'disabled={!aiConfirmed || aiRunning || !aiTargetWords.length || !mainReady}',
  'disabled={aiRunning || !aiTargetWords.length || !mainReady}'
);

const regressionTest = `${ROOT}/app/lib/vocab/__tests__/word-flashcard-session.test.mjs`;
replaceRequired(
  regressionTest,
  'const pageSource = fs.readFileSync(pagePath, "utf8");',
  'const pageSource = fs.readFileSync(pagePath, "utf8");\nconst readingWordsSource = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../reading-words/page.jsx"), "utf8");'
);
replaceRequired(
  regressionTest,
  'test("home page imports the unified quality queue used after vocab hydration", () => {',
  'test("paid AI start remains clickable so it can explain missing confirmation", () => {\n  assert.match(readingWordsSource, /if \\(!aiConfirmed\\) \\{/);\n  assert.match(readingWordsSource, /请先勾选付费确认/);\n  assert.match(readingWordsSource, /disabled=\\{aiRunning \\|\\| !aiTargetWords\\.length \\|\\| !mainReady\\}/);\n  assert.doesNotMatch(readingWordsSource, /disabled=\\{!aiConfirmed \\|\\|/);\n});\n\ntest("home page imports the unified quality queue used after vocab hydration", () => {'
);

for (const relativePath of [
  ".github/workflows/ci-apply-repairs.yml",
  ".github/workflows/ci-lexicon-diagnosis.yml",
  "scripts/ci-apply-repairs.mjs",
  "scripts/ci-diagnose-lexicon.mjs",
  "scripts/ci-find-ai-button.mjs"
]) {
  const fullPath = `${ROOT}/${relativePath}`;
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

console.log(JSON.stringify({
  uiFix: "paid AI start remains interactive but still requires explicit confirmation",
  removedTemporaryFiles: 5
}, null, 2));
