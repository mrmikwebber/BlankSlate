"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Link2, RefreshCw, Unlink, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "../../context/AuthContext";
import { useAccountContext } from "../../context/AccountContext";
import { useBudgetContext } from "../../context/BudgetContext";

interface SimplefinAvailableAccount {
  id: string;
  name: string;
  orgName: string | null;
}

interface SimplefinLink {
  id: string;
  simplefinAccountId: string;
  simplefinAccountName: string | null;
  orgName: string | null;
  blankslateAccountId: string | null;
  blankslateAccountName: string | null;
  lastSyncedAt: string | null;
}

interface ConnectionState {
  connected: boolean;
  lastSyncedAt?: string | null;
  links: SimplefinLink[];
}

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

function BankConnectionSection() {
  const { toast } = useToast();
  const { accounts, refetchAccounts } = useAccountContext();

  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [setupToken, setSetupToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [pendingAccounts, setPendingAccounts] = useState<SimplefinAvailableAccount[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // simplefinAccountId -> blankslateAccountId | "new"
  const [newNames, setNewNames] = useState<Record<string, string>>({});
  const [newTypes, setNewTypes] = useState<Record<string, "debit" | "credit">>({});
  const [importModes, setImportModes] = useState<Record<string, "fresh" | "history">>({});
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadConnection = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/simplefin/connection");
      const data = await jsonOrThrow(res);
      setConnection(data);
    } catch (err) {
      console.error("[SettingsTab] load connection failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnection();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupToken.trim()) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/simplefin/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupToken: setupToken.trim() }),
      });
      const data = await jsonOrThrow(res);
      setPendingAccounts(data.accounts ?? []);
      setSetupToken("");
      toast({ title: "Connected to SimpleFin", description: "Choose which accounts to import." });
    } catch (err) {
      toast({
        title: "Connection failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleLinkAll = async () => {
    if (!pendingAccounts) return;
    setLinking(true);
    try {
      for (const acct of pendingAccounts) {
        const choice = mapping[acct.id];
        if (!choice) continue;

        const body =
          choice === "new"
            ? {
                simplefinAccountId: acct.id,
                simplefinAccountName: acct.name,
                orgName: acct.orgName,
                blankslateAccountId: null,
                newAccount: {
                  name: newNames[acct.id]?.trim() || acct.name,
                  type: newTypes[acct.id] ?? "debit",
                  importMode: importModes[acct.id] ?? "fresh",
                },
              }
            : {
                simplefinAccountId: acct.id,
                simplefinAccountName: acct.name,
                orgName: acct.orgName,
                blankslateAccountId: choice,
              };

        const res = await fetch("/api/simplefin/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await jsonOrThrow(res);
      }

      setPendingAccounts(null);
      setMapping({});
      await Promise.all([loadConnection(), refetchAccounts()]);
      toast({ title: "Accounts linked", description: "Hit Sync Now to pull in transactions." });
    } catch (err) {
      toast({
        title: "Linking failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLinking(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/simplefin/sync", { method: "POST" });
      const data = await jsonOrThrow(res);
      await Promise.all([loadConnection(), refetchAccounts()]);
      toast({
        title: "Sync complete",
        description: `${data.accountsSynced} account(s) synced, ${data.newTransactions} new transaction(s).`,
      });
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleUnlink = async (linkId: string) => {
    try {
      const res = await fetch("/api/simplefin/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId }),
      });
      await jsonOrThrow(res);
      await loadConnection();
    } catch (err) {
      toast({
        title: "Unlink failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      const res = await fetch("/api/simplefin/connection", { method: "DELETE" });
      await jsonOrThrow(res);
      setConnection({ connected: false, links: [] });
      toast({ title: "Disconnected from SimpleFin" });
    } catch (err) {
      toast({
        title: "Disconnect failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <CardContent className="pt-4">
          <p className="text-xs text-slate-400 dark:text-slate-500">Loading connection…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-ledger-600 dark:text-ledger-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Bank Connection</p>
        </div>

        {!connection?.connected && !pendingAccounts && (
          <form onSubmit={handleConnect} className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              SimpleFin setup token
            </label>
            <Input
              type="text"
              placeholder="Paste your setup token"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
            />
            <Button type="submit" disabled={connecting || !setupToken.trim()} className="bg-ledger-600 hover:bg-ledger-700">
              {connecting ? "Connecting…" : "Connect"}
            </Button>
          </form>
        )}

        {pendingAccounts && pendingAccounts.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Map each SimpleFin account to a BlankSlate account.
            </p>
            {pendingAccounts.map((acct) => (
              <div key={acct.id} className="rounded-md border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {acct.name}
                  {acct.orgName && (
                    <span className="text-slate-400 dark:text-slate-500 font-normal"> — {acct.orgName}</span>
                  )}
                </p>
                <Select
                  value={mapping[acct.id] ?? ""}
                  onValueChange={(v) => setMapping((prev) => ({ ...prev, [acct.id]: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose an account…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create new account</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {mapping[acct.id] === "new" && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Account name"
                        value={newNames[acct.id] ?? acct.name}
                        onChange={(e) => setNewNames((prev) => ({ ...prev, [acct.id]: e.target.value }))}
                      />
                      <Select
                        value={newTypes[acct.id] ?? "debit"}
                        onValueChange={(v) => setNewTypes((prev) => ({ ...prev, [acct.id]: v as "debit" | "credit" }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="debit">Debit</SelectItem>
                          <SelectItem value="credit">Credit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2">
                      {(
                        [
                          { value: "fresh", label: "Start fresh", hint: "Balance only, sync forward" },
                          { value: "history", label: "Import history", hint: "Pull recent transactions too" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setImportModes((prev) => ({ ...prev, [acct.id]: opt.value }))}
                          className={`flex-1 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                            (importModes[acct.id] ?? "fresh") === opt.value
                              ? "border-ledger-500 bg-ledger-50 text-ledger-700 dark:border-ledger-600 dark:bg-ledger-950/40 dark:text-ledger-300"
                              : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          <span className="block font-medium">{opt.label}</span>
                          <span className="block text-[10px] opacity-75">{opt.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <Button
              onClick={handleLinkAll}
              disabled={linking || pendingAccounts.some((a) => !mapping[a.id])}
              className="bg-ledger-600 hover:bg-ledger-700"
            >
              {linking ? "Linking…" : "Link accounts"}
            </Button>
          </div>
        )}

        {connection?.connected && !pendingAccounts && (
          <div className="space-y-3">
            {connection.links.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">No accounts linked yet.</p>
            ) : (
              <div className="space-y-2">
                {connection.links.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-slate-700 dark:text-slate-200">
                        {l.blankslateAccountName ?? l.simplefinAccountName ?? "Unnamed"}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        {l.lastSyncedAt
                          ? `Last synced ${new Date(l.lastSyncedAt).toLocaleString()}`
                          : "Not synced yet"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleUnlink(l.id)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={handleSync} disabled={syncing} className="bg-ledger-600 hover:bg-ledger-700">
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync Now"}
              </Button>
              <Button variant="outline" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Also syncs automatically once a day — use Sync Now if you want the latest transactions right away.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InsightsExclusionsSection() {
  const { budgetView, setCategoryHideFromInsights } = useBudgetContext();

  const categories = budgetView?.categories ?? [];
  const hasItems = categories.some((g) => g.categoryItems.length > 0);

  return (
    <Card className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <EyeOff className="h-4 w-4 text-ledger-600 dark:text-ledger-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Hide from Insights</p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Transactions in a hidden category are excluded from the Insights spending charts — the
          category still works normally everywhere else. Useful for things like a loan from a
          family member that gets paid back and isn&apos;t real spending.
        </p>

        {!hasItems ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No categories yet.</p>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {categories.map((group) =>
              group.categoryItems.length === 0 ? null : (
                <div key={group.id}>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide px-3 pt-2.5 pb-1 bg-slate-100 dark:bg-slate-800">
                    {group.name}
                  </p>
                  {group.categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between px-3 py-2 border-t border-slate-100 dark:border-slate-800 first:border-t-0"
                    >
                      <span className="text-sm text-slate-700 dark:text-slate-300">{item.name}</span>
                      <Switch
                        checked={item.isHiddenFromInsights ?? false}
                        onCheckedChange={(checked) => setCategoryHideFromInsights(item.id, checked)}
                      />
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsTab() {
  const { signOut } = useAuth();

  return (
    <div className="flex flex-col gap-4 py-6 px-4 bg-slate-50 dark:bg-slate-950 min-h-full max-w-lg mx-auto w-full">
      <div className="flex items-center gap-2 mb-1">
        <SettingsIcon className="h-5 w-5 text-slate-500 dark:text-slate-400" />
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">Settings</p>
      </div>

      <BankConnectionSection />
      <InsightsExclusionsSection />

      <Button
        onClick={signOut}
        variant="outline"
        className="w-fit"
      >
        Sign Out
      </Button>
    </div>
  );
}
