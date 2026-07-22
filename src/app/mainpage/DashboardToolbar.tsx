"use client";

import MonthNav from "./MonthNav";

// The page-level hero band — spans the full width above the sidebar/content
// split. Ready to Assign lives in the sidebar footer instead (see
// SidebarPanel), so it's visible no matter which panel is active there.
export default function DashboardToolbar() {
  return (
    <div className="inline-flex self-start items-center gap-4 rounded-md px-5 py-3.5 mb-3 flex-shrink-0 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
      <MonthNav />
    </div>
  );
}
