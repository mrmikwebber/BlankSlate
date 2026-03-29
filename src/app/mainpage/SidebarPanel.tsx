import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useAccountContext } from "@/app/context/AccountContext";

import AccountCardCompact from "./AccountCardCompact";
import AddAccountModal from "./AddAccountModal";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { Plus } from "lucide-react";

export default function SidebarPanel() {
  const [showModal, setShowModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    accountId: string | number;
  } | null>(null);
  const [renaming, setRenaming] = useState<{ accountId: string | number; value: string } | null>(null);

  const { accounts, addAccount, deleteAccount, reorderAccounts, editAccountName } = useAccountContext();
  const [draggingId, setDraggingId] = useState<string | number | null>(null);
  const [dragOver, setDragOver] = useState<{
    id: string | number;
    position: "before" | "after";
  } | null>(null);

  const handleAddAccount = (newAccount) => {
    addAccount(newAccount);
  };

  const handleDeleteAccount = (accountId: string | number) => {
    deleteAccount(accountId);
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const renderAccountCard = (acc) => {
    const isDragTarget = dragOver?.id === acc.id;
    const borderClass = isDragTarget
      ? dragOver?.position === "after"
        ? "border-b-4 border-b-teal-500"
        : "border-l-4 border-l-teal-500"
      : "";

    return (
      <div
        key={acc.id}
        className={`relative group w-full`}
        style={{
          opacity: draggingId === acc.id ? 0.7 : 1,
          boxShadow: isDragTarget ? "0 0 0 2px rgba(20,184,166,0.35)" : undefined,
        }}
        onDragOver={(e) => {
          if (draggingId === null || draggingId === acc.id) return;
          const draggingAcc = accounts.find((a) => a.id === draggingId);
          if (!draggingAcc || draggingAcc.type !== acc.type) return;
          e.preventDefault();
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const position = e.clientY - rect.top > rect.height / 2 ? "after" : "before";
          setDragOver({ id: acc.id, position });
        }}
        onDrop={(e) => {
          if (draggingId === null || draggingId === acc.id) return;
          const draggingAcc = accounts.find((a) => a.id === draggingId);
          if (!draggingAcc || draggingAcc.type !== acc.type) return;
          e.preventDefault();
          reorderAccounts(draggingId, acc.id, dragOver?.position || "before");
          setDraggingId(null);
          setDragOver(null);
        }}
        onDragLeave={() => {
          if (dragOver?.id === acc.id) setDragOver(null);
        }}
      >
        <button
          aria-label="Drag to reorder account"
          className="absolute right-1 top-1 z-10 rounded-full border border-slate-200/80 bg-white/75 p-[6px] text-slate-400 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-slate-600 hover:shadow dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-slate-500"
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            setDraggingId(acc.id);
            setDragOver({ id: acc.id, position: "before" });
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDragOver(null);
          }}
        >
          <span className="flex flex-col items-center justify-center gap-[2px] px-[1px]">
            <span className="flex gap-[2px]">
              <span className="h-[2.25px] w-[2.25px] rounded-full bg-slate-400 dark:bg-slate-300" />
              <span className="h-[2.25px] w-[2.25px] rounded-full bg-slate-400 dark:bg-slate-300" />
            </span>
            <span className="flex gap-[2px]">
              <span className="h-[2.25px] w-[2.25px] rounded-full bg-slate-400 dark:bg-slate-300" />
              <span className="h-[2.25px] w-[2.25px] rounded-full bg-slate-400 dark:bg-slate-300" />
            </span>
          </span>
        </button>

        <div className={`w-full border border-transparent ${borderClass}`}>
          <AccountCardCompact
            account={acc}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                accountId: acc.id,
              });
            }}
          />
        </div>
      </div>
    );
  };

  const sectionDropZone = (list, type: "debit" | "credit") => {
    if (list.length === 0 || draggingId === null) return null;
    const last = list[list.length - 1];
    return (
      <div
        className="h-2 w-full"
        onDragOver={(e) => {
          const draggingAcc = accounts.find((a) => a.id === draggingId);
          if (!draggingAcc || draggingAcc.type !== type) return;
          e.preventDefault();
          setDragOver({ id: last.id, position: "after" });
        }}
        onDrop={(e) => {
          const draggingAcc = accounts.find((a) => a.id === draggingId);
          if (!draggingAcc || draggingAcc.type !== type) return;
          e.preventDefault();
          reorderAccounts(draggingId, last.id, "after");
          setDraggingId(null);
          setDragOver(null);
        }}
      />
    );
  };

  return (
    <aside className="space-y-3 w-full text-sm">
      {/* Accounts card */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-sm font-semibold">Accounts</CardTitle>
            <CardDescription className="text-xs">
              Cash and credit balances at a glance.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setShowModal(true)}
            className="gap-1 bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-700 dark:hover:bg-teal-600"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.length === 0 ? (
            <p className="text-muted-foreground text-center">
              No accounts added yet.
            </p>
          ) : (
            <>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase mb-1">
                  Cash
                </p>
                <div className="flex flex-col gap-2">
                  {accounts
                    .filter((a) => a.type === "debit")
                    .map((acc) => renderAccountCard(acc))}
                </div>
                {sectionDropZone(accounts.filter((a) => a.type === "debit"), "debit")}
              </div>

              <Separator className="my-1" />

              <div>
                <p className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase mb-1">
                  Credit
                </p>
                <div className="flex flex-col gap-2">
                  {accounts
                    .filter((a) => a.type === "credit")
                    .map((acc) => renderAccountCard(acc))}
                </div>
                {sectionDropZone(accounts.filter((a) => a.type === "credit"), "credit")}
              </div>
            </>
          )}

          {showModal && (
            <AddAccountModal
              onAddAccount={handleAddAccount}
              onClose={() => setShowModal(false)}
            />
          )}
        </CardContent>
      </Card>

      {/* ItemsToAddress removed per request */}

      {/* Right-click context menu for delete account (kept, but visually softened) */}
      {contextMenu &&
        createPortal(
          <div
            className="absolute bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-md z-50 text-xs"
            style={{
              top: contextMenu.y - document.documentElement.scrollTop,
              left: contextMenu.x,
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              className="px-3 py-2 w-full text-left hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
              onClick={() => {
                const acc = accounts.find((a) => a.id === contextMenu!.accountId);
                setRenaming({ accountId: contextMenu!.accountId, value: acc?.name ?? "" });
                setContextMenu(null);
              }}
            >
              Rename account
            </button>
            <button
              className="px-3 py-2 w-full text-left hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600"
              onClick={() => {
                handleDeleteAccount(contextMenu!.accountId);
                setContextMenu(null);
              }}
            >
              Delete account
            </button>
          </div>,
          document.body
        )}

      {renaming &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={(e) => { if (e.target === e.currentTarget) setRenaming(null); }}
          >
            <form
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-4 w-64 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = renaming.value.trim();
                if (trimmed) editAccountName(renaming.accountId, trimmed);
                setRenaming(null);
              }}
            >
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Rename account</p>
              <input
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={renaming.value}
                autoFocus
                onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRenaming(null)} className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                <button type="submit" className="px-3 py-1.5 text-xs rounded-md bg-teal-600 hover:bg-teal-700 text-white">Save</button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </aside>
  );
}
