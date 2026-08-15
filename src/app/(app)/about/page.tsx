"use client";
import AboutPage from "@/components/pages/AboutPage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { navigate } = useAppShell();
  return <AboutPage onNavigate={navigate as (page: string) => void} />;
}
