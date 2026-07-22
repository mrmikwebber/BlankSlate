// Server-only client for the SimpleFin Bridge protocol (https://www.simplefin.org/).
// Never import this from client components — the access URL embeds permanent
// Basic Auth credentials and must stay server-side.

export interface SimplefinTransaction {
  id: string;
  posted: number; // unix seconds
  amount: string; // decimal string, signed
  description: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
}

export interface SimplefinAccount {
  id: string;
  name: string;
  currency: string;
  balance: string;
  "available-balance"?: string;
  "balance-date": number;
  org: { name?: string; domain?: string };
  transactions?: SimplefinTransaction[];
}

interface SimplefinAccountsResponse {
  accounts: SimplefinAccount[];
  errors?: string[];
}

// A setup token is a base64 blob whose decoded contents are the one-time
// claim URL. POSTing to it (once) returns the permanent access URL.
export async function claimSetupToken(setupToken: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = Buffer.from(setupToken.trim(), "base64").toString("utf-8");
  } catch {
    throw new Error("Setup token is not valid base64");
  }

  if (!/^https?:\/\//.test(claimUrl)) {
    throw new Error("Setup token did not decode to a valid claim URL");
  }

  const res = await fetch(claimUrl, { method: "POST" });
  if (!res.ok) {
    throw new Error(`SimpleFin claim failed: ${res.status} ${await res.text()}`);
  }

  const accessUrl = (await res.text()).trim();
  if (!/^https?:\/\/.+:.+@/.test(accessUrl)) {
    throw new Error("SimpleFin claim response was not a valid access URL");
  }

  return accessUrl;
}

function parseAccessUrl(accessUrl: string) {
  const url = new URL(accessUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  url.username = "";
  url.password = "";
  const baseUrl = url.toString().replace(/\/$/, "");
  return { baseUrl, username, password };
}

export async function fetchSimplefinAccounts(
  accessUrl: string,
  opts: { accountIds?: string[]; startDate?: number; balancesOnly?: boolean } = {}
): Promise<SimplefinAccount[]> {
  const { baseUrl, username, password } = parseAccessUrl(accessUrl);
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  const qs = new URLSearchParams();
  if (opts.startDate) qs.set("start-date", String(opts.startDate));
  if (opts.balancesOnly) qs.set("balances-only", "1");
  for (const id of opts.accountIds ?? []) qs.append("account", id);

  const res = await fetch(`${baseUrl}/accounts?${qs.toString()}`, {
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    throw new Error(`SimpleFin accounts request failed: ${res.status} ${await res.text()}`);
  }

  const data: SimplefinAccountsResponse = await res.json();
  if (data.errors?.length) {
    console.error("[simplefin] accounts response included errors:", data.errors);
  }

  return data.accounts ?? [];
}
