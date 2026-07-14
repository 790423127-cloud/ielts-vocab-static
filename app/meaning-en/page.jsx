"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clearRetrievalState } from "../lib/meaning-en/adaptive-state.mjs";
import { speakWord, speakExample, stop } from "../lib/meaning-en/audio.mjs";
import { createDiagnosticPayload } from "../lib/meaning-en/diagnostics.mjs";
import StudyRangeSummary from "../components/StudyRangeSummary.jsx";
import StableLoadingState from "../components/StableLoadingState.jsx";
import styles from "./meaning-en.module.css";

const WORD_BANK_URL = "/data/meaning-6000.json";

let meaningEnExampleRuntime = null;
let meaningEnExampleRuntimePromise = null;

async function loadMeaningEnExampleRuntime() {
  if (meaningEnExampleRuntime) return meaningEnExampleRuntime;
  if (!meaningEnExampleRuntimePromise) {
    meaningEnExampleRuntimePromise = import("../lib/meaning-mode/example-index.mjs")
      .then((module) => {
        meaningEnExampleRuntime = module;
        return module;
      });
  }
  return meaningEnExampleRuntimePromise;
}

function getMeaningEnExampleForWord(wordId) {
  return meaningEnExampleRuntime?.getExampleForWord(wordId) || null;
}

