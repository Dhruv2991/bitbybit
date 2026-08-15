"use client";
import TermsPage from "@/components/pages/TermsPage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { navigate } = useAppShell();
  return <TermsPage onNavigate={navigate as (page: string) => void} />;
}
