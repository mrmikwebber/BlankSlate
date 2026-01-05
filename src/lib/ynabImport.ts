import { format, parse } from "date-fns";

type YnabRegisterRow = Record<string, string>;

type YnabPlanRow = Record<string, string>;

type ParsedTransaction = {
  date: string;
  payee: string;
  category: string;
  category_group: string;
  balance: number;
};

type ParsedAccount = {
  name: string;
  type: "credit" | "debit";
  issuer: "amex" | "visa" | "mastercard" | "discover";
  transactions: ParsedTransaction[];
};

type ParsedBudgetData = {
  [month: string]: {
    categories: {
      name: string;
      categoryItems: {
        name: string;
        assigned: number;
        activity: number;
        available: number;
      }[];
    }[];
    assignable_money?: number;
    ready_to_assign?: number;
  };
};

type RegisterParseResult = {
  accounts: ParsedAccount[];
  transactionCount: number;
};

type PlanParseResult = {
  budgetData: ParsedBudgetData;
  monthCount: number;
};

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const parseCsv = (text: string): Record<string, string>[] => {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx]?.replace(/^"|"$/g, "") ?? "";
    });
    return row;
  });
};

const parseMoney = (value: string | undefined): number => {
  if (!value) return 0;
  const clean = value.replace(/[$,]/g, "").trim();
  if (!clean) return 0;
  const num = Number(clean);
  return Number.isFinite(num) ? num : 0;
};

const normalizeDate = (value: string): string => {
  try {
    const parsed = parse(value, "MM/dd/yyyy", new Date());
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
    return format(parsed, "yyyy-MM-dd");
  } catch {
    return format(new Date(), "yyyy-MM-dd");
  }
};

const splitGroupCategory = (
  groupCategory: string,
  group: string,
  category: string
): { group: string; category: string } => {
  if (group && category) return { group, category };
  if (groupCategory) {
    const [g, c] = groupCategory.split(":").map((s) => s.trim());
    return {
      group: group || g || "Uncategorized",
      category: category || c || "Uncategorized",
    };
  }
  return { group: group || "Uncategorized", category: category || "Uncategorized" };
};

const inferAccountType = (name: string): "credit" | "debit" => {
  const lower = name.toLowerCase();
  if (
    lower.includes("checking") ||
    lower.includes("savings") ||
    lower.includes("cash") ||
    lower.includes("bank")
  ) {
    return "debit";
  }
  return "credit";
};

const inferIssuer = (
  name: string
): "amex" | "visa" | "mastercard" | "discover" => {
  const lower = name.toLowerCase();
  if (lower.includes("amex") || lower.includes("american express")) return "amex";
  if (lower.includes("mastercard")) return "mastercard";
  if (lower.includes("discover")) return "discover";
  return "visa";
};

export const parseYnabRegister = (text: string): RegisterParseResult => {
  const rows = parseCsv(text) as YnabRegisterRow[];
  const accountsMap = new Map<string, ParsedAccount>();
  let transactionCount = 0;

  for (const row of rows) {
    const accountName = row["Account"]?.trim() || "Imported Account";
    const payee = row["Payee"]?.trim() || "Unknown";
    const outflow = parseMoney(row["Outflow"]);
    const inflow = parseMoney(row["Inflow"]);
    const balance = inflow - outflow;
    const date = normalizeDate(row["Date"] || "");

    const { group, category } = splitGroupCategory(
      row["Category Group/Category"] || "",
      row["Category Group"] || "",
      row["Category"] || ""
    );

    const existing = accountsMap.get(accountName) || {
      name: accountName,
      type: inferAccountType(accountName),
      issuer: inferIssuer(accountName),
      transactions: [],
    };

    existing.transactions.push({
      date,
      payee,
      category,
      category_group: group,
      balance,
    });

    accountsMap.set(accountName, existing);
    transactionCount++;
  }

  return {
    accounts: Array.from(accountsMap.values()),
    transactionCount,
  };
};

const monthKeyFromLabel = (label: string): string => {
  try {
    const parsed = parse(label, "MMM yyyy", new Date());
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid month");
    return format(parsed, "yyyy-MM");
  } catch {
    return format(new Date(), "yyyy-MM");
  }
};

export const parseYnabPlan = (text: string): PlanParseResult => {
  const rows = parseCsv(text) as YnabPlanRow[];
  const budgetData: ParsedBudgetData = {};

  for (const row of rows) {
    const month = monthKeyFromLabel(row["Month"] || "");
    if (!budgetData[month]) {
      budgetData[month] = { categories: [], assignable_money: 0, ready_to_assign: 0 };
    }

    const { group, category } = splitGroupCategory(
      row["Category Group/Category"] || "",
      row["Category Group"] || "",
      row["Category"] || ""
    );

    const assigned = parseMoney(row["Assigned"]);
    const activity = parseMoney(row["Activity"]);
    const available = parseMoney(row["Available"]);

    const groupEntry =
      budgetData[month].categories.find((c) => c.name === group) ||
      (() => {
        const fresh = { name: group, categoryItems: [] as ParsedBudgetData[string]["categories"][number]["categoryItems"] };
        budgetData[month].categories.push(fresh);
        return fresh;
      })();

    const existingItem = groupEntry.categoryItems.find((i) => i.name === category);
    if (existingItem) {
      existingItem.assigned = assigned;
      existingItem.activity = activity;
      existingItem.available = available;
    } else {
      groupEntry.categoryItems.push({
        name: category,
        assigned,
        activity,
        available,
      });
    }
  }

  return {
    budgetData,
    monthCount: Object.keys(budgetData).length,
  };
};
