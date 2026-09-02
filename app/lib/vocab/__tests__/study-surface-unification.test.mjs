import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStudyEntryDisplay } from "../study-entry-display.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("all flashcard surfaces use the shared keyboard resolver without delayed status callbacks", () => {
  const dynamicFiles = [
    "app/basic/page.jsx",
    "app/reading-g/page.jsx",
    "app/components/PhraseFlashcardPanel.jsx"
  ];
  for (const file of dynamicFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /event\.key === "0"/, `${file} must not keep the legacy 0 shortcut`);
    assert.doesNotMatch(source, /setTimeout\(\(\) => \{\s*const nextList = build(?:Rg)?StudyList/, `${file} must not defer queue decisions`);
  }

  const basic = read("app/basic/page.jsx");
  const readingG = read("app/reading-g/page.jsx");
  assert.match(basic, /getStudyKeyboardAction\(event, \{ verticalNavigation: true \}\)/);
  assert.match(basic, /action === "known"[\s\S]*status\.FAMILIAR/);
  assert.match(basic, /action === "unknown"[\s\S]*status\.UNFAMILIAR/);
  assert.match(readingG, /getStudyKeyboardAction\(event, \{ verticalNavigation: true \}\)/);
  assert.match(readingG, /action === "known"[\s\S]*RG_STATUS\.FAMILIAR/);
  assert.match(readingG, /action === "unknown"[\s\S]*RG_STATUS\.UNFAMILIAR/);

  for (const file of ["public/assets/basic.js", "public/assets/ielts-538.js", "public/assets/reading-g.js"]) {
    const source = read(file);
    assert.match(source, /(?:e|event)\.key === "1"/);
    assert.match(source, /(?:e|event)\.key === "3"/);
    assert.doesNotMatch(source, /(?:e|event)\.key === "0"/);
  }
});

