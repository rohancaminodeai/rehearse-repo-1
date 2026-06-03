import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native deps used only on the server (image conversion).
  serverExternalPackages: ["heic-convert"],
};

export default nextConfig;
