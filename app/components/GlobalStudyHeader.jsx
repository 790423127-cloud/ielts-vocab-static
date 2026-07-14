"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BookOpen,
  CircleX,
  Clock3,
  Library,
  ListTree,
  ListChecks,
  Menu,
  MessageSquareText,
  PencilLine,
  Sparkles,
} from "lucide-react";
import FontScaleControl from "./FontScaleControl.jsx";

/** Custom event: pages listen and open their own AI panel without leaving the route. */
export const OPEN_AI_TOOLS_EVENT = "ielts:open-ai-tools";

const PRIMARY_NAV = [
  { href: "/", label: "刷词", icon: BookOpen, matches: (path) => path === "/" },
  {
    href: "/spelling-words",
    label: "拼写",
    icon: PencilLine,
    matches: (path, source) => path.startsWith("/spelling") && source !== "error_bank" && source !== "srs_review"
  },
  { href: "/meaning", label: "选义", icon: ListChecks, matches: (path) => path === "/meaning" || path === "/meaning-en" },
  { href: "/expressions", label: "高频表达", icon: MessageSquareText, matches: (path) => path === "/expressions" }
];

const LIBRARY_NAV = [
  { href: "/basic", label: "零基础词库", icon: Library, matches: (path) => path === "/basic" },
  { href: "/reading-g", label: "G类阅读提升", icon: BookOpen, matches: (path) => path === "/reading-g" },
  { href: "/spelling-phrases", label: "词组训练", icon: ListTree, matches: (path) => path === "/spelling-phrases" },
  {
    href: "/spelling-words?source=error_bank",
    label: "错词本",
    icon: CircleX,
    matches: (path, source) => path.startsWith("/spelling") && source === "error_bank"
  },
  {
    href: "/spelling-words?source=srs_review",
    label: "SRS 复习",
    icon: Clock3,
    matches: (path, source) => path.startsWith("/spelling") && source === "srs_review"
  }
];

const MOBILE_MORE_NAV = [
  LIBRARY_NAV[0],
  LIBRARY_NAV[1],
  PRIMARY_NAV[3],
  LIBRARY_NAV[2],
  LIBRARY_NAV[4]
];

const PAGE_CONTEXT = [
  { test: (path) => path === "/", title: "主词库刷词", meta: "专注学习" },
  { test: (path) => path === "/spelling-phrases", title: "词组拼写训练", meta: "短语层" },
  { test: (path) => path.startsWith("/spelling"), title: "单词拼写训练", meta: "主词库" },
  { test: (path) => path === "/meaning-en", title: "中文选英文", meta: "核心 6000" },
  { test: (path) => path === "/meaning", title: "看词选意思", meta: "核心 6000" },
  { test: (path) => path === "/expressions", title: "高频表达", meta: "口语与写作" },
  { test: (path) => path === "/basic", title: "零基础词库", meta: "独立进度" },
  { test: (path) => path === "/reading-g", title: "G类阅读提升", meta: "独立进度" }
];

