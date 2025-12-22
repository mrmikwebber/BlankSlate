"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "cookie_consent_v1";

type Consent = {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
};

function getInitialConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Consent : null;
  } catch {
    return null;
  }
}

function saveConsent(consent: Consent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    // Optionally emit a custom event so analytics can be initialized elsewhere
    window.dispatchEvent(new CustomEvent("cookie-consent-updated", { detail: consent }));
  } catch {}
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const existing = getInitialConsent();
    setVisible(!existing);
  }, []);

  if (!visible) return null;

  const acceptAll = () => {
    const consent: Consent = {
      essential: true,
      analytics: true,
      marketing: false,
      timestamp: Date.now(),
    };
    saveConsent(consent);
    setVisible(false);
  };

  const acceptSelected = () => {
    const consent: Consent = {
      essential: true,
      analytics,
      marketing: false,
      timestamp: Date.now(),
    };
    saveConsent(consent);
    setVisible(false);
  };

  const decline = () => {
    const consent: Consent = {
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: Date.now(),
    };
    saveConsent(consent);
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-8 sm:right-8 z-50">
      <div className="mx-auto max-w-3xl rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur shadow-lg">
        <div className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Cookies & Analytics</h2>
          <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
            We use essential cookies to make the app work. With your permission, we would also like to use analytics cookies to understand usage and improve the product.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="h-4 w-4"
              />
              Enable analytics cookies
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={acceptAll} className="px-3 py-1.5 rounded bg-neutral-900 text-white hover:bg-neutral-800 text-sm">
              Accept all
            </button>
            <button onClick={acceptSelected} className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm">
              Save selection
            </button>
            <button onClick={decline} className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm">
              Decline non-essential
            </button>
            <a href="/cookies" className="px-3 py-1.5 rounded text-sm underline">
              Learn more
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