export default function MeaningEnPage() {
  const [phase, setPhase] = useState("loading");
  const [runtime, setRuntime] = useState(null);
  const [engine, setEngine] = useState(null);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [copyOk, setCopyOk] = useState(false);
  const loadAttempted = useRef(false);
  const startedAt = useRef(0);
  const cardRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const advanceTokenRef = useRef(0);
  const advancingRef = useRef(false);
  const answeringRef = useRef(false);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearAdvanceTimer(), [clearAdvanceTimer]);

  useEffect(() => {
    if (loadAttempted.current) return;
    loadAttempted.current = true;
    let cancelled = false;

    async function load() {
      try {
        const [engineRuntime] = await Promise.all([
          import("../lib/meaning-en/engine.mjs"),
          loadMeaningEnExampleRuntime()
        ]);
        const response = await fetch(WORD_BANK_URL);
        if (!response.ok) throw new Error("词库加载失败: " + response.status);
        const data = await response.json();
        if (cancelled) return;
        if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
          setError("词库为空，请先生成 meaning-6000 数据。");
          setPhase("error");
          return;
        }
        const eng = await engineRuntime.createEngine(data.items);
        setRuntime(engineRuntime);
        setEngine(eng);
        setStats(engineRuntime.getSessionStats(eng));
        setPhase("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "加载失败");
          setPhase("error");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const applyNextQuestion = useCallback(() => {
    if (!engine || !runtime || advancingRef.current) return;
    advancingRef.current = true;
    clearAdvanceTimer();
    const q = runtime.nextQuestion(engine);
    if (!q) {
      setStats(runtime.getSessionStats(engine));
      setPhase("done");
      setQuestion(null);
      setSelected(null);
      setResult(null);
      answeringRef.current = false;
      advancingRef.current = false;
      return;
    }
    setQuestion(q);
    setSelected(null);
    setResult(null);
    answeringRef.current = false;
    startedAt.current = Date.now();
    setStats(runtime.getSessionStats(engine));
    setPhase("question");
    requestAnimationFrame(() => cardRef.current && cardRef.current.focus());
    window.setTimeout(() => {
      advancingRef.current = false;
    }, 0);
  }, [engine, runtime, clearAdvanceTimer]);

  const startQuestion = useCallback(() => {
    advanceTokenRef.current += 1;
    advancingRef.current = false;
    answeringRef.current = false;
    clearAdvanceTimer();
    applyNextQuestion();
  }, [applyNextQuestion, clearAdvanceTimer]);

  const handleNext = useCallback(() => {
    advanceTokenRef.current += 1;
    clearAdvanceTimer();
    applyNextQuestion();
  }, [applyNextQuestion, clearAdvanceTimer]);

  const handleSelect = useCallback((option) => {
    if (!engine || !runtime || !question || phase !== "question" || answeringRef.current) return;
    answeringRef.current = true;
    const responseTime = Date.now() - startedAt.current;
    const res = runtime.submitAnswer(engine, option, responseTime);
    setSelected(option);
    setResult(res);
    setStats(runtime.getSessionStats(engine));
    setPhase("result");

    // 答对：短暂停顿后自动下一题（答错停在结果页）
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
  }, [engine, runtime, question, phase, applyNextQuestion, clearAdvanceTimer]);

  const handleReset = useCallback(() => {
    advanceTokenRef.current += 1;
    clearAdvanceTimer();
    advancingRef.current = false;
    answeringRef.current = false;
    clearRetrievalState();
    if (!engine || !runtime) return;
    Promise.resolve(runtime.createEngine(engine.wordBank)).then((fresh) => {
      setEngine(fresh);
      setStats(runtime.getSessionStats(fresh));
      setQuestion(null);
      setSelected(null);
      setResult(null);
      setPhase("ready");
    });
  }, [engine, runtime, clearAdvanceTimer]);

  const handleCopyDiagnostic = useCallback(() => {
    const payload = createDiagnosticPayload(question, selected, result);
    if (!payload) return;
    const text = JSON.stringify(payload, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopyOk(true);
        setTimeout(() => setCopyOk(false), 1800);
      });
    }
  }, [question, selected, result]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      const isTyping = ["input", "textarea", "select"].includes(tag) || document.activeElement?.isContentEditable;
      if (isTyping) return;

      if (phase === "question" && question) {
        const key = event.key.toLowerCase();
        const indexByKey = { "1": 0, "2": 1, "3": 2, "4": 3, a: 0, b: 1, c: 2, d: 3 };
        if (Object.prototype.hasOwnProperty.call(indexByKey, key)) {
          event.preventDefault();
          const option = question.options[indexByKey[key]];
          if (option) handleSelect(option);
        }
        return;
      }

      if (phase === "result" && question) {
        if (event.key === "Enter") {
          event.preventDefault();
          if (result?.correct) return;
          handleNext();
        } else if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          speakWord(question.canonicalAnswer);
        } else if (event.code === "Space") {
          const example = getExampleText(question);
          if (example) {
            event.preventDefault();
            speakExample(example);
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, question, result, handleSelect, handleNext]);

  if (phase === "loading") {
    return (
      <main className={`${styles.page} system-loading-page`}>
        <StableLoadingState
          mark="M"
          eyebrow="看中文选英文"
          note="读取核心 6000 题库并恢复学习记录"
        />
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className={`${styles.page} system-loading-page`}>
        <StableLoadingState
          mark="M"
          eyebrow="看中文选英文"
          title="训练题库暂时无法读取"
          note={error}
          variant="error"
          actionHref="/"
        />
      </main>
    );
  }

  if (phase === "ready") {
    return (
      <main className={styles.page}>
        <TopBar stats={stats} />
        <StudyRangeSummary
          mode="选择题"
          title="看中文选英文"
          meta="核心 6000"
          detail="答题前只看中文义项；答题后再显示英文、发音和例句。"
          className="quiz-study-range"
        />
        <div className={styles.centerWrap}>
          <h1 className={styles.title}>中文选英文</h1>
          <p className={styles.subtitle}>看到中文具体义项，从四个英文选项里找出规范答案。</p>
          <button className={styles.primaryBtn} onClick={startQuestion}>开始</button>
          <button className={styles.ghostBtn} onClick={handleReset}>清空本模式记录</button>
        </div>
      </main>
    );
  }

  if (phase === "done") {
    return (
      <main className={styles.page}>
        <TopBar stats={stats} />
        <div className={styles.centerWrap}>
          <h1 className={styles.title}>暂时没有可用题目</h1>
          <p className={styles.subtitle}>系统没有用低质量干扰项凑数。可以稍后扩充索引后继续。</p>
          <button className={styles.primaryBtn} onClick={handleReset}>重置本模式</button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <TopBar stats={stats} question={question} />
      <StudyRangeSummary
        mode="选择题"
        title="看中文选英文"
        meta={phase === "result" ? (result?.correct ? "答对" : "答错") : "作答中"}
        detail={question ? `当前义项：${question.meaningZh || "—"}` : ""}
        className="quiz-study-range"
      />
      <div className={`${styles.cardWrap} ${phase === "result" ? styles.resultWrap : styles.questionWrap}`} ref={cardRef} tabIndex={-1}>
        {phase === "question" ? (
          <QuestionCard question={question} onSelect={handleSelect} />
        ) : (
          <ResultCard
            question={question}
            selected={selected}
            result={result}
            onNext={handleNext}
            onPlayWord={() => speakWord(question.canonicalAnswer)}
            onPlayExample={() => {
              const example = getExampleText(question);
              if (example) speakExample(example);
            }}
            onCopyDiagnostic={handleCopyDiagnostic}
            copyOk={copyOk}
            nextDisabled={Boolean(result?.correct)}
          />
        )}
      </div>
      <BottomProgress stats={stats} engine={engine} />
    </main>
  );
}

function TopBar({ stats, question }) {
  const label = question && question._selectedBecause
    ? {
        "new-sense": "新义项",
        "confusion-repair": "混淆修复",
        "learning-review": "巩固复习",
        "spaced-review": "间隔复习"
      }[question._selectedBecause]
    : "";

  return (
    <div className={styles.topbar}>
      <Link className={styles.pillLink} href="/">← 首页</Link>
      <Link className={styles.pillLink} href="/meaning">英文选中文</Link>
      <div className={styles.topTitle}>中文选英文 · English Retrieval</div>
      <div className={styles.topMeta}>{label ? label + " · " : ""}{stats ? `${stats.total} 题 · ${stats.accuracy}%` : "0 题"}</div>
    </div>
  );
}

function QuestionCard({ question, onSelect }) {
  return (
    <section className={styles.card}>
      <div className={styles.promptBlock}>
        <div className={styles.promptLabel}>中文义项</div>
        <h1 className={styles.promptText}>{withPos(question.chinesePromptZh, question.posFamily)}</h1>
      </div>
      <div className={styles.optionsGrid}>
        {question.options.map((option, index) => (
          <button key={option.sourceWordId + option.senseKey} className={styles.optionBtn} onClick={() => onSelect(option)}>
            <span className={styles.optionKey}>{String.fromCharCode(65 + index)}</span>
            <span className={styles.optionWord}>{option.headword}</span>
          </button>
        ))}
      </div>
      <div className={styles.hint}>1-4 或 A-D 选择。答题前不播放英文发音。</div>
    </section>
  );
}

function ResultCard({ question, selected, result, onNext, onPlayWord, onPlayExample, onCopyDiagnostic, copyOk, nextDisabled }) {
  const correctOption = question.options.find(option => option.isCorrect);
  const example = getExampleText(question);
  const exampleCn = getExampleCn(question);

  return (
    <section className={styles.card}>
      <div className={`${styles.resultBadge} ${result.correct ? styles.correct : styles.wrong}`}>
        {result.correct ? "正确" : "错误"}
      </div>

      <div className={styles.answerHeader}>
        <div>
          <div className={styles.promptLabel}>正确答案</div>
          <h1 className={styles.answerWord}>{question.canonicalAnswer}</h1>
        </div>
        <span className={styles.posPill}>{posFamilyPill(question.posFamily)}</span>
        <button className={styles.audioBtn} onClick={onPlayWord} title="播放单词发音 (Tab)">播放单词</button>
      </div>

      <div className={styles.optionsGrid}>
        {question.options.map((option, index) => {
          const cls = [
            styles.optionResult,
            option.isCorrect ? styles.optionCorrect : "",
            selected && selected.sourceWordId === option.sourceWordId && !option.isCorrect ? styles.optionWrong : ""
          ].filter(Boolean).join(" ");
          return (
            <div key={option.sourceWordId + option.senseKey} className={cls}>
              <span className={styles.optionKey}>{String.fromCharCode(65 + index)}</span>
              <div>
                <div className={styles.optionWord}>{option.headword}</div>
                <div className={styles.optionMeaning}>{option.quizMeaningZh}</div>
              </div>
            </div>
          );
        })}
      </div>

      {example && (
        <div className={styles.exampleCard}>
          <div className={styles.promptLabel}>Example</div>
          <p className={styles.exampleText}>{example}</p>
          {exampleCn && <p className={styles.exampleCn}>{exampleCn}</p>}
          <button className={styles.smallBtn} onClick={onPlayExample}>播放例句</button>
        </div>
      )}

      <div className={styles.detailGrid}>
        <div className={styles.detailBox}>
          <div className={styles.promptLabel}>完整释义</div>
          <p>{question.meaningDetailedZh || question.chinesePromptZh}</p>
        </div>
        <div className={styles.detailBox}>
          <div className={styles.promptLabel}>正确项辨析</div>
          <p>{correctOption ? correctOption.learnerDistinctionZh : `${question.canonicalAnswer} 是本题规范答案。`}</p>
        </div>
        {!result.correct && selected && (
          <div className={styles.detailBox}>
            <div className={styles.promptLabel}>你选择了 {selected.headword}</div>
            <p>{selected.notAnswerReasonZh || selected.learnerDistinctionZh}</p>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button className={styles.primaryBtn} onClick={onNext} disabled={nextDisabled}>下一题</button>
        <button className={styles.ghostBtn} onClick={onCopyDiagnostic}>{copyOk ? "已复制" : "复制诊断 JSON"}</button>
      </div>
      <div className={styles.hint}>Tab 播放单词，Space 播放例句，Enter 下一题。</div>
    </section>
  );
}

function BottomProgress({ stats, engine }) {
  if (!stats || !engine) return null;
  const total = engine.wordBank.length;
  const answered = stats.total || 0;
  const pct = total > 0 ? Math.round((stats.seen / total) * 100) : 0;
  return (
    <div className={styles.bottomBar}>
      <div className={styles.bottomInfo}>
        <span>{answered} 次练习</span>
        <span>{stats.seen} / {total}</span>
      </div>
      <div className={styles.progressBarWrap}>
        <div className={styles.progressBarFill} style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}

function getExampleText(question) {
  if (!question || !question.targetWordId) return null;
  const entry = getMeaningEnExampleForWord(question.targetWordId);
  return entry && entry.example ? entry.example : null;
}

function getExampleCn(question) {
  if (!question || !question.targetWordId) return null;
  const entry = getMeaningEnExampleForWord(question.targetWordId);
  return entry && entry.exampleCn ? entry.exampleCn : null;
}

function withPos(prompt, posFamily) {
  const pos = posLabel(posFamily);
  if (!pos || String(prompt || "").includes("（")) return prompt;
  return `${prompt}（${pos}）`;
}

function posLabel(posFamily) {
  // Keep Chinese-only for prompt suffix: "…（名词）"
  const map = {
    noun: "名词",
    verb: "动词",
    adjective: "形容词",
    adverb: "副词",
    phrase: "短语"
  };
  return map[posFamily] || posFamily || "";
}

function posFamilyPill(posFamily) {
  const f = String(posFamily || "").trim();
  if (!f || f === "unknown") return "";
  const zh = posLabel(f);
  if (!zh) return f;
  if (f === zh || f.includes(zh)) return f;
  return `${f} ${zh}`;
}
