import { NextResponse } from "next/server";

const GITHUB_REPO = process.env.GITHUB_REPO; // e.g., "owner/repo"
const GITHUB_ISSUE_TOKEN = process.env.GITHUB_ISSUE_TOKEN; // token with repo:issues scope

// Additional rate limiting for bug reports: 3 per IP per hour
const BUG_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const BUG_RATE_LIMIT_MAX = 20;
const bugIpHits = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

export async function POST(req: Request) {
  // Check bug-specific rate limit
  const now = Date.now();
  const windowStart = now - BUG_RATE_LIMIT_WINDOW_MS;
  const ip = getClientIp(req);

  const hits = bugIpHits.get(ip) || [];
  const recentHits = hits.filter((ts) => ts > windowStart);

  if (recentHits.length >= BUG_RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "Too many bug reports. Please wait before submitting another." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(BUG_RATE_LIMIT_WINDOW_MS / 1000).toString(),
          "X-RateLimit-Limit": BUG_RATE_LIMIT_MAX.toString(),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  recentHits.push(now);
  bugIpHits.set(ip, recentHits);

  if (!GITHUB_REPO || !GITHUB_ISSUE_TOKEN) {
    return NextResponse.json(
      { error: "Bug reporting is not configured." },
      { status: 500 }
    );
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, steps, expected, actual, contact, metadata } = payload || {};

  if (!title || !steps || !expected || !actual) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const bodyLines = [
    "### Steps to Reproduce",
    steps,
    "",
    "### Expected",
    expected,
    "",
    "### Actual",
    actual,
  ];

  if (contact) {
    bodyLines.push("", `### Contact`, contact);
  }

  if (metadata) {
    bodyLines.push("", "### Metadata", "```json", JSON.stringify(metadata, null, 2), "```");
  }

  const [owner, repo] = GITHUB_REPO.split("/");

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_ISSUE_TOKEN}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      title: `[Bug] ${title}`,
      body: bodyLines.join("\n"),
      labels: ["bug", "user-report", "beta-feedback"],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: "Failed to create issue", details: text },
      { status: 502 }
    );
  }

  const json = await res.json();

  return NextResponse.json({ issueUrl: json.html_url }, { status: 201 });
}
