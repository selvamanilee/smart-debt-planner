import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "exceljs", "jspdf"],
  poweredByHeader: false,
};

export default nextConfig;
