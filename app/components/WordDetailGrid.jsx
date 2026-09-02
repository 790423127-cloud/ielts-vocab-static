"use client";

import { GitBranch, Network, PanelsTopLeft, Replace, Volume2 } from "lucide-react";
import { normalizeAiPhraseItems } from "../lib/vocab/admin-ai-content-profile.mjs";
import {
  getFormChineseType,
  getFormExplanation,
  getFormHint,
  getPosDisplay
} from "../lib/vocab/page-word-helpers.mjs";

function DetailCard({ id, title, icon: Icon, children, compact = false }) {
  return (
    <section id={id} className="word-dictionary-module" aria-label={title}>
      <h3><Icon aria-hidden="true" />{title}</h3>
      <div className={`word-dictionary-content${compact ? " word-dictionary-content--compact" : ""}`}>
        {children}
      </div>
    </section>
  );
}

function PhraseRows({ items, typeLabel, speechLabel, speakSmallText }) {
  return items.map((pair) => (
    <div className="word-dictionary-row" key={`${pair.phrase}-${pair.chinese}`}>
      <span>{typeLabel}</span>
      <button
        type="button"
        disabled={!pair.phrase}
        onClick={() => speakSmallText(pair.phrase, speechLabel)}
      >
        <Volume2 aria-hidden="true" />
        <span className="word-dictionary-row__term">{pair.phrase}</span>
      </button>
      <small>{pair.chinese || ""}</small>
    </div>
  ));
}

function normalizeFormRows(displayForms = []) {
  return (Array.isArray(displayForms) ? displayForms : []).map((form) => (
    typeof form === "string"
      ? { word: form.trim() }
      : { ...form, word: String(form?.word || "").trim() }
  )).filter((form) => form?.word);
}

function normalizeFamilyRows(displayFamily = []) {
  return (Array.isArray(displayFamily) ? displayFamily : []).map((family) => (
    typeof family === "string"
      ? { word: family.trim() }
      : { ...family, word: String(family?.word || "").trim() }
  )).filter((family) => family?.word);
}

function normalizeSynonymRows(item = {}, synonymItems = []) {
  const explicit = Array.isArray(synonymItems) ? synonymItems : [];
  const details = Array.isArray(item?.synonymDetails) ? item.synonymDetails : [];
  const source = explicit.length
    ? explicit
    : details.length
      ? details
      : Array.isArray(item?.synonyms)
        ? item.synonyms
        : [];

  const detailByWord = new Map(details.map((entry) => [
    String(entry?.word || entry?.replacement || "").trim().toLowerCase(),
    entry
  ]));

  return source.map((entry) => {
    const word = typeof entry === "string"
      ? entry.trim()
      : String(entry?.word || entry?.replacement || "").trim();
    const detail = detailByWord.get(word.toLowerCase()) || entry || {};
    return {
      word,
      meaning: String(
        detail?.meaning || detail?.meaningZh || detail?.meaning_zh || detail?.chinese || ""
      ).trim(),
      replacementType: String(detail?.replacementType || detail?.replacement_type || "").trim() === "phrase" || /\s/.test(word)
        ? "phrase"
        : "word"
    };
  }).filter((entry, index, rows) => (
    entry.word
    && entry.word.toLowerCase() !== String(item?.word || "").trim().toLowerCase()
    && rows.findIndex((candidate) => candidate.word.toLowerCase() === entry.word.toLowerCase()) === index
  ));
}

function FormsPanel({ item, forms, speakSmallText }) {
  return (
    <DetailCard id="word-dictionary-forms-panel" title="变形" icon={GitBranch} compact={forms.length <= 2}>
      {forms.map((form) => (
        <div className="word-dictionary-row" key={`${form.word}-${form.type || form.note || ""}`}>
          <span>{getFormChineseType(form.type, {
            baseWord: item?.word,
            formWord: form.word,
            pos: item?.primaryPos || item?.pos
          }) || "变形"}</span>
          <button type="button" onClick={() => speakSmallText(form.word, "变形")}>
            <Volume2 aria-hidden="true" />
            <span className="word-dictionary-row__term">{form.word}</span>
          </button>
          <small>
            {[getFormHint(form, {
              baseWord: item?.word,
              formWord: form.word,
              pos: item?.primaryPos || item?.pos
            }), getFormExplanation(item?.word, item?.meaning, form, item?.primaryPos || item?.pos)]
              .filter(Boolean)
              .join(" · ") || form.note || ""}
          </small>
        </div>
      ))}
    </DetailCard>
  );
}

function FamilyPanel({ familyRows, speakSmallText }) {
  return (
    <DetailCard id="word-dictionary-family-panel" title="词族" icon={Network} compact={familyRows.length <= 2}>
      {familyRows.map((family) => (
        <div className="word-dictionary-row" key={`${family.word}-${family.pos || ""}`}>
          <span>{getPosDisplay(family.pos) || family.pos || "词族"}</span>
          <button type="button" onClick={() => speakSmallText(family.word, "词族")}>
            <Volume2 aria-hidden="true" />
            <span className="word-dictionary-row__term">{family.word}</span>
          </button>
          <small>{family.meaning || "同词族词条"}</small>
        </div>
      ))}
    </DetailCard>
  );
}

