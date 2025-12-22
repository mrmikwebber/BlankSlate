"use client";
import Link from "next/link";

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-slate-800 dark:text-slate-100">
      <h1 className="text-2xl font-semibold mb-4">Legal & Policies</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
        Find all policy information for BlankSlate below.
      </p>

      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-semibold mb-2">Terms of Service</h2>
          <p className="text-sm mb-3">Read the terms governing use of the service.</p>
          <Link href="/terms" className="text-teal-600 dark:text-teal-400 hover:underline">View Terms</Link>
        </div>
        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-semibold mb-2">Privacy Policy</h2>
          <p className="text-sm mb-3">Learn how we handle your data.</p>
          <Link href="/privacy" className="text-teal-600 dark:text-teal-400 hover:underline">View Privacy Policy</Link>
        </div>
        <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-semibold mb-2">Cookie Policy</h2>
          <p className="text-sm mb-3">Understand our use of cookies.</p>
          <Link href="/cookies" className="text-teal-600 dark:text-teal-400 hover:underline">View Cookie Policy</Link>
        </div>
      </div>
    </div>
  );
}
