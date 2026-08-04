"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { loadAdaptiveState, clearProgress, migrateFromV1, getAdaptiveStats } from "../lib/meaning-mode/storage.mjs";
import { speakWord, speakExample, stop } from "../lib/meaning-mode/audio.mjs";
import { FEEDBACK_REASONS, saveFeedback, createFeedbackPayload } from "../lib/meaning-mode/quality-feedback.mjs";
import StudyRangeSummary from "../components/StudyRangeSummary.jsx";
import StableLoadingState from "../components/StableLoadingState.jsx";
import styles from "./meaning.module.css";
import { getPosFamilyDisplay } from "../lib/vocab/pos-display.mjs";

// 训练子集（6000），与主词库动态物理总数分开计数。见 PRODUCT.md。
const WORD_BANK_URL = "/data/meaning-6000.json";

let meaningExampleRuntime = null;
let meaningExampleRuntimePromise = null;
let meaningWordBankPromise = null;
let meaningWordBankItems = null;

// 大索引（example / semantic distractor 等）按需 dynamic import，避免首屏打进 MB 级 chunk。
// 长期可改为 public/data/*.json + fetch；当前策略已满足 First Load ~109kB。
async function loadMeaningExampleRuntime() {
  if (meaningExampleRuntime) return meaningExampleRuntime;
  if (!meaningExampleRuntimePromise) {
    meaningExampleRuntimePromise = import("../lib/meaning-mode/example-index.mjs")
      .then((module) => {
        meaningExampleRuntime = module;
        return module;
      });
  }
  return meaningExampleRuntimePromise;
}

function getMeaningExampleForWord(wordId) {
  return meaningExampleRuntime?.getExampleForWord(wordId) || null;
}

