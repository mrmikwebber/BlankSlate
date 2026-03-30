"use client"
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css";
import Navbar from "./navigation/navbar";
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
      <head>
        {/* Blocking script: apply dark class before first paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('darkMode');var p=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='true'||(s===null&&p)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased no-motion`}
      >
        <AuthListener />
        <SpeedInsights />
        <DarkModeProvider>
          <AuthProvider>
            <UndoRedoProvider>
              <AccountProvider>
                <BudgetProvider>
                  <Navbar />
                  {children}
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
