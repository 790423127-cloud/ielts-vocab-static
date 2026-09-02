"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Bookmark,
  CheckSquare2,
  CircleX,
  Clock3,
  FileText,
  LibraryBig,
  Menu,
  MessageSquareText,
  Moon,
  PencilLine,
  Search,
  Sun
} from "lucide-react";
import FontScaleControl from "./FontScaleControl.jsx";
import {
  CURRENT_SYSTEM_SEARCH_REQUEST_EVENT,
  CURRENT_SYSTEM_SEARCH_RESULTS_EVENT,
  CURRENT_SYSTEM_SEARCH_SELECT_EVENT
} from "../lib/vocab/current-system-search.mjs";
import {
  EFFECTIVE_STUDY_TIME_STORAGE_KEY,
  EFFECTIVE_STUDY_TIME_UPDATE_EVENT,
  EFFECTIVE_STUDY_MODULE_CHANGE_EVENT,
  calculateEffectiveStudyStreak,
  formatEffectiveStudyTime,
  getEffectiveStudyIntensity,
  getEffectiveStudyModule,
  getEffectiveStudyModuleMs,
  getRecentEffectiveStudyDays,
  migrateLegacySpellingActiveTime,
  readEffectiveStudyHistory,
  resolveEffectiveStudyModule,
  toEffectiveStudyDayKey
} from "../lib/study-time/effective-study-time.mjs";

const PAGE_CONTEXT = [
  { test: (path) => path === "/", title: "主词库刷词", meta: "今日学习" },
  { test: (path) => path === "/spelling-phrases", title: "词组拼写训练", meta: "短语" },
  { test: (path) => path.startsWith("/spelling"), title: "单词拼写训练", meta: "主词库" },
  { test: (path) => path === "/meaning-en", title: "中文选英文", meta: "核心词汇" },
  { test: (path) => path === "/meaning", title: "看词选意思", meta: "核心词汇" },
  { test: (path) => path === "/expressions", title: "高频表达", meta: "口语与写作" },
  { test: (path) => path === "/basic", title: "零基础词库", meta: "独立进度" },
  { test: (path) => path === "/ielts-538", title: "538考点", meta: "376词 · 1257组新增真题替换" },
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
      { href: "/spelling-words", label: "拼写训练", icon: PencilLine, matches: (path, source) => path === "/spelling-words" && !source },
      { href: "/spelling-phrases", label: "词组拼写", icon: PencilLine, matches: (path) => path === "/spelling-phrases" },
      { href: "/meaning", label: "选义训练", icon: CheckSquare2, matches: (path) => path === "/meaning" },
      { href: "/meaning-en", label: "中文选英文", icon: CheckSquare2, matches: (path) => path === "/meaning-en" },
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
      { href: "/reading-words", label: "阅读生词本", icon: FileText, matches: (path) => path === "/reading-words" }
    ]
  },
  {
    label: "数据",
    items: [
      { href: "/?openLibrary=1", label: "词库管理", icon: LibraryBig, matches: () => false }
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
  // The 24 MB G-reading body is intentionally excluded: that page performs
  // its own revision-aware load. Prefetching it with force-cache while the
  // page requests no-store can otherwise download the same file twice.
  "/reading-g": ["/data/reading-g-paraphrases.json", "/data/reading-g-question-evidence.json"],
  "/reading-paraphrases": ["/data/listening-reading-paraphrases.json"],
  "/expressions": ["/data/speaking-writing-phrases-700.json"]
};

function formatStudyDayLabel(dayKey) {
  const [, month, day] = String(dayKey || "").split("-");
  return month && day ? `${Number(month)}月${Number(day)}日` : dayKey;
}

function getStudyMonthDays(monthKey) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  if (!year || !month) return [];
  const first = new Date(year, month - 1, 1, 12);
  const lastDay = new Date(year, month, 0, 12).getDate();
  const leading = (first.getDay() + 6) % 7;
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: lastDay }, (_, index) => {
      const date = new Date(year, month - 1, index + 1, 12);
      return { key: toEffectiveStudyDayKey(date.getTime()), date };
    })
  ];
}