export default function MeaningPage() {
  const [phase, setPhase] = useState("loading");
  const [runtime, setRuntime] = useState(null);
  const [engine, setEngine] = useState(null);
  const [wordBank, setWordBank] = useState([]);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const loadAttempted = useRef(false);
  const cardRef = useRef(null);
  const feedbackRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const advanceTokenRef = useRef(0);
  const advancingRef = useRef(false);
  const runtimePreparationRef = useRef(null);

  function clearAdvanceTimer() {
    if (advanceTimerRef.current != null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }

  // Load word bank and init engine
  useEffect(() => {
    if (loadAttempted.current) return;
    loadAttempted.current = true;
    let cancelled = false;

    async function load() {
      try {
        if (!meaningWordBankPromise) {
          meaningWordBankPromise = (async () => {
            if (meaningWordBankItems) return meaningWordBankItems;
            const res = await fetch(WORD_BANK_URL, { cache: "force-cache" });
            if (!res.ok) throw new Error("Failed to load word bank: " + res.status);
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
              throw new Error("Word bank is empty. Please run build-meaning-6000 first.");
            }
            meaningWordBankItems = data.items;
            return meaningWordBankItems;
          })().catch((error) => {
            meaningWordBankPromise = null;
            throw error;
          });
        }
        const items = await meaningWordBankPromise;
        if (cancelled) return;
        setWordBank(items);
        const progressState = loadAdaptiveState() || migrateFromV1() || { version: 2, words: {} };
        setStats(getAdaptiveStats(progressState));
        setPhase("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load word bank");
          setPhase("error");
        }
      }
    }
    load();

    return () => {
      cancelled = true;
      stop();
      if (advanceTimerRef.current != null) {
        window.clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
  }, [])
  
  const handleSubmitFeedback = () => {
    if (!feedbackReason || !question || !question.questionAuditSnapshot) return;
    const selMeaning = typeof selected === "string" ? selected : (selected ? selected.meaningZh : "");
    const selOption = question.options ? question.options.find(o => o.meaningZh === selMeaning) : null;
    const snap = question.questionAuditSnapshot;
    const payload = createFeedbackPayload(
      snap, feedbackReason, feedbackNote,
      selOption ? question.options.indexOf(selOption) : -1,
      result.correct
    );
    saveFeedback(payload);
    setFeedbackSent(true);
  };

  const handleCopyDiagnostic = () => {
    if (!question || !question.options) return;
    const selMeaning2 = typeof selected === "string" ? selected : (selected ? selected.meaningZh : "");
    const diagnostic = {
      target: question.questionAuditSnapshot ? question.questionAuditSnapshot.target : null,
      options: question.options.map((opt, i) => ({
        index: i,
        isCorrect: opt.isCorrect,
        sourceWordId: opt.sourceWordId,
        displayEnglish: opt.displayEnglish,
        posFamily: opt.posFamily,
        quizMeaningZh: opt.meaningZh,
        relationToTarget: opt.relationToTarget,
        relationReason: opt.relationReason,
        qualityTier: opt.qualityTier
      })),
      optionHash: question.optionHash,
      correctOptionIndex: question.correctOptionIndex,
      userSelected: selMeaning2,
      userWasCorrect: result ? result.correct : false,
      combinationScore: question.combinationScore,
      combinationStrategy: question.combinationStrategy
    };
    const text = JSON.stringify(diagnostic, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text) => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };


  // Cleanup audio on unmount
  useEffect(() => {
    return () => stop();
  }, []);

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Tab: play word audio (only in question/result phase, not on interactive elements)
      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        const isInteractive = ["button", "a", "input", "textarea", "select"].includes(tag)
          || document.activeElement.isContentEditable;
        if (!isInteractive && question && (phase === "question" || phase === "result")) {
          e.preventDefault();
          speakWord(question.word);
        }
      }

      // Space: play example (only in result phase, correct answer, not on interactive elements)
      if (e.code === "Space" && phase === "result" && result && result.correct) {
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        const isInteractive = ["button", "a", "input", "textarea", "select"].includes(tag)
          || document.activeElement.isContentEditable;
        if (!isInteractive && question) {
          const example = getExampleFromQuestion(question);
          if (example) {
            e.preventDefault();
            speakExample(example);
            if (typeof window !== "undefined" && window.__MEANING_DEBUG__) {
              console.log("[Meaning Debug]", {
                wordId: question.wordId,
                playedAudioType: "example",
                audioEngine: "speech-synthesis",
                keyboardTrigger: "space",
                exampleSourceField: getExampleField(question)
              });
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, question, result]);

  // Focus feedback area after correct answer for Space shortcut
  useEffect(() => {
    if (phase === "result" && result && result.correct && feedbackRef.current) {
      feedbackRef.current.focus({ preventScroll: true });
    }
  }, [phase, result]);

  const applyNextQuestion = useCallback(() => {
    if (!engine || !runtime || advancingRef.current) return;
    advancingRef.current = true;
    clearAdvanceTimer();
    try {
      const q = runtime.nextQuestion(engine);
      if (!q) {
        setStats(runtime.getSessionStats(engine));
        setPhase("done");
        setQuestion(null);
        setSelected(null);
        setResult(null);
        return;
      }
      setQuestion(q);
      setSelected(null);
      setResult(null);
      setPhase("question");
      setStats(runtime.getSessionStats(engine));
      if (cardRef.current) cardRef.current.focus();
    } finally {
      // Release after paint so double-click / auto+click cannot double-consume.
      window.setTimeout(() => {
        advancingRef.current = false;
      }, 0);
    }
  }, [engine, runtime]);

  const prepareRuntime = useCallback(async () => {
    if (runtime) return runtime;
    if (!runtimePreparationRef.current) {
      runtimePreparationRef.current = Promise.all([
        import("../lib/meaning-mode/engine.mjs"),
        loadMeaningExampleRuntime()
      ])
        .then(async ([engineRuntime]) => {
          await engineRuntime.ensureMeaningRuntimeIndexes();
          return engineRuntime;
        })
        .catch((error) => {
          runtimePreparationRef.current = null;
          throw error;
        });
    }
    return runtimePreparationRef.current;
  }, [runtime]);

  const startQuestion = useCallback(async () => {
    if (engine && runtime) {
      advancingRef.current = false;
      applyNextQuestion();
      return;
    }

    if (!wordBank.length) return;
    setPhase("preparing");

    try {
      const engineRuntime = await prepareRuntime();
      const nextEngine = await engineRuntime.createEngine(wordBank);
      const nextQuestion = engineRuntime.nextQuestion(nextEngine);
      setRuntime(engineRuntime);
      setEngine(nextEngine);
      setStats(engineRuntime.getSessionStats(nextEngine));
      setQuestion(nextQuestion);
      setSelected(null);
      setResult(null);
      setPhase(nextQuestion ? "question" : "done");
    } catch (err) {
      setError(err?.message || "Failed to prepare meaning practice");
      setPhase("error");
    }
  }, [applyNextQuestion, engine, prepareRuntime, runtime, wordBank]);

  const handleNext = useCallback(() => {
    // Cancel pending auto-advance so correct + click cannot consume two questions.
    advanceTokenRef.current += 1;
    clearAdvanceTimer();
    applyNextQuestion();
  }, [applyNextQuestion]);

  const handleSelect = useCallback((option) => {
    if (!engine || !runtime || !question || result) return;
    setSelected(option);
    const res = runtime.submitAnswer(engine, option);
    setResult(res);
    setPhase("result");
    setStats(runtime.getSessionStats(engine));

    // Debug logging
    if (typeof window !== "undefined" && window.__MEANING_DEBUG__) {
      console.log("[Meaning Debug]", {
        ...res.debug,
        playedAudioType: null,
        audioEngine: "speech-synthesis",
        keyboardTrigger: null
      });
    }

    // 答对：短暂停顿后自动下一题（答错仍停在结果页便于看辨析）
    if (res?.correct) {
      advanceTokenRef.current += 1;
      const token = advanceTokenRef.current;
      clearAdvanceTimer();
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null;
        if (token !== advanceTokenRef.current) return;
        applyNextQuestion();
      }, 450);
    }
  }, [engine, runtime, question, result, applyNextQuestion]);

  const handleReset = useCallback(() => {
    advanceTokenRef.current += 1;
    clearAdvanceTimer();
    clearProgress();
    if (runtime && wordBank.length) {
      Promise.resolve(runtime.createEngine(wordBank)).then((fresh) => {
        setEngine(fresh);
        setPhase("ready");
        setQuestion(null);
        setSelected(null);
        setResult(null);
        setStats(runtime.getSessionStats(fresh));
      });
      return;
    }
    setEngine(null);
    setQuestion(null);
    setSelected(null);
    setResult(null);
    setStats(getAdaptiveStats({ version: 2, words: {} }));
    setPhase("ready");
  }, [runtime, wordBank]);

  const handlePlayWord = useCallback(() => {
    if (question) {
      speakWord(question.word);
    }
  }, [question]);

  const handlePlayExample = useCallback(() => {
    const example = getExampleFromQuestion(question);
    if (example) speakExample(example);
  }, [question]);

  // ─── RENDER: Loading ───
  if (phase === "loading" || phase === "preparing") {
    return (
      <main className={`${styles.page} system-loading-page`}>
        <StableLoadingState
          mark="M"
          eyebrow="看英文选中文"
          title={phase === "preparing" ? "正在准备本轮题目" : "正在准备学习内容"}
          note={phase === "preparing" ? "加载训练规则与选项关系" : "读取核心 6000 词库并恢复学习记录"}
        />
      </main>
    );
  }

  // ─── RENDER: Error ───
  if (phase === "error") {
    return (
      <main className={`${styles.page} system-loading-page`}>
        <StableLoadingState
          mark="M"
          eyebrow="看英文选中文"
          title="训练题库暂时无法读取"
          note={error}
          variant="error"
          actionHref="/"
        />
      </main>
    );
  }

  // ─── RENDER: Ready ───
  if (phase === "ready") {
    const prog = stats || runtime?.getCombinedProgress();
    return (
      <main className={styles.page}>
        <TopBar stats={stats} />
        <StudyRangeSummary
          mode="选择题"
          title="看英文选中文"
          meta="核心 6000"
          detail="答题前只显示题干和选项；答题后再看释义、例句和辨析。"
          className="quiz-study-range"
        />
        <div className={styles.centerWrap}>
          <h2 className={styles.readyTitle}>看词选意思</h2>
          <p className={styles.readyDesc}>看英文单词，从 4 个选项中选出正确的中文意思</p>
          <CompactStats stats={prog} />
          <button
            className={styles.startBtn}
            onClick={startQuestion}
            onPointerEnter={() => { prepareRuntime().catch(() => {}); }}
            onFocus={() => { prepareRuntime().catch(() => {}); }}
          >
            开始练习
          </button>
          {prog && prog.total > 0 && (
            <button className={styles.resetBtn} onClick={handleReset}>重置进度</button>
          )}
        </div>
      </main>
    );
  }

  // ─── RENDER: Question ───
  if (phase === "question" && question) {
    return (
      <main className={styles.page}>
        <TopBar stats={stats} />
        <StudyRangeSummary
          mode="选择题"
          title="看英文选中文"
          meta={stats ? `${stats.correct || 0} / ${stats.total || 0} 题` : "核心 6000"}
          detail={`当前词：${question.word || "—"}`}
          className="quiz-study-range"
        />
        <div className={`${styles.cardWrap} ${styles.questionWrap}`} ref={cardRef} tabIndex={-1}>
          <QuestionCard
            question={question}
            onSelect={handleSelect}
            onPlayWord={handlePlayWord}
          />
        </div>
        <BottomProgress stats={stats} engine={engine} />
      </main>
    );
  }

  // ─── RENDER: Result ───
  if (phase === "result" && question && result) {
    const example = result.correct ? getExampleFromQuestion(question) : null;
    return (
      <main className={styles.page}>
        <TopBar stats={stats} />
        <StudyRangeSummary
          mode="选择题"
          title="看英文选中文"
          meta={result.correct ? "答对" : "答错"}
          detail={`当前词：${question.word || "—"}`}
          className="quiz-study-range"
        />
        <div className={`${styles.cardWrap} ${styles.resultWrap}`} ref={cardRef} tabIndex={-1}>
          <ResultCard
            question={question}
            selected={selected}
            result={result}
            example={example}
            onPlayWord={handlePlayWord}
            onPlayExample={handlePlayExample}
            onNext={handleNext}
            nextDisabled={false}
            nextLabel={result?.correct ? "下一题（可提前） →" : "下一题 →"}
            feedbackRef={feedbackRef}
            showFeedback={showFeedback}
            setShowFeedback={setShowFeedback}
            feedbackReason={feedbackReason}
            setFeedbackReason={setFeedbackReason}
            feedbackNote={feedbackNote}
            setFeedbackNote={setFeedbackNote}
            feedbackSent={feedbackSent}
            copySuccess={copySuccess}
            handleSubmitFeedback={handleSubmitFeedback}
            handleCopyDiagnostic={handleCopyDiagnostic}
          />
        </div>
        <BottomProgress stats={stats} engine={engine} />
      </main>
    );
  }

  // ─── RENDER: Done ───
  if (phase === "done") {
    return (
      <main className={styles.page}>
        <TopBar stats={stats} />
        <div className={styles.centerWrap}>
          <h2 className={styles.readyTitle}>本轮完成！</h2>
          <CompactStats stats={stats} />
          <button className={styles.startBtn} onClick={handleReset}>重新开始</button>
          <a href="/" className={styles.resetBtn}>返回首页</a>
        </div>
      </main>
    );
  }

  return null;
}

