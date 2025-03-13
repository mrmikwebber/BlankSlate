"use client";
import Link from "next/link";
import { useState } from "react";
import AccountTile from "./accountTile";

export default function TotalSpendingTile() {

  return (
    <div className="flex flex-col bg-zinc-100 rounded-md p-2">
      <div>
        <h1>Total Spending</h1>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 m-2">
      </div>

    </div>
  );
}