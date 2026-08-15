"use client";
import PrivacyPolicyPage from "@/components/pages/PrivacyPolicyPage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { navigate } = useAppShell();
  return <PrivacyPolicyPage onNavigate={navigate as (page: string) => void} />;
}
