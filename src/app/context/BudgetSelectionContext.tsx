"use client"
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";

export interface BudgetSummary {
  id: string;
  name: string;
  archived_at: string | null;
  created_at: string;
}

interface BudgetSelectionContextType {
  budgets: BudgetSummary[];
  currentBudgetId: string | null;
  budgetsLoading: boolean;
  refreshBudgets: () => Promise<void>;
}

const BudgetSelectionContext = createContext<BudgetSelectionContextType | undefined>(undefined);

export const useBudgetSelection = () => {
  const context = useContext(BudgetSelectionContext);
  if (!context) {
    throw new Error("useBudgetSelection must be used within a BudgetSelectionProvider");
  }
  return context;
};

export const BudgetSelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth() || { user: null };

  const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
  const [currentBudgetId, setCurrentBudgetId] = useState<string | null>(null);
  const [budgetsLoading, setBudgetsLoading] = useState(true);

  const refreshBudgets = async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/budgets");
      if (!res.ok) throw new Error(`Failed to load budgets (${res.status})`);
      const data = await res.json();
      setBudgets(data.budgets ?? []);
      setCurrentBudgetId(data.currentBudgetId ?? null);
    } catch (err) {
      console.error("[BudgetSelectionContext] refreshBudgets failed:", err);
    } finally {
      setBudgetsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setBudgets([]);
      setCurrentBudgetId(null);
      setBudgetsLoading(false);
      return;
    }
    setBudgetsLoading(true);
    refreshBudgets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const contextValue = useMemo(
    () => ({ budgets, currentBudgetId, budgetsLoading, refreshBudgets }),
    [budgets, currentBudgetId, budgetsLoading, refreshBudgets]
  );

  return (
    <BudgetSelectionContext.Provider value={contextValue}>
      {children}
    </BudgetSelectionContext.Provider>
  );
};
