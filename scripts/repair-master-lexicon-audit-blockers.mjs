import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_PATH = path.join(ROOT, "public", "data", "words.json");
const CACHE_PATH = path.join(ROOT, ".static-export-cache", "words.json");
const BACKUPS_ROOT = path.join(ROOT, "backups");
const MALFORMED_WORD_ID = "reading-coach-word-52e4467b11e646e0b0ea5a99119e1e8c";
const MALFORMED_WORD = "suggests t";
const REDIRECT_WORD = "suggest";

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath);
  return { raw, data: JSON.parse(raw.toString("utf8")) };
}

function atomicWrite(filePath, content) {
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, filePath);
}

function isDanglingForm(entry, form, knownWords) {
  const target = normalize(typeof form === "string" ? form : form?.word);
  return Boolean(target && target !== normalize(entry.word) && target !== "earning" && !knownWords.has(target));
}

function buildPlan() {
  const publicFile = readJson(PUBLIC_PATH);
  const cacheFile = readJson(CACHE_PATH);
  if (!publicFile.raw.equals(cacheFile.raw)) {
    throw new Error("public/data/words.json 与 .static-export-cache/words.json 不一致，停止修复。");
  }

  const words = Array.isArray(publicFile.data?.words) ? publicFile.data.words : [];
  const malformed = words.find((entry) => String(entry?.wordId || entry?.id || "") === MALFORMED_WORD_ID);
  if (!malformed || normalize(malformed.word) !== MALFORMED_WORD) {
    throw new Error(`未找到预期的截断条目 ${MALFORMED_WORD}，停止修复。`);
  }

  const suggest = words.find((entry) => normalize(entry.word) === REDIRECT_WORD);
  if (!suggest) throw new Error("未找到 suggest 基词，停止修复。");

  const knownWords = new Set(words.map((entry) => normalize(entry.word)));
  const removedForms = [];
  const nextWords = words
    .filter((entry) => entry !== malformed)
    .map((entry) => {
      const next = { ...entry };

      if (normalize(entry.word) === "immune system") {
        next.lexicalizedCompound = true;
      }

      if (normalize(entry.word) === REDIRECT_WORD) {
        const aliases = Array.isArray(entry.legacyHeadwords) ? entry.legacyHeadwords : [];
        next.legacyHeadwords = [...new Set([...aliases, MALFORMED_WORD])];
      }

      if (Array.isArray(entry.forms)) {
        const keptForms = entry.forms.filter((form) => {
          if (!isDanglingForm(entry, form, knownWords)) return true;
          removedForms.push({
            ownerId: entry.wordId || entry.id,
            owner: entry.word,
            form: typeof form === "string" ? form : form.word
          });
          return false;
        });
        if (keptForms.length !== entry.forms.length) next.forms = keptForms;
      }

      return next;
    });

  const compound = nextWords.find((entry) => normalize(entry.word) === "immune system");
  const redirect = nextWords.find((entry) => normalize(entry.word) === REDIRECT_WORD);
  if (!compound?.lexicalizedCompound) throw new Error("immune system 复合词标记写入失败。");
  if (!redirect?.legacyHeadwords?.includes(MALFORMED_WORD)) throw new Error("suggests t 旧词头迁移写入失败。");
  if (nextWords.some((entry) => normalize(entry.word) === MALFORMED_WORD)) throw new Error("截断条目仍在词库中。");

  const payload = {
    ...publicFile.data,
    count: nextWords.length,
    words: nextWords
  };

  return {
    content: `${JSON.stringify(payload, null, 2)}\n`,
    report: {
      removedMalformedEntry: {
        id: malformed.wordId || malformed.id,
        word: malformed.word,
        redirectTo: REDIRECT_WORD
      },
      markedLexicalizedCompound: compound.word,
      removedDanglingForms: removedForms
    }
  };
}

const apply = process.argv.includes("--apply");
const plan = buildPlan();

if (apply) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(BACKUPS_ROOT, `master-audit-repair-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(PUBLIC_PATH, path.join(backupDir, "words.json"));
  fs.copyFileSync(CACHE_PATH, path.join(backupDir, "cache-words.json"));
  atomicWrite(PUBLIC_PATH, plan.content);
  atomicWrite(CACHE_PATH, plan.content);
  plan.report.backupDir = backupDir;
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...plan.report }, null, 2));
