import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(ROOT, "app/page.jsx");
const outPath = path.join(ROOT, "app/components/WordFlashcardView.jsx");
const page = fs.readFileSync(pagePath, "utf8");

if (page.includes("<WordFlashcardView") && fs.existsSync(outPath)) {
  console.log(JSON.stringify({ ok: true, skipped: true }, null, 2));
  process.exit(0);
}

const lines = page.split(/\r?\n/);
const start = lines.findIndex((l) => l.includes('className="word-flash-shell"'));
const edit = lines.findIndex((l, i) => i > start && l.includes("<WordEditModal"));
if (start < 0 || edit < 0) throw new Error("markers missing");

let shellEnd = edit - 1;
while (shellEnd > start && lines[shellEnd].trim() === "") shellEnd -= 1;

const shell = lines.slice(start, shellEnd + 1).join("\n");
const shellFixed = shell.replace(/actions=\{\{[\s\S]*?\}\}/m, "actions={adminActions}");

const component = `"use client";

import StudyRangeSummary from "./StudyRangeSummary";
import VirtualList from "./VirtualList";
import VocabAdminToolsPanel from "./VocabAdminToolsPanel";

/** Word flashcard shell UI (v2026-07-10.3) */
export default function WordFlashcardView(p) {
  const {
    prevItem, item, filter, studyWords, learningEntryGroups,
    toolsMenuRef, aiToolsRef, loading, pasteText, setPasteText,
    lastLocalChange, audioCacheStats, audioStats, batchInfo, duplicateInfo,
    isExternalIdictationItem, adminActions, wordLibraryStats, familiarCount,
    missingCount, classifyMissingCount, search, setSearch, setLibraryFilter,
    filteredWordIndices, activeWordPool, activeWordByIndex, index, setIndex,
    studySessionRef, latestStateRef, persistWordFlashSessionNow,
    getFilterName, filterKey, isSameFilter, resolveStudyWordEntry, studyRangeDetail,
    isStudyEmpty, toggleFavorite, speakExample, speakWord, speakSmallText, fallback,
    meaningDetailOpen, setMeaningDetailOpen, displayForms, displayFamily,
    commonCollocations, phraseCollocations, collocationFallback, phraseCollocationFallback,
    markStatus, progressPercent, safeStudyPosition, TOPIC_OPTIONS, DIFFICULTY_OPTIONS,
    IDICTATION_FLASH_FILTERS, shuffleStudyWords
  } = p;

  return (
${shellFixed
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
  );
}
`;

fs.writeFileSync(outPath, component, "utf8");

const replacement = `        <WordFlashcardView
          prevItem={prevItem}
          item={item}
          filter={filter}
          studyWords={studyWords}
          learningEntryGroups={learningEntryGroups}
          toolsMenuRef={toolsMenuRef}
          aiToolsRef={aiToolsRef}
          loading={loading}
          pasteText={pasteText}
          setPasteText={setPasteText}
          lastLocalChange={lastLocalChange}
          audioCacheStats={audioCacheStats}
          audioStats={audioStats}
          batchInfo={batchInfo}
          duplicateInfo={duplicateInfo}
          isExternalIdictationItem={isExternalIdictationItem}
          adminActions={{
              importFromText, handleFile, openEditCurrentWord, deleteCurrentWord,
              downloadVocabBackup, exportStaticSite, downloadBlankVocabTemplateCsv,
              importTemplateVocabFile, importVocabBackup, downloadEnglishOnlyTxt,
              undoLastLocalChange, clearLastLocalChangeLog, undoOneLocalChangeItem,
              localOptimizeWordList, localCleanWordList, localDedupeWords, localMergeWordForms,
              localScanAndRepairWrongWords, localRepairTruncatedHeadwords, localScanTtsSymbols,
              confirmAiCost, aiRepairCurrentWordSymbol, clearWrongAiRepairFlags,
              localScanObscureDerivedWords, localDeleteObscureDerivedWords,
              refreshAudioCacheStats, cleanupFallbackAudioCache, retryRealAudioForCurrentLibrary,
              prefillWordAudio, rebuildRealAudioFromStart, rebuildMissingAudioFromStart,
              clearRealAudioPrefillCursor, clearAudioPrefillCursor, dedupeLocalAudio,
              recoverWordsFromLocalFiles, recoverWordsFromTencentCloud, cleanBrowserStorageNow,
              downloadBlankVocabTemplateJson, exportJSON, generateCurrent, generateHundredByFiveBatch,
              aiSlowCompleteMissing10x1, aiCompletePendingAndUnclassifiedOneByOne,
              aiStableRepairWrongWords10x2, categorizeWords
          }}
          wordLibraryStats={wordLibraryStats}
          familiarCount={familiarCount}
          missingCount={missingCount}
          classifyMissingCount={classifyMissingCount}
          search={search}
          setSearch={setSearch}
          setLibraryFilter={setLibraryFilter}
          filteredWordIndices={filteredWordIndices}
          activeWordPool={activeWordPool}
          activeWordByIndex={activeWordByIndex}
          index={index}
          setIndex={setIndex}
          studySessionRef={studySessionRef}
          latestStateRef={latestStateRef}
          persistWordFlashSessionNow={persistWordFlashSessionNow}
          getFilterName={getFilterName}
          filterKey={filterKey}
          isSameFilter={isSameFilter}
          resolveStudyWordEntry={resolveStudyWordEntry}
          studyRangeDetail={studyRangeDetail}
          isStudyEmpty={isStudyEmpty}
          toggleFavorite={toggleFavorite}
          speakExample={speakExample}
          speakWord={speakWord}
          speakSmallText={speakSmallText}
          fallback={fallback}
          meaningDetailOpen={meaningDetailOpen}
          setMeaningDetailOpen={setMeaningDetailOpen}
          displayForms={displayForms}
          displayFamily={displayFamily}
          commonCollocations={commonCollocations}
          phraseCollocations={phraseCollocations}
          collocationFallback={collocationFallback}
          phraseCollocationFallback={phraseCollocationFallback}
          markStatus={markStatus}
          progressPercent={progressPercent}
          safeStudyPosition={safeStudyPosition}
          TOPIC_OPTIONS={TOPIC_OPTIONS}
          DIFFICULTY_OPTIONS={DIFFICULTY_OPTIONS}
          IDICTATION_FLASH_FILTERS={IDICTATION_FLASH_FILTERS}
          shuffleStudyWords={shuffleStudyWords}
        />`;

let next = page;
if (!next.includes("import WordFlashcardView")) {
  next = next.replace(
    'import WordEditModal from "./components/WordEditModal";',
    `import WordEditModal from "./components/WordEditModal";
import WordFlashcardView from "./components/WordFlashcardView";`
  );
}

const nextLines = next.split(/\r?\n/);
const start2 = nextLines.findIndex((l) => l.includes('className="word-flash-shell"'));
const edit2 = nextLines.findIndex((l, i) => i > start2 && l.includes("<WordEditModal"));
let shellEnd2 = edit2 - 1;
while (shellEnd2 > start2 && nextLines[shellEnd2].trim() === "") shellEnd2 -= 1;

const out = [
  ...nextLines.slice(0, start2),
  ...replacement.split("\n"),
  ...nextLines.slice(shellEnd2 + 1)
].join("\n");

fs.writeFileSync(pagePath, out, "utf8");
console.log(
  JSON.stringify(
    {
      ok: true,
      shellLines: shellEnd2 - start2 + 1,
      pageLines: out.split("\n").length,
      componentLines: component.split("\n").length
    },
    null,
    2
  )
);
