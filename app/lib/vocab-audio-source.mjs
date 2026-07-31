import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import {
  REAL_AUDIO_ENHANCE_VERSION,
  enhanceRealAudioBuffer,
  needsEdgeAudioEnhance,
  needsRealAudioEnhance,
  resolveEnhanceBitrate,
  resolveEnhanceFilter
} from "./real-audio-enhance.mjs";

export const REAL_AUDIO_CACHE_VERSION = "real-ll-wav-v1";

export function cacheDir() {
  const dir = path.join(process.cwd(), ".audio-cache");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function audioIndexPath() {
  return path.join(cacheDir(), "audio-index.json");
}

export function pronunciationCachePath() {
  return path.join(cacheDir(), "pronunciation-cache.json");
}

let audioIndexMemo = {
  file: "",
  mtimeMs: -1,
  size: -1,
  value: null
};

function isAudioIndexFile(file) {
  return path.resolve(String(file || "")) === path.resolve(audioIndexPath());
}

export function isReadableAudioFile(filepath) {
  try {
    if (!filepath) return false;
    const stat = statSync(filepath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

export function readJson(file, fallback = {}) {
  try {
    if (!existsSync(file)) return fallback;
    const memoized = isAudioIndexFile(file);
    const stat = memoized ? statSync(file) : null;
    if (
      memoized &&
      audioIndexMemo.file === file &&
      audioIndexMemo.mtimeMs === stat.mtimeMs &&
      audioIndexMemo.size === stat.size &&
      audioIndexMemo.value
    ) {
      return audioIndexMemo.value;
    }

    const value = JSON.parse(readFileSync(file, "utf-8") || JSON.stringify(fallback));
    if (memoized) {
      audioIndexMemo = {
        file,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        value
      };
    }
    return value;
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  try {
    writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    if (isAudioIndexFile(file)) {
      const stat = statSync(file);
      audioIndexMemo = {
        file,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        value: data
      };
    }
  } catch {}
}

export function normalizeAudioKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function safeSpeechText(value, maxLength = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function isSimpleDictionaryWord(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z][A-Za-z'-]*$/.test(text);
}

export function hashText(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex")
    .slice(0, 32);
}

export function extensionFromAudio(url = "", contentType = "") {
  const lowerType = String(contentType || "").toLowerCase();
  const lowerUrl = String(url || "").toLowerCase().split("?")[0];

  if (lowerType.includes("mpeg") || lowerType.includes("mp3") || lowerUrl.endsWith(".mp3")) return "mp3";
  if (lowerType.includes("ogg") || lowerUrl.endsWith(".ogg") || lowerUrl.endsWith(".oga")) return "ogg";
  if (lowerType.includes("wav") || lowerUrl.endsWith(".wav")) return "wav";
  if (lowerType.includes("webm") || lowerUrl.endsWith(".webm")) return "webm";
  return "mp3";
}

export function contentTypeFromExtension(extension = "mp3") {
  if (extension === "ogg" || extension === "oga") return "audio/ogg";
  if (extension === "wav") return "audio/wav";
  if (extension === "webm") return "audio/webm";
  return "audio/mpeg";
}

function normalizeRemoteAudioUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

export function isLinguaLibreEngWavTitle(title = "") {
  const value = String(title || "");
  if (!/^File:LL-Q1860 \(eng\)-.+\.wav$/i.test(value)) return false;
  if (NON_ENGLISH_COMMONS_HINT_RE.test(value)) return false;
  return true;
}

function isAcceptedRealVoiceCandidate(candidate = {}) {
  if (!candidate?.audioUrl) return false;
  if (candidate.source === "real-dictionary") return false;
  return isLinguaLibreEngWavTitle(candidate.title || "");
}

export function scoreRealVoiceCandidate(candidate = {}, targetWord = "") {
  if (!isAcceptedRealVoiceCandidate(candidate)) return -1;

  const title = String(candidate.title || "");
  const spoken = normalizeAudioKey(extractCommonsSpokenText(title));
  const target = normalizeAudioKey(targetWord);
  let score = 0;

  if (target && spoken === target) score += 200;
  if (/^File:LL-Q1860 \(eng\)-/i.test(title)) score += 100;
  if (/\.wav$/i.test(title)) score += 40;

  return score;
}

function pickBestRealVoiceCandidate(candidates = [], targetWord = "") {
  return [...candidates]
    .filter((item) => isAcceptedRealVoiceCandidate(item))
    .sort((left, right) => (
      scoreRealVoiceCandidate(right, targetWord) - scoreRealVoiceCandidate(left, targetWord)
    ))[0] || null;
}

const NON_ENGLISH_COMMONS_HINT_RE = /mandarin|chinese pronunciation|tbilisi|tlelingit|wet.?suwet|karbi|musqueam|ǃ|ǁ/i;

export function extractCommonsSpokenText(title = "") {
  const clean = String(title || "").replace(/^File:/i, "").trim();

  const linguaLibre = clean.match(/^LL-Q1860 \(eng\)-.+?-(.+)\.(wav|ogg|oga|mp3|flac)$/i);
  if (linguaLibre) return linguaLibre[1].trim();

  const enVariant = clean.match(/^En-(?:us|uk|au)[ -]+(.+?)\.(wav|ogg|oga|mp3|flac)$/i);
  if (enVariant) return enVariant[1].trim();

  const pronunciationInEnglish = clean.match(/^(.+?)\s+pronunciation\s+in\s+english\.(wav|ogg|oga|mp3|flac)$/i);
  if (pronunciationInEnglish) return pronunciationInEnglish[1].trim();

  return "";
}

export function isEnglishCommonsTitle(title = "") {
  return isLinguaLibreEngWavTitle(title);
}

export function matchesCommonsAudioTarget(searchText = "", title = "", kind = "word") {
  if (!isLinguaLibreEngWavTitle(title)) return false;

  const spoken = normalizeAudioKey(extractCommonsSpokenText(title));
  const target = normalizeAudioKey(searchText);
  if (!spoken || !target) return false;

  if (kind === "word") {
    if (spoken === target) return true;

    const tokens = spoken.split(/[\s-]+/).filter(Boolean);
    if (tokens.length === 1) return tokens[0] === target;

    return false;
  }

  if (spoken === target) return true;
  if (spoken.includes(target) && target.length >= 8) return true;
  if (target.includes(spoken) && spoken.length >= 8) return true;

  const targetTokens = target.split(/\s+/).filter(Boolean);
  if (!targetTokens.length) return false;
  const matched = targetTokens.filter((token) => spoken.includes(token));
  return matched.length >= Math.ceil(targetTokens.length * 0.8);
}

function scoreValidatedCommonsAudio(title = "", searchText = "", kind = "word") {
  if (!matchesCommonsAudioTarget(searchText, title, kind)) return -1;

  const spoken = normalizeAudioKey(extractCommonsSpokenText(title));
  const target = normalizeAudioKey(searchText);
  let score = 0;

  if (/^File:LL-Q1860 \(eng\)-/i.test(title)) score += 8;
  if (spoken === target) score += 50;

  return score;
}

async function resolveCommonsFileUrl(title, timeoutMs = 1400) {
  const params = new URLSearchParams({
    action: "query",
    titles: title.startsWith("File:") ? title : `File:${title}`,
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    format: "json",
    origin: "*"
  });
  const res = await fetchWithTimeout(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, timeoutMs);
  if (!res.ok) return null;

  const data = await res.json();
  const page = Object.values(data?.query?.pages || {})[0];
  const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
  const audioUrl = normalizeRemoteAudioUrl(info?.url || "");
  const mime = String(info?.mime || "");
  const resolvedTitle = page?.title || title;
  if (!audioUrl || !/^audio\//i.test(mime)) return null;
  if (!isLinguaLibreEngWavTitle(resolvedTitle)) return null;

  return {
    audioUrl,
    mime,
    title: resolvedTitle,
    license: info?.extmetadata?.LicenseShortName?.value || "",
    attribution: info?.extmetadata?.Artist?.value || info?.extmetadata?.Credit?.value || ""
  };
}

function buildValidatedCommonsSource(file, provider = "Wikimedia Commons") {
  return {
    audioUrl: file.audioUrl,
    phonetic: "",
    source: "real-commons",
    provider,
    license: file.license || "Commons file license",
    attribution: file.attribution || file.title || provider,
    title: file.title
  };
}

async function fetchWithTimeout(url, timeoutMs = 2000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "ielts-vocab-local-audio/1.0",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function searchCommonsPronunciation(search, cleanText, kind = "word", timeoutMs = 1400, limit = 10) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: search,
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    format: "json",
    origin: "*"
  });
  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
  const res = await fetchWithTimeout(url, timeoutMs, {
    next: { revalidate: 86400 }
  });

  if (!res.ok) return null;

  const data = await res.json();
  const pages = Object.values(data?.query?.pages || {});
  const candidates = pages
    .map((page) => {
      const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
      const audioUrl = normalizeRemoteAudioUrl(info?.url || "");
      const mime = String(info?.mime || "");
      return {
        audioUrl,
        mime,
        title: page.title || "",
        license: info?.extmetadata?.LicenseShortName?.value || "",
        attribution: info?.extmetadata?.Artist?.value || info?.extmetadata?.Credit?.value || ""
      };
    })
    .filter((item) => (
      item.audioUrl &&
      /^audio\//i.test(item.mime) &&
      isLinguaLibreEngWavTitle(item.title) &&
      matchesCommonsAudioTarget(cleanText, item.title, kind)
    ));

  candidates.sort((left, right) => (
    scoreValidatedCommonsAudio(right.title, cleanText, kind)
    - scoreValidatedCommonsAudio(left.title, cleanText, kind)
  ));

  const best = candidates[0];
  if (!best?.audioUrl) return null;

  return buildValidatedCommonsSource(best);
}

function speechSearchVariants(text = "") {
  const cleanText = safeSpeechText(text, 80);
  if (!cleanText) return [];

  const variants = [cleanText];
  const capitalized = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
  if (capitalized !== cleanText) variants.push(capitalized);
  return [...new Set(variants)];
}

async function fetchTargetedCommonsPronunciation(word, timeoutMs = 1400) {
  const cleanText = safeSpeechText(word, 80);
  if (!cleanText || !isSimpleDictionaryWord(cleanText)) return null;

  const searches = [];
  for (const variant of speechSearchVariants(cleanText)) {
    searches.push(`"LL-Q1860 (eng)" ${variant}`);
    searches.push(`"${variant}" "LL-Q1860 (eng)"`);
  }

  for (const search of searches) {
    const found = await searchCommonsPronunciation(search, cleanText, "word", timeoutMs, 8);
    if (found?.audioUrl) return found;
  }

  return null;
}

async function fetchWiktionaryPageContent(word, timeoutMs = 1600) {
  const params = new URLSearchParams({
    action: "query",
    titles: word,
    prop: "revisions",
    rvprop: "content",
    format: "json",
    origin: "*"
  });
  const res = await fetchWithTimeout(`https://en.wiktionary.org/w/api.php?${params.toString()}`, timeoutMs);
  if (!res.ok) return "";

  const data = await res.json();
  const page = Object.values(data?.query?.pages || {})[0];
  if (!page || page?.missing) return "";
  return page?.revisions?.[0]?.["*"] || "";
}

async function fetchWiktionaryPronunciation(word, timeoutMs = 1600) {
  if (!isSimpleDictionaryWord(word)) return null;

  let content = "";
  for (const variant of speechSearchVariants(word)) {
    content = await fetchWiktionaryPageContent(variant, timeoutMs);
    if (content) break;
  }
  if (!content) return null;

  const filenames = new Set();
  const patterns = [
    /LL-Q1860 \(eng\)-[^|}\n]+\.wav/gi
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      filenames.add(match[0]);
    }
  }

  const ranked = [...filenames]
    .map((filename) => {
      const title = filename.startsWith("File:") ? filename : `File:${filename}`;
      return {
        title,
        score: scoreValidatedCommonsAudio(title, word, "word")
      };
    })
    .filter((item) => item.score >= 0)
    .sort((left, right) => right.score - left.score);

  for (const candidate of ranked.slice(0, 4)) {
    const resolved = await resolveCommonsFileUrl(candidate.title, timeoutMs);
    if (resolved?.audioUrl && matchesCommonsAudioTarget(word, resolved.title, "word")) {
      return buildValidatedCommonsSource(resolved, "Wiktionary / Wikimedia Commons");
    }
  }

  return null;
}

export async function resolveRealVoiceAudioSource(text, options = {}) {
  const kind = options.kind || "word";
  const cleanText = safeSpeechText(text, kind === "sentence" ? 500 : 160);
  if (!cleanText) return null;
  const timeoutMs = options.timeoutMs || (kind === "sentence" ? 900 : 1600);

  if (kind === "word" && isSimpleDictionaryWord(cleanText)) {
    const settled = await Promise.allSettled([
      fetchWiktionaryPronunciation(cleanText, timeoutMs),
      fetchTargetedCommonsPronunciation(cleanText, timeoutMs)
    ]);

    const candidates = settled
      .filter((item) => item.status === "fulfilled")
      .map((item) => item.value)
      .filter((item) => isAcceptedRealVoiceCandidate(item));

    return pickBestRealVoiceCandidate(candidates, cleanText);
  }

  return null;
}

export function isValidCachedRealAudioEntry(entry = {}, expectedText = "", kind = "word") {
  if (!entry?.realAudio || !entry?.hasAudio || !entry?.filename) return false;

  if (entry.source === "real-dictionary") return false;

  if (entry.source === "real-commons") {
    const text = safeSpeechText(expectedText || entry.text || "", kind === "sentence" ? 500 : 160);
    const title = entry.title || "";
    if (!text || !title || !isLinguaLibreEngWavTitle(title)) return false;
    return matchesCommonsAudioTarget(text, title, kind);
  }

  return false;
}

export async function downloadRemoteAudio(source, options = {}) {
  if (!source?.audioUrl) return null;

  const res = await fetchWithTimeout(source.audioUrl, options.timeoutMs || 4500);
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") || "";
  if (contentType && !/^audio\//i.test(contentType)) return null;

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) return null;

  const extension = extensionFromAudio(source.audioUrl, contentType);
  return {
    buffer,
    extension,
    contentType: contentTypeFromExtension(extension)
  };
}

export async function ensureRealVoiceAudio(text, audioIndex, options = {}) {
  const kind = options.kind || "word";
  const cleanText = safeSpeechText(text, kind === "sentence" ? 500 : 160);
  if (!cleanText) return { ok: false, source: "none" };

  const key = normalizeAudioKey(cleanText);
  const found = await resolveRealVoiceAudioSource(cleanText, { kind });

  if (!found?.audioUrl) {
    audioIndex[key] = {
      ...(audioIndex[key] || {}),
      text: cleanText,
      kind,
      realAudioUnavailable: true,
      realAudioVersion: REAL_AUDIO_CACHE_VERSION,
      realCheckedAt: Date.now(),
      updatedAt: Date.now()
    };
    return { ok: false, source: "real-miss" };
  }

  const downloaded = await downloadRemoteAudio(found);
  if (!downloaded?.buffer?.length) {
    audioIndex[key] = {
      ...(audioIndex[key] || {}),
      text: cleanText,
      kind,
      realAudioUnavailable: true,
      realAudioVersion: REAL_AUDIO_CACHE_VERSION,
      realCheckedAt: Date.now(),
      updatedAt: Date.now()
    };
    return { ok: false, source: "real-download-failed" };
  }

  const enhanced = await enhanceRealAudioBuffer(downloaded.buffer, downloaded.extension, {
    filter: resolveEnhanceFilter(found, found.source),
    bitrate: resolveEnhanceBitrate(found, found.source)
  });
  const finalAudio = enhanced?.buffer?.length ? enhanced : downloaded;
  const filename = `real-${hashText(kind, cleanText, found.source, found.audioUrl)}.${finalAudio.extension}`;
  const filepath = path.join(cacheDir(), filename);
  writeFileSync(filepath, finalAudio.buffer);

  audioIndex[key] = {
    text: cleanText,
    filename,
    kind,
    source: found.source,
    provider: found.provider,
    license: found.license,
    attribution: found.attribution,
    title: found.title || "",
    phonetic: found.phonetic || "",
    hasAudio: true,
    realAudio: true,
    realAudioUnavailable: false,
    realAudioVersion: REAL_AUDIO_CACHE_VERSION,
    audioEnhanceVersion: finalAudio.enhanced ? REAL_AUDIO_ENHANCE_VERSION : "",
    contentType: finalAudio.contentType || downloaded.contentType,
    remoteAudioUrl: found.audioUrl,
    updatedAt: Date.now()
  };

  return {
    ok: true,
    source: found.source,
    filename,
    contentType: finalAudio.contentType || downloaded.contentType,
    phonetic: found.phonetic || "",
    enhanced: Boolean(finalAudio.enhanced)
  };
}

export async function ensureEnhancedRealAudioFile(entry = {}, options = {}) {
  if (!needsRealAudioEnhance(entry)) {
    return { ok: true, enhanced: false, skipped: true };
  }

  return repairRealAudioCacheEntry(entry, options);
}

export async function repairRealAudioCacheEntry(entry = {}, options = {}) {
  const filepath = path.join(cacheDir(), entry.filename || "");
  let sourceBuffer = null;
  let extension = String(entry.filename || "").split(".").pop() || "mp3";

  if (entry.remoteAudioUrl) {
    const downloaded = await downloadRemoteAudio({ audioUrl: entry.remoteAudioUrl }, options);
    if (downloaded?.buffer?.length) {
      sourceBuffer = downloaded.buffer;
      extension = downloaded.extension;
    }
  }

  if (!sourceBuffer?.length && existsSync(filepath)) {
    sourceBuffer = readFileSync(filepath);
  }

  if (!sourceBuffer?.length) {
    return { ok: false, enhanced: false, reason: "no-source" };
  }

  const result = await enhanceRealAudioBuffer(sourceBuffer, extension, {
    ...options,
    filter: resolveEnhanceFilter(entry, entry.source),
    bitrate: resolveEnhanceBitrate(entry, entry.source)
  });

  if (!result?.buffer?.length) {
    return { ok: false, enhanced: false, reason: "empty-result" };
  }

  writeFileSync(filepath, result.buffer);

  return {
    ok: true,
    enhanced: Boolean(result.enhanced),
    redownloaded: Boolean(entry.remoteAudioUrl && sourceBuffer),
    contentType: result.contentType,
    extension: result.extension
  };
}

export function shouldRetryRealAudio(indexed = {}, kind = "word") {
  if (!indexed || indexed.realAudioVersion !== REAL_AUDIO_CACHE_VERSION) return true;
  if (indexed.realAudio && indexed.hasAudio) return false;

  const checkedAt = Number(indexed.realCheckedAt || 0);
  const retryMs = kind === "sentence" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return !checkedAt || Date.now() - checkedAt > retryMs;
}

export function getReadableRealAudioEntry(key, audioIndex = {}) {
  const existing = audioIndex[key];
  if (!existing?.realAudio || !existing?.hasAudio || !existing?.filename) return null;
  if (!isValidCachedRealAudioEntry(existing, existing.text, existing.kind || "word")) return null;

  const filepath = path.join(cacheDir(), existing.filename);
  if (!isReadableAudioFile(filepath)) return null;

  return existing;
}

export function lookupCachedAudioEntry(text, index = {}, options = {}) {
  const kind = options.kind || "word";
  const cleanText = safeSpeechText(text, kind === "sentence" ? 500 : 160);
  if (!cleanText) return null;

  const key = normalizeAudioKey(cleanText);
  const indexed = index[key];
  if (!indexed?.hasAudio || !indexed?.filename) return null;

  const filepath = path.join(cacheDir(), indexed.filename);
  if (!isReadableAudioFile(filepath)) return null;

  // Edge-only: never serve real-person cache through the public audio file API.
  if (indexed.realAudio) {
    return null;
  }

  // realAudioVersion describes the retired real-voice lookup policy, not the
  // validity of an Edge cache file. Legacy Edge entries remain safe to reuse.
  return indexed;
}

export function resolveReadableAudioEntry(text, index = {}, options = {}) {
  const entry = lookupCachedAudioEntry(text, index, options);
  if (!entry) return null;

  const filepath = path.join(cacheDir(), entry.filename);
  if (!isReadableAudioFile(filepath)) return null;

  return { entry, filepath };
}

export function audioEntryResponseHeaders(entry = {}, source = "") {
  const extension = String(entry.filename || "").split(".").pop() || "mp3";
  const cacheToken = entry.audioEnhanceVersion || String(entry.updatedAt || "") || REAL_AUDIO_CACHE_VERSION;
  return {
    "Content-Type": entry.contentType || contentTypeFromExtension(extension),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Audio-Source": source || entry.source || "cache",
    "X-Audio-Provider": entry.provider || "",
    "X-Audio-Real": entry.realAudio ? "1" : "0",
    "X-Audio-Enhanced": entry.audioEnhanceVersion === REAL_AUDIO_ENHANCE_VERSION ? "1" : "0",
    "X-Audio-Enhance-Version": entry.audioEnhanceVersion || "",
    "X-Audio-Cache-Token": cacheToken,
    "X-Audio-Updated-At": String(entry.updatedAt || ""),
    "X-Audio-Cache-Version": entry.realAudioVersion || REAL_AUDIO_CACHE_VERSION
  };
}

async function enhanceCachedSpeechFile(filepath) {
  if (!existsSync(filepath)) return { enhanced: false };

  const extension = path.extname(filepath).slice(1) || "mp3";
  const original = readFileSync(filepath);
  const result = await enhanceRealAudioBuffer(original, extension);
  if (!result?.buffer?.length || !result.enhanced) {
    return { enhanced: false };
  }

  writeFileSync(filepath, result.buffer);
  return {
    enhanced: true,
    contentType: result.contentType || "audio/mpeg"
  };
}

function applyEdgeAudioIndexEntry(audioIndex, key, baseEntry = {}) {
  audioIndex[key] = {
    ...baseEntry,
    audioEnhanceVersion: REAL_AUDIO_ENHANCE_VERSION,
    contentType: "audio/mpeg",
    updatedAt: Date.now()
  };
}

export function runEdgeTtsCli(payload) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts", "edge-tts-cli.mjs");

    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1"
      }
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Edge TTS timeout"));
    }, 30000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `Edge TTS process exited with code ${code}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function ensureEdgeAudio(text, audioIndex, options = {}) {
  const kind = options.kind || "word";
  const cleanText = safeSpeechText(text, kind === "sentence" ? 500 : 160);
  if (!cleanText) return { ok: false, source: "none" };

  const key = normalizeAudioKey(cleanText);

  // Edge-only product policy: never short-circuit to real-person audio.
  // Words / phrases / sentences all use the same voice + rate.
  const voice = options.voice || "en-US-AriaNeural";
  const rate = options.rate || "-10%";
  const filename = `${hashText("edge", voice, rate, cleanText)}.mp3`;
  const filepath = path.join(cacheDir(), filename);

  if (isReadableAudioFile(filepath)) {
    const cachedEntry = {
      ...(audioIndex[key] || {}),
      text: cleanText,
      filename,
      voice,
      rate,
      kind,
      source: "edge-cache",
      hasAudio: true,
      realAudio: false,
      fallbackAudio: true,
      temporaryFallback: true,
      realAudioVersion: REAL_AUDIO_CACHE_VERSION,
      contentType: "audio/mpeg",
      updatedAt: Date.now()
    };

    if (needsEdgeAudioEnhance(cachedEntry)) {
      await enhanceCachedSpeechFile(filepath, cachedEntry);
      applyEdgeAudioIndexEntry(audioIndex, key, cachedEntry);
    } else {
      audioIndex[key] = cachedEntry;
    }

    return { ok: true, source: "edge-cache", filename, contentType: "audio/mpeg" };
  }

  await runEdgeTtsCli({
    text: cleanText,
    filepath,
    voice,
    rate,
    kind
  });

  const ok = isReadableAudioFile(filepath);
  if (ok) {
    const generatedEntry = {
      ...(audioIndex[key] || {}),
      text: cleanText,
      filename,
      voice,
      rate,
      kind,
      source: "edge-generated",
      hasAudio: true,
      realAudio: false,
      fallbackAudio: true,
      temporaryFallback: true,
      realAudioVersion: REAL_AUDIO_CACHE_VERSION,
      contentType: "audio/mpeg",
      updatedAt: Date.now()
    };

    await enhanceCachedSpeechFile(filepath, generatedEntry);
    applyEdgeAudioIndexEntry(audioIndex, key, generatedEntry);
  }

  return {
    ok,
    source: ok ? "edge-generated" : "none",
    filename: ok ? filename : "",
    contentType: "audio/mpeg"
  };
}

export async function ensureEnhancedEdgeAudioFile(entry = {}) {
  if (!needsEdgeAudioEnhance(entry)) {
    return { ok: true, enhanced: false, skipped: true };
  }

  const filepath = path.join(cacheDir(), entry.filename || "");
  const result = await enhanceCachedSpeechFile(filepath, entry);
  if (!result.enhanced) {
    return { ok: false, enhanced: false, reason: "enhance-failed" };
  }

  return {
    ok: true,
    enhanced: true,
    contentType: result.contentType || "audio/mpeg"
  };
}

export async function ensureReadableSpeechCacheEntry(text, audioIndex = {}, options = {}) {
  const kind = options.kind || "word";
  const cleanText = safeSpeechText(text, kind === "sentence" ? 500 : 160);
  if (!cleanText) return { entry: null, changed: false };

  const key = normalizeAudioKey(cleanText);
  const entry = audioIndex[key];
  if (!entry?.hasAudio || !entry?.filename) {
    return { entry: entry || null, changed: false };
  }

  if (entry.realAudio && needsRealAudioEnhance(entry)) {
    const repaired = await repairRealAudioCacheEntry(entry, options);
    if (repaired.ok) {
      audioIndex[key] = {
        ...entry,
        audioEnhanceVersion: REAL_AUDIO_ENHANCE_VERSION,
        contentType: repaired.contentType || entry.contentType || "audio/mpeg",
        updatedAt: Date.now()
      };
      return { entry: audioIndex[key], changed: true };
    }
  }

  if (!entry.realAudio && needsEdgeAudioEnhance(entry)) {
    const repaired = await ensureEnhancedEdgeAudioFile(entry);
    if (repaired.ok && repaired.enhanced) {
      audioIndex[key] = {
        ...entry,
        audioEnhanceVersion: REAL_AUDIO_ENHANCE_VERSION,
        contentType: repaired.contentType || entry.contentType || "audio/mpeg",
        updatedAt: Date.now()
      };
      return { entry: audioIndex[key], changed: true };
    }
  }

  return { entry, changed: false };
}
