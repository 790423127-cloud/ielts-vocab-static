import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  outputFileTracingRoot: projectRoot,
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: false }
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/export-static", destination: "/api/export-static-final" }
      ],
      afterFiles: [],
      fallback: []
    };
  }
};

export default nextConfig;
