"use client";

import { Volume2 } from "lucide-react";
import { getPosDisplay } from "../lib/vocab/page-word-helpers.mjs";
import { normalizeOtherMeanings } from "../lib/vocab/admin-ai-content-profile.mjs";
import {
  formatHeadwordForDisplay,
  formatHeadwordForSpeech
} from "../lib/vocab/headword-format.mjs";
import { getMeaningDisplay } from "../lib/vocab/meaning-display.mjs";

function highlightTargetWords(sentence, words) {
  if (!sentence) return sentence;
  const targets = new Set(words.filter(Boolean).map((word) => String(word).toLowerCase()));

  return sentence.split(/([A-Za-z]+(?:'[A-Za-z]+)?)/g).map((part, index) => {
    if (!targets.has(part.toLowerCase())) return part;
    return <strong key={`${part}-${index}`}>{part}</strong>;
  });
}

function HeadwordText({ value }) {
  const displayValue = formatHeadwordForDisplay(value) || "—";

  return displayValue.split(/(\s+\/\s+)/).map((part, index) => (
    part.includes("/")
      ? <span className="word-slash" aria-hidden="true" key={`slash-${index}`}> / </span>
      : part
  ));
}

export default function WordStudyContent({
  item,
  audioInfo,
  displayForms,
  fallback,
  speakExample,
  speakWord
}) {
  const highlightedWords = [item.word, ...displayForms.map((form) => form.word)];
  const displayHeadword = formatHeadwordForDisplay(item.word) || "—";
  const spokenHeadword = formatHeadwordForSpeech(item.word) || "当前单词";
  const headwordClassName = [
    "word",
    displayHeadword.length > 18 ? "word--long" : "",
    displayHeadword.includes("/") ? "word--alternatives" : ""
  ].filter(Boolean).join(" ");
  const otherMeanings = normalizeOtherMeanings(item.otherMeanings, item.meaning);
  const mainMeaningDetail = getMeaningDisplay(item).detail;

  return (
    <div className="word-study-content">
      <section className="example-box" aria-label="例句">
        <button
          className="hero-sound-btn example-sound-btn"
          type="button"
          onClick={speakExample}
          title="播放例句发音（空格）"
          aria-label="播放例句发音，快捷键空格"
        >
          <Volume2 aria-hidden="true" />
        </button>
        <div
          className="example-clickable"
          onClick={speakExample}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              speakExample();
            }
          }}
        >
          <div className="example">
            {highlightTargetWords(fallback(item.example, "等待补充雅思例句"), highlightedWords)}
          </div>
          <div className="example-cn">{fallback(item.exampleCn, "等待补充例句中文翻译")}</div>
        </div>
      </section>

      <section className="word-hero" aria-label="当前单词">
        <button
          className="word-clickable"
          type="button"
          onClick={() => speakWord(true)}
          title="播放单词发音（Tab）"
          aria-label={`播放单词 ${spokenHeadword} 的发音，快捷键 Tab`}
        >
          <span className={headwordClassName}><HeadwordText value={displayHeadword} /></span>
        </button>
        <div className="word-sub">
          <span className="phonetic">{fallback(item.phonetic || audioInfo.phonetic, "等待音标")}</span>
          <button
            className="word-pronunciation-button"
            type="button"
            onClick={() => speakWord(true)}
            aria-label="播放当前单词发音"
            title="播放单词发音"
          >
            <Volume2 aria-hidden="true" />
          </button>
          <span className="pos">{getPosDisplay(item.pos)}</span>
        </div>
      </section>

      <div className="meaning-block">
        <div className="meaning-primary">{fallback(item.meaning, "等待补充中文主释义")}</div>
        {mainMeaningDetail ? (
          <div className="meaning-detail"><strong>主释义详解：</strong>{mainMeaningDetail}</div>
        ) : null}
        {otherMeanings.length ? (
          <details className="meaning-other">
            <summary>
              <strong>其他释义 {otherMeanings.length}</strong>
              <span>{otherMeanings.map((sense) => sense.meaningZh).join("；")}</span>
            </summary>
            <div className="meaning-other-list">
              {otherMeanings.map((sense, senseIndex) => (
                <article className="meaning-other-item" key={`${sense.meaningZh}-${senseIndex}`}>
                  <div className="meaning-other-heading">
                    {sense.pos ? <span className="meaning-other-pos">{getPosDisplay(sense.pos)}</span> : null}
                    <strong>{sense.meaningZh}</strong>
                  </div>
                  {sense.definitionEn ? <p>{sense.definitionEn}</p> : null}
                  {sense.example ? (
                    <div className="meaning-other-example">
                      <span>{sense.example}</span>
                      {sense.exampleCn ? <span>{sense.exampleCn}</span> : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
