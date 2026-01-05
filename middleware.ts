import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 100; // max requests per IP per window

// In-memory store; per-node and reset on deploy. Good enough for basic abuse protection.
const ipHits = new Map<string, number[]>();

const isApiPath = (path: string) => path.startsWith("/api/");
const isStaticPath = (path: string) =>
  path.startsWith("/_next") ||
  path.startsWith("/static") ||
  path === "/favicon.ico" ||
  path === "/robots.txt" ||
  path === "/sitemap.xml";

function getClientIp(req: NextRequest) {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStaticPath(pathname) || !isApiPath(pathname)) {
    return NextResponse.next();
  }

  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const ip = getClientIp(req);

  const hits = ipHits.get(ip) || [];
  const recentHits = hits.filter((ts) => ts > windowStart);
  recentHits.push(now);
  ipHits.set(ip, recentHits);

  if (recentHits.length > RATE_LIMIT_MAX) {
    return new NextResponse(
      JSON.stringify({ error: "Too many requests. Please wait and try again." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(RATE_LIMIT_WINDOW_MS / 1000).toString(),
          "X-RateLimit-Limit": RATE_LIMIT_MAX.toString(),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const remaining = Math.max(RATE_LIMIT_MAX - recentHits.length, 0);

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", RATE_LIMIT_MAX.toString());
  res.headers.set("X-RateLimit-Remaining", remaining.toString());
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
