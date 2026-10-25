import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /api/evals route reads these files at runtime; make sure Vercel bundles them.
  outputFileTracingIncludes: { "/api/evals": ["./evals/results*.json"] },
};

export default nextConfig;
