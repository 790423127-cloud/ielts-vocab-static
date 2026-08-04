import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Audits can build into an isolated directory while the local production
  // server keeps using `.next`, avoiding mixed dev/production artifacts.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  compress: true,
  outputFileTracingRoot: projectRoot,
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: false }
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          }
        ]
      },
      // Large static lexicons under /public/data — browser may revalidate, but
      // same-session navigations should hit disk/HTTP cache instead of re-download.
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
