import { NextResponse } from "next/server";

const GITHUB_REPO = process.env.GITHUB_REPO; // e.g., "owner/repo"
const GITHUB_ISSUE_TOKEN = process.env.GITHUB_ISSUE_TOKEN; // token with repo:issues scope

// Additional rate limiting for feature suggestions: 5 per IP per hour
const SUGGESTION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SUGGESTION_RATE_LIMIT_MAX = 5;
const suggestionIpHits = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

export async function POST(req: Request) {
  // Check suggestion-specific rate limit
  const now = Date.now();
  const windowStart = now - SUGGESTION_RATE_LIMIT_WINDOW_MS;
  const ip = getClientIp(req);

  const hits = suggestionIpHits.get(ip) || [];
  const recentHits = hits.filter((ts) => ts > windowStart);

  if (recentHits.length >= SUGGESTION_RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "Too many feature suggestions. Please wait before submitting another." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(SUGGESTION_RATE_LIMIT_WINDOW_MS / 1000).toString(),
          "X-RateLimit-Limit": SUGGESTION_RATE_LIMIT_MAX.toString(),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  recentHits.push(now);
  suggestionIpHits.set(ip, recentHits);

  if (!GITHUB_REPO || !GITHUB_ISSUE_TOKEN) {
    return NextResponse.json(
      { error: "Feature suggestions are not configured." },
      { status: 500 }
    );
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, description, useCase, contact, metadata } = payload || {};

  if (!title || !description) {
    return NextResponse.json(
      { error: "Title and description are required" },
      { status: 400 }
    );
  }

  const bodyLines = [
    "### Feature Description",
    description,
    "",
  ];

  if (useCase) {
    bodyLines.push("### Use Case", useCase, "");
  }

  if (contact) {
    bodyLines.push("### Contact", contact, "");
  }

  if (metadata) {
    bodyLines.push("### Metadata", "```json", JSON.stringify(metadata, null, 2), "```");
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
      title: `[Feature Request] ${title}`,
      body: bodyLines.join("\n"),
      labels: ["feature-request", "pending-features", "user-submitted"],
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
