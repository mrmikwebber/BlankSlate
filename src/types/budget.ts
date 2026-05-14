// Canonical budget types for the server-owned computation architecture.
//
// ComputedMonthView and its children are ephemeral projections returned by
// API routes — they are NEVER persisted to the database. The source of
// truth is: accounts + transactions + budget_assignments + category_items.

export interface Target {
  type: string;
  amount: number;
  targetDate: string;
  amountNeeded: number;
}

export interface NoteEntry {
  text: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Computed projection types (server → frontend, never persisted)
// ---------------------------------------------------------------------------

export interface ComputedCategoryItem {
  id: string;                    // stable UUID — used for ALL mutations, never name
  name: string;                  // display only

  assigned: number;              // user-controlled (source of truth: budget_assignments)
  activity: number;              // computed from transactions
  available: number;             // computed: assigned + activity + cumulative carryover

  snoozed?: boolean;
  target?: Target;
  notes?: string;
  notes_history?: NoteEntry[];
}

export interface ComputedCategory {
  id: string;                    // stable UUID — used for ALL mutations, never name
  name: string;                  // display only

  notes?: string;
  notes_history?: NoteEntry[];

  categoryItems: ComputedCategoryItem[];
}

export interface ComputedMonthView {
  month: string;                 // "YYYY-MM"

  ready_to_assign: number;
  rta_carry: number;             // deficit carry forwarded from prior months
  has_deficit_carry: boolean;

  version: number;               // monotonically increasing per user — reject stale responses
  generatedAt: string;           // ISO timestamp

  categories: ComputedCategory[];
}

// ---------------------------------------------------------------------------
// Normalized transaction layer — all computation operates on these only
// ---------------------------------------------------------------------------

export type CashFlowType = "income" | "expense" | "transfer" | "credit_payment";

export interface NormalizedTransaction {
  id: string;
  accountId: string;
  date: string;                  // "YYYY-MM-DD"
  amount: number;                // positive = inflow, negative = outflow
  categoryItemId?: string;       // FK to category_items.id (null = uncategorized/Teller)
  transferPairId?: string;       // links the two legs of a transfer
  affectsBudget: boolean;        // false for transfers, internal movements
  isCreditCardPayment: boolean;
  cashFlowType: CashFlowType;
}

// ---------------------------------------------------------------------------
// Computation engine input types
// ---------------------------------------------------------------------------

export interface AssignmentRecord {
  categoryItemId: string;
  month: string;                 // "YYYY-MM"
  assigned: number;
}

export interface CategoryItemMeta {
  id: string;
  groupId: string;
  name: string;
  sortOrder: number;
  snoozed: boolean;
  target?: Target;
  notes?: string;
  notes_history?: NoteEntry[];
}

export interface CategoryGroupMeta {
  id: string;
  name: string;
  sortOrder: number;
  notes?: string;
  notes_history?: NoteEntry[];
  items: CategoryItemMeta[];
}

export interface AccountMeta {
  id: string;
  name: string;
  type: "debit" | "credit";
  issuer?: string;
}

// Full input bundle consumed by computeBudgetState
export interface BudgetStateInput {
  userId: string;
  accounts: AccountMeta[];
  transactions: NormalizedTransaction[];
  assignments: AssignmentRecord[];
  categoryGroups: CategoryGroupMeta[];
}

// ---------------------------------------------------------------------------
// Computed budget state (intermediate — not serialized to frontend)
// ---------------------------------------------------------------------------

export interface MonthItemState {
  categoryItemId: string;
  assigned: number;
  activity: number;
  cumulativeAvailable: number;   // sum of (assigned + activity) for all prior months
  available: number;             // assigned + activity + max(cumulativeAvailable, 0)
}

export interface MonthState {
  month: string;
  itemStates: Map<string, MonthItemState>;
  readyToAssign: number;
  rtaCarry: number;
}

export interface BudgetState {
  months: Map<string, MonthState>;  // keyed by "YYYY-MM"
  categoryGroups: CategoryGroupMeta[];
  accounts: AccountMeta[];
  generatedAt: string;
  version: number;
}

// ---------------------------------------------------------------------------
// API mutation request bodies
// ---------------------------------------------------------------------------

export interface AssignRequest {
  month: string;
  categoryItemId: string;
  assigned: number;
}

export interface MoveMoneRequest {
  month: string;
  sourceItemId: string;
  destinationItemId: string;
  amount: number;
}

export interface CreateGroupRequest {
  name: string;
}

export interface UpdateGroupRequest {
  name?: string;
  sortOrder?: number;
  notes?: string;
}

export interface CreateItemRequest {
  groupId: string;
  name: string;
  sortOrder?: number;
}

export interface UpdateItemRequest {
  name?: string;
  sortOrder?: number;
  snoozed?: boolean;
  target?: Target | null;
  notes?: string;
}

export interface RecomputeRequest {
  months?: string[];
}
