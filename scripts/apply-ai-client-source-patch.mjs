import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(file, search, replacement, label) {
  const source = readFileSync(file, "utf8");
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: source pattern not found in ${file}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${label}: source pattern is not unique in ${file}`);
  }
  writeFileSync(file, source.replace(search, replacement), "utf8");
}

replaceOnce(
  "app/hooks/useHomeLexiconAdmin.ai.js",
  "error.retryable = [429, 503, 504].includes(error.status);",
  "error.retryable = [429, 502, 503, 504].includes(error.status);",
  "retry 502 responses"
);

replaceOnce(
  "app/hooks/useHomeLexiconAdmin.ai.js",
  `    await runChunks(chunks.slice(0, 1), 1);\n    if (generatedByInputId.size > 0 && !signal?.aborted) {\n      await runChunks(chunks.slice(1), concurrency);\n    }`,
  `    await runChunks(chunks.slice(0, 1), 1);\n    // A failed probe is diagnostic only. It must not prevent later batches\n    // from running because one malformed group can otherwise hide the entire\n    // remaining completion queue. Server-side adaptive splitting isolates the\n    // bad words while later chunks continue normally.\n    if (!signal?.aborted) {\n      await runChunks(chunks.slice(1), concurrency);\n    }`,
  "continue after failed probe"
);

replaceOnce(
  "app/components/VocabAdminToolsPanel.jsx",
  `    "completed-with-failures": "可处理队列已完成",`,
  `    "completed-with-failures": "仍有失败词待处理",`,
  "failure status label"
);

replaceOnce(
  "app/components/VocabAdminToolsPanel.jsx",
  `  const continuousResolved = Math.min(\n    continuousTotal,\n    Math.max(0, (Number(aiRunState?.filled) || 0) + (Number(aiRunState?.failed) || 0))\n  );`,
  `  const continuousResolved = Math.min(\n    continuousTotal,\n    Math.max(0, continuousTotal - (Number(aiRunState?.remaining) || 0))\n  );`,
  "progress excludes failed words"
);

replaceOnce(
  "app/components/VocabAdminToolsPanel.jsx",
  `                          <span>失败 {aiRunState.failed || 0}</span>\n                          <span>剩余 {aiRunState.remaining || 0}</span>`,
  `                          <span>失败待处理 {aiRunState.blocked ?? aiRunState.failed ?? 0}</span>\n                          <span>真实剩余 {aiRunState.remaining || 0}</span>`,
  "display blocked and true remaining"
);

console.log("Applied exact AI client queue patches.");
