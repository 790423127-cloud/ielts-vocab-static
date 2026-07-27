import { Buffer } from "node:buffer";

import {
  patchStaticExportZip,
  STATIC_RESPONSIVE_VERSION
} from "./static-export-responsive.mjs";

export async function patchStaticZipResponse(response) {
  if (!(response instanceof Response)) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!response.ok || !contentType.includes("application/zip")) return response;

  const patchedZip = patchStaticExportZip(Buffer.from(await response.arrayBuffer()));
  const headers = new Headers(response.headers);
  headers.set("Content-Length", String(patchedZip.length));
  headers.set("X-Static-Export-Version", STATIC_RESPONSIVE_VERSION);

  return new Response(patchedZip, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
