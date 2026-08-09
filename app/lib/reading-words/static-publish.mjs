import { createHash } from "crypto";

export const STATIC_READING_WORDS_PUBLISH_TYPE = "ielts-reading-words-static-publish";
export const STATIC_READING_WORDS_PUBLISH_VERSION = 1;

export function isReadingWordsTransferPackage(payload) {
  return (
    payload?.type === "ielts-reading-words-transfer" &&
    Number(payload?.version) === 1 &&
    Array.isArray(payload?.readingWords) &&
    Array.isArray(payload?.linkedMainEntries)
  );
}

export function wouldErasePublishedReadingWords(previous, next) {
  return Number(previous?.wordCount) > 0 && Number(next?.wordCount) === 0;
}

export function buildStaticReadingWordsPublishSnapshot(transfer, options = {}) {
  if (!isReadingWordsTransferPackage(transfer)) {
    throw new Error("静态发布包必须使用有效的阅读生词跨设备迁移格式");
  }

  const content = {
    readingWords: transfer.readingWords,
    linkedMainEntries: transfer.linkedMainEntries,
    sourceMainMeta: transfer.sourceMainMeta || {}
  };
  const revision = createHash("sha256")
    .update(JSON.stringify(content))
    .digest("hex");

  return {
    type: STATIC_READING_WORDS_PUBLISH_TYPE,
    version: STATIC_READING_WORDS_PUBLISH_VERSION,
    revision,
    sourceUpdatedAt: String(options.sourceUpdatedAt || new Date().toISOString()),
    publishedAt: String(options.publishedAt || new Date().toISOString()),
    wordCount: transfer.readingWords.length,
    transfer: {
      ...transfer,
      readingWords: transfer.readingWords,
      linkedMainEntries: transfer.linkedMainEntries,
      sourceMainMeta: transfer.sourceMainMeta || {}
    }
  };
}
