import type { NextConfig } from "next";

const ContentSecurityPolicy = `
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline' fonts.googleapis.com;
font-src 'self' fonts.gstatic.com;
img-src 'self' data: blob:;
connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL};
frame-src 'none';
object-src 'none';
base-uri 'self';
`;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: ContentSecurityPolicy.replace(/\n/g, ""),
          }
        ]
      }
    ];
  }
};

export default nextConfig;
