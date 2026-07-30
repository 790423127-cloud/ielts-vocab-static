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
  }
};

export default nextConfig;
