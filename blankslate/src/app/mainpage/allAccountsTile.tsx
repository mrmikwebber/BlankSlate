"use client";
import Link from "next/link";
import { createContext, useContext, useState } from "react";
import AccountTile from "./accountTile";
import { useAccountContext } from "../context/AccountContext";

export default function AllAccountsTile() {
  const { accounts } = useAccountContext();

  return (
    <div className="flex flex-col bg-zinc-100 rounded-md p-2">
      <div>
        <h1>Accounts</h1>
      </div>
      <h2>Cash</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 m-2">
      {accounts.map((account) => (
        account.type === 'debit' && <AccountTile cardIssuer={account.issuer} accountName={account.name} cardBalance={account.balance} isCredit={false}/>
      ))}
      </div>
      <h2>Credit</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 m-2">
      {accounts.map((account) => (
        account.type === 'credit' && <AccountTile cardIssuer={account.issuer} accountName={account.name} cardBalance={account.balance} isCredit={true}/>
      ))}
      </div>
    </div>
  );
}