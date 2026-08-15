"use client";
import WeeklyChallengePage from "@/components/pages/WeeklyChallengePage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { user, navigate } = useAppShell();
  return <WeeklyChallengePage user={user} onNavigate={navigate as (page: string) => void} />;
}