// ─── Sub-components ───

function TopBar({ stats }) {
  return (
    <div className={styles.topbar}>
      <a href="/" className={styles.pillLink}>← 首页</a>
      <a href="/meaning-en" className={styles.pillLink}>中文选英文</a>
      <span className={styles.topTitle}>看词选意思 · IELTS 核心6000</span>
      {stats && (
        <span className={styles.topMeta}>
          {stats.totalAnswered || 0} 题 · {stats.accuracy || 0}%
        </span>
      )}
    </div>
  );
}

function QuestionCard({ question, onSelect, onPlayWord }) {
  return (
    <div className={styles.card}>
      {/* Current question source badge */}
      {question._selectedBecause && (
        <div className={styles.sourceBadge}>
          {question._selectedBecause === "new-word" && "🆕 新词"}
          {question._selectedBecause === "weak-reinforcement" && "🔁 错题强化"}
          {question._selectedBecause === "due-review" && "📅 到期复习"}
          {question._selectedBecause === "fallback-learning" && "📖 巩固复习"}
        </div>
      )}

      {/* English word — always visible */}
      <div className={styles.wordDisplay}>
        <span className={styles.wordText}>{question.word}</span>
        {question.posFamily && question.posFamily !== "unknown" && (
          <span className={styles.posPill}>{getPosFamilyDisplay(question.posFamily) || question.posFamily}</span>
        )}
        <button
          className={styles.audioBtn}
          onClick={onPlayWord}
          title="播放单词发音 (Tab)"
          aria-label="播放单词发音"
        >
          🔊
        </button>
      </div>
      <span className={styles.shortcutHint}>Tab：播放单词发音</span>

      {/* 4 option buttons — 2x2 grid, meaningZh only before answer */}
      <div className={styles.optionsGrid}>
        {question.options.map((opt, i) => (
          <button
            key={i}
            className={styles.optionBtn}
            onClick={() => onSelect(opt)}
          >
            {opt.meaningZh}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultCard({ question, selected, result, example, onPlayWord, onPlayExample, onNext, nextDisabled = false, nextLabel = "下一题 →", feedbackRef, showFeedback, setShowFeedback, feedbackReason, setFeedbackReason, feedbackNote, setFeedbackNote, feedbackSent, copySuccess, handleSubmitFeedback, handleCopyDiagnostic }) {
  const selMeaning = typeof selected === "string" ? selected : selected.meaningZh;
  const selOption = question.options ? question.options.find(o => o.meaningZh === selMeaning) : null;

  return (
    <div className={styles.card}>
      {/* Feedback */}
      <div className={styles.resultBadge + " " + (result.correct ? styles.resultCorrect : styles.resultWrong)}>
        {result.correct ? "✓ 正确" : "✗ 错误"}
      </div>

      {/* English word — always visible */}
      <div className={styles.wordDisplay}>
        <span className={styles.wordText}>{question.word}</span>
        {question.posFamily && question.posFamily !== "unknown" && (
          <span className={styles.posPill}>{getPosFamilyDisplay(question.posFamily) || question.posFamily}</span>
        )}
        <button
          className={styles.audioBtn}
          onClick={onPlayWord}
          title="播放单词发音 (Tab)"
          aria-label="播放单词发音"
        >
          🔊
        </button>
      </div>

      {/* 4 options with English display */}
      <div className={styles.optionsGrid}>
        {question.options.map((opt, i) => {
          let cls = styles.optionBtnResult;
          const shouldShowDistinction = opt.isCorrect || (opt.meaningZh === selMeaning && !result.correct);
          if (opt.isCorrect) {
            cls += " " + styles.optionCorrect;
          } else if (opt.meaningZh === selMeaning && !result.correct) {
            cls += " " + styles.optionWrong;
          } else {
            cls += " " + styles.optionNeutral;
          }
          return (
            <div key={i} className={cls}>
              <span className={styles.optionZh}>{opt.meaningZh}</span>
              <span className={styles.optionEn}>{opt.displayEnglish}</span>
              {shouldShowDistinction && opt.meaningDetailedZh && opt.meaningDetailedZh !== opt.meaningZh && (
                <span className={styles.optionDetail}>{opt.meaningDetailedZh}</span>
              )}
              {shouldShowDistinction && opt.learnerDistinctionZh && (
                <span className={styles.optionDistinction}>辨析：{opt.learnerDistinctionZh}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Example sentence — only if correct and example exists */}
      {example && (
        <div className={styles.exampleCard}>
          <div className={styles.exampleLabel}>Example</div>
          <div className={styles.exampleText}>{example}</div>
              {getExampleCnFromQuestion(question) && (
                <div className={styles.exampleCnText}>{getExampleCnFromQuestion(question)}</div>
              )}
          <button
            className={styles.exampleAudioBtn}
            onClick={onPlayExample}
            title="播放例句发音 (Space)"
            aria-label="播放例句发音"
          >
            🔊
          </button>
          <span className={styles.shortcutHint}>Space：播放例句发音</span>
        </div>
      )}

      {/* Detailed meaning */}
      {question.meaningDetailedZh && (
        <div className={styles.senseDetail}>
          <span className={styles.senseLabel}>完整释义：</span>
          <span className={styles.senseText}>{question.meaningDetailedZh}</span>
        </div>
      )}

      {/* Feedback text */}
      <div
        className={styles.feedbackArea}
        ref={feedbackRef}
        tabIndex={-1}
      >
        {result.correct ? (
          <div className={styles.feedbackDetail}>
            <div className={styles.feedbackSection}>
              <div className={styles.feedbackLabel}>正确答案</div>
              <div className={styles.feedbackEnWord}>{question.word} <span className={styles.posPill}>{getPosFamilyDisplay(question.posFamily) || question.posFamily}</span></div>
              <div className={styles.feedbackSenseTitle}>本题义项：</div>
              <div className={styles.feedbackSenseText}>{question.correctAnswer}</div>
              {question.options?.find(o => o.isCorrect)?.learnerDistinctionZh && (
                <>
                  <div className={styles.feedbackSenseTitle}>辨析：</div>
                  <div className={styles.feedbackSenseText}>{question.options.find(o => o.isCorrect).learnerDistinctionZh}</div>
                </>
              )}
              {question.meaningDetailedZh && question.meaningDetailedZh !== question.correctAnswer && (
                <>
                  <div className={styles.feedbackSenseTitle}>常见义项：</div>
                  <div className={styles.feedbackSenseText}>{question.meaningDetailedZh}</div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.feedbackDetail}>
            <div className={styles.feedbackSection}>
              <div className={styles.feedbackLabel}>正确答案</div>
              <div className={styles.feedbackEnWord}>{question.word} <span className={styles.posPill}>{getPosFamilyDisplay(question.posFamily) || question.posFamily}</span></div>
              <div className={styles.feedbackSenseTitle}>本题义项：</div>
              <div className={styles.feedbackSenseText}>{question.correctAnswer}</div>
              {question.options?.find(o => o.isCorrect)?.learnerDistinctionZh && (
                <>
                  <div className={styles.feedbackSenseTitle}>辨析：</div>
                  <div className={styles.feedbackSenseText}>{question.options.find(o => o.isCorrect).learnerDistinctionZh}</div>
                </>
              )}
              {question.meaningDetailedZh && question.meaningDetailedZh !== question.correctAnswer && (
                <>
                  <div className={styles.feedbackSenseTitle}>常见义项：</div>
                  <div className={styles.feedbackSenseText}>{question.meaningDetailedZh}</div>
                </>
              )}
            </div>
            <div className={styles.feedbackSection}>
              <div className={styles.feedbackLabel}>你选择的是</div>
              <div className={styles.feedbackEnWord}>{selOption?.displayEnglish || ""} <span className={styles.posPill}>{getPosFamilyDisplay(selOption?.posFamily) || selOption?.posFamily || ""}</span></div>
              <div className={styles.feedbackSenseTitle}>具体义项：</div>
              <div className={styles.feedbackSenseText}>{selMeaning}</div>
              {selOption?.meaningDetailedZh && selOption.meaningDetailedZh !== selMeaning && (
                <>
                  <div className={styles.feedbackSenseTitle}>详细释义：</div>
                  <div className={styles.feedbackSenseText}>{selOption.meaningDetailedZh}</div>
                </>
              )}
              {selOption?.learnerDistinctionZh && (
                <>
                  <div className={styles.feedbackSenseTitle}>辨析：</div>
                  <div className={styles.feedbackSenseText}>{selOption.learnerDistinctionZh}</div>
                </>
              )}
            </div>
          </div>
        )}
        {!result.correct && (
          <p className={styles.feedbackHint}>该词已加入强化复习，会在稍后重新出现。</p>
        )}
        {result.correct && (
          <p className={styles.feedbackHint}>已更新学习状态。</p>
        )}
      </div>

      {/* Feedback & Diagnostic */}
      <div className={styles.feedbackTools}>
        {!showFeedback ? (
          <button className={styles.feedbackTrigger} onClick={() => setShowFeedback(true)}>
            题目有问题？
          </button>
        ) : feedbackSent ? (
          <div className={styles.feedbackSentMsg}>已记录，可在诊断导出中查看</div>
        ) : (
          <div className={styles.feedbackForm}>
            <div className={styles.feedbackFormTitle}>请选择问题类型：</div>
            {FEEDBACK_REASONS.map(r => (
              <label key={r.code} className={styles.feedbackOption}>
                <input
                  type="radio"
                  name="feedbackReason"
                  value={r.code}
                  checked={feedbackReason === r.code}
                  onChange={(e) => setFeedbackReason(e.target.value)}
                />
                {r.label}
              </label>
            ))}
            {feedbackReason === "other" && (
              <textarea
                className={styles.feedbackNote}
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value.slice(0, 200))}
                placeholder="请简要描述问题（200字以内）"
                rows={3}
                maxLength={200}
              />
            )}
            <div className={styles.feedbackActions}>
              <button className={styles.feedbackSubmit} onClick={handleSubmitFeedback} disabled={!feedbackReason}>
                提交反馈
              </button>
              <button className={styles.feedbackCancel} onClick={() => { setShowFeedback(false); setFeedbackReason(""); setFeedbackNote(""); }}>
                取消
              </button>
            </div>
          </div>
        )}
        <button className={styles.diagnosticBtn} onClick={handleCopyDiagnostic}>
          {copySuccess ? "已复制" : "复制题目诊断"}
        </button>
      </div>

      {/* Next button — disabled while correct auto-advance is pending to avoid double nextQuestion */}
      <button className={styles.nextBtn} type="button" onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </button>
    </div>
  );
}

function CompactStats({ stats }) {
  if (!stats) return null;
  return (
    <div className={styles.compactStats}>
      <div className={styles.statItem}>
        <span className={styles.statNum}>{stats.newCount ?? "-"}</span>
        <span className={styles.statLabel}>新词</span>
      </div>
      <div className={styles.statItem}>
        <span className={styles.statNum}>{stats.weakCount ?? "-"}</span>
        <span className={styles.statLabel}>薄弱</span>
      </div>
      <div className={styles.statItem}>
        <span className={styles.statNum}>{stats.learningCount ?? "-"}</span>
        <span className={styles.statLabel}>巩固中</span>
      </div>
      <div className={styles.statItem}>
        <span className={styles.statNum}>{stats.masteredCount ?? "-"}</span>
        <span className={styles.statLabel}>已掌握</span>
      </div>
    </div>
  );
}

function BottomProgress({ stats, engine }) {
  if (!stats || !engine) return null;
  const total = engine.wordBank.length;
  const answered = stats.total || 0;
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

// ─── Helpers ───

function getExampleFromQuestion(question) {
  if (!question || !question.wordId) return null;
  const entry = getMeaningExampleForWord(question.wordId);
  if (!entry || !entry.example) return null;
  return entry.example;
}

function getExampleField(question) {
  if (!question || !question.wordId) return "none";
  const entry = getMeaningExampleForWord(question.wordId);
  if (!entry) return "none";
  return entry.sourceField || "example";
}

function getExampleCnFromQuestion(question) {
  if (!question || !question.wordId) return null;
  const entry = getMeaningExampleForWord(question.wordId);
  if (!entry) return null;
  return entry.exampleCn || null;
}
