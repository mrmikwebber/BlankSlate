"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useDarkMode } from "../context/DarkModeContext";
import { supabase } from "../../utils/supabaseClient";
import { createPortal } from "react-dom";
import { Moon, Sun, User, MoreHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isAdminUser, normalizeAdminList } from "@/lib/admin";
import dynamic from "next/dynamic";
import { getDaysInMonth, getDate } from "date-fns";

const MonthlyAuditModal = dynamic(() => import("../mainpage/MonthlyAuditModal"), { ssr: false });

function UtilityMenu({
  isAdmin,
  onExport,
  onReportBug,
  onSuggestFeature,
  onReset,
  compact,
}: {
  isAdmin: boolean;
  onExport: () => void;
  onReportBug: () => void;
  onSuggestFeature: () => void;
  onReset: () => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More options"
          className={
            compact
              ? "h-8 w-8 flex items-center justify-center rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              : "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          }
        >
          <MoreHorizontal className="h-4 w-4" />
          {!compact && <span>Menu</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onExport}>Export Data</DropdownMenuItem>
        <DropdownMenuItem onSelect={onReportBug}>Report Bug</DropdownMenuItem>
        <DropdownMenuItem onSelect={onSuggestFeature}>Suggest Feature</DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin/port-user-data">Admin Tools</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onReset}
          className="text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-950 focus:text-red-700 dark:focus:text-red-300"
        >
          Reset Transactions
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Navbar() {
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showBugModal, setShowBugModal] = useState(false);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const [bugError, setBugError] = useState<string | null>(null);
  const [bugSuccess, setBugSuccess] = useState<string | null>(null);
  const [bugTitle, setBugTitle] = useState("");
  const [bugSteps, setBugSteps] = useState("");
  const [bugExpected, setBugExpected] = useState("");
  const [bugActual, setBugActual] = useState("");
  const [bugContact, setBugContact] = useState("");
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionSuccess, setSuggestionSuccess] = useState<string | null>(null);
  const [suggestionTitle, setSuggestionTitle] = useState("");
  const [suggestionDescription, setSuggestionDescription] = useState("");
  const [suggestionUseCase, setSuggestionUseCase] = useState("");
  const [suggestionContact, setSuggestionContact] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0";

  const isEndOfMonth = (() => {
    const now = new Date();
    const daysLeft = getDaysInMonth(now) - getDate(now);
    return daysLeft <= 6;
  })();
  
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showResetModal) {
        setShowResetModal(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showResetModal]);
  
  const { user, signOut } = useAuth();
  const name = user?.user_metadata?.first_name;
  const adminEmails = normalizeAdminList(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  const adminIds = normalizeAdminList(process.env.NEXT_PUBLIC_ADMIN_USER_IDS);
  const isAdmin = isAdminUser(
    { email: user?.email, id: user?.id },
    { emails: adminEmails, ids: adminIds }
  );

  const handleResetTransactions = async () => {
    if (!user) return;

    setIsResetting(true);

    try {
      const userId = user.id;

      // Delete all transactions — accounts and categories/plan are kept intact
      const { error: txError } = await supabase
        .from('transactions')
        .delete()
        .eq('user_id', userId);

      if (txError) throw txError;

      // Delete assigned money for every category — the category/plan
      // structure itself (category_groups, category_items) stays
      const { error: assignmentsError } = await supabase
        .from('budget_assignments')
        .delete()
        .eq('user_id', userId);

      if (assignmentsError) throw assignmentsError;

      // Clear legacy per-month budget_data rows (superseded by budget_assignments)
      const { error: budgetError } = await supabase
        .from('budget_data')
        .delete()
        .eq('user_id', userId);

      if (budgetError) throw budgetError;

      // Close modal and refresh the page to show clean state
      setShowResetModal(false);
      setIsResetting(false);
      window.location.reload();

    } catch (error) {
      console.error('Error resetting transactions:', error);
      alert('Failed to reset transactions. Please try again.');
      setIsResetting(false);
    }
  };

  const handleExportData = async () => {
    const [planRes, regRes] = await Promise.all([
      fetch("/api/export/plan"),
      fetch("/api/export/register"),
    ]);
    for (const [res, name] of [[planRes, "plan"], [regRes, "register"]] as const) {
      if (!res.ok) continue;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      a.download = cd.match(/filename="([^"]+)"/)?.[1] ?? `blankslate-${name}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const openReportBug = () => {
    setShowBugModal(true);
    setBugError(null);
    setBugSuccess(null);
  };

  const openSuggestFeature = () => {
    setShowSuggestionModal(true);
    setSuggestionError(null);
    setSuggestionSuccess(null);
  };

  return (
    <div>
      <nav className="block w-full px-3 py-2 mx-auto bg-slate-50 dark:bg-slate-900 sticky top-0 shadow-sm dark:shadow lg:px-4 z-[9999]">
        <div className="flex flex-wrap items-center justify-between w-full text-slate-800 dark:text-slate-100">
          <Link
            href="/"
            className="mr-4 block cursor-pointer py-0.5 text-ledger-600 font-bold text-lg"
          >
            blankslate
          </Link>
          <span className="hidden lg:inline text-[11px] text-slate-500 dark:text-slate-400">v{appVersion}</span>

          <div className="lg:hidden flex items-center gap-2">
            {user && isEndOfMonth && (
              <button
                onClick={() => setShowAuditModal(true)}
                className="relative px-2.5 py-1 rounded-md text-xs border border-ledger-400 dark:border-ledger-500 text-ledger-700 dark:text-ledger-300 bg-transparent font-semibold audit-pulse"
              >
                Audit
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-ledger-400 animate-ping" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-ledger-500" />
              </button>
            )}
            {user && (
              <UtilityMenu
                isAdmin={isAdmin}
                onExport={handleExportData}
                onReportBug={openReportBug}
                onSuggestFeature={openSuggestFeature}
                onReset={() => setShowResetModal(true)}
                compact
              />
            )}
          </div>

          <div className="hidden lg:block">
            {/* Compact links + user actions */}
            {user && (
              <div className="flex items-center gap-3">
                <Link href="/roadmap" className="text-xs text-slate-700 dark:text-slate-300 hover:underline">Roadmap</Link>
                <Link href="/legal" className="text-xs text-slate-700 dark:text-slate-300 hover:underline">Legal</Link>
                <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded px-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                          <User className="h-3.5 w-3.5" />
                          <span>Hello, {name || "User"}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-4" align="end">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-10 w-10 rounded-full bg-ledger-100 dark:bg-ledger-900/50 flex items-center justify-center shrink-0">
                            <span className="text-sm font-semibold text-ledger-700 dark:text-ledger-300">
                              {(user?.user_metadata?.first_name?.[0] ?? "") + (user?.user_metadata?.last_name?.[0] ?? "") || "?"}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {[user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter(Boolean).join(" ") || "—"}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                          </div>
                        </div>
                        <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                          <div className="flex justify-between">
                            <span className="font-medium">First name</span>
                            <span>{user?.user_metadata?.first_name || "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Last name</span>
                            <span>{user?.user_metadata?.last_name || "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">Email</span>
                            <span className="truncate ml-2 max-w-[140px] text-right">{user?.email || "—"}</span>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <button
                      onClick={toggleDarkMode}
                      className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                    >
                      <span className="relative h-4 w-4 block">
                        <Sun className={`absolute inset-0 h-4 w-4 text-yellow-500 transition-opacity duration-100 ${isDarkMode ? "opacity-100" : "opacity-0"}`} />
                        <Moon className={`absolute inset-0 h-4 w-4 text-slate-600 transition-opacity duration-100 ${isDarkMode ? "opacity-0" : "opacity-100"}`} />
                      </span>
                    </button>
                    {isEndOfMonth && (
                      <button
                        onClick={() => setShowAuditModal(true)}
                        className="relative px-3 py-1.5 rounded-md text-xs border border-ledger-400 dark:border-ledger-500 text-ledger-700 dark:text-ledger-300 bg-transparent hover:bg-ledger-50 dark:hover:bg-ledger-950 transition-colors font-semibold audit-pulse"
                      >
                        Monthly Audit
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-ledger-400 animate-ping" />
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-ledger-500" />
                      </button>
                    )}
                    <UtilityMenu
                      isAdmin={isAdmin}
                      onExport={handleExportData}
                      onReportBug={openReportBug}
                      onSuggestFeature={openSuggestFeature}
                      onReset={() => setShowResetModal(true)}
                    />
                    <button onClick={signOut} className="bg-ledger-600 dark:bg-ledger-700 hover:bg-ledger-500 dark:hover:bg-ledger-600 text-white px-5 py-1.5 rounded-md text-xs transition-colors">
                      Sign Out
                    </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Monthly Audit Modal */}
      {showAuditModal && (
        <MonthlyAuditModal onClose={() => setShowAuditModal(false)} />
      )}

      {/* Reset Transactions Confirmation Modal */}
      {showResetModal && createPortal(
        <div
          className="fixed inset-0 bg-black/30 dark:bg-black/60 z-[10000] flex items-center justify-center"
          onClick={() => setShowResetModal(false)}
        >
          <div
            className="bg-slate-50 dark:bg-slate-900 p-6 rounded-lg shadow-lg dark:shadow-xl w-full max-w-md space-y-4 border dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-red-600 dark:text-red-400">
              Reset Transactions?
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              This will permanently delete:
            </p>
            <ul className="text-sm text-slate-700 dark:text-slate-300 list-disc list-inside space-y-1">
              <li>All transactions</li>
              <li>All assigned money for every category</li>
            </ul>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Your accounts and categories are kept.
            </p>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              This action cannot be undone!
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-4 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-300 transition-colors"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm rounded-md bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 transition-colors"
                onClick={handleResetTransactions}
                disabled={isResetting}
              >
                {isResetting ? 'Resetting...' : 'Yes, Reset Transactions'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Report Bug Modal */}
      {showBugModal && createPortal(
        <div 
          className="fixed inset-0 bg-black/30 dark:bg-black/60 z-[10000] flex items-center justify-center"
          onClick={() => setShowBugModal(false)}
        >
          <div 
            className="bg-slate-50 dark:bg-slate-900 p-6 rounded-lg shadow-lg dark:shadow-xl w-full max-w-lg space-y-4 border dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Report a Bug</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This will open a GitHub issue in our tracker. Please include clear steps and what you expected vs. what you observed.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-600 dark:text-slate-300">Title</label>
                <input
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  placeholder="Short summary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-600 dark:text-slate-300">Steps to reproduce</label>
                <textarea
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                  rows={3}
                  value={bugSteps}
                  onChange={(e) => setBugSteps(e.target.value)}
                  placeholder="1. ...
2. ...
3. ..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-600 dark:text-slate-300">Expected</label>
                <textarea
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                  rows={2}
                  value={bugExpected}
                  onChange={(e) => setBugExpected(e.target.value)}
                  placeholder="What you expected to happen"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-600 dark:text-slate-300">Actual</label>
                <textarea
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                  rows={2}
                  value={bugActual}
                  onChange={(e) => setBugActual(e.target.value)}
                  placeholder="What actually happened"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-600 dark:text-slate-300">Contact (optional)</label>
                <input
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                  value={bugContact}
                  onChange={(e) => setBugContact(e.target.value)}
                  placeholder="Email or handle for follow-up"
                />
              </div>
            </div>

            {bugError && <p className="text-sm text-red-600 dark:text-red-400">{bugError}</p>}
            {bugSuccess && <p className="text-sm text-green-600 dark:text-green-400">{bugSuccess}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-4 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-300 transition-colors"
                onClick={() => setShowBugModal(false)}
                disabled={bugSubmitting}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm rounded-md bg-amber-600 dark:bg-amber-700 text-white hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 transition-colors"
                disabled={bugSubmitting || !bugTitle || !bugSteps || !bugExpected || !bugActual}
                onClick={async () => {
                  setBugError(null);
                  setBugSuccess(null);
                  setBugSubmitting(true);
                  try {
                    const res = await fetch("/api/report-bug", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: bugTitle,
                        steps: bugSteps,
                        expected: bugExpected,
                        actual: bugActual,
                        contact: bugContact,
                        metadata: {
                          userId: user?.id,
                          appVersion,
                          path: window.location.pathname,
                        },
                      }),
                    });
                    const json = await res.json();
                    if (!res.ok) {
                      setBugError(json?.error || "Failed to submit bug");
                    } else {
                      setBugSuccess("Bug reported! Thank you.");
                      setBugTitle("");
                      setBugSteps("");
                      setBugExpected("");
                      setBugActual("");
                      setBugContact("");
                    }
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Failed to submit bug";
                    setBugError(message);
                  } finally {
                    setBugSubmitting(false);
                  }
                }}
              >
                {bugSubmitting ? "Submitting..." : "Submit Bug"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Suggest Feature Modal */}
      {showSuggestionModal && createPortal(
        <div 
          className="fixed inset-0 bg-black/30 dark:bg-black/60 z-[10000] flex items-center justify-center"
          onClick={() => setShowSuggestionModal(false)}
        >
          <div 
            className="bg-slate-50 dark:bg-slate-900 p-6 rounded-lg shadow-lg dark:shadow-xl w-full max-w-lg space-y-4 border dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Suggest a Feature</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Have an idea? This will create a GitHub issue labeled as &quot;Pending Features&quot; for review.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-600 dark:text-slate-300">Feature Title</label>
                <input
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                  value={suggestionTitle}
                  onChange={(e) => setSuggestionTitle(e.target.value)}
                  placeholder="Brief title for your feature"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-600 dark:text-slate-300">Description</label>
                <textarea
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm min-h-[80px]"
                  value={suggestionDescription}
                  onChange={(e) => setSuggestionDescription(e.target.value)}
                  placeholder="Describe the feature you'd like to see"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-600 dark:text-slate-300">Use Case</label>
                <textarea
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm min-h-[60px]"
                  value={suggestionUseCase}
                  onChange={(e) => setSuggestionUseCase(e.target.value)}
                  placeholder="How would this feature help you?"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-600 dark:text-slate-300">Contact (Optional)</label>
                <input
                  className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm"
                  value={suggestionContact}
                  onChange={(e) => setSuggestionContact(e.target.value)}
                  placeholder="Email or username for follow-up"
                />
              </div>

              {suggestionError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-600 dark:text-red-400">{suggestionError}</p>
                </div>
              )}

              {suggestionSuccess && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                  <p className="text-sm text-green-600 dark:text-green-400">{suggestionSuccess}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-4 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-300"
                onClick={() => setShowSuggestionModal(false)}
                disabled={suggestionSubmitting}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm rounded-md bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50"
                disabled={suggestionSubmitting || !suggestionTitle || !suggestionDescription}
                onClick={async () => {
                  setSuggestionSubmitting(true);
                  setSuggestionError(null);
                  try {
                    const res = await fetch("/api/suggest-feature", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: suggestionTitle,
                        description: suggestionDescription,
                        useCase: suggestionUseCase,
                        contact: suggestionContact,
                        metadata: {
                          userId: user?.id,
                          appVersion,
                          path: window.location.pathname,
                        },
                      }),
                    });
                    const json = await res.json();
                    if (!res.ok) {
                      setSuggestionError(json?.error || "Failed to submit suggestion");
                    } else {
                      setSuggestionSuccess("Feature suggestion submitted! Thank you.");
                      setSuggestionTitle("");
                      setSuggestionDescription("");
                      setSuggestionUseCase("");
                      setSuggestionContact("");
                    }
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : "Failed to submit suggestion";
                    setSuggestionError(message);
                  } finally {
                    setSuggestionSubmitting(false);
                  }
                }}
              >
                {suggestionSubmitting ? "Submitting..." : "Submit Suggestion"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}