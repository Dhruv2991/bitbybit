"use client";
import { Suspense } from "react";
import DuelsLobbyPage from "@/components/pages/DuelsLobbyPage";
import { useAppShell } from "@/components/layout/AppShellContext";

function Inner() {
  const { user, navigate } = useAppShell();
  return <DuelsLobbyPage user={user} onNavigate={navigate} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
