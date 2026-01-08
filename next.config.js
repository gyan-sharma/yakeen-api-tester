/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow requests to the internal API
  async rewrites() {
    return [];
  },
}

module.exports = nextConfig
