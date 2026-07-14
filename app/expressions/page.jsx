"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Volume2 } from "lucide-react";
import {
  createEngine,
  nextQuestion,
  submitAnswer,
  getSessionStats,
  EXPRESSIONS_SESSION_SIZE
} from "../lib/expressions/engine.mjs";
import { getLearnedCount } from "../lib/expressions/storage.mjs";
import { speakPhrase, speakExample, stopAudio } from "../lib/expressions/audio.mjs";
import StudyRangeSummary from "../components/StudyRangeSummary.jsx";
import StableLoadingState from "../components/StableLoadingState.jsx";
import styles from "./expressions.module.css";

const DATA_URL = "/data/speaking-writing-phrases-700.json";

const TAG_LABELS = {
  "speaking": "Speaking",
  "writing-task1": "Task 1",
  "writing-task2": "Task 2"
};

export default function ExpressionsPage() {
  const [phase, setPhase] = useState("loading");
  const [engine, setEngine] = useState(null);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [learnedCount, setLearnedCount] = useState(0);
  const loadAttempted = useRef(false);
  const cardRef = useRef(null);
  const lastPhraseRef = useRef(null);

  useEffect(() => {
    if (loadAttempted.current) return;
    loadAttempted.current = true;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(DATA_URL);
        if (!res.ok) throw new Error("Failed to load: " + res.status);
        const data = await res.json();
        if (cancelled) return;
        if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
          setError("Phrase bank is empty.");
          setPhase("error");
          return;
        }
        const eng = createEngine(data.items);
        setEngine(eng);
        setLearnedCount(getLearnedCount());
        setStats(getSessionStats(eng));
        setPhase("ready");
      } catch (err) {
        if (!cancelled) { setError(err.message || "Failed to load"); setPhase("error"); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Keyboard: Tab = speak phrase, Space = speak example (correct only)
  useEffect(() => {
    function handleKeyDown(e) {
      // Only handle plain Tab / Space (no modifiers)
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

      const tag = document.activeElement?.tagName?.toLowerCase();
      const isInteractive = tag === "button" || tag === "a" || tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement?.isContentEditable);

      if (e.key === "Tab") {
        // Only play phrase when focus is on the training card (non-interactive area)
        if (!isInteractive && phase === "question" && question) {
          e.preventDefault();
          speakPhrase(question.phrase);
          if (typeof window !== "undefined" && window.__EXPRESSIONS_DEBUG__) {
            console.log("[Expressions Debug]", { phraseId: question.phraseId, phrase: question.phrase, hasExample: !!question.example, playedAudioType: "phrase", audioEngine: "speech-synthesis", keyboardTrigger: "tab" });
          }
        }
        return;
      }

      if (e.key === " ") {
        if (!isInteractive && phase === "result" && result?.correct && question?.example) {
          e.preventDefault();
          speakExample(question.example);
          if (typeof window !== "undefined" && window.__EXPRESSIONS_DEBUG__) {
            console.log("[Expressions Debug]", { phraseId: question.phraseId, phrase: question.phrase, hasExample: true, playedAudioType: "example", audioEngine: "speech-synthesis", keyboardTrigger: "space" });
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      stopAudio();
    };
  }, [phase, question, result]);

  // Stop audio when changing questions
  useEffect(() => {
    stopAudio();
    lastPhraseRef.current = question?.phrase || null;
    return () => { stopAudio(); };
  }, [question?.phrase, question?.phraseId]);

  const startSession = useCallback(() => {
    if (!engine) return;
    const activeEngine = engine.queueIndex >= engine.queue.length
      ? createEngine(engine.phraseBank)
      : engine;
    if (activeEngine !== engine) setEngine(activeEngine);
    const q = nextQuestion(activeEngine);
    if (!q) { setPhase("done"); return; }
    setQuestion(q);
    setSelected(null);
    setResult(null);
    setStats(getSessionStats(activeEngine));
    setPhase("question");
    if (cardRef.current) cardRef.current.focus();
  }, [engine]);

  const handleSelect = useCallback((option) => {
    if (!engine || !question || result) return;
    stopAudio();
    setSelected(option);
    const res = submitAnswer(engine, option);
    setResult(res);
    setPhase("result");
    setStats(getSessionStats(engine));
    setLearnedCount(getLearnedCount());

    if (typeof window !== "undefined" && window.__EXPRESSIONS_DEBUG__) {
      console.log("[Expressions Debug]", {
        ...res.debug,
        heuristicSimilarityScore: null,
        selectedOptionId: option.sourcePhraseId || null,
        displayPhraseTraceable: option.sourcePhraseId ? true : false
      });
    }
  }, [engine, question, result]);

  const handleNext = useCallback(() => {
    stopAudio();
    if (!engine) return;
    const q = nextQuestion(engine);
    if (!q) { setPhase("done"); setStats(getSessionStats(engine)); return; }
    setQuestion(q);
    setSelected(null);
    setResult(null);
    setPhase("question");
    if (cardRef.current) cardRef.current.focus();
  }, [engine]);

  const handleSkip = useCallback(() => {
    stopAudio();
    if (!engine) return;
    const q = nextQuestion(engine);
    if (!q) { setPhase("done"); return; }
    setQuestion(q);
    setSelected(null);
    setResult(null);
    setPhase("question");
    setStats(getSessionStats(engine));
    if (cardRef.current) cardRef.current.focus();
  }, [engine]);

  // Loading
  if (phase === "loading") {
    return (
      <main className={`${styles.page} system-loading-page`}>
        <StableLoadingState
          mark="E"
          eyebrow="高频表达训练"
          note="读取口语写作表达并恢复学习记录"
        />
      </main>
    );
  }

  // Error
  if (phase === "error") {
    return (
      <main className={`${styles.page} system-loading-page`}>
        <StableLoadingState
          mark="E"
          eyebrow="高频表达训练"
          title="表达题库暂时无法读取"
          note={error}
          variant="error"
          actionHref="/"
          actionLabel="返回刷词"
        />
      </main>
    );
  }

  // Ready
  if (phase === "ready") {
    return (
      <main className={styles.page}>
        <TopBar learnedCount={learnedCount} total={engine.phraseBank.length} />
        <StudyRangeSummary
          mode="选择题"
          title="口语写作表达"
          meta={`总题库 ${engine.phraseBank.length} 条`}
          detail={`每轮 ${engine.queue.length} 题，优先未学习表达并穿插不熟题。`}
          className="quiz-study-range"
        />
        <div className={styles.centerWrap}>
          <h2 className={styles.readyTitle}>高频表达训练</h2>
          <p className={styles.readyDesc}>总题库 {engine.phraseBank.length} 条 · 本轮 {engine.queue.length} 题</p>
          <button className={styles.startBtn} onClick={startSession}>开始本轮</button>
        </div>
      </main>
    );
  }

  // Question
  if (phase === "question" && question) {
    return (
      <main className={styles.page}>
        <TopBar learnedCount={learnedCount} total={engine.phraseBank.length} stats={stats} />
        <StudyRangeSummary
          mode="选择题"
          title="口语写作表达"
          meta={stats ? `本轮 ${stats.sessionPosition || 0} / ${stats.sessionTotal || EXPRESSIONS_SESSION_SIZE}` : "作答中"}
          detail={`累计覆盖 ${learnedCount} / ${engine.phraseBank.length} · 当前表达：${question.phrase || "—"}`}
          className="quiz-study-range"
        />
        <div className={styles.cardWrap} ref={cardRef} tabIndex={-1}>
          <QuestionCard question={question} onSelect={handleSelect} onSkip={handleSkip} />
        </div>
        <BottomBar stats={stats} />
      </main>
    );
  }

  // Result
  if (phase === "result" && question && result) {
    return (
      <main className={styles.page}>
        <TopBar learnedCount={learnedCount} total={engine.phraseBank.length} stats={stats} />
        <StudyRangeSummary
          mode="选择题"
          title="口语写作表达"
          meta={`${result.correct ? "答对" : "答错"} · 本轮 ${stats?.sessionPosition || 0} / ${stats?.sessionTotal || EXPRESSIONS_SESSION_SIZE}`}
          detail={`累计覆盖 ${learnedCount} / ${engine.phraseBank.length} · 当前表达：${question.phrase || "—"}`}
          className="quiz-study-range"
        />
        <div className={styles.cardWrap} ref={cardRef} tabIndex={-1}>
          <ResultCard question={question} selected={selected} result={result} onNext={handleNext} />
        </div>
        <BottomBar stats={stats} />
      </main>
    );
  }

  // Done
  if (phase === "done") {
    return (
      <main className={styles.page}>
        <TopBar learnedCount={learnedCount} total={engine.phraseBank.length} />
        <div className={styles.centerWrap}>
          <h2 className={styles.readyTitle}>本轮完成</h2>
          <p className={styles.readyDesc}>累计覆盖 {learnedCount} / {engine.phraseBank.length}</p>
          <button className={styles.startBtn} onClick={startSession}>开始下一轮</button>
          <Link href="/" className={styles.pillLink}>返回刷词</Link>
        </div>
      </main>
    );
  }

  return null;
}

// ─── Sub-components ───

function TopBar({ learnedCount, total, stats }) {
  return (
    <div className={styles.topbar}>
      <span className={styles.topTitle}>高频表达训练</span>
      <span className={styles.topMeta}>
        {stats ? `本轮 ${stats.sessionPosition} / ${stats.sessionTotal} · ` : ""}累计覆盖 {learnedCount} / {total}
      </span>
    </div>
  );
}

function QuestionCard({ question, onSelect, onSkip }) {
  const tags = [...new Set([...(question.skillTags || []), ...(question.usageTags || []).slice(0, 2)])];

  const handlePhraseSpeak = () => {
    if (question?.phrase) speakPhrase(question.phrase);
  };

  return (
    <div className={styles.card}>
      {/* Tags */}
      {tags.length > 0 && (
        <div className={styles.tagRow}>
          {tags.map(tag => (
            <span key={tag} className={styles.tag}>{TAG_LABELS[tag] || tag}</span>
          ))}
        </div>
      )}

      {/* English phrase — always visible */}
      <div className={styles.phraseDisplay}>
        <span className={styles.phraseText}>{question.phrase}</span>
        <button className={styles.audioBtn} onClick={handlePhraseSpeak} aria-label="Play phrase" title="播放词组发音 (Tab)">
          <Volume2 aria-hidden="true" />
        </button>
      </div>

      {/* 4 option buttons — 2x2 grid */}
      <div className={styles.optionsGrid}>
        {question.options.map((opt, i) => (
          <button key={i} className={styles.optionBtn} onClick={() => onSelect(opt)}>
            {opt.meaningZh}
          </button>
        ))}
      </div>

      {/* Skip button */}
      <button className={styles.skipBtn} onClick={onSkip}>跳过 →</button>
    </div>
  );
}

function ResultCard({ question, selected, result, onNext }) {
  const selectedMeaning = typeof selected === "string" ? selected : selected.meaningZh;

  const handleExampleSpeak = () => {
    if (question?.example) speakExample(question.example);
  };

  const handlePhraseSpeak = () => {
    if (question?.phrase) speakPhrase(question.phrase);
  };

  return (
    <div className={styles.card}>
      {/* Result badge */}
      <div className={styles.resultBadge + " " + (result.correct ? styles.resultCorrect : styles.resultWrong)}>
        {result.correct ? "✓ 正确" : "✗ 错误"}
      </div>

      {/* English phrase — always visible */}
      <div className={styles.phraseDisplay}>
        <span className={styles.phraseText}>{question.phrase}</span>
        <button className={styles.audioBtn} onClick={handlePhraseSpeak} aria-label="Play phrase" title="播放词组发音 (Tab)">
          <Volume2 aria-hidden="true" />
        </button>
      </div>

      {/* 4 options with English display */}
      <div className={styles.optionsGrid}>
        {question.options.map((opt, i) => {
          let cls = styles.optionBtnResult;
          if (opt.isCorrect) cls += " " + styles.optionCorrect;
          else if (opt.meaningZh === selectedMeaning && !result.correct) cls += " " + styles.optionWrong;
          else cls += " " + styles.optionNeutral;
          return (
            <div key={i} className={cls}>
              <span className={styles.optionZh}>{opt.meaningZh}</span>
              <span className={styles.optionEn}>{opt.displayPhrase}</span>
            </div>
          );
        })}
      </div>

      {/* Example — ONLY shown when correct */}
      {result.correct && question.example && (
        <div className={styles.exampleCard}>
          <div className={styles.exampleHeader}>
            <div className={styles.exampleLabel}>Example</div>
            <button className={styles.audioBtnSm} onClick={handleExampleSpeak} aria-label="Play example" title="播放例句发音 (Space)">
              <Volume2 aria-hidden="true" />
            </button>
          </div>
          <div className={styles.exampleText}>{question.example}</div>
        </div>
      )}

      {/* Feedback */}
      <div className={styles.feedbackArea}>
        {result.correct ? (
          <p className={styles.feedbackCorrect}>答对了：{question.phrase} = {question.correctMeaning}</p>
        ) : (
          <p className={styles.feedbackWrong}>
            答错了：{question.phrase} = {question.correctMeaning}
            <br />
            你选择的是：{selectedMeaning} · {question.options.find(o => o.meaningZh === selectedMeaning)?.displayPhrase || ""}
          </p>
        )}
      </div>

      {/* Next button */}
      <button className={styles.nextBtn} onClick={onNext}>下一题 →</button>
    </div>
  );
}

function BottomBar({ stats }) {
  if (!stats) return null;
  const answered = stats.sessionPosition || 0;
  const total = stats.sessionTotal || EXPRESSIONS_SESSION_SIZE;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div className={styles.bottomBar}>
      <div className={styles.bottomInfo}>
        <span>{answered} / {total}</span>
        <span>{pct}%</span>
      </div>
      <div className={styles.progressBarWrap}>
        <div className={styles.progressBarFill} style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}
