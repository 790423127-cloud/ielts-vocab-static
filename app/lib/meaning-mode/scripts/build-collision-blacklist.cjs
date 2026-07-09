// build-collision-blacklist.cjs — Generates browser-compatible collision data.
// Usage: node app/lib/meaning-mode/scripts/build-collision-blacklist.cjs
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "..", "..");
const SRC = path.join(ROOT, "reports", "meaning-gloss-collision-blacklist.json");
const DST = path.join(ROOT, "app", "lib", "meaning-mode", "collision-blacklist.generated.mjs");

const collisionData = JSON.parse(fs.readFileSync(SRC, "utf-8"));
const pairs = collisionData.pairs || [];
const collisionMap = new Map();

for (const entry of pairs) {
  for (const g of entry.pair) {
    const n = g.trim().replace(/[；;，,、\s]/g, "");
    if (!collisionMap.has(n)) collisionMap.set(n, new Set());
    for (const other of entry.pair) {
      const no = other.trim().replace(/[；;，,、\s]/g, "");
      if (no !== n) collisionMap.get(n).add(no);
    }
  }
}

const mapEntries = [];
for (const [key, vals] of collisionMap) {
  mapEntries.push([key, [...vals]]);
}

const normalizedPairs = pairs.map(e => ({
  pair: e.pair.map(g => g.trim().replace(/[；;，,、\s]/g, "")),
  reason: e.reason || ""
}));

const out = [
  "// collision-blacklist.generated.mjs — browser-compatible collision data.",
  "// Auto-generated. Do not edit by hand.",
  "// Generated at: " + new Date().toISOString(),
  "",
  "export const COLLISION_MAP_ENTRIES = " + JSON.stringify(mapEntries) + ";",
  "export const COLLISION_PAIRS = " + JSON.stringify(normalizedPairs) + ";",
  "export const VERSION = " + JSON.stringify(collisionData.version || "unknown") + ";",
  ""
].join("\n");

fs.writeFileSync(DST, out, "utf-8");
console.log("Generated:", DST);
console.log("Pairs:", pairs.length);
console.log("Map entries:", mapEntries.length);
