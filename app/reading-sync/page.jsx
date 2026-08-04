"use client";

import { useEffect, useState } from "react";

import {
  readReadingWords,
  writeReadingWords,
  writeReadingWordsWithBackup
} from "../lib/reading-words/storage.mjs";
import {
  loadReadingParaphraseState,
  saveReadingParaphraseState,
  saveReadingParaphraseStateWithBackup
} from "../lib/reading-paraphrases/storage.mjs";
import {
  READING_COACH_SYNC_TYPE,
  buildReadingCoachSyncReceipt,
  mergeReadingCoachParaphrases,
  mergeReadingCoachWords,
  parseReadingCoachSyncPackage
} from "../lib/reading-sync/smart-sync.mjs";

const ALLOWED_READING_ORIGINS = new Set([
  "http://127.0.0.1:8001",
  "http://localhost:8001"
]);

function requestedSourceOrigin() {
  if (typeof window === "undefined") return "";
  const value = new URLSearchParams(window.location.search).get("sourceOrigin") || "";
  return ALLOWED_READING_ORIGINS.has(value) ? value : "";
}

export default function ReadingSyncPage() {
  const [status, setStatus] = useState("正在等待阅读系统发送内容……");
  const [summary, setSummary] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sourceOrigin = requestedSourceOrigin();
    const opener = window.opener;
    if (!sourceOrigin || !opener) {
      setFailed(true);
      setStatus("请从雅思阅读系统的“传到词库软件”按钮进入此页。");
      return undefined;
    }

    let handledTransferId = "";
    let handledResult = null;
    const send = (message) => opener.postMessage(message, sourceOrigin);
    const onMessage = (event) => {
      if (event.origin !== sourceOrigin || event.source !== opener) return;
      if (event.data?.type !== READING_COACH_SYNC_TYPE) return;
      try {
        const payload = parseReadingCoachSyncPackage(event.data);
        if (handledTransferId === payload.transferId && handledResult) {
          send(handledResult);
          return;
        }

        const previousWords = readReadingWords();
        const previousParaphrases = loadReadingParaphraseState();
        const wordResult = mergeReadingCoachWords(previousWords, payload.words);
        const paraphraseResult = mergeReadingCoachParaphrases(
          previousParaphrases,
          payload.paraphrases
        );
        if (!writeReadingWordsWithBackup(wordResult.words, previousWords)) {
          throw new Error("生词本写入失败，原数据未改变");
        }
        if (!saveReadingParaphraseStateWithBackup(paraphraseResult.state, previousParaphrases)) {
          writeReadingWords(previousWords);
          saveReadingParaphraseState(previousParaphrases);
          throw new Error("同义替换本写入失败，已恢复传输前数据");
        }

        const nextSummary = {
          words: wordResult,
          paraphrases: paraphraseResult,
          receivedWords: payload.words.length,
          receivedParaphrases: payload.paraphrases.length
        };
        handledTransferId = payload.transferId;
        handledResult = {
          type: "ielts-reading-coach-smart-sync-result",
          schemaVersion: 1,
          transferId: payload.transferId,
          status: "ok",
          receipt: buildReadingCoachSyncReceipt(payload),
          summary: {
            wordsAdded: wordResult.added,
            wordsUpdated: wordResult.updated,
            wordsUnchanged: wordResult.unchanged,
            paraphrasesAdded: paraphraseResult.added,
            paraphrasesUpdated: paraphraseResult.updated,
            paraphrasesUnchanged: paraphraseResult.unchanged
          }
        };
        setSummary(nextSummary);
        setFailed(false);
        setStatus("传输完成，阅读系统已收到成功回执。");
        send(handledResult);
      } catch (error) {
        const message = error instanceof Error ? error.message : "传输失败";
        setFailed(true);
        setStatus(message);
        send({
          type: "ielts-reading-coach-smart-sync-result",
          schemaVersion: 1,
          transferId: String(event.data?.transferId || ""),
          status: "error",
          message
        });
      }
    };

    window.addEventListener("message", onMessage);
    send({ type: "ielts-reading-coach-smart-sync-ready", schemaVersion: 1 });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#f4f8f7", padding: "48px 20px", color: "#12332d" }}>
      <section style={{ maxWidth: 760, margin: "0 auto", background: "white", border: "1px solid #dce9e5", borderRadius: 24, padding: 32, boxShadow: "0 18px 50px rgba(24, 92, 75, .08)" }}>
        <p style={{ margin: 0, color: "#0b9d7a", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>READING SMART SYNC</p>
        <h1 style={{ margin: "8px 0 10px", fontSize: 30 }}>阅读学习记录传输</h1>
        <p role={failed ? "alert" : "status"} style={{ margin: 0, padding: "14px 16px", borderRadius: 12, background: failed ? "#fff3f1" : "#eefaf6", color: failed ? "#a33a2b" : "#166b57" }}>
          {status}
        </p>
        {summary ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 20 }}>
            <article style={{ border: "1px solid #dce9e5", borderRadius: 14, padding: 16 }}>
              <strong style={{ display: "block", fontSize: 22 }}>{summary.receivedWords}</strong>
              <span>生词：新增 {summary.words.added}，更新 {summary.words.updated}</span>
            </article>
            <article style={{ border: "1px solid #dce9e5", borderRadius: 14, padding: 16 }}>
              <strong style={{ display: "block", fontSize: 22 }}>{summary.receivedParaphrases}</strong>
              <span>同义替换：新增 {summary.paraphrases.added}，更新 {summary.paraphrases.updated}</span>
            </article>
          </div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
          <a href="/reading-words" style={{ color: "white", background: "#087f65", borderRadius: 10, padding: "10px 15px", textDecoration: "none", fontWeight: 700 }}>查看阅读生词本</a>
          <a href="/reading-paraphrases" style={{ color: "#087f65", border: "1px solid #8fcdbd", borderRadius: 10, padding: "10px 15px", textDecoration: "none", fontWeight: 700 }}>查看同义替换本</a>
        </div>
        <p style={{ margin: "20px 0 0", color: "#70817c", fontSize: 13 }}>传输前会自动保留一份本地回退数据；相同内容再次发送不会生成重复记录。</p>
      </section>
    </main>
  );
}
