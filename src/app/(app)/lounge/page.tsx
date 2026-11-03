"use client";

import LoungePage from "@/components/pages/LoungePage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { user, authChecked, navigate } = useAppShell();

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <LoungePage user={user} onNavigate={navigate} />;
}
