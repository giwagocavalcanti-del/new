import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The end-to-end test runs a second dev server next to the normal one;
  // a separate build folder keeps the two from overwriting each other.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  // 90 is for the product photos (sharp slats), 80 for the hero, 75 is the default for the rest.
  images: { formats: ["image/avif", "image/webp"], qualities: [75, 80, 90], minimumCacheTTL: 2678400 },
  async headers() {
    return [
      {
        // Built by scripts/images/build-photos.mjs with a content hash in the name: safe to keep for a year.
        source: "/(products/web|swatches)/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // AR Quick Look (iPhone, iPad) only opens the 3D file with this type.
        source: "/models/:file([^/]+\\.usdz)",
        headers: [{ key: "Content-Type", value: "model/vnd.usdz+zip" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
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
