"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAccountContext } from "@/app/context/AccountContext";

declare global {
  interface Window {
    TellerConnect?: {
      setup: (config: TellerConnectConfig) => TellerConnectInstance;
    };
  }
}

interface TellerConnectConfig {
  applicationId: string;
  appId?: string;
  environment?: string;
  products?: string[];
  onSuccess: (enrollment: TellerEnrollment) => void;
  onFailure?: (err: unknown) => void;
  onExit?: () => void;
}

interface TellerConnectInstance {
  open: () => void;
}

interface TellerEnrollment {
  accessToken: string;
  enrollment: {
    id: string;
    institution: { name: string };
  };
  user: { id: string };
}

export interface TellerEnrollmentData {
  accessToken: string;
  enrollmentId: string;
}

interface Props {
  onConnected?: () => void;
  onEnrollmentReady?: (data: TellerEnrollmentData) => void;
}

export default function TellerConnect({ onConnected, onEnrollmentReady }: Props) {
  const { setAccounts } = useAccountContext();
  const instanceRef = useRef<TellerConnectInstance | null>(null);
  const [loading, setLoading] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = process.env.NEXT_PUBLIC_TELLER_APP_ID;
  const environment = process.env.NEXT_PUBLIC_TELLER_ENV ?? "sandbox";

  // Load Teller Connect script
  useEffect(() => {
    if (document.getElementById("teller-connect-script")) {
      if (window.TellerConnect) setScriptReady(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "teller-connect-script";
    script.src = "https://cdn.teller.io/connect/connect.js";
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
  }, []);

  // Initialize Teller Connect instance once script is ready
  useEffect(() => {
    if (!scriptReady || !window.TellerConnect || !appId) return;

    instanceRef.current = window.TellerConnect.setup({
      applicationId: appId,
      environment,
      products: ["transactions"],
      onSuccess: async (enrollment) => {
        setLoading(true);
        setError(null);

        // If a parent wants to handle account selection, hand off enrollment data
        if (onEnrollmentReady) {
          onEnrollmentReady({
            accessToken: enrollment.accessToken,
            enrollmentId: enrollment.enrollment.id,
          });
          setLoading(false);
          return;
        }

        // Legacy: auto-enroll all accounts
        try {
          const res = await fetch("/api/teller/enroll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken: enrollment.accessToken,
              enrollmentId: enrollment.enrollment.id,
            }),
          });

          if (!res.ok) {
            const body = await res.json() as { error?: string };
            throw new Error(body.error ?? "Enrollment failed");
          }

          onConnected?.();
          window.location.reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
          setLoading(false);
        }
      },
      onFailure: () => {
        setError("Bank connection failed. Please try again.");
      },
    });
  }, [scriptReady, appId, environment, onConnected, onEnrollmentReady, setAccounts]);

  const handleClick = () => {
    if (!appId) {
      setError("Teller app ID is not configured.");
      return;
    }
    instanceRef.current?.open();
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        onClick={handleClick}
        disabled={loading || !scriptReady}
        className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-8"
        size="sm"
      >
        {loading ? "Connecting…" : "Connect Bank"}
      </Button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
