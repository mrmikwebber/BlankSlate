"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { isAdminUser, normalizeAdminList } from "@/lib/admin";

export default function PortUserDataPage() {
  const { user, loading } = useAuth() || { user: null, loading: false };
  const [sourceUserId, setSourceUserId] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const adminEmails = useMemo(
    () => normalizeAdminList(process.env.NEXT_PUBLIC_ADMIN_EMAILS),
    []
  );
  const adminIds = useMemo(
    () => normalizeAdminList(process.env.NEXT_PUBLIC_ADMIN_USER_IDS),
    []
  );

  const isAdmin = useMemo(() => {
    return isAdminUser(
      { email: user?.email, id: user?.id },
      { emails: adminEmails, ids: adminIds }
    );
  }, [user?.email, user?.id, adminEmails, adminIds]);

  const submit = async () => {
    setError(null);
    setSuccess(null);
    setResult(null);

    if (!user) {
      setError("You must be signed in.");
      return;
    }

    if (!isAdmin) {
      setError("You do not have access to this tool.");
      return;
    }

    const trimmed = sourceUserId.trim();
    if (!trimmed) {
      setError("Source user id is required.");
      return;
    }

    if (!confirm) {
      setError("Please confirm before running.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/port-user-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUserId: trimmed,
          replaceExisting,
          confirm: true,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Failed to port user data.");
      } else {
        setSuccess("User data ported successfully.");
        setResult(json);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to port user data.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
        <p className="text-teal-600 dark:text-teal-400 text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Admin: Port User Data
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Copy another user&apos;s data into your account for debugging. This is
          admin-only and should be used carefully.
        </p>

        {!user && (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
            Please sign in to continue.
          </div>
        )}

        {user && !isAdmin && (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
            You do not have access to this tool.
          </div>
        )}

        {user && isAdmin && (
          <div className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Source user id
              </label>
              <input
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={sourceUserId}
                onChange={(e) => setSourceUserId(e.target.value)}
                placeholder="e.g. 3e2b7e5e-...."
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              Replace my existing data
            </label>

            <label className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              I understand this will overwrite my data and cannot be undone.
            </label>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200">
                {success}
              </div>
            )}

            {result && (
              <div className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <div>Accounts: {result?.copied?.accounts ?? 0}</div>
                <div>Transactions: {result?.copied?.transactions ?? 0}</div>
                <div>Budget rows: {result?.copied?.budgetRows ?? 0}</div>
                <div>Payees: {result?.copied?.payees ?? 0}</div>
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || !sourceUserId || !confirm}
              className="inline-flex items-center justify-center rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Porting..." : "Port User Data"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
