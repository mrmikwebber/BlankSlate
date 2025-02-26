"use client";
import Link from "next/link";
import { useState } from "react";
import AccountTile from "./accountTile";

export default function MainPageHeader() {

  return (
    <div className="flex">
        <AccountTile cardIssuer='amex' accountName='Gold Card' cardBalance='2356'/>
        <AccountTile cardIssuer='visa' accountName='OneAZ Card' cardBalance='2553'/>
        <AccountTile cardIssuer='mastercard' accountName='Bilt Mastercard' cardBalance='1210'/>
        <AccountTile cardIssuer='discover' accountName='Journey Card' cardBalance='8634'/>
    </div>
  );
}