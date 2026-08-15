"use client";
import HomePage from "@/components/pages/HomePage";
import { AppShellProvider, useAppShell } from "@/components/layout/AppShellContext";
import AppShell from "@/components/layout/AppShell";

function Inner() {
  const { user, navigate } = useAppShell();
  return <HomePage user={user} onNavigate={navigate} />;
}

export default function Page() {
  return (
    <AppShellProvider>
      <AppShell>
        <Inner />
      </AppShell>
    </AppShellProvider>
  );
}
