import https from "https";

const TELLER_BASE_URL = "https://api.teller.io";

function getTellerAgent(): https.Agent {
  const certB64 = process.env.TELLER_CERT;
  const keyB64 = process.env.TELLER_PRIVATE_KEY;

  if (!certB64 || !keyB64) {
    throw new Error("TELLER_CERT and TELLER_PRIVATE_KEY env vars are required");
  }

  const cert = Buffer.from(certB64, "base64").toString("utf-8");
  const key = Buffer.from(keyB64, "base64").toString("utf-8");

  return new https.Agent({ cert, key });
}

function basicAuth(accessToken: string): string {
  return `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`;
}

function tellerRequest<T>(
  path: string,
  accessToken: string,
  method: "GET" | "DELETE" = "GET"
): Promise<T> {
  return new Promise((resolve, reject) => {
    const agent = getTellerAgent();
    const url = new URL(`${TELLER_BASE_URL}${path}`);

    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      agent,
      headers: {
        Authorization: basicAuth(accessToken),
        Accept: "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Teller API error ${res.statusCode}: ${raw}`));
          return;
        }
        if (!raw.trim()) {
          resolve(undefined as T);
          return;
        }
        try {
          resolve(JSON.parse(raw) as T);
        } catch {
          reject(new Error(`Failed to parse Teller response: ${raw}`));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

export interface TellerAccount {
  id: string;
  enrollment_id: string;
  name: string;
  type: "depository" | "credit";
  subtype: string; // "checking" | "savings" | "credit_card" | etc.
  status: "open" | "closed";
  institution: { name: string; id: string };
  currency: string;
  last_four: string;
}

export interface TellerTransaction {
  id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // positive number as string
  type: "credit" | "debit";
  status: "posted" | "pending";
  details: {
    processing_status: string;
    category?: string;
    counterparty?: {
      name?: string;
      type?: string;
    };
  };
  links: Record<string, string>;
}

export function getTellerAccounts(accessToken: string): Promise<TellerAccount[]> {
  return tellerRequest<TellerAccount[]>("/accounts", accessToken);
}

export function deleteTellerAccount(
  accessToken: string,
  tellerAccountId: string
): Promise<void> {
  return tellerRequest<void>(`/accounts/${tellerAccountId}`, accessToken, "DELETE");
}

export interface TellerBalance {
  account_id: string;
  ledger: string;
  available: string;
}

export function getTellerAccountBalance(
  accessToken: string,
  tellerAccountId: string
): Promise<TellerBalance> {
  return tellerRequest<TellerBalance>(
    `/accounts/${tellerAccountId}/balances`,
    accessToken
  );
}

export function getTellerTransactions(
  accessToken: string,
  tellerAccountId: string,
  fromId?: string
): Promise<TellerTransaction[]> {
  const qs = fromId ? `?from_id=${encodeURIComponent(fromId)}` : "";
  return tellerRequest<TellerTransaction[]>(
    `/accounts/${tellerAccountId}/transactions${qs}`,
    accessToken
  );
}

/** Convert Teller amount + type to a signed balance (positive = credit, negative = debit) */
export function toSignedBalance(amount: string, type: "credit" | "debit"): number {
  const abs = parseFloat(amount);
  return type === "debit" ? -abs : abs;
}

/** Guess card issuer from institution name */
export function guessIssuer(
  institutionName: string
): "amex" | "visa" | "mastercard" | "discover" {
  const lower = institutionName.toLowerCase();
  if (lower.includes("amex") || lower.includes("american express")) return "amex";
  if (lower.includes("discover")) return "discover";
  if (lower.includes("mastercard")) return "mastercard";
  return "visa";
}
