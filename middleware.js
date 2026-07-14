import { NextResponse } from "next/server";

export function middleware(request) {
  const target = request.nextUrl.clone();
  target.pathname = "/api/export-static-responsive";
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: ["/api/export-static"]
};