function NavLink({ item, pathname, source = "", compact = false }) {
  const active = item.matches(pathname, source);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={false}
      className={`study-shell-nav-item${active ? " is-active" : ""}${compact ? " is-compact" : ""}`}
      aria-current={active ? "page" : undefined}
      title={item.label}
    >
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

export default function GlobalStudyHeader() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const source = searchParams?.get("source") || "";
  const [aiHintOpen, setAiHintOpen] = useState(false);
  const mobileMoreActive = MOBILE_MORE_NAV.some((item) => item.matches(pathname, source));
  const context = PAGE_CONTEXT.find((item) => item.test(pathname)) || {
    title: "IELTS 学习工作台",
    meta: "专注训练"
  };

  const openAiToolsHere = useCallback(() => {
    // Never force-navigate away from the current learning page.
    if (pathname === "/") {
      window.dispatchEvent(new CustomEvent(OPEN_AI_TOOLS_EVENT, { detail: { page: "home" } }));
      return;
    }
    if (pathname.startsWith("/spelling")) {
      window.dispatchEvent(new CustomEvent(OPEN_AI_TOOLS_EVENT, { detail: { page: "spelling" } }));
      return;
    }
    // Other pages have no in-page AI dock — stay put and offer choices.
    setAiHintOpen(true);
  }, [pathname]);

  return (
    <>
      <header className="study-brand-header">
        <Link href="/" prefetch={false} className="study-brand-mark" aria-label="IELTS Vocab 首页">
          <span aria-hidden="true" />
          IELTS VOCAB
        </Link>
        <div className="study-session-context" aria-label="当前训练">
          <strong>{context.title}</strong>
          <span>{context.meta}</span>
        </div>
        <div className="study-header-tools">
          {/* Search / more intentionally omitted until implemented — avoid dead buttons. */}
          <FontScaleControl className="study-brand-font-scale" />
        </div>
      </header>

      <aside className="study-shell-sidebar" aria-label="全站学习导航">
        <div className="study-shell-nav-label">训练模式</div>
        <nav className="study-shell-nav-group">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} source={source} />
          ))}
        </nav>
        <div className="study-shell-divider" />
        <div className="study-shell-nav-label">专项学习</div>
        <nav className="study-shell-nav-group">
          {LIBRARY_NAV.map((item) => (
            <NavLink key={`${item.href}-${item.label}`} item={item} pathname={pathname} source={source} />
          ))}
        </nav>
        <nav className="study-shell-nav-group study-shell-nav-bottom">
          <button type="button" className="study-shell-nav-item" onClick={openAiToolsHere}>
            <Sparkles aria-hidden="true" />
            <span>AI 工具</span>
          </button>
        </nav>
      </aside>

      {aiHintOpen ? (
        <div className="study-ai-hint-backdrop" role="presentation" onClick={() => setAiHintOpen(false)}>
          <div
            className="study-ai-hint-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="study-ai-hint-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="study-ai-hint-title">当前页没有内嵌 AI 面板</h2>
            <p>
              点「AI 工具」不会再强制回主页。主词库补全 / 拼写 AI 分别在对应页面打开；你可留在本页，或自行选择前往：
            </p>
            <div className="study-ai-hint-actions">
              <button type="button" className="study-ai-hint-secondary" onClick={() => setAiHintOpen(false)}>
                留在本页
              </button>
              <Link
                href="/spelling-words?openAiTools=1"
                prefetch={false}
                className="study-ai-hint-secondary"
                onClick={() => setAiHintOpen(false)}
              >
                拼写页 AI
              </Link>
              <Link
                href="/?openAiTools=1#ai-tools"
                prefetch={false}
                className="study-ai-hint-primary"
                onClick={() => setAiHintOpen(false)}
              >
                主词库 AI
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <nav className="study-mobile-nav" aria-label="移动端学习导航">
        <NavLink item={PRIMARY_NAV[0]} pathname={pathname} source={source} compact />
        <NavLink item={PRIMARY_NAV[1]} pathname={pathname} source={source} compact />
        <NavLink item={PRIMARY_NAV[2]} pathname={pathname} source={source} compact />
        <Link
          href="/spelling-words?source=error_bank"
          prefetch={false}
          className={`study-shell-nav-item is-compact${pathname.startsWith("/spelling") && source === "error_bank" ? " is-active" : ""}`}
          aria-current={pathname.startsWith("/spelling") && source === "error_bank" ? "page" : undefined}
        >
          <CircleX aria-hidden="true" />
          <span>错词</span>
        </Link>
        <details className="study-mobile-more">
          <summary
            className={`study-shell-nav-item is-compact${mobileMoreActive ? " is-active" : ""}`}
            title="更多学习入口"
          >
            <Menu aria-hidden="true" />
            <span>更多</span>
          </summary>
          <nav className="study-mobile-more-menu" aria-label="更多学习入口">
            {MOBILE_MORE_NAV.map((item) => {
              const active = item.matches(pathname, source);
              return (
                <Link
                  key={`mobile-${item.href}`}
                  href={item.href}
                  prefetch={false}
                  className={active ? "is-active" : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </details>
      </nav>
    </>
  );
}
