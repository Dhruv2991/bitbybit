"use client";
import AdminPage from "@/components/pages/AdminPage";
import { useAppShell } from "@/components/layout/AppShellContext";

export default function Page() {
  const { user, authChecked } = useAppShell();
  if (!authChecked) return null;
  if (!user?.is_admin) {
    return (
      <div className="py-24 text-center font-mono text-sm text-[var(--muted)]">
        Access denied.
      </div>
    );
  }
  return <AdminPage user={user} />;
}
