import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /api/evals route reads this file at runtime; make sure Vercel bundles it.
  outputFileTracingIncludes: { "/api/evals": ["./evals/results.json"] },
};

export default nextConfig;
