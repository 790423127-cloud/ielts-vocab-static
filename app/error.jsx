"use client";

export default function Error({ error, reset }) {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>页面加载出错</h1>
      <p>{error?.message || "未知错误"}</p>
      <button type="button" onClick={() => reset()}>
        重试
      </button>
    </main>
  );
}