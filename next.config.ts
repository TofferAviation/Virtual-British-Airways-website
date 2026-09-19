import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
