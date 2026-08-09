"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Bookmark,
  CalendarDays,
  CheckSquare2,
  CircleX,
  Clock3,
  FileText,
  Headphones,
  LibraryBig,
  Menu,
  MessageSquareText,
  Moon,
  PencilLine,
  Search,
  Settings,
  Sun
} from "lucide-react";
import FontScaleControl from "./FontScaleControl.jsx";

const PAGE_CONTEXT = [
  { test: (path) => path === "/", title: "主词库刷词", meta: "今日学习" },
  { test: (path) => path === "/spelling-phrases", title: "词组拼写训练", meta: "短语" },
  { test: (path) => path.startsWith("/spelling"), title: "单词拼写训练", meta: "主词库" },
  { test: (path) => path === "/meaning-en", title: "中文选英文", meta: "核心词汇" },
  { test: (path) => path === "/meaning", title: "看词选意思", meta: "核心词汇" },
  { test: (path) => path === "/expressions", title: "高频表达", meta: "口语与写作" },
  { test: (path) => path === "/basic", title: "零基础词库", meta: "独立进度" },
  { test: (path) => path === "/ielts-538", title: "538考点", meta: "独立进度 · 376词" },
  { test: (path) => path === "/reading-g", title: "G类阅读提升", meta: "独立进度" },
  { test: (path) => path === "/reading-words", title: "阅读生词本", meta: "个人独立词库" },
  { test: (path) => path === "/reading-paraphrases", title: "阅读同义替换记录本", meta: "错题关系词库" }
];

const NAV_GROUPS = [
  {
    label: "学习",
    items: [
      { href: "/", label: "今日刷词", icon: BookOpen, matches: (path) => path === "/" },
      { href: "/spelling-words?source=srs_review", label: "SRS 复习", icon: Clock3, matches: (path, source) => path.startsWith("/spelling") && source === "srs_review" },
      { href: "/spelling-words?source=error_bank", label: "错词本", icon: CircleX, matches: (path, source) => path.startsWith("/spelling") && source === "error_bank" },
      { href: "/?filterType=status&filterValue=收藏&openLibrary=1", label: "收藏夹", icon: Bookmark, matches: () => false }
    ]
  },
  {
    label: "训练",
    items: [
      { href: "/spelling-words", label: "拼写训练", icon: PencilLine, matches: (path, source) => path.startsWith("/spelling") && !source },
      { href: "/meaning", label: "选义训练", icon: CheckSquare2, matches: (path) => path === "/meaning" || path === "/meaning-en" },
      { label: "听力识别", icon: Headphones, disabled: true },
      { href: "/expressions", label: "高频表达", icon: MessageSquareText, matches: (path) => path === "/expressions" }
    ]
  },
  {
    label: "专项提升",
    items: [
      { href: "/ielts-538", label: "538考点", icon: BookOpen, matches: (path) => path === "/ielts-538" },
      { href: "/basic", label: "零基础单词", icon: BookOpen, matches: (path) => path === "/basic" },
      { href: "/reading-g", label: "G类阅读提升", icon: BookOpen, matches: (path) => path === "/reading-g" },
      { href: "/reading-paraphrases", label: "阅读同义替换记录本", icon: FileText, matches: (path) => path === "/reading-paraphrases" },
      { href: "/expressions", label: "口语话题词汇", icon: MessageSquareText, matches: () => false },
      { href: "/reading-words", label: "阅读生词本", icon: FileText, matches: (path) => path === "/reading-words" }
    ]
  },
  {
    label: "数据",
    items: [
      { label: "学习报告", icon: BarChart3, disabled: true },
      { href: "/?openLibrary=1", label: "词库管理", icon: LibraryBig, matches: () => false },
      { label: "设置", icon: Settings, disabled: true }
    ]
  }
];

const MOBILE_MORE_NAV = NAV_GROUPS
  .slice(1)
  .flatMap((group) => group.items)
  .filter((item) => !item.disabled);

/**
 * Heavy JSON / meta to start downloading on hover/pointerdown so the page shell
 * does not wait for a cold data fetch after JS arrives.
 */
