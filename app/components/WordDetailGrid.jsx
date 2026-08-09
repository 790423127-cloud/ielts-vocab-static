"use client";

import { GitBranch, Network, PanelsTopLeft, Replace, Volume2 } from "lucide-react";
import { normalizeAiPhraseItems } from "../lib/vocab/admin-ai-content-profile.mjs";
import {
  getFormChineseType,
  getFormExplanation,
  getFormHint,
  getPosDisplay
} from "../lib/vocab/page-word-helpers.mjs";

function DetailCard({ id, title, icon: Icon, children }) {
  return (
    <section id={id} className="word-dictionary-module" aria-label={title}>
      <h3><Icon aria-hidden="true" />{title}</h3>
      <div className="word-dictionary-content">{children}</div>
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

function FormsPanel({ item, forms, speakSmallText }) {
  return (
    <DetailCard id="word-dictionary-forms-panel" title="变形" icon={GitBranch}>
      {forms.map((form) => (
        <div className="word-dictionary-row" key={`${form.word}-${form.type || form.note || ""}`}>
          <span>{getFormChineseType(form.type) || form.type || "变形"}</span>
          <button type="button" onClick={() => speakSmallText(form.word, "变形")}>
            <Volume2 aria-hidden="true" />
            <span className="word-dictionary-row__term">{form.word}</span>
          </button>
          <small>
            {[getFormHint(form), getFormExplanation(item?.word, item?.meaning, form)]
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
    <DetailCard id="word-dictionary-family-panel" title="词族" icon={Network}>
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
 * Shared dictionary footer used by main flashcard (图b) and reading-words (图a).
 * variant="reading-words": 变形 / 词族 / 同义替换 — same row chrome as main, no collocations.
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
  variant = "default",
  synonymItems = []
}) {
  const forms = normalizeFormRows(displayForms);
  const familyRows = normalizeFamilyRows(displayFamily);
  // page.jsx still normalizes legacy display props to three items. Read the active
  // word first so the v2 four-item profile is not truncated before rendering.
  const normalizedCommon = normalizeAiPhraseItems(item?.collocations || commonCollocations);
  const normalizedPhrases = normalizeAiPhraseItems(item?.phraseCollocations || phraseCollocations);
  const commonItems = normalizedCommon.length
    ? normalizedCommon
    : normalizeAiPhraseItems(collocationFallback);
  const phraseItems = normalizedPhrases.length
    ? normalizedPhrases
    : normalizeAiPhraseItems(phraseCollocationFallback);

  if (variant === "reading-words") {
    const synonyms = (Array.isArray(synonymItems) ? synonymItems : [])
      .map((entry) => {
        if (typeof entry === "string") {
          return { word: entry.trim(), meaning: "" };
        }
        return {
          word: String(entry?.word || entry?.replacement || "").trim(),
          meaning: String(entry?.meaning || entry?.meaningZh || "").trim()
        };
      })
      .filter((entry) => entry.word);

    if (!forms.length && !familyRows.length && !synonyms.length) return null;

    return (
      <section className="word-dictionary-panel study-answer-content" aria-label="词典详情">
        <div className="word-dictionary-grid word-dictionary-grid--reading">
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
            <DetailCard id="word-dictionary-synonyms-panel" title="同义替换" icon={Replace}>
              {synonyms.map((synonym) => (
                <div className="word-dictionary-row" key={synonym.word}>
                  <span>同义</span>
                  <button type="button" onClick={() => speakSmallText(synonym.word, "同义替换")}>
                    <Volume2 aria-hidden="true" />
                    <span className="word-dictionary-row__term">{synonym.word}</span>
                  </button>
                  <small>{synonym.meaning || "释义待补全"}</small>
                </div>
              ))}
            </DetailCard>
          ) : null}
        </div>
      </section>
    );
  }

  if (!forms.length && !familyRows.length && !commonItems.length && !phraseItems.length) {
    return null;
  }

  return (
    <section className="word-dictionary-panel study-answer-content" aria-label="词典详情">
      <div className="word-dictionary-grid">
        {forms.length ? <FormsPanel
          item={item}
          forms={forms}
          speakSmallText={speakSmallText}
        /> : null}
        {familyRows.length ? <FamilyPanel
          familyRows={familyRows}
          speakSmallText={speakSmallText}
        /> : null}

        {commonItems.length ? <DetailCard id="word-dictionary-collocations-panel" title="常见搭配" icon={PanelsTopLeft}>
          <PhraseRows items={commonItems} typeLabel="常见搭配" speechLabel="搭配" speakSmallText={speakSmallText} />
        </DetailCard> : null}

        {phraseItems.length ? <DetailCard id="word-dictionary-phrases-panel" title="短语搭配" icon={PanelsTopLeft}>
          <PhraseRows items={phraseItems} typeLabel="短语搭配" speechLabel="短语" speakSmallText={speakSmallText} />
        </DetailCard> : null}
      </div>
    </section>
  );
}
