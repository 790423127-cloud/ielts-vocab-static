export const IDICTATION_FREQUENCY_BATCH_SIZE = 300;

export const IDICTATION_FREQUENCY_META = {
  generatedAt: "2026-06-30",
  batchSize: IDICTATION_FREQUENCY_BATCH_SIZE,
  sources: {
    listening: {
      source: "idictation_listening",
      label: "\u7231\u542c\u5199\u542c\u529b",
      rawRows: 3913,
      uniqueWords: 3906,
      groupCount: 9
    },
    reading: {
      source: "idictation_reading",
      label: "\u7231\u542c\u5199\u9605\u8bfb",
      rawRows: 3398,
      uniqueWords: 3396,
      groupCount: 9
    }
  },
  overlapWords: 1782,
  meaningSanitizedAt: "2026-07-04"
};

let idictationFrequencySources = null;
let idictationFrequencyLoadPromise = null;

function normalizeIdictationPayload(payload = {}) {
  if (payload?.sources) return payload.sources;
  if (payload?.IDICTATION_FREQUENCY_SOURCES) return payload.IDICTATION_FREQUENCY_SOURCES;
  return null;
}

function setIdictationFrequencySources(sources) {
  if (sources && typeof sources === "object") idictationFrequencySources = sources;
  return idictationFrequencySources;
}

export function isIdictationFrequencyLoaded() {
  return Boolean(idictationFrequencySources);
}

export function primeIdictationFrequencyData(payload = {}) {
  return setIdictationFrequencySources(normalizeIdictationPayload(payload));
}

export async function ensureIdictationFrequencyData() {
  if (idictationFrequencySources) return idictationFrequencySources;
  if (idictationFrequencyLoadPromise) return idictationFrequencyLoadPromise;

  idictationFrequencyLoadPromise = (async () => {
    if (typeof window !== "undefined" && typeof fetch === "function") {
      const response = await fetch("/data/idictation-frequency.json", { cache: "force-cache" });
      if (!response.ok) throw new Error(`Failed to load idictation frequency data: ${response.status}`);
      return setIdictationFrequencySources(normalizeIdictationPayload(await response.json()));
    }

    const generated = await import("./idictation-frequency.generated.mjs");
    return setIdictationFrequencySources(generated.IDICTATION_FREQUENCY_SOURCES);
  })().finally(() => {
    idictationFrequencyLoadPromise = null;
  });

  return idictationFrequencyLoadPromise;
}

export const IDICTATION_PRACTICE_SOURCES = [
  { value: "idictation_listening", sourceKey: "listening", label: "爱听写听力" },
  { value: "idictation_reading", sourceKey: "reading", label: "爱听写阅读" }
];

export function isIdictationPracticeSource(value = "") {
  return IDICTATION_PRACTICE_SOURCES.some((source) => source.value === value);
}

export function idictationSourceKeyFromPracticeSource(value = "") {
  return IDICTATION_PRACTICE_SOURCES.find((source) => source.value === value)?.sourceKey || "";
}

export function getIdictationSource(sourceKey = "") {
  return idictationFrequencySources?.[sourceKey] || null;
}

export function normalizeIdictationChapterLabel(chapter = "") {
  return String(chapter || "").split("|")[0].trim();
}

export function chaptersForEntry(entry) {
  const raw = String(entry?.sourceChapter || "");
  if (!raw) return [];
  const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : [raw.trim()];
}

export function entryMatchesChapter(entry, chapter = "") {
  const target = String(chapter || "").trim();
  if (!target) return false;
  return chaptersForEntry(entry).includes(target);
}

export function idictationChapterGroupKey(chapter = "") {
  return `chapter:${String(chapter || "").trim()}`;
}

export function idictationChapterFromGroupKey(groupKey = "") {
  const value = String(groupKey || "");
  return value.startsWith("chapter:") ? value.slice("chapter:".length) : "";
}

function parseChapterFrequencyScore(chapter = "") {
  const value = String(chapter || "");
  if (value.includes("词组")) {
    const match = value.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  }
  const range = value.match(/(\d+)(?:~(\d+))?次/);
  if (range) return Number(range[2] || range[1]);
  const single = value.match(/^(\d+)次/);
  if (single) return Number(single[1]);
  return 0;
}

export function chapterSortRank(chapter = "", sourceKey = "") {
  const value = String(chapter || "");
  if (sourceKey === "listening") {
    if (value.includes("答案词")) return [0, -parseChapterFrequencyScore(value)];
    if (value.includes("听力原文")) return [1, -parseChapterFrequencyScore(value)];
    if (value.includes("词组")) return [2, -parseChapterFrequencyScore(value)];
    return [3, 0];
  }
  if (value.includes("词组")) return [1, -parseChapterFrequencyScore(value)];
  return [0, -parseChapterFrequencyScore(value)];
}

/** 刷单词：保留 9 档频率分组 */
export function listIdictationFrequencyGroupOptions(sourceKey = "") {
  const source = getIdictationSource(sourceKey);
  return (source?.groups || []).map((group) => ({
    value: group.key,
    label: `${group.label} · ${group.count}词`,
    count: group.count,
    batchCount: group.batchCount,
    mode: "frequency"
  }));
}

