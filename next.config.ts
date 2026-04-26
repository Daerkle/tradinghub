import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
