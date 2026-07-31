import fs from "node:fs";
import path from "node:path";

/**
 * Render master-lexicon-baseline.mjs source.
 * Keep this format stable — scripts/sync-master-lexicon.mjs and patch tools depend on it.
 */
export function renderMasterLexiconBaseline({ count, version, fileHash }) {
  const safeCount = Number(count);
  if (!Number.isFinite(safeCount) || safeCount < 0) {
    throw new Error(`Invalid baseline count: ${count}`);
  }
  const safeVersion = String(version || "").trim();
  const safeHash = String(fileHash || "").trim().toLowerCase();
  if (!safeVersion) throw new Error("Invalid baseline version");
  if (!/^[a-f0-9]{64}$/.test(safeHash)) {
    throw new Error(`Invalid baseline sha256: ${fileHash}`);
  }

  return [
    "// Baseline metadata for the bundled master lexicon.",
    "// Keep this in sync with public/data/words.json and .static-export-cache/words.json.",
    `export const MASTER_LEXICON_EXPECTED_COUNT = ${safeCount};`,
    `export const MASTER_LEXICON_VERSION = ${JSON.stringify(safeVersion)};`,
    `export const MASTER_LEXICON_SHA256 = ${JSON.stringify(safeHash)};`,
    ""
  ].join("\n");
}

export function resolveMasterLexiconBaselinePath(projectRoot = process.cwd()) {
  return path.join(projectRoot, "app", "lib", "vocab", "master-lexicon-baseline.mjs");
}

/**
 * Rewrite baseline after a successful local lexicon edit (delete / import / publish).
 * Returns the written path.
 */
export function writeMasterLexiconBaseline(
  { count, version, fileHash },
  { projectRoot = process.cwd(), dryRun = false } = {}
) {
  const filePath = resolveMasterLexiconBaselinePath(projectRoot);
  const source = renderMasterLexiconBaseline({ count, version, fileHash });
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, source, "utf8");
  }
  return { filePath, source };
}
