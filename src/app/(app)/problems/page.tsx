"use client";
import { Suspense } from "react";
import ProblemsPage from "@/components/pages/ProblemsPage";
import { useAppShell } from "@/components/layout/AppShellContext";

function Inner() {
  const { user, navigate } = useAppShell();
  return <ProblemsPage user={user} onNavigate={navigate} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
