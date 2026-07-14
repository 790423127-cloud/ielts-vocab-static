/**
 * Rollback reading-g vocab to pre-v3 backup.
 * Usage:
 *   node scripts/rollback-reading-g-v3.mjs
 *   node scripts/rollback-reading-g-v3.mjs --file backups/reading-g-vocab-before-v3-....json
 *
 * Does NOT touch words.json / meaning-6000 / basic.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const backupsDir = path.join(root, "backups");
const target = path.join(root, "public", "data", "reading-g-vocab.json");

function parseArgs() {
  const out = { file: null };
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] === "--file" && process.argv[i + 1]) out.file = process.argv[++i];
  }
  return out;
}

function latestBackup() {
  if (!fs.existsSync(backupsDir)) return null;
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith("reading-g-vocab-before-v3-") && f.endsWith(".json"))
    .map((f) => ({ f, t: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files[0] ? path.join(backupsDir, files[0].f) : null;
}

function main() {
  const args = parseArgs();
  const src = args.file
    ? path.isAbsolute(args.file)
      ? args.file
      : path.join(root, args.file)
    : latestBackup();

  if (!src || !fs.existsSync(src)) {
    console.error("No backup found. Expected backups/reading-g-vocab-before-v3-*.json");
    process.exit(1);
  }

  // snapshot current v3 before rollback
  if (fs.existsSync(target)) {
    const snap = path.join(
      backupsDir,
      `reading-g-vocab-v3-before-rollback-${Date.now()}.json`
    );
    fs.copyFileSync(target, snap);
    console.log("snapshotted current:", snap);
  }

  fs.copyFileSync(src, target);
  console.log("restored:", src, "->", target);
  console.log(
    "Note: browser v3 localStorage keys remain; clear site data or keep v3 keys if re-importing."
  );
  console.log(
    "Page loader still supports legacy items shape (word/meaning). Revert code via git if needed."
  );
}

main();
