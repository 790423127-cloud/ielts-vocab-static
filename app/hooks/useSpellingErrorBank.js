"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { mergeErrorBankRecords, summarizeErrorBankItems } from "../lib/spelling/error-bank.mjs";
import { recoverAndPersistSpellingErrorBank } from "../lib/spelling/error-bank-recovery.mjs";
import { SpellingIndexedDbStore } from "../lib/spelling/indexeddb-store.mjs";

export function useSpellingErrorBank(lexiconEntries = [], options = {}) {
  const scope = options.scope || "word";
  const activeOnly = options.activeOnly === true;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const recoveryRef = useRef({
    scope: "",
    lexiconEntries: null,
    promise: null,
    promiseScope: "",
    promiseLexiconEntries: null
  });

  const refresh = useCallback(async () => {
    if (!Array.isArray(lexiconEntries) || !lexiconEntries.length) {
      setItems([]);
      setLoading(false);
      setError("");
      return [];
    }

    setLoading(true);
    let activeRecoveryPromise = null;

    try {
      const store = new SpellingIndexedDbStore({ scope });
      await store.open();
      const recovery = recoveryRef.current;
      const needsRecovery = recovery.scope !== scope || recovery.lexiconEntries !== lexiconEntries;

      if (needsRecovery) {
        const matchingRecovery = (
          recovery.promise
          && recovery.promiseScope === scope
          && recovery.promiseLexiconEntries === lexiconEntries
        );
        if (!matchingRecovery) {
          recovery.promise = recoverAndPersistSpellingErrorBank(store, lexiconEntries, { scope });
          recovery.promiseScope = scope;
          recovery.promiseLexiconEntries = lexiconEntries;
        }
        activeRecoveryPromise = recovery.promise;
        await activeRecoveryPromise;
        if (recovery.promise === activeRecoveryPromise) {
          recovery.scope = scope;
          recovery.lexiconEntries = lexiconEntries;
          recovery.promise = null;
          recovery.promiseScope = "";
          recovery.promiseLexiconEntries = null;
        }
      }

      const records = await store.getAllErrorBankRecords();
      const merged = mergeErrorBankRecords(records, lexiconEntries, { activeOnly });
      setItems(merged);
      setError("");
      return merged;
    } catch (loadError) {
      if (recoveryRef.current.promise === activeRecoveryPromise) {
        recoveryRef.current.promise = null;
        recoveryRef.current.promiseScope = "";
        recoveryRef.current.promiseLexiconEntries = null;
      }
      setItems([]);
      setError(loadError?.message || String(loadError));
      return [];
    } finally {
      setLoading(false);
    }
  }, [lexiconEntries, activeOnly, scope]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const summary = summarizeErrorBankItems(items);

  return {
    items,
    summary,
    count: summary.distinct,
    totalWrongAttempts: summary.totalWrongAttempts,
    loading,
    error,
    refresh
  };
}

export default useSpellingErrorBank;
