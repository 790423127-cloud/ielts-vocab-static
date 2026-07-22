"use client";

import { useCallback, useEffect, useState } from "react";

import { SpellingIndexedDbStore } from "../lib/spelling/indexeddb-store.mjs";
import { mergeDueSrsRecords } from "../lib/spelling/srs-review.mjs";

export function useSpellingSrsReview(lexiconEntries = [], options = {}) {
  const scope = options.scope || "word";
  const refreshKey = options.refreshKey || "";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!Array.isArray(lexiconEntries) || !lexiconEntries.length) {
      setItems([]);
      setLoading(false);
      setError("");
      return [];
    }

    setLoading(true);
    try {
      const store = new SpellingIndexedDbStore({ scope });
      const records = await store.getDueSrsReviews(Date.now());
      const merged = mergeDueSrsRecords(records, lexiconEntries);
      setItems(merged);
      setError("");
      return merged;
    } catch (loadError) {
      setItems([]);
      setError(loadError?.message || String(loadError));
      return [];
    } finally {
      setLoading(false);
    }
  }, [lexiconEntries, scope]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  return { items, count: items.length, loading, error, refresh };
}

export default useSpellingSrsReview;