function EffectiveStudyTimeCard({ module, history, todayKey, compact = false }) {
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [monthKey, setMonthKey] = useState(todayKey.slice(0, 7));
  const recentDays = useMemo(
    () => getRecentEffectiveStudyDays(14, new Date(`${todayKey}T12:00:00`).getTime()),
    [todayKey]
  );
  const monthDays = useMemo(() => getStudyMonthDays(monthKey), [monthKey]);
  const selectedMs = getEffectiveStudyModuleMs(history, module.key, selectedDay);
  const todayMs = getEffectiveStudyModuleMs(history, module.key, todayKey);
  const streak = calculateEffectiveStudyStreak(history, module.key, new Date(`${todayKey}T12:00:00`).getTime());
  const earliestMonth = getRecentEffectiveStudyDays(365, new Date(`${todayKey}T12:00:00`).getTime())[0].key.slice(0, 7);

  useEffect(() => {
    setSelectedDay(todayKey);
    setMonthKey(todayKey.slice(0, 7));
    setHistoryOpen(false);
  }, [module.key, todayKey]);

  const renderDayButton = (entry, extraClass = "") => {
    if (!entry) return <span className="study-time-calendar__empty" aria-hidden="true" />;
    const activeMs = getEffectiveStudyModuleMs(history, module.key, entry.key);
    const selected = entry.key === selectedDay;
    const isFuture = entry.key > todayKey;
    const label = `${formatStudyDayLabel(entry.key)}，${formatEffectiveStudyTime(activeMs)}`;
    return (
      <button
        type="button"
        key={entry.key}
        className={`${extraClass}${selected ? " is-selected" : ""}`}
        data-level={getEffectiveStudyIntensity(activeMs)}
        aria-label={label}
        aria-pressed={selected}
        disabled={isFuture}
        title={label}
        onClick={() => {
          if (!isFuture) setSelectedDay(entry.key);
        }}
      >
        <span>{entry.date.getDate()}</span>
      </button>
    );
  };

  return (
    <section className={`study-habit-card study-time-card${compact ? " study-time-card--compact" : ""}`} aria-label={`${module.label}有效学习时间`}>
      <div className="study-habit-card__head">
        <span>{module.label}</span>
        <Clock3 aria-hidden="true" />
      </div>
      <div className="study-time-card__date">{selectedDay === todayKey ? "今日有效学习" : formatStudyDayLabel(selectedDay)}</div>
      <strong>{formatEffectiveStudyTime(selectedMs)}</strong>
      <div className="study-time-card__subline">
        <span>今日 {formatEffectiveStudyTime(todayMs, { compact: true })}</span>
        <span>连续 {streak} 天</span>
      </div>
      <div className="study-mini-calendar study-time-calendar" aria-label={`${module.label}最近十四天学习时间`}>
        {recentDays.map((entry) => renderDayButton(entry))}
      </div>
      <div className="study-time-card__footer">
        <span>颜色越深，学习越久</span>
        <button type="button" onClick={() => setHistoryOpen(true)}>查看历史</button>
      </div>

      {historyOpen ? (
        <div className="study-time-history-overlay" role="presentation" onMouseDown={() => setHistoryOpen(false)}>
          <section className="study-time-history-dialog" role="dialog" aria-modal="true" aria-label={`${module.label}历史学习时间`} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>模块历史</span>
                <strong>{module.label}</strong>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="关闭历史记录">×</button>
            </header>
            <div className="study-time-history-summary">
              <span>{selectedDay === todayKey ? "今天" : formatStudyDayLabel(selectedDay)}</span>
              <strong>{formatEffectiveStudyTime(selectedMs)}</strong>
            </div>
            <label className="study-time-month-picker">
              <span>选择月份</span>
              <input
                type="month"
                min={earliestMonth}
                max={todayKey.slice(0, 7)}
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value || todayKey.slice(0, 7))}
              />
            </label>
            <div className="study-time-history-weekdays" aria-hidden="true">
              {"一二三四五六日".split("").map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="study-time-history-calendar">
              {monthDays.map((entry, index) => entry
                ? renderDayButton(entry, "study-time-history-day")
                : <span className="study-time-calendar__empty" aria-hidden="true" key={`empty-${index}`} />)}
            </div>
            <p>仅显示当前模块；记录保留最近一年。</p>
          </section>
        </div>
      ) : null}
    </section>
  );
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
  const [currentSystemSearch, setCurrentSystemSearch] = useState({
    status: "idle",
    requestId: "",
    query: "",
    results: [],
    total: 0
  });
  const [theme, setTheme] = useState("light");
  const [studyTimeHistory, setStudyTimeHistory] = useState(() => readEffectiveStudyHistory());
  const [todayKey, setTodayKey] = useState(() => toEffectiveStudyDayKey());
  const routeStudyModule = resolveEffectiveStudyModule(pathname);
  const [studyModuleKey, setStudyModuleKey] = useState(routeStudyModule?.key || "");
  const [navPending, setNavPending] = useState(false);
  const searchFormRef = useRef(null);
  const searchRequestCounterRef = useRef(0);
  const prefetchedRoutesRef = useRef(new Set());
  const prefetchedDataRef = useRef(new Set());
  const context = PAGE_CONTEXT.find((entry) => entry.test(pathname)) || { title: "IELTS 学习工作台", meta: "专注训练" };
  const studyModule = getEffectiveStudyModule(studyModuleKey) || routeStudyModule;
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
    setCurrentSystemSearch({ status: "idle", requestId: "", query: "", results: [], total: 0 });
  }, [pathname, source]);

  useEffect(() => {
    const handleResults = (event) => {
      const detail = event.detail || {};
      setCurrentSystemSearch((current) => {
        if (!current.requestId || detail.requestId !== current.requestId) return current;
        const results = Array.isArray(detail.results) ? detail.results : [];
        return {
          status: "ready",
          requestId: current.requestId,
          query: current.query,
          results,
          total: Number.isInteger(detail.total) ? detail.total : results.length
        };
      });
    };
    const closeResults = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && searchFormRef.current?.contains(event.target)) return;
      setCurrentSystemSearch((current) => current.status === "idle"
        ? current
        : { status: "idle", requestId: "", query: "", results: [], total: 0 });
    };

    window.addEventListener(CURRENT_SYSTEM_SEARCH_RESULTS_EVENT, handleResults);
    document.addEventListener("pointerdown", closeResults);
    document.addEventListener("keydown", closeResults);
    return () => {
      window.removeEventListener(CURRENT_SYSTEM_SEARCH_RESULTS_EVENT, handleResults);
      document.removeEventListener("pointerdown", closeResults);
      document.removeEventListener("keydown", closeResults);
    };
  }, []);

  useEffect(() => {
    const fallbackKey = resolveEffectiveStudyModule(pathname)?.key || "";
    const syncFromPage = () => {
      const pageModuleKey = pathname === "/"
        ? document.querySelector("main[data-effective-study-module]")?.getAttribute("data-effective-study-module")
        : "";
      setStudyModuleKey(getEffectiveStudyModule(pageModuleKey)?.key || fallbackKey);
    };
    const handleModuleChange = (event) => {
      if (pathname !== "/") return;
      const nextModule = getEffectiveStudyModule(event.detail?.moduleKey);
      if (nextModule) setStudyModuleKey(nextModule.key);
    };

    syncFromPage();
    window.addEventListener(EFFECTIVE_STUDY_MODULE_CHANGE_EVENT, handleModuleChange);
    return () => window.removeEventListener(EFFECTIVE_STUDY_MODULE_CHANGE_EVENT, handleModuleChange);
  }, [pathname]);

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
  }, []);

  useEffect(() => {
    setStudyTimeHistory(migrateLegacySpellingActiveTime());
    const refresh = () => {
      setTodayKey(toEffectiveStudyDayKey());
      setStudyTimeHistory(readEffectiveStudyHistory());
    };
    const handleStorage = (event) => {
      if (event.key === EFFECTIVE_STUDY_TIME_STORAGE_KEY) refresh();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener(EFFECTIVE_STUDY_TIME_UPDATE_EVENT, refresh);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(EFFECTIVE_STUDY_TIME_UPDATE_EVENT, refresh);
      window.removeEventListener("storage", handleStorage);
    };
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
    const requestId = `${pathname}:${searchRequestCounterRef.current + 1}`;
    searchRequestCounterRef.current += 1;
    setCurrentSystemSearch({
      status: "loading",
      requestId,
      query: cleanQuery,
      results: [],
      total: 0
    });
    window.dispatchEvent(new CustomEvent(CURRENT_SYSTEM_SEARCH_REQUEST_EVENT, {
      detail: { query: cleanQuery, requestId }
    }));
    window.setTimeout(() => {
      setCurrentSystemSearch((current) => current.requestId === requestId && current.status === "loading"
        ? { ...current, status: "unavailable" }
        : current);
    }, 1000);
  };

  const selectCurrentSystemSearchResult = (result) => {
    window.dispatchEvent(new CustomEvent(CURRENT_SYSTEM_SEARCH_SELECT_EVENT, {
      detail: { ...result, requestId: currentSystemSearch.requestId }
    }));
    setQuery(result.word || query);
    setCurrentSystemSearch({ status: "idle", requestId: "", query: "", results: [], total: 0 });
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
        <form className="study-global-search" role="search" onSubmit={submitSearch} ref={searchFormRef}>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentSystemSearch({ status: "idle", requestId: "", query: "", results: [], total: 0 });
            }}
            placeholder="搜索当前系统的单词、短语或释义"
            aria-label="搜索当前系统词表"
            aria-expanded={currentSystemSearch.status !== "idle"}
            aria-controls="study-global-search-results"
          />
          <button type="submit">查询</button>
          {currentSystemSearch.status !== "idle" ? (
            <div className="study-global-search-results" id="study-global-search-results" aria-live="polite">
              {currentSystemSearch.status === "loading" ? (
                <p>正在查找“{currentSystemSearch.query}”…</p>
              ) : currentSystemSearch.status === "unavailable" ? (
                <p>当前页面暂不支持顶部查词。</p>
              ) : currentSystemSearch.results.length ? (
                <>
                  <div className="study-global-search-results__list" aria-label="顶部查词结果">
                    {currentSystemSearch.results.map((result) => (
                      <button
                        type="button"
                        key={result.key}
                        onClick={() => selectCurrentSystemSearchResult(result)}
                      >
                        <strong>{result.word}</strong>
                        <span>{result.meaning || "释义待补"}</span>
                      </button>
                    ))}
                  </div>
                  <p>找到 {currentSystemSearch.total} 条，显示前 {currentSystemSearch.results.length} 条</p>
                </>
              ) : (
                <p>没有找到“{currentSystemSearch.query}”。</p>
              )}
            </div>
          ) : null}
        </form>
        <div className="study-header-tools">
          {studyModule ? (
            <details className="study-time-compact-trigger" key={`time-trigger-${studyModule.key}`}>
              <summary title={`${studyModule.label}今日有效学习`}>
                <Clock3 aria-hidden="true" />
                <span>{formatEffectiveStudyTime(getEffectiveStudyModuleMs(studyTimeHistory, studyModule.key, todayKey), { compact: true })}</span>
              </summary>
              <div className="study-time-compact-popover">
                <EffectiveStudyTimeCard key={`compact-${studyModule.key}`} module={studyModule} history={studyTimeHistory} todayKey={todayKey} compact />
              </div>
            </details>
          ) : null}
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

        {studyModule ? (
          <EffectiveStudyTimeCard key={studyModule.key} module={studyModule} history={studyTimeHistory} todayKey={todayKey} />
        ) : null}
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
