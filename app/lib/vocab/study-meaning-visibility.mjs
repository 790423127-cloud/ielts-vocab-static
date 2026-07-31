export const STUDY_MEANING_VISIBILITY_KEY = "ielts_vocab_hide_meanings_v1";
export const STUDY_MEANING_VISIBILITY_EVENT = "ielts:study-meaning-visibility";

export function readStudyMeaningsHidden(storageGet) {
  try {
    return storageGet?.(STUDY_MEANING_VISIBILITY_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeStudyMeaningsHidden(hidden, storageSet) {
  try {
    storageSet?.(STUDY_MEANING_VISIBILITY_KEY, hidden ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}
