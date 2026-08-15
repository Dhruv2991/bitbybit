"use client";
import HomePage from "@/components/pages/HomePage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { user, navigate } = useAppShell();
  return <HomePage user={user} onNavigate={navigate} />;
}
