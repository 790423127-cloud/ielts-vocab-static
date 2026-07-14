export const runtime = "nodejs";

import { Buffer } from "node:buffer";
import {
  GET as getOriginalStaticExport,
  POST as postOriginalStaticExport
} from "../export-static/route.js";
import {
  patchStaticExportZip,
  STATIC_RESPONSIVE_VERSION
} from "../../lib/static-export-responsive.mjs";

async function applyResponsiveTransform(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/zip")) {
    return response;
  }

  const original = Buffer.from(await response.arrayBuffer());
  const patched = patchStaticExportZip(original);
  const headers = new Headers(response.headers);

  headers.set("Content-Length", String(patched.byteLength));
  headers.set("X-Static-Responsive-Version", STATIC_RESPONSIVE_VERSION);
  headers.set("Cache-Control", "no-store");

  return new Response(patched, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function GET(req) {
  return applyResponsiveTransform(await getOriginalStaticExport(req));
}

export async function POST(req) {
  return applyResponsiveTransform(await postOriginalStaticExport(req));
}
