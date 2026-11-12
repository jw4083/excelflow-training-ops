import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 여러 과정 운영 전의 옛 주소(/admin/roster 등)로 들어오면 과정 목록으로 보낸다 (과정마다 /admin/courses/<번호>/ 아래로 옮겼다)
  async redirects() {
    return [{ source: "/admin/:old(roster|draw|replies|history|course|export)", destination: "/admin", permanent: false }];
  },
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
