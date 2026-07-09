/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: false }
    ];
  }
};

module.exports = nextConfig;
