import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // yt-search pulls in cheerio, an ESM dual-package whose export map trips
  // up Next's webpack server bundling/tracing (surfaces as a spurious
  // "Cannot find module 'cheerio'" during page-data collection, even
  // though it's present in node_modules). Leaving it external instead of
  // inlining it avoids that; only affects the webpack build path used for
  // the Cloudflare deploy (see open-next.config.ts) - Turbopack (Vercel)
  // never hit this.
  serverExternalPackages: ["yt-search", "cheerio"],
};

export default nextConfig;
