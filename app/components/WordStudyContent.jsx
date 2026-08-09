"use client";

import { Volume2 } from "lucide-react";
import { getPosDisplay } from "../lib/vocab/page-word-helpers.mjs";
import {
  formatHeadwordForDisplay,
  formatHeadwordForSpeech
} from "../lib/vocab/headword-format.mjs";
import { getMeaningDisplay } from "../lib/vocab/meaning-display.mjs";
import { getStudyEntryDisplay } from "../lib/vocab/study-entry-display.mjs";
import InlineStudyMeaning from "./InlineStudyMeaning.jsx";

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
  const display = getStudyEntryDisplay(item);
  const highlightedWords = [item.word, ...displayForms.map((form) => form.word)];
  const displayHeadword = formatHeadwordForDisplay(item.word) || "—";
  const spokenHeadword = formatHeadwordForSpeech(item.word) || "当前单词";
  const headwordClassName = [
    "word",
    displayHeadword.length > 9 ? "word--wide" : "",
    displayHeadword.length > 18 ? "word--long" : "",
    displayHeadword.includes("/") ? "word--alternatives" : ""
  ].filter(Boolean).join(" ");
  const otherMeanings = display.supplementalSenses;
  const mainMeaningDetail = getMeaningDisplay(item).detail;

  return (
    <div className="word-study-content">
      <section className="example-box study-answer-content" aria-label="例句">
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
            {highlightTargetWords(fallback(display.example, "等待补充雅思例句"), highlightedWords)}
          </div>
          <div className="example-cn">{fallback(display.exampleCn, "等待补充例句中文翻译")}</div>
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
        <div className="word-sub study-answer-content">
          <span className="phonetic">{fallback(display.phonetic || audioInfo.phonetic, "等待音标")}</span>
          <button
            className="word-pronunciation-button"
            type="button"
            onClick={() => speakWord(true)}
            aria-label="播放当前单词发音"
            title="播放单词发音"
          >
            <Volume2 aria-hidden="true" />
          </button>
          <span className="pos">{getPosDisplay(display.pos)}</span>
        </div>
      </section>

      <div className="meaning-block study-answer-content">
        <InlineStudyMeaning
          primaryMeaning={fallback(display.meaning, "等待补充中文主释义")}
          primaryPos={display.pos}
          supplementalSenses={otherMeanings}
        />
        {display.needsSenseSplit ? (
          <div className="meaning-detail" role="status">
            <strong>资料提示：</strong>该词含多个词性，现有释义尚未按词性拆分。
          </div>
        ) : null}
        {mainMeaningDetail ? (
          <div className="meaning-detail"><strong>主释义详解：</strong>{mainMeaningDetail}</div>
        ) : null}
      </div>
    </div>
  );
}
