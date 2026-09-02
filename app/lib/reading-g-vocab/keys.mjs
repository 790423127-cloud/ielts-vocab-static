/** Storage keys for IELTS G-class Reading vocab v3 data / v4 progress. */

export const READING_G_DATA_URL = "/data/reading-g-vocab.json?v=20260824-ai-coach-logic-v70";
export const READING_G_VOCAB_CACHE_KEY = "reading-g-vocab:normalized:20260824-ai-coach-logic-v70";
export const READING_G_PARAPHRASES_URL = "/data/reading-g-paraphrases.json";
export const READING_G_QUESTION_EVIDENCE_URL = "/data/reading-g-question-evidence.json";
export const READING_G_REPORT_URL = "/data/reading-g-import-report.json";

/** Dataset schema stays v3 — do not bump */
export const DATA_SCHEMA_VERSION = 3;
/** Progress / status schema v4 (stable keys + separated statuses) */
export const PROGRESS_SCHEMA_VERSION = 4;
export const DATASET_VERSION = "reading-g-core-v3";

/** Current progress keys (v4 logical; storage may still use v3 key names for continuity) */
export const READING_G_STATUS_KEY = "ielts_reading_g_status_v3";
export const READING_G_SESSION_KEY = "ielts_reading_g_session_v3";
export const READING_G_POSITIONS_KEY = "ielts_reading_g_positions_v3";
export const READING_G_DAILY_KEY = "ielts_reading_g_daily_v3";
export const READING_G_PARAPHRASE_STATUS_KEY = "ielts_reading_g_paraphrase_status_v3";
/** Paraphrase coverage cycle (seen ids + cycle order) — does not alter mastery status */
export const READING_G_PARA_COVERAGE_KEY = "ielts_reading_g_para_coverage_v1";
/** Paraphrase review metadata — independent from legacy paraphraseStatus */
export const READING_G_PARA_REVIEW_KEY = "ielts_reading_g_paraphrase_review_v1";
/** Resumable paraphrase learning session */
export const READING_G_PARA_SESSION_KEY = "ielts_reading_g_paraphrase_session_v1";

/** One-shot migration flags */
export const READING_G_MIGRATION_KEY = "ielts_reading_g_migration_v3";
export const READING_G_MIGRATION_V4_KEY = "ielts_reading_g_migration_v4";
// v5 remaps the old independent-form ids after they are compacted into the
// master lexicon's real headword.  The status payload schema itself stays v4.
export const READING_G_MIGRATION_V5_KEY = "ielts_reading_g_migration_v5";

/** Legacy keys for selective migration */
export const READING_G_STATUS_KEY_V1 = "ielts_reading_g_status_v1";
export const READING_G_SESSION_KEY_V1 = "ielts_reading_g_session_v1";
export const READING_G_POSITIONS_KEY_V1 = "ielts_reading_g_positions_v1";
export const READING_G_DAILY_KEY_V1 = "ielts_reading_g_daily_v1";
export const READING_G_STATUS_KEY_V2 = "ielts_reading_g_status_v2";
