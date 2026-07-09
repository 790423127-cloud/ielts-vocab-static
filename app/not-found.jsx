"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1>页面不存在</h1>
      <p>你访问的地址没有对应页面。开发环境请用下面两个地址，不要用 <code>/index.html</code>。</p>
      <ul>
        <li><Link href="/">刷单词首页</Link> → <code>http://localhost:3000/</code></li>
        <li><Link href="/spelling-words">单词拼写训练</Link> → <code>http://localhost:3000/spelling-words</code></li>
        <li><Link href="/spelling-phrases">词组拼写训练</Link> → <code>http://localhost:3000/spelling-phrases</code></li>
      </ul>
      <p>静态导出版拼写页是 <code>/spelling.html</code>，不是 <code>/spelling</code>。</p>
    </main>
  );
}