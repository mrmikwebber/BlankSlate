"use client";
import Link from "next/link";
import { useState } from "react";
import AccountTile from "./accountTile";

export default function AllAccountsTile() {

  return (
    <div className="flex flex-col bg-zinc-100 rounded-md p-2">
      <div>
        <h1>Accounts</h1>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 m-2">
        <AccountTile cardIssuer='amex' accountName='Gold Card' cardBalance='2356'/>
        <AccountTile cardIssuer='visa' accountName='OneAZ Card' cardBalance='2553'/>
        <AccountTile cardIssuer='mastercard' accountName='Bilt Mastercard' cardBalance='1210'/>
        <AccountTile cardIssuer='discover' accountName='Journey Card' cardBalance='8634'/>
      </div>

    </div>
  );
}