/**
 * Shared dictionary footer for the main flashcard and reading-words surfaces.
 * Main keeps 变形 / 词族 / 同义替换 / 短语搭配; reading-words keeps the first
 * three cards only. Empty cards are omitted on both surfaces.
 */
export default function WordDetailGrid({
  item,
  displayForms,
  displayFamily,
  commonCollocations,
  phraseCollocations,
  collocationFallback,
  phraseCollocationFallback,
  speakSmallText,
  variant = "main",
  synonymItems = []
}) {
  const forms = normalizeFormRows(displayForms);
  const familyRows = normalizeFamilyRows(displayFamily);
  // page.jsx still normalizes legacy display props to three items. Read the active
  // word first so the v2 four-item profile is not truncated before rendering.
  const synonyms = normalizeSynonymRows(item, synonymItems);
  const normalizedPhrases = normalizeAiPhraseItems(item?.phraseCollocations || phraseCollocations);
  const phraseItems = normalizedPhrases.length
    ? normalizedPhrases
    : normalizeAiPhraseItems(phraseCollocationFallback);
  const includePhraseCollocations = variant === "main";
  const activePanelCount = [
    forms.length,
    familyRows.length,
    synonyms.length,
    includePhraseCollocations && phraseItems.length
  ].filter(Boolean).length;
  const activeGridClassName = [
    "word-dictionary-grid",
    "word-dictionary-grid--reading",
    activePanelCount <= 2 && "word-dictionary-grid--compact",
    activePanelCount === 1 && "word-dictionary-grid--single"
  ].filter(Boolean).join(" ");

  /* V2 rule: the three relation cards are shared globally, while the main
   * flashcard additionally keeps phrase collocations. The old common/phrase
   * layout remains an explicit fallback until Phase 3 removes dead branches. */
  if (variant !== "legacy-collocations") {

    if (
      !forms.length
      && !familyRows.length
      && !synonyms.length
      && !(includePhraseCollocations && phraseItems.length)
    ) return null;

    return (
      <section className="word-dictionary-panel study-answer-content" aria-label="词典详情">
        <div className={activeGridClassName}>
          {forms.length ? <FormsPanel
            item={item}
            forms={forms}
            speakSmallText={speakSmallText}
          /> : null}
          {familyRows.length ? <FamilyPanel
            familyRows={familyRows}
            speakSmallText={speakSmallText}
          /> : null}
          {synonyms.length ? (
            <DetailCard id="word-dictionary-synonyms-panel" title="同义替换" icon={Replace} compact={synonyms.length <= 2}>
              {synonyms.map((synonym) => (
                <div className="word-dictionary-row" key={synonym.word}>
                  <span>{synonym.replacementType === "phrase" ? "短语改写" : "同义"}</span>
                  <button type="button" onClick={() => speakSmallText(synonym.word, "同义替换")}>
                    <Volume2 aria-hidden="true" />
                    <span className="word-dictionary-row__term">{synonym.word}</span>
                  </button>
                  <small>{synonym.meaning || "释义待补全"}</small>
                </div>
              ))}
            </DetailCard>
          ) : null}
          {includePhraseCollocations && phraseItems.length ? (
            <DetailCard id="word-dictionary-phrases-panel" title="短语搭配" icon={PanelsTopLeft} compact={phraseItems.length <= 2}>
              <PhraseRows
                items={phraseItems}
                typeLabel="短语搭配"
                speechLabel="短语"
                speakSmallText={speakSmallText}
              />
            </DetailCard>
          ) : null}
        </div>
      </section>
    );
  }

  const normalizedCommon = normalizeAiPhraseItems(item?.collocations || commonCollocations);
  const commonItems = normalizedCommon.length
    ? normalizedCommon
    : normalizeAiPhraseItems(collocationFallback);
  const legacyPanelCount = [forms.length, familyRows.length, commonItems.length, phraseItems.length]
    .filter(Boolean)
    .length;
  const legacyGridClassName = [
    "word-dictionary-grid",
    legacyPanelCount <= 2 && "word-dictionary-grid--compact",
    legacyPanelCount === 1 && "word-dictionary-grid--single"
  ].filter(Boolean).join(" ");

  if (!forms.length && !familyRows.length && !commonItems.length && !phraseItems.length) {
    return null;
  }

  return (
    <section className="word-dictionary-panel study-answer-content" aria-label="词典详情">
      <div className={legacyGridClassName}>
        {forms.length ? <FormsPanel
          item={item}
          forms={forms}
          speakSmallText={speakSmallText}
        /> : null}
        {familyRows.length ? <FamilyPanel
          familyRows={familyRows}
          speakSmallText={speakSmallText}
        /> : null}

        {commonItems.length ? <DetailCard id="word-dictionary-collocations-panel" title="常见搭配" icon={PanelsTopLeft} compact={commonItems.length <= 2}>
          <PhraseRows items={commonItems} typeLabel="常见搭配" speechLabel="搭配" speakSmallText={speakSmallText} />
        </DetailCard> : null}

        {phraseItems.length ? <DetailCard id="word-dictionary-phrases-panel" title="短语搭配" icon={PanelsTopLeft} compact={phraseItems.length <= 2}>
          <PhraseRows items={phraseItems} typeLabel="短语搭配" speechLabel="短语" speakSmallText={speakSmallText} />
        </DetailCard> : null}
      </div>
    </section>
  );
}
