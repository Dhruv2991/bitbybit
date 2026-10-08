'use client';
// ════════════════════════════════════════════════════════════
// src/app/(app)/collaborations/page.tsx
// Public Collaborations & Partnerships route (/collaborations)
// ════════════════════════════════════════════════════════════

import CollaborationsPage from '@/components/pages/CollaborationsPage';
import { useAppShell } from '@/components/layout/AppShellContext';

export default function Page() {
  const { navigate } = useAppShell();
  return <CollaborationsPage onNavigate={navigate as (page: string) => void} />;
}
