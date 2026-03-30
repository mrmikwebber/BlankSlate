"use client";

import { createContext, useContext, useState } from "react";

interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("darkMode");
    if (stored !== null) return stored === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    const html = document.documentElement;
    html.classList.add("theme-transitioning");
    // Force the browser to commit the transition rule before changing the theme class,
    // otherwise both changes are batched and no "before" state exists to transition from
    void html.offsetHeight;
    html.classList.toggle("dark", next);
    localStorage.setItem("darkMode", String(next));
    setTimeout(() => html.classList.remove("theme-transitioning"), 100);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsDarkMode(next)));
  };

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
}

export function useDarkMode() {
  const context = useContext(DarkModeContext);
  if (context === undefined) {
    throw new Error("useDarkMode must be used within DarkModeProvider");
  }
  return context;
}
