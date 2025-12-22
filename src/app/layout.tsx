"use client"
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css";
import Navbar from "./navigation/navbar";
import Link from "next/link";
import CookieConsent from "../components/ui/CookieConsent";
import { AccountProvider } from "./context/AccountContext";
import { BudgetProvider } from "./context/BudgetContext";
import { AuthProvider } from "./context/AuthContext";
import { UndoRedoProvider } from "./context/UndoRedoContext";
import { DarkModeProvider } from "./context/DarkModeContext";
import AuthListener from "./auth/AuthListener";
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
        <AuthListener />
        <SpeedInsights />
        <DarkModeProvider>
          <AuthProvider>
            <UndoRedoProvider>
              <Navbar />
              <AccountProvider>
                <BudgetProvider>
                  {children}
                  {/* Site footer with legal links */}
                  <footer className="mt-16 border-t border-neutral-200 dark:border-neutral-800">
                    <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-neutral-600 dark:text-neutral-300 flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">BlankSlate</span>
                        <span className="opacity-70">© {new Date().getFullYear()}</span>
                      </div>
                      <nav className="flex flex-wrap gap-4">
                        <Link href="/terms" className="hover:underline">Terms</Link>
                        <Link href="/privacy" className="hover:underline">Privacy</Link>
                        <Link href="/cookies" className="hover:underline">Cookies</Link>
                      </nav>
                    </div>
                  </footer>
                </BudgetProvider>
              </AccountProvider>
            </UndoRedoProvider>
          </AuthProvider>
        </DarkModeProvider>
        {/* Cookie consent banner (only if non-essential cookies used) */}
        {process.env.NEXT_PUBLIC_ENABLE_COOKIE_BANNER === "true" && (
          <CookieConsent />
        )}
      </body>
    </html>
  );
}
