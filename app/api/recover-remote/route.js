export const runtime = "nodejs";

import { requireLocalAdmin } from "../../lib/api/local-admin-guard.mjs";

function normalizeBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function extractWords(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.words)) return data.words;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

async function tryFetchJson(url) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "accept": "application/json,text/plain,*/*"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const text = await res.text();
  return JSON.parse(text);
}

export async function POST(req) {
  const guard = requireLocalAdmin(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const base = normalizeBase(body.url || body.baseUrl);

    if (!base) {
      return Response.json(
        { ok: false, error: "缺少腾讯云网站地址" },
        { status: 400 }
      );
    }

    const urls = unique([
      base,
      `${base}/data/words.json`,
      `${base}/words.json`,
      `${base}/beidanci/data/words.json`,
      `${base}/beidanci/words.json`
    ]);

    const errors = [];

    for (const url of urls) {
      try {
        const data = await tryFetchJson(url);
        const words = extractWords(data);

        if (words.length) {
          return Response.json({
            ok: true,
            source: url,
            count: words.length,
            words
          });
        }

        errors.push(`${url}：没有 words 数组`);
      } catch (error) {
        errors.push(`${url}：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return Response.json(
      {
        ok: false,
        error: "没有从线上地址找到 words.json",
        tried: urls,
        detail: errors
      },
      { status: 404 }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "恢复线上词库失败",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
