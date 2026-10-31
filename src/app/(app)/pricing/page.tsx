"use client";
import PricingPage from "@/components/pages/PricingPage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { user, navigate } = useAppShell();
  return <PricingPage user={user} onNavigate={navigate as (page: string) => void} />;
}

