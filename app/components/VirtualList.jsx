"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export default function VirtualList({
  items = [],
  itemHeight = 56,
  height = 300,
  fill = false,
  overscan = 6,
  className = "",
  resetKey = "",
  scrollToIndex = null,
  role = "list",
  itemRole = "listitem",
  getKey,
  renderItem
}) {
  const listRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const scrollRafRef = useRef(0);
  const pendingScrollTopRef = useRef(0);
  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const rowHeight = Math.max(1, Number(itemHeight) || 56);
  const maxHeight = Math.max(rowHeight, Number(height) || 300);
  const viewportHeight = fill
    ? Math.max(rowHeight, measuredHeight || Math.min(maxHeight, safeItems.length * rowHeight))
    : Math.min(maxHeight, Math.max(rowHeight, safeItems.length * rowHeight));
  const totalHeight = safeItems.length * rowHeight;

  useLayoutEffect(() => {
    if (!fill || !listRef.current || typeof ResizeObserver === "undefined") return undefined;
    const list = listRef.current;
    const updateHeight = () => {
      const nextHeight = Math.max(0, Math.round(list.getBoundingClientRect().height));
      setMeasuredHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(list);
    return () => observer.disconnect();
  }, [fill]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setScrollTop(0);
    pendingScrollTopRef.current = 0;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [resetKey]);

  useLayoutEffect(() => {
    const index = Number(scrollToIndex);
    const list = listRef.current;
    if (!list || !Number.isInteger(index) || index < 0 || index >= safeItems.length) return;
    const visibleHeight = list.clientHeight || viewportHeight;
    const rowTop = index * rowHeight;
    const rowBottom = rowTop + rowHeight;
    let nextScrollTop = list.scrollTop;
    if (rowTop < list.scrollTop) nextScrollTop = rowTop;
    else if (rowBottom > list.scrollTop + visibleHeight) {
      nextScrollTop = Math.max(0, rowBottom - visibleHeight);
    }
    if (nextScrollTop === list.scrollTop) return;
    list.scrollTop = nextScrollTop;
    pendingScrollTopRef.current = nextScrollTop;
    setScrollTop(nextScrollTop);
  }, [rowHeight, safeItems.length, scrollToIndex, viewportHeight]);

  const visibleRows = useMemo(() => {
    if (!safeItems.length) return [];
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(
      safeItems.length,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
    );

    return safeItems.slice(start, end).map((item, offset) => ({
      item,
      index: start + offset
    }));
  }, [safeItems, rowHeight, overscan, scrollTop, viewportHeight]);

  function handleScroll(event) {
    pendingScrollTopRef.current = event.currentTarget.scrollTop;
    if (scrollRafRef.current) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      setScrollTop(pendingScrollTopRef.current);
    });
  }

  return (
    <div
      ref={listRef}
      className={`virtual-list${className ? ` ${className}` : ""}`}
      style={fill ? undefined : { height: viewportHeight }}
      role={role}
      onScroll={handleScroll}
    >
      <div className="virtual-list__spacer" style={{ height: totalHeight }}>
        {visibleRows.map(({ item, index }) => (
          <div
            key={getKey ? getKey(item, index) : index}
            className="virtual-list__row"
            role={itemRole}
            style={{
              height: rowHeight,
              transform: `translateY(${index * rowHeight}px)`
            }}
          >
            {renderItem?.(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
