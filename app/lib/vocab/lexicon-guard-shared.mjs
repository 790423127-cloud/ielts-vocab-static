export const LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES =
  "v1-10000-without-confirmed-person-names";

export const CONFIRMED_PERSON_NAME_WORDS = new Set([
  "stuart", "bonaparte", "anne", "christopher", "oliver", "alexander", "martin",
  "tom", "jone", "johnson", "gordon", "howard", "andy", "ruth", "luke", "adam", "harry",
  "colin", "laura", "dave", "thoma", "graham", "miller", "jame", "hong", "ann", "julie",
  "terry", "vera", "simon", "joe", "bernard", "elizabeth", "alan", "clarke", "alice",
  "davy", "taylor", "kelly", "tony", "owen", "nigel", "jackson", "fred", "ian", "anatole",
  "stephen", "helen", "neil", "brian", "charlie", "paul", "don", "emily", "smith", "roger",
  "kate", "arthur", "rachel", "boris", "keith", "watson", "margaret", "george", "maria",
  "sam", "lawrence", "francis", "lucy", "ken", "patrick", "andrew", "derek", "raf", "chris",
  "russell", "nick", "william", "nichola", "roosevelt", "hugh", "henry", "wilson",
  "dougla", "edward", "steve", "wright", "gary", "diana", "stewart", "susan"
]);

export const PENDING_PERSON_NAME_WORDS = new Set([
  "clare", "ford", "sherlock", "carolina", "holme", "jefferson", "victoria", "jan",
  "san", "lincoln", "lloyd", "maggie", "hamilton", "phil", "darl", "unus"
]);

const VERSION_RANK = new Map([
  ["", 0],
  ["v1-10000", 1],
  ["v1-10000-no-person-names", 2],
  [LEXICON_VERSION_WITHOUT_CONFIRMED_PERSON_NAMES, 3],
  ["v1-10500-gt-expansion", 4],
  ["v1-10500-gt-quality-recovery", 5],
  ["v1-10500-gt-p0-content-rebuild", 6],
  ["v1-10500-gt-codex-auto-repair", 7],
  ["v1-10500-gt-interjection-removal", 8],
  ["v1-10500-gt-truncation-fix", 9],
  ["v1-10500-gt-truncation-fix-v2", 10],
  ["v1-10500-gt-truncation-fix-v3", 11],
  ["v1-10500-gt-truncation-canonical-fix", 12],
  ["v1-10500-gt-grok-definition-upgrade", 13],
  ["v6-11532-listening-1179-deepseek", 14],
  ["v6-11532-listening-1179-deepseek-priority-v2", 15],
  ["v7-12885-excel-listening-reading-writing-v1", 16],
  ["v7-13795-excel-listening-reading-writing-v1", 17],
  ["v8-13808-master-lexicon-v1", 18]
]);

export function normalizeHeadword(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function lexiconVersionRank(version = "") {
  return VERSION_RANK.get(String(version || "").trim()) ?? 0;
}

export function findConfirmedPersonNamesInWords(words = []) {
  const found = [];
  for (const entry of words) {
    const normalized = normalizeHeadword(entry?.word);
    if (CONFIRMED_PERSON_NAME_WORDS.has(normalized)) {
      found.push(normalized);
    }
  }
  return found;
}

export function entryIntegrityFingerprint(entry = {}, originalIndex = 0) {
  return {
    id: String(entry?.id || entry?.wordId || ""),
    word: String(entry?.word || ""),
    definition: String(entry?.definition || ""),
    phonetic: String(entry?.phonetic || ""),
    example: String(entry?.example || ""),
    category: String(entry?.category || ""),
    difficulty: String(entry?.difficulty || ""),
    topics: Array.isArray(entry?.topics) ? [...entry.topics].sort() : [],
    originalIndex: Number(originalIndex)
  };
}
