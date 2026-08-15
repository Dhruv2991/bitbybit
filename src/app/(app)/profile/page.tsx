"use client";
import ProfilePage from "@/components/pages/ProfilePage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { user, navigate } = useAppShell();
  return <ProfilePage user={user} onNavigate={navigate as (page: string) => void} />;
}
