"use client";
import RefundPolicyPage from "@/components/pages/RefundPolicyPage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { navigate } = useAppShell();
  return <RefundPolicyPage onNavigate={navigate as (page: string) => void} />;
}
