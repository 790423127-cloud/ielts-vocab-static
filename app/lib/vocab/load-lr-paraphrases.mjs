import { LR_PARAPHRASE_URL } from "./lr-paraphrase-keys.mjs";

export function asParaphraseList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.entries)) return payload.entries;
  return [];
}

export function buildParaphraseLexiconMeta(payload = {}, entries = []) {
  const version = String(payload?.version || "").trim();
  const count = entries.length;
  const firstId = entries[0]?.id || "";
  const lastId = entries[entries.length - 1]?.id || "";
  return {
    version,
    count,
    paraphraseLexiconHash: [version, count, firstId, lastId].join("|"),
    generatedAt: payload?.generatedAt || ""
  };
}

export async function loadLrParaphrases(url = LR_PARAPHRASE_URL) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response?.ok) throw new Error(`同义替换库加载失败（HTTP ${response?.status || "unknown"}）`);
  const payload = await response.json().catch(() => null);
  if (!payload) throw new Error("同义替换 JSON 解析失败");
  const entries = asParaphraseList(payload);
  if (entries.length !== 600) throw new Error(`同义替换库数量异常：${entries.length}，期望 600`);
  const meta = buildParaphraseLexiconMeta(payload, entries);
  return { entries, ...meta, source: url };
}