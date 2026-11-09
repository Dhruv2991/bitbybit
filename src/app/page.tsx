"use client";
import HomePage from "@/components/pages/HomePage";
import { AppShellProvider, useAppShell } from "@/components/layout/AppShellContext";
import { LoungeAudioProvider } from "@/components/lounge/LoungeAudioContext";
import AppShell from "@/components/layout/AppShell";

function Inner() {
  const { user, navigate } = useAppShell();
  return <HomePage user={user} onNavigate={navigate} />;
}

export default function Page() {
  return (
    <AppShellProvider>
      <LoungeAudioProvider>
        <AppShell>
          <Inner />
        </AppShell>
      </LoungeAudioProvider>
    </AppShellProvider>
  );
}
