import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // la root è questa cartella: in ~ c'è un package-lock.json estraneo che Turbopack scambierebbe per la root
  turbopack: { root: path.join(__dirname) },
  compress: true,
  headers: async () => [
    {
      source: "/:path((?:_next/static|favicon\\.ico).*)",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
  ],
};

export default nextConfig;
