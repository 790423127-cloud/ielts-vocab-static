/**
 * Copy missing fields from AI-completed G-reading entries into matching master
 * entries, and append complete non-retired headwords that are absent from the
 * master lexicon. Existing master content and stable IDs are never replaced.
 *
 * Usage:
 *   node scripts/sync-reading-g-ai-to-master.mjs
 *   node scripts/sync-reading-g-ai-to-master.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncReadingGAiCompletedEntriesToMaster } from "../app/lib/reading-g-vocab/master-content-sync.server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const G_VOCAB_PATH = path.join(ROOT, "public", "data", "reading-g-vocab.json");
const apply = process.argv.includes("--apply");
const gPayload = JSON.parse(fs.readFileSync(G_VOCAB_PATH, "utf8"));
if (!Array.isArray(gPayload?.items)) throw new Error("G类阅读词库 items 无法读取。");

const report = await syncReadingGAiCompletedEntriesToMaster(gPayload.items, { apply });
console.log(JSON.stringify(report, null, 2));
