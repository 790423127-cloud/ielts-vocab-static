"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html lang="zh-CN">
      <body style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>应用出错</h1>
        <p>{error?.message || "未知错误"}</p>
        <button type="button" onClick={() => reset()}>
          重试
        </button>
      </body>
    </html>
  );
}