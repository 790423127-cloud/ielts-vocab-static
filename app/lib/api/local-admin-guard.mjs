const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function parseHost(value) {
  const host = String(value || "").trim().toLowerCase();
  if (!host) return "";
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  if ((host.match(/:/g) || []).length > 1) return host;
  return host.split(":")[0];
}

export function isLocalRequest(req) {
  const headers = req?.headers;
  const host = parseHost(headers?.get?.("host"));
  const forwardedFor = String(headers?.get?.("x-forwarded-for") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const realIp = String(headers?.get?.("x-real-ip") || "").trim();

  if (LOCAL_HOSTS.has(host)) return true;
  if (forwardedFor.length && forwardedFor.every((ip) => LOCAL_HOSTS.has(parseHost(ip)))) return true;
  return Boolean(realIp && LOCAL_HOSTS.has(parseHost(realIp)));
}

function hasValidAdminToken(req) {
  const expectedToken = String(process.env.LOCAL_ADMIN_TOKEN || "").trim();
  const actualToken = String(req?.headers?.get?.("x-local-admin-token") || "").trim();
  return Boolean(expectedToken && actualToken && expectedToken === actualToken);
}

function forbiddenResponse(message) {
  return Response.json(
    {
      ok: false,
      error: "Forbidden",
      message
    },
    { status: 403 }
  );
}

/**
 * Protect destructive write/admin routes.
 * - development + localhost: allow
 * - allowLocalhostAlways: localhost allowed even in production (local speech/TTS)
 * - otherwise: require LOCAL_ADMIN_TOKEN header
 */
export function requireLocalAdmin(req, options = {}) {
  const { allowLocalhostAlways = false } = options;

  if (allowLocalhostAlways && isLocalRequest(req)) return null;
  if (process.env.NODE_ENV !== "production" && isLocalRequest(req)) return null;
  if (hasValidAdminToken(req)) return null;

  return forbiddenResponse(
    "This write operation is only available from localhost or with LOCAL_ADMIN_TOKEN."
  );
}

/** Protect sensitive read routes that expose the full lexicon. */
export function requireLocalRead(req) {
  if (isLocalRequest(req)) return null;
  if (process.env.NODE_ENV !== "production") return null;
  if (hasValidAdminToken(req)) return null;

  return forbiddenResponse(
    "This read operation is only available from localhost or with LOCAL_ADMIN_TOKEN."
  );
}

export function buildSpeechRequestHeaders(extra = {}) {
  const token = String(
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_LOCAL_ADMIN_TOKEN || ""
      : ""
  ).trim();

  return {
    ...extra,
    ...(token ? { "x-local-admin-token": token } : {})
  };
}