/**
 * Single source of truth for master lexicon expectations.
 * Update this when the authoritative words.json count/version intentionally changes.
 */
export const MASTER_LEXICON_EXPECTED_COUNT = 13808;

/**
 * Canonical version label for the master lexicon (count-aligned).
 * Legacy alias kept for one release of migration notes.
 */
export const MASTER_LEXICON_VERSION = "v8-13808-master-lexicon-v1";
export const MASTER_LEXICON_VERSION_LEGACY = "v7-13795-excel-listening-reading-writing-v1";

export const MASTER_LEXICON_CACHE_RELATIVE = ".static-export-cache/words.json";
export const MASTER_LEXICON_PUBLIC_RELATIVE = "public/data/words.json";
