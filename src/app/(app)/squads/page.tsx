"use client";

import SquadsPage from "@/components/pages/SquadsPage";
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

  return <SquadsPage user={user} />;
}
