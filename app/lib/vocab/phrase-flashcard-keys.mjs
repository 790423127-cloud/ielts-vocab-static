import { progressStorageKey } from "./progress-schema.mjs";

/** Independent storage namespace for phrase flashcard mode (never shared with word flashcards). */

export const PHRASE_FLASH_STUDY_MODE_KEY = "ielts_flash_study_mode_v1";

export const PHRASE_FLASHCARD_SESSION_KEY = "ielts_phrase_flashcard_session_v1";
export const PHRASE_FLASHCARD_POSITIONS_KEY = "ielts_phrase_flashcard_positions_v1";
export const PHRASE_FLASHCARD_PROGRESS_SESSION_KEY = progressStorageKey("flashcard", "phrase", "session");
export const PHRASE_FLASHCARD_PROGRESS_POSITIONS_KEY = progressStorageKey("flashcard", "phrase", "positions");
export const PHRASE_FLASHCARD_STATUS_KEY = "ielts_phrase_flashcard_status_v1";
export const PHRASE_FLASHCARD_DAILY_KEY = "ielts_phrase_flashcard_daily_v1";
export const PHRASE_FLASHCARD_REVIEW_QUEUE_KEY = "ielts_phrase_flashcard_review_queue_v1";

export const PHRASE_FLASHCARD_DB = "ielts_phrase_flashcard_store_v1";
export const PHRASE_FLASHCARD_STORE = "kv";
export const PHRASE_FLASHCARD_META_KEY = "phrases_meta_v1";
export const PHRASE_FLASHCARD_CHUNK_PREFIX = "phrases_chunk_v1_";
export const PHRASE_FLASHCARD_CHUNK_SIZE = 200;

/** Word flashcard keys (read-only reference; do not reuse for phrases). */
export const WORD_FLASHCARD_KEYS = [
  "ielts_vocab_session_v1",
  "ielts_vocab_entry_positions_v1",
  "ielts_vocab_big_store_v1"
];