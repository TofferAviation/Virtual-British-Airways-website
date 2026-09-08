import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Cloudflare Quick Tunnels generate a new *.trycloudflare.com hostname each
  // time they are restarted. Allow that development-only origin family so
  // Next.js can serve HMR/dev resources through the tunnel without requiring
  // a config edit for every generated preview URL.
  allowedDevOrigins: ["*.trycloudflare.com"],
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
