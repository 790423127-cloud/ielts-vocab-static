"use client";

import { GitBranch, Network, PanelsTopLeft, Volume2 } from "lucide-react";
import {
  getFormChineseType,
  getFormExplanation,
  getFormHint,
  getPosDisplay
} from "../lib/vocab/page-word-helpers.mjs";

function DetailCard({ title, icon: Icon, children }) {
  return (
    <section className="word-dictionary-module" aria-label={title}>
      <h3><Icon aria-hidden="true" />{title}</h3>
      <div className="word-dictionary-content">{children}</div>
    </section>
  );
}

function PhraseRows({ items, typeLabel, speechLabel, speakSmallText }) {
  const visibleItems = items.filter((pair) => pair?.phrase && !pair.phrase.startsWith("等待 AI")).slice(0, 4);
  if (!visibleItems.length) return <p className="word-dictionary-empty">当前词暂无可靠搭配。</p>;

  return visibleItems.map((pair) => (
    <div className="word-dictionary-row" key={`${pair.phrase}-${pair.chinese}`}>
      <span>{typeLabel}</span>
      <button
        type="button"
        disabled={!pair.phrase}
        onClick={() => speakSmallText(pair.phrase, speechLabel)}
      >
        <Volume2 aria-hidden="true" />{pair.phrase}
      </button>
      <small>{pair.chinese || ""}</small>
    </div>
  ));
}

export default function WordDetailGrid({
  item,
  displayForms,
  displayFamily,
  commonCollocations,
  phraseCollocations,
  collocationFallback,
  phraseCollocationFallback,
  speakSmallText
}) {
  const commonItems = commonCollocations.length ? commonCollocations : collocationFallback;
  const phraseItems = phraseCollocations.length ? phraseCollocations : phraseCollocationFallback;

  return (
    <section className="word-dictionary-panel" aria-label="词典详情">
      <div className="word-dictionary-grid">
        <DetailCard title="变形" icon={GitBranch}>
          {displayForms.length ? displayForms.map((form) => (
            <div className="word-dictionary-row" key={`${form.word}-${form.type}`}>
              <span>{getFormChineseType(form.type)}</span>
              <button type="button" onClick={() => speakSmallText(form.word, "变形")}>
                <Volume2 aria-hidden="true" />{form.word}
              </button>
              <small>{getFormHint(form)} · {getFormExplanation(item.word, item.meaning, form)}</small>
            </div>
          )) : <p className="word-dictionary-empty">当前词暂无重要变形。</p>}
        </DetailCard>

        <DetailCard title="词族" icon={Network}>
          {displayFamily.length ? displayFamily.map((family) => (
            <div className="word-dictionary-row" key={`${family.word}-${family.pos}`}>
              <span>{getPosDisplay(family.pos)}</span>
              <button type="button" onClick={() => speakSmallText(family.word, "词族")}>
                <Volume2 aria-hidden="true" />{family.word}
              </button>
              <small>{family.meaning || "同词族词条"}</small>
            </div>
          )) : <p className="word-dictionary-empty">当前词暂无词族信息。</p>}
        </DetailCard>

        <DetailCard title="常见搭配" icon={PanelsTopLeft}>
          <PhraseRows items={commonItems} typeLabel="常见搭配" speechLabel="搭配" speakSmallText={speakSmallText} />
        </DetailCard>

        <DetailCard title="短语搭配" icon={PanelsTopLeft}>
          <PhraseRows items={phraseItems} typeLabel="短语搭配" speechLabel="短语" speakSmallText={speakSmallText} />
        </DetailCard>
      </div>
    </section>
  );
}
