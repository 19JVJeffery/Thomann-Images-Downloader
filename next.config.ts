import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "thumbs.static-thomann.de",
      },
      {
        protocol: "https",
        hostname: "images.static-thomann.de",
      },
    ],
  },
};

export default nextConfig;
