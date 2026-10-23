import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow globe QA beside a developer's existing server without sharing its
  // compiler output/lock. Never enabled by the production start command.
  distDir: process.env.BAV_GLOBE_QA === "1" ? ".next-globe-qa" : ".next",
  reactStrictMode: true,
  // The GRIB2 reader is a native Node module. Keep it external to Turbopack so
  // the deployed server can load its platform-specific binding normally.
  serverExternalPackages: ["@mattnucc/gribberish"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
