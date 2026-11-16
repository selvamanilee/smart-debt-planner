import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "exceljs", "jspdf"],
  poweredByHeader: false,
  // Ship the SQL migrations with every server function so the schema can be
  // created automatically on first request if the build-time migration was skipped.
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
    "/**/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
