"use client";

import CoordinatorPage from "@/components/pages/CoordinatorPage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { user, authChecked } = useAppShell();

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user?.is_admin && !user?.is_coordinator) {
    return (
      <div className="py-24 text-center font-mono text-sm text-[var(--muted)]">
        Access denied. Management coordinator permissions required.
      </div>
    );
  }

  return <CoordinatorPage user={user} />;
}