/** 拼写：按 Excel 原表章节展示 */
export function listIdictationChapterGroupOptions(sourceKey = "") {
  const source = getIdictationSource(sourceKey);
  const byChapter = new Map();

  for (const entry of source?.entries || []) {
    for (const chapter of chaptersForEntry(entry)) {
      if (!byChapter.has(chapter)) {
        byChapter.set(chapter, {
          value: idictationChapterGroupKey(chapter),
          label: chapter,
          count: 0,
          rank: chapterSortRank(chapter, sourceKey)
        });
      }
      byChapter.get(chapter).count += 1;
    }
  }

  return Array.from(byChapter.values())
    .sort((a, b) => {
      for (let index = 0; index < Math.max(a.rank.length, b.rank.length); index += 1) {
        const left = a.rank[index] ?? 0;
        const right = b.rank[index] ?? 0;
        if (left !== right) return left - right;
      }
      return a.label.localeCompare(b.label, "zh-Hans-CN");
    })
    .map((group) => ({
      value: group.value,
      label: `${group.label} · ${group.count}词`,
      count: group.count,
      batchCount: 1,
      mode: "chapter"
    }));
}

/** 拼写页默认：原表章节 */
export function listIdictationGroupOptions(sourceKey = "") {
  const chapterGroups = listIdictationChapterGroupOptions(sourceKey);
  if (chapterGroups.length) return chapterGroups;
  return listIdictationFrequencyGroupOptions(sourceKey);
}

export function resolveIdictationGroupMode(groupKey = "") {
  const value = String(groupKey || "");
  if (value.startsWith("freq-")) return "frequency";
  if (value.startsWith("chapter:")) return "chapter";
  return "chapter";
}

export function normalizeIdictationPrefs(sourceKey = "", prefs = {}) {
  if (!getIdictationSource(sourceKey)) {
    return {
      groupKey: String(prefs.groupKey || ""),
      batchIndex: Math.max(0, Number(prefs.batchIndex) || 0)
    };
  }

  const requestedMode = resolveIdictationGroupMode(prefs.groupKey);
  const groups = requestedMode === "frequency"
    ? listIdictationFrequencyGroupOptions(sourceKey)
    : listIdictationGroupOptions(sourceKey);
  const groupKey = groups.some((group) => group.value === prefs.groupKey)
    ? prefs.groupKey
    : groups[0]?.value || "";

  return {
    groupKey,
    batchIndex: Math.max(0, Number(prefs.batchIndex) || 0)
  };
}

function entriesForGroup(sourceKey = "", groupKey = "") {
  const source = getIdictationSource(sourceKey);
  if (!source) return [];

  const chapter = idictationChapterFromGroupKey(groupKey);
  if (chapter) {
    return (source.entries || []).filter((entry) => entryMatchesChapter(entry, chapter));
  }

  return (source.entries || []).filter((entry) => entry.frequencyGroup === groupKey);
}

export function listIdictationBatchOptions(sourceKey = "", groupKey = "") {
  const entries = entriesForGroup(sourceKey, groupKey);
  const chapter = idictationChapterFromGroupKey(groupKey);

  if (chapter) {
    return [{ value: 0, label: `本章节 · ${entries.length}词`, count: entries.length }];
  }

  const batches = Math.max(1, Math.ceil(entries.length / IDICTATION_FREQUENCY_BATCH_SIZE));
  return Array.from({ length: batches }, (_, index) => {
    const start = index * IDICTATION_FREQUENCY_BATCH_SIZE;
    const count = entries.slice(start, start + IDICTATION_FREQUENCY_BATCH_SIZE).length;
    return {
      value: index,
      label: `第${index + 1}组 · ${count}词`,
      count
    };
  });
}

export function selectIdictationBatch(sourceKey = "", prefs = {}) {
  const source = getIdictationSource(sourceKey);
  const normalizedPrefs = normalizeIdictationPrefs(sourceKey, prefs);
  const groupMode = resolveIdictationGroupMode(normalizedPrefs.groupKey);
  const groupOptions = groupMode === "frequency"
    ? listIdictationFrequencyGroupOptions(sourceKey)
    : listIdictationGroupOptions(sourceKey);
  const selectedOption = groupOptions.find((item) => item.value === normalizedPrefs.groupKey) || groupOptions[0] || null;
  const chapter = idictationChapterFromGroupKey(selectedOption?.value || "");
  const entries = entriesForGroup(sourceKey, selectedOption?.value || "");
  const batchCount = chapter
    ? 1
    : Math.max(1, Math.ceil(entries.length / IDICTATION_FREQUENCY_BATCH_SIZE));
  const batchIndex = chapter
    ? 0
    : Math.min(normalizedPrefs.batchIndex, Math.max(0, batchCount - 1));
  const start = batchIndex * IDICTATION_FREQUENCY_BATCH_SIZE;
  const batchEntries = chapter ? entries : entries.slice(start, start + IDICTATION_FREQUENCY_BATCH_SIZE);

  return {
    entries: batchEntries,
    sourceKey,
    sourceValue: source?.source || "",
    label: source?.label || "",
    groupKey: selectedOption?.value || "",
    groupLabel: selectedOption?.label || "",
    batchIndex,
    batchSize: chapter ? entries.length : IDICTATION_FREQUENCY_BATCH_SIZE,
    totalInCategory: entries.length,
    batchCount,
    batchEntryCount: batchEntries.length,
    rawRows: source?.rawRows || 0,
    uniqueWords: source?.uniqueWords || 0,
    groupMode: chapter ? "chapter" : groupMode
  };
}