const ROUTE_DATA_PREFETCH = {
  "/": ["/api/vocab-meta", "/api/catalog-meta"],
  "/spelling-words": ["/api/vocab-meta"],
  "/spelling-phrases": ["/data/phrases.json"],
  "/meaning": ["/data/meaning-6000.json"],
  "/meaning-en": ["/data/meaning-6000.json"],
  "/basic": ["/data/basic-words.json"],
  "/ielts-538": ["/data/ielts-538-words.json"],
  "/reading-g": ["/data/reading-g-vocab.json?v=20260804-grok-excel-part1-2-missing-v1", "/data/reading-g-paraphrases.json", "/data/reading-g-question-evidence.json"],
  "/reading-paraphrases": ["/data/listening-reading-paraphrases.json"],
  "/expressions": ["/data/speaking-writing-phrases-700.json"]
};

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRecentDays(count = 14) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (count - index - 1));
    return date;
  });
}

function calculateStreak(daySet) {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  while (daySet.has(formatLocalDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function routePathOnly(href) {
  return String(href || "").split("?")[0] || "/";
}

function markNavigationPending(active) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.navPending = active ? "1" : "0";
}

function NavItem({ item, pathname, source, onIntent, onNavigate }) {
  const Icon = item.icon;
  if (item.disabled) {
    return (
      <button className="study-shell-nav-item" type="button" disabled title={`${item.label}暂未开放`}>
        <Icon aria-hidden="true" /><span>{item.label}</span>
      </button>
    );
  }
  const active = item.matches?.(pathname, source) || false;
  return (
    <Link
      href={item.href}
      prefetch={false}
      className={`study-shell-nav-item${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onPointerEnter={() => onIntent?.(item.href)}
      onPointerDown={() => onIntent?.(item.href)}
      onFocus={() => onIntent?.(item.href)}
      onClick={() => onNavigate?.(item.href)}
    >
      <Icon aria-hidden="true" /><span>{item.label}</span>
    </Link>
  );
}

export default function GlobalStudyHeader() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const source = searchParams?.get("source") || "";
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState("light");
  const [studyDays, setStudyDays] = useState(() => new Set());
  const [navPending, setNavPending] = useState(false);
  const prefetchedRoutesRef = useRef(new Set());
  const prefetchedDataRef = useRef(new Set());
  const recentDays = useMemo(() => getRecentDays(), []);
  const context = PAGE_CONTEXT.find((entry) => entry.test(pathname)) || { title: "IELTS 学习工作台", meta: "专注训练" };
  const mobileMoreActive = MOBILE_MORE_NAV.some((item) => item.matches?.(pathname, source));

  const prefetchDataForRoute = useCallback((href) => {
    const path = routePathOnly(href);
    const assets = ROUTE_DATA_PREFETCH[path] || [];
    for (const asset of assets) {
      if (prefetchedDataRef.current.has(asset)) continue;
      prefetchedDataRef.current.add(asset);
      // Fire-and-forget: warm HTTP cache / service path before the page mounts.
      fetch(asset, { cache: "force-cache", credentials: "same-origin" }).catch(() => {});
    }
  }, []);

  const preloadRoute = useCallback((href) => {
    const target = String(href || "").trim();
    if (!target) return;
    if (!prefetchedRoutesRef.current.has(target)) {
      prefetchedRoutesRef.current.add(target);
      try {
        router.prefetch(target);
      } catch {
        // ignore prefetch failures (offline / aborted)
      }
    }
    prefetchDataForRoute(target);
  }, [prefetchDataForRoute, router]);

  const beginNavigate = useCallback((href) => {
    const targetPath = routePathOnly(href);
    if (targetPath === pathname && !String(href).includes("?")) return;
    setNavPending(true);
    markNavigationPending(true);
    preloadRoute(href);
  }, [pathname, preloadRoute]);

  useEffect(() => {
    setNavPending(false);
    markNavigationPending(false);
  }, [pathname, source]);

  useEffect(() => {
    // Safety timeout if navigation is cancelled or same-page.
    if (!navPending) return undefined;
    const timer = window.setTimeout(() => {
      setNavPending(false);
      markNavigationPending(false);
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [navPending]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("ielts-study-theme") === "dark" ? "dark" : "light";
    setTheme(savedTheme);
    document.documentElement.dataset.studyTheme = savedTheme;

    const today = formatLocalDate(new Date());
    let savedDays = [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem("ielts-study-days") || "[]");
      if (Array.isArray(parsed)) savedDays = parsed;
    } catch {}
    const nextDays = new Set([...savedDays, today]);
    setStudyDays(nextDays);
    window.localStorage.setItem("ielts-study-days", JSON.stringify([...nextDays].slice(-120)));
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.studyTheme = nextTheme;
    window.localStorage.setItem("ielts-study-theme", nextTheme);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    if (pathname === "/") {
      window.dispatchEvent(new CustomEvent("ielts:search-word", { detail: { query: cleanQuery } }));
    } else {
      beginNavigate(`/?search=${encodeURIComponent(cleanQuery)}`);
      router.push(`/?search=${encodeURIComponent(cleanQuery)}`);
    }
  };

  return (
    <>
      <div
        className={`study-nav-progress${navPending ? " is-active" : ""}`}
        aria-hidden={!navPending}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-busy={navPending}
      />
      <header className="study-brand-header">
        <Link
          href="/"
          prefetch={false}
          onPointerEnter={() => preloadRoute("/")}
          onPointerDown={() => preloadRoute("/")}
          onFocus={() => preloadRoute("/")}
          onClick={() => beginNavigate("/")}
          className="study-brand-mark"
          aria-label="IELTS Vocab 首页"
        >
          <span aria-hidden="true" />IELTS VOCAB
        </Link>
        <div className="study-session-context" aria-label="当前训练">
          <strong>{context.title}</strong><span aria-hidden="true">›</span><span>{context.meta}</span>
        </div>
        <form className="study-global-search" role="search" onSubmit={submitSearch}>
          <Search aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索单词、短语或释义" aria-label="搜索单词" />
          <button type="submit">查询</button>
        </form>
        <div className="study-header-tools">
          <FontScaleControl className="study-brand-font-scale" />
          <span className="study-user-avatar" aria-label="当前用户">L</span>
        </div>
      </header>

      <aside className="study-shell-sidebar" aria-label="全站学习导航">
        <div className="study-shell-sidebar__scroll">
          {NAV_GROUPS.map((group) => (
            <section className="study-shell-nav-section" key={group.label} aria-label={group.label}>
              <div className="study-shell-nav-label">{group.label}</div>
              <nav className="study-shell-nav-group">
                {group.items.map((item) => (
                  <NavItem
                    key={item.label}
                    item={item}
                    pathname={pathname}
                    source={source}
                    onIntent={preloadRoute}
                    onNavigate={beginNavigate}
                  />
                ))}
              </nav>
            </section>
          ))}
        </div>

        <section className="study-habit-card" aria-label="连续学习日历">
          <div className="study-habit-card__head"><span>连续学习</span><CalendarDays aria-hidden="true" /></div>
          <strong>{calculateStreak(studyDays)} <small>天</small></strong>
          <div className="study-mini-calendar" aria-label="最近十四天学习记录">
            {recentDays.map((day) => <span key={formatLocalDate(day)} className={studyDays.has(formatLocalDate(day)) ? "is-studied" : ""} title={formatLocalDate(day)} />)}
          </div>
        </section>
        <button className="study-theme-toggle" type="button" onClick={toggleTheme} aria-pressed={theme === "dark"}>
          {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          <span>{theme === "dark" ? "日间模式" : "夜间模式"}</span>
          <span className="study-theme-toggle__switch" aria-hidden="true"><i /></span>
        </button>
      </aside>

      <nav className="study-mobile-nav" aria-label="移动端学习导航">
        {NAV_GROUPS[0].items.slice(0, 3).map((item) => (
          <NavItem
            key={`mobile-${item.label}`}
            item={item}
            pathname={pathname}
            source={source}
            onIntent={preloadRoute}
            onNavigate={beginNavigate}
          />
        ))}
        <Link
          className="study-shell-nav-item"
          href="/?openLibrary=1"
          prefetch={false}
          onPointerEnter={() => preloadRoute("/?openLibrary=1")}
          onPointerDown={() => preloadRoute("/?openLibrary=1")}
          onFocus={() => preloadRoute("/?openLibrary=1")}
          onClick={() => beginNavigate("/?openLibrary=1")}
        >
          <LibraryBig aria-hidden="true" /><span>词库</span>
        </Link>
        <details className="study-mobile-more">
          <summary
            className={`study-shell-nav-item${mobileMoreActive ? " is-active" : ""}`}
            aria-current={mobileMoreActive ? "page" : undefined}
          ><Menu aria-hidden="true" /><span>更多</span></summary>
          <nav className="study-mobile-more-menu">
            {MOBILE_MORE_NAV.map((item) => (
              <NavItem
                key={`more-${item.label}`}
                item={item}
                pathname={pathname}
                source={source}
                onIntent={preloadRoute}
                onNavigate={beginNavigate}
              />
            ))}
          </nav>
        </details>
      </nav>
    </>
  );
}
