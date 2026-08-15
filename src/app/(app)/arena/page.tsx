"use client";
import ArenaPage from "@/components/pages/ArenaPage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { user, navigate, setArenaLocked } = useAppShell();
  return <ArenaPage user={user} onArenaLockChange={setArenaLocked} onNavigate={navigate as (page: string) => void} />;
}
