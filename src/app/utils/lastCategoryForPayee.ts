interface TransactionLike {
  date: string;
  payee: string;
  category: string | null;
  category_group: string | null;
}

interface AccountLike {
  transactions: TransactionLike[];
}

export interface LastPayeeCategory {
  category: string;
  categoryGroup: string | null;
}

// Looks across every account's transaction history for the most recent
// transaction with an exact (case-insensitive) payee match and a real
// category, and suggests that category — the same "remembers what you did
// last time" behavior YNAB's payee autofill has, but derived directly from
// existing transaction data instead of a separate payee/category table.
export function findLastCategoryForPayee(
  accounts: AccountLike[],
  payeeName: string
): LastPayeeCategory | null {
  const normalized = payeeName.trim().toLowerCase();
  if (!normalized) return null;

  let best: (TransactionLike & { category: string }) | null = null;

  for (const account of accounts) {
    for (const tx of account.transactions) {
      if (!tx.category) continue;
      if (tx.payee?.trim().toLowerCase() !== normalized) continue;
      if (!best || tx.date > best.date) {
        best = tx as TransactionLike & { category: string };
      }
    }
  }

  if (!best) return null;
  return { category: best.category, categoryGroup: best.category_group };
}
