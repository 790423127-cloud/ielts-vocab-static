"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function VirtualList({
  items = [],
  itemHeight = 56,
  height = 300,
  overscan = 6,
  className = "",
  resetKey = "",
  role = "list",
  itemRole = "listitem",
  getKey,
  renderItem
}) {
  const listRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRafRef = useRef(0);
  const pendingScrollTopRef = useRef(0);
  const safeItems = Array.isArray(items) ? items : [];
  const rowHeight = Math.max(1, Number(itemHeight) || 56);
  const maxHeight = Math.max(rowHeight, Number(height) || 300);
  const viewportHeight = Math.min(maxHeight, Math.max(rowHeight, safeItems.length * rowHeight));
  const totalHeight = safeItems.length * rowHeight;

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
      style={{ height: viewportHeight }}
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