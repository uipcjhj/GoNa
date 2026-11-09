import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs", "cheerio", "undici", "sharp", "jszip"],
  // company report templates (Excel / PowerPoint) are read at runtime
  outputFileTracingIncludes: { "/api/weekly/**": ["./templates/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
