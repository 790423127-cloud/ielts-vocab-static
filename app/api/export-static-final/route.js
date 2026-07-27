export const runtime = "nodejs";

import {
  GET as getRawStaticExport,
  POST as postRawStaticExport
} from "../export-static/route.js";
import { patchStaticZipResponse } from "../../lib/static-export-response.mjs";

export async function POST(request) {
  return patchStaticZipResponse(await postRawStaticExport(request));
}

export async function GET(request) {
  return patchStaticZipResponse(await getRawStaticExport(request));
}
