"use client";

import { useEffect } from "react";

function requestCurrentWordDeletion() {
  window.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Delete",
    code: "Delete",
    bubbles: true,
    cancelable: true
  }));
}

function isEditableTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
}

export default function WordStudyActions({
  item,
  isStudyEmpty,
  isExternalIdictationItem,
  prevWord,
  nextWord,
  markStatus,
  tidyReview
}) {
  useEffect(() => {
    function handleDeleteAlias(event) {
      if (isStudyEmpty || isExternalIdictationItem) return;
      if (isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (String(event.key || "").toLowerCase() !== "d") return;

      event.preventDefault();
      event.stopPropagation();
      requestCurrentWordDeletion();
    }

    window.addEventListener("keydown", handleDeleteAlias, true);
    return () => window.removeEventListener("keydown", handleDeleteAlias, true);
  }, [isExternalIdictationItem, isStudyEmpty]);

  if (tidyReview?.active) {
    return (
      <footer className="bottom bottombar tidy-review-actions" aria-label="词库整理操作">
        <button className="study-step-button study-step-button--previous" type="button" disabled={isStudyEmpty} onClick={prevWord}>
          上一个
        </button>
        <div className="actions">
          <button className="status known" type="button" disabled={isStudyEmpty} onClick={tidyReview.onKeep}>
            留着
          </button>
          <button className="status uncertain" type="button" disabled={isStudyEmpty} onClick={tidyReview.onLater}>
            以后再看
          </button>
          <button className="status unknown active-unknown" type="button" disabled={isStudyEmpty} onClick={requestCurrentWordDeletion} title="只从雅思主词库删除（快捷键：D / Delete）">
            删除
          </button>
        </div>
        <button className="study-step-button study-step-button--next" type="button" disabled={isStudyEmpty} onClick={nextWord}>
          下一个
        </button>
      </footer>
    );
  }

  return (
    <footer className="bottom bottombar" aria-label="学习操作">
      <button className="study-step-button study-step-button--previous" type="button" disabled={isStudyEmpty} onClick={prevWord}>
        上一个
      </button>
      <div className="actions">
        <button
          className={`status known${item.status === "熟悉" ? " is-selected" : ""}`}
          disabled={isStudyEmpty}
          onClick={() => markStatus("熟悉")}
          title="快捷键：1"
        >
          {isExternalIdictationItem ? "下一个" : "认识"}
        </button>
        <button
          className={`status uncertain${item.status === "模糊" ? " is-selected" : ""}`}
          disabled={isStudyEmpty}
          onClick={() => markStatus("模糊")}
          title="快捷键：2"
        >
          {isExternalIdictationItem ? "稍后" : "模糊"}
        </button>
        <button
          className={`status unknown${item.status === "不熟" ? " is-selected active-unknown" : ""}`}
          disabled={isStudyEmpty}
          onClick={() => markStatus("不熟")}
          title="快捷键：3"
        >
          {isExternalIdictationItem ? "跳过" : item.status === "不熟" ? "取消不熟" : "不熟"}
        </button>
      </div>
      <button className="study-step-button study-step-button--next" type="button" disabled={isStudyEmpty} onClick={nextWord}>
        下一个
      </button>
    </footer>
  );
}
