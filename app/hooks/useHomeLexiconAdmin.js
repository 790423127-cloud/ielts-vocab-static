"use client";
/**
 * Home lexicon admin composer (local + AI + IO).
 * Split in v2026-07-10.3 for maintainability.
 */
import { createLocalOps } from "./useHomeLexiconAdmin.local.js";
import { createAiOps } from "./useHomeLexiconAdmin.ai.js";
import { createIoOps } from "./useHomeLexiconAdmin.io.js";

export function useHomeLexiconAdmin(ctx) {
  const local = createLocalOps(ctx);
  const ai = createAiOps({ ...ctx, ...local });
  const io = createIoOps({ ...ctx, ...local, ...ai });
  return { ...local, ...ai, ...io };
}
