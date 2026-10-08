'use client';
// ════════════════════════════════════════════════════════════
// src/app/(app)/admin/collaborations/page.tsx
// Protected Admin Collaborations & Partnerships Management Route
// ════════════════════════════════════════════════════════════

import AdminCollaborationsPage from '@/components/pages/AdminCollaborationsPage';
import { useAppShell } from '@/components/layout/AppShellContext';

export default function Page() {
  const { user, authChecked, navigate } = useAppShell();

  if (!authChecked) {
    return (
      <div className="py-24 text-center font-mono text-xs text-zinc-500 flex items-center justify-center gap-2">
        <span className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span>Authenticating administrator…</span>
      </div>
    );
  }

  if (!user?.is_admin) {
    return (
      <div className="max-w-md mx-auto py-24 px-4 text-center font-mono space-y-3">
        <div className="text-3xl">🔒</div>
        <h2 className="text-sm font-bold text-zinc-200">Access Denied</h2>
        <p className="text-xs text-zinc-500">
          You must be an administrator to access the Collaborations management screen.
        </p>
      </div>
    );
  }

  return (
    <AdminCollaborationsPage
      user={user}
      onNavigate={navigate as (page: string) => void}
    />
  );
}
