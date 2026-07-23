import fs from "node:fs";

const page = fs.readFileSync("app/page.jsx", "utf8");
const panel = fs.readFileSync("app/components/VocabAdminToolsPanel.jsx", "utf8");
const alreadyApplied = page.includes("getWordQualityEvaluation") && panel.includes("可选丰富：");

if (alreadyApplied) {
  console.log("Quality-standard patch already applied.");
} else {
  await import("./apply-quality-standard-patch.mjs");
}