test("reading notebooks expose the same resumable 1/2/3, swipe, and progress controls", () => {
  const dynamicParaphrases = read("app/reading-paraphrases/page.jsx");
  const dynamicWords = read("app/reading-words/page.jsx");
  const staticParaphrases = read("public/assets/reading-paraphrases.js");
  const staticWords = read("public/assets/reading-words.js");
  const staticNavigation = read("public/assets/static-navigation.js");

  for (const source of [dynamicParaphrases, dynamicWords]) {
    assert.match(source, /getStudyKeyboardAction/);
    assert.match(source, /WORD_CARD_SWIPE_EVENT/);
    assert.match(source, /data-word-swipe-card/);
  }
  assert.match(dynamicWords, /WordStudyProgress/);
  assert.match(dynamicWords, /readReadingWordsSession/);
  assert.match(dynamicWords, /writeReadingWordsSession/);
  assert.match(dynamicWords, /markSelectedStatus/);
  assert.match(staticParaphrases, /action==="known"/);
  assert.match(staticParaphrases, /action==="fuzzy"/);
  assert.match(staticParaphrases, /action==="unfamiliar"/);
  assert.match(staticNavigation, /data-static-swipe-card/);
  assert.match(staticNavigation, /STATIC_SWIPE_VERSION = "touch-pointer-v5"/);
  assert.match(staticNavigation, /window\.StaticCardSwipe/);
  assert.match(staticNavigation, /data-static-swipe-handle/);
  assert.match(staticNavigation, /suppressClickUntil/);
  assert.match(staticNavigation, /addEventListener\("pointerdown"/);
  assert.match(staticNavigation, /addEventListener\("pointerup"/);
  assert.match(staticNavigation, /addEventListener\("touchstart"/);
  assert.match(staticNavigation, /touchAction = "pan-y"/);
  assert.match(staticNavigation, /button,a,input,textarea,select,option,label,summary,details/);
  for (const file of [
    "public/basic.html",
    "public/ielts-538.html",
    "public/reading-g.html",
    "public/reading-paraphrases.html",
    "public/reading-words.html"
  ]) {
    assert.match(read(file), /data-static-swipe-card/, `${file} must opt into the shared static swipe controller`);
  }
  assert.match(
    read("public/reading-g.html"),
    /id="staticStudyCard"[\s\S]*id="swipeArea"[\s\S]*id="relationBlocks"[\s\S]*<\/div>[\s\S]*<footer class="bottom"/,
    "G reading relations must remain inside the shared swipe card"
  );
  assert.match(staticWords, /READING_SESSION_KEY/);
  assert.match(staticWords, /function seekStudyPosition/);
  assert.match(staticWords, /progressSeek\.onchange/);
});

test("reading word notebook uses the shared flashcard workspace without card/list overlap", () => {
  const workspace = read("app/components/WordStudyWorkspace.jsx");
  const page = read("app/reading-words/page.jsx");
  const css = read("app/reading-words/reading-words.module.css");
  const globalCss = read("app/globals.css");

  assert.match(workspace, /studyColumnClassName/);
  assert.match(page, /<WordStudyWorkspace/);
  assert.match(page, /studyColumnClassName=\{styles\.studyColumn\}/);
  assert.match(page, /word-insight-panel--persistent/);
  assert.match(page, /actions=\{studyToolbar\}/);
  assert.doesNotMatch(page, /<div className=\{styles\.workspace\}>/);
  assert.match(css, /\.toolbar\s*\{[\s\S]*?flex-direction:\s*row;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.searchBox\s*\{\s*display:\s*none;/);
  assert.match(css, /不覆盖 word-study-card \/ example \/ word-study-content：完全用 globals 主词库样式/);
  assert.match(globalCss, /\.word-study-content\s*\{[\s\S]*?width:\s*min\(1100px, 100%\);/);
  assert.match(css, /data-adaptive-shell="compact"[\s\S]*?\.workspace\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?word-study-layout[\s\S]*?> \.wordList\s*\{[\s\S]*?display:\s*flex;/);
});

test("G reading library can hold an explicitly selected entry outside the active study queue", () => {
  const source = read("app/reading-g/page.jsx");
  assert.match(source, /libraryBrowseEntryIdRef = useRef\(""\)/);
  assert.match(source, /libraryBrowseEntryIdRef\.current === focusedId/);
  assert.match(source, /libraryBrowseEntryIdRef\.current = studyList\.some/);
  assert.match(source, /familiarLabel=\{isQuizMode \? "掌握" : "认识"\}/);
});

test("global search library details hide internal relation and source metadata", () => {
  const source = read("app/components/SatelliteLexiconFlashcard.jsx");
  assert.match(source, /CURRENT_SYSTEM_SEARCH_REQUEST_EVENT/);
  assert.doesNotMatch(source, /4\. 同义替换关系/);
  assert.doesNotMatch(source, /5\. 来源信息/);
  assert.doesNotMatch(source, /本词暂无高可信同义关系|质量标记|aria-label="来源文件"/);
});

test("basic and 538 keep their concise card shape while G reading owns morphology panels", () => {
  const source = read("app/components/SatelliteLexiconFlashcard.jsx");
  assert.match(source, /const morphologyBlocks = \([\s\S]*\{isReadingG \? \(/);
  assert.match(source, /className="block relation-block--forms"/);
  assert.match(source, /className="block relation-block--family"/);
  assert.match(source, /className="block relation-block--synonyms"/);
  assert.doesNotMatch(source, /\{isIelts538 \? \([\s\S]*block-title">变形/);
  assert.match(source, /isReadingG && headwordText\.length > 9 \? "word--wide"/);
  assert.doesNotMatch(source, /isIelts538 && headwordText\.length > 9/);
  assert.match(source, /String\(row\.meaning \|\| row\.meaningZh \|\| ""\)\.trim\(\)/);
  assert.match(source, /!displayedFormKeys\.has\(String\(row\.word \|\| ""\)\.toLowerCase\(\)\)/);
});

test("538 shares the outer study workspace while keeping its specialist content inside the card", () => {
  const source = read("app/components/SatelliteLexiconFlashcard.jsx");
  const css = read("app/globals.css");
  const staticHtml = read("public/ielts-538.html");
  assert.match(source, /const insightVisible = showInsight;/);
  assert.match(source, /isIelts538 && selectedRelatedWord/);
  assert.match(source, /\? "ielts-538-related-wrap"/);
  assert.doesNotMatch(css, /\.ielts-538-study \.word-study-layout/);
  assert.doesNotMatch(css, /\.ielts-538-study \.word-study-column/);
  assert.match(staticHtml, /body class="basic-static ielts-538-static"/);
  assert.match(staticHtml, /main class="app" data-study-surface="ielts-538"/);
  assert.match(staticHtml, /id="basicTopbar" class="top basic-topbar"/);
  assert.match(staticHtml, /id="studyCard" class="hero" data-static-swipe-card/);
  assert.match(staticHtml, /footer class="bottom"/);
  assert.match(staticHtml, /id="paraphrase" class="forms-box study538-para/);
  assert.match(staticHtml, /class="forms-box study538-related/);
});

test("main and G reading scale medium-long headwords on mobile without changing basic or 538 cards", () => {
  const staticHomeRuntime = read("app/lib/static-home-app-template.mjs");
  assert.match(read("app/components/WordStudyContent.jsx"), /displayHeadword\.length > 9 \? "word--wide"/);
  assert.match(staticHomeRuntime, /classList\.toggle\("word--wide",renderedHeadword\.trim\(\)\.length>9\)/);
  assert.match(read("app/globals.css"), /word\.word--wide:not\(\.word--long\):not\(\.word--alternatives\)/);
});

test("menu panels wrap inherited toolbar text without horizontal scrolling", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.menu-panel\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;[\s\S]*?white-space:\s*normal;/);
});

test("G reading relation panels render every row and wrap every detail without clipping", () => {
  const source = read("app/components/SatelliteLexiconFlashcard.jsx");
  const css = read("app/globals.css");
  const relationSetup = source.match(
    /const normalizedForms =[\s\S]*?const readingGSynonymStatus =/
  )?.[0] || "";

  assert.match(relationSetup, /const displayForms = normalizedForms;/);
  assert.doesNotMatch(relationSetup, /\.slice\(/);
  assert.match(
    css,
    /\.g-reading-relation-grid \.zh\s*\{[\s\S]*?overflow:\s*visible;[\s\S]*?text-overflow:\s*clip;[\s\S]*?white-space:\s*normal;/
  );
  assert.match(
    css,
    /\.g-reading-relation-grid \.list\s*\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/
  );
  assert.match(css, /\.g-reading-relation-grid \.block\s*\{[\s\S]*?height:\s*auto;/);
  assert.match(
    read("public/assets/study-system.css"),
    /main\[data-study-surface="reading-g"\][\s\S]*?\.word-study-content > :nth-child\(4\) > \.footer-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/
  );
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.g-reading-relation-grid \.list\s*\{[\s\S]*?grid-auto-rows:\s*max-content;[\s\S]*?align-content:\s*start;/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.g-reading-relation-grid \.zh\s*\{[\s\S]*?flex:\s*0 1 auto;/);
});

test("empty relation cards stay hidden globally and populated cards reflow into the free space", () => {
  const sharedGrid = read("app/components/WordDetailGrid.jsx");
  const readingWordsPage = read("app/reading-words/page.jsx");
  const satellite = read("app/components/SatelliteLexiconFlashcard.jsx");
  const globalCss = read("app/globals.css");
  const staticReadingWords = read("public/assets/reading-words.js");
  const staticReadingWordsCss = read("public/assets/reading-words.css");
  const staticReadingG = read("public/assets/reading-g.js");

  assert.match(readingWordsPage, /variant="reading-words"/);
  assert.match(readingWordsPage, /synonymItems=\{selectedSynonymItems\}/);
  assert.doesNotMatch(readingWordsPage, /commonCollocations=\{\(selectedStudyWord/);
  assert.match(
    read("public/assets/study-system.css"),
    /main\[data-study-surface="reading-words"\][\s\S]*?\.word-dictionary-grid--reading\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/
  );
  assert.match(sharedGrid, /variant = "main"/);
  assert.match(sharedGrid, /const includePhraseCollocations = variant === "main";/);
  assert.match(sharedGrid, /includePhraseCollocations && phraseItems\.length/);
  assert.match(sharedGrid, /id="word-dictionary-phrases-panel" title="短语搭配"/);
  assert.match(sharedGrid, /variant !== "legacy-collocations"/);
  assert.match(sharedGrid, /\{forms\.length \? <FormsPanel/);
  assert.match(sharedGrid, /\{familyRows\.length \? <FamilyPanel/);
  assert.match(sharedGrid, /\{synonyms\.length \? \(/);
  assert.doesNotMatch(sharedGrid, /当前词暂无重要变形|当前词暂无词族信息|当前词暂无同义替换/);
  assert.match(satellite, /const hasReadingGRelations = hasReadingGForms \|\| hasReadingGFamily \|\| hasReadingGSynonyms;/);
  assert.match(satellite, /\{hasReadingGForms \? \(/);
  assert.match(satellite, /\{hasReadingGFamily \? \(/);
  assert.match(satellite, /\{hasReadingGSynonyms \? \(/);
  assert.match(globalCss, /word-dictionary-grid[\s\S]*?repeat\(auto-fit, minmax\(min\(/);
  assert.match(staticReadingWords, /section\.hidden = entry\[1\]\.length === 0/);
  assert.match(staticReadingWordsCss, /detail-grid\{[^\n]*repeat\(auto-fit/);
  assert.match(staticReadingG, /if \(!rows\.length\) return false;/);
  assert.match(staticReadingG, /classList\.toggle\("hidden", renderedCount === 0\)/);
});

test("all study surfaces append supplemental meanings to the primary meaning without a standalone card", () => {
  const sharedMeaning = read("app/components/InlineStudyMeaning.jsx");
  const wordStudy = read("app/components/WordStudyContent.jsx");
  const satellite = read("app/components/SatelliteLexiconFlashcard.jsx");
  const globalCss = read("app/globals.css");
  const exportRoute = read("app/api/export-static/route.js");
  const staticHomeRuntime = read("app/lib/static-home-app-template.mjs");
  const staticReadingG = read("public/assets/reading-g.js");
  const staticReadingGHtml = read("public/reading-g.html");
  const staticReadingWords = read("public/assets/reading-words.js");

  assert.match(sharedMeaning, /meaning-inline-supplemental/);
  assert.match(sharedMeaning, /meaning-inline-separator/);
  assert.match(globalCss, /\.meaning-inline-supplemental\s*\{[^}]*color:\s*inherit;[^}]*font-family:\s*inherit;[^}]*font-size:\s*inherit;[^}]*font-weight:\s*inherit;/s);
  assert.match(globalCss, /\.meaning-inline-separator\s*\{[^}]*color:\s*inherit;[^}]*font-weight:\s*inherit;/s);
  assert.match(wordStudy, /<InlineStudyMeaning/);
  assert.match(satellite, /<InlineStudyMeaning/);
  assert.doesNotMatch(wordStudy, /meaning-other|其他释义/);
  assert.doesNotMatch(satellite, /showSupplementalSenses|补充义项|其他释义|熟词生义/);

  assert.match(exportRoute, /supplementalMeanings: display\.supplementalSenses/);
  assert.match(staticHomeRuntime, /function inlineStudyMeaning\(item\)/);
  assert.match(staticReadingG, /function inlineStaticStudyMeaning\(/);
  assert.doesNotMatch(staticReadingG, /renderStaticSenseHint|senseHint|其他义项/);
  assert.doesNotMatch(staticReadingGHtml, /senseHint|sense-hint/);
  assert.match(staticReadingWords, /function inlineStudyMeaningText\(/);
  assert.match(staticReadingWords, /els\.meaningText\.textContent = inlineStudyMeaningText\(current\)/);
});

test("formal lexicon sources stay identical and corrected entries have aligned POS, senses, and examples", () => {
  const publicRaw = fs.readFileSync(path.join(root, "public/data/words.json"));
  const cacheRaw = fs.readFileSync(path.join(root, ".static-export-cache/words.json"));
  assert.equal(crypto.createHash("sha256").update(publicRaw).digest("hex"), crypto.createHash("sha256").update(cacheRaw).digest("hex"));

  const main = JSON.parse(publicRaw.toString("utf8"));
  const readingG = JSON.parse(read("public/data/reading-g-vocab.json"));
  for (const items of [main.words, readingG.items]) {
    const publishing = items.find((entry) => entry.word === "publishing");
    const alongside = items.find((entry) => entry.word === "alongside");
    const publishingDisplay = getStudyEntryDisplay(publishing);
    const alongsideDisplay = getStudyEntryDisplay(alongside);
    assert.equal(publishingDisplay.pos, "noun");
    assert.equal(publishingDisplay.meaning, "出版；出版业");
    assert.equal(publishingDisplay.needsSenseSplit, false);
    assert.equal(alongsideDisplay.pos, "preposition");
    assert.equal(alongsideDisplay.supplementalSenses[0]?.pos, "adverb");
    assert.equal(alongsideDisplay.needsSenseSplit, false);
  }
});
