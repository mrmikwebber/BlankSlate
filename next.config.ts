import type { NextConfig } from "next";

const ContentSecurityPolicy = `
default-src 'self';
script-src 'self' 'unsafe-inline' https://cdn.teller.io;
style-src 'self' 'unsafe-inline' fonts.googleapis.com;
font-src 'self' fonts.gstatic.com;
img-src 'self' data: blob:;
connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL} *.supabase.co wss://*.supabase.co https://api.teller.io https://connect.teller.io https://cdn.teller.io;
frame-src https://*.teller.io https://teller.io;
object-src 'none';
base-uri 'self';
`;

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
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
