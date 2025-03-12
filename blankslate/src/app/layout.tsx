"use client"
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./navigation/navbar";
import { AccountProvider } from "./context/AccountContext";
import { TableProvider } from "./context/TableDataContext";
import { BudgetProvider } from "./context/BudgetContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head></head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Navbar />
        <TableProvider>
          <AccountProvider>
            <BudgetProvider>{children}</BudgetProvider>
          </AccountProvider>
        </TableProvider>
      </body>
    </html>
  );
}
