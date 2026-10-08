"use client";
import CouponsTab from "@/components/admin/CouponsTab";
import { useAppShell } from "@/components/layout/AppShellContext";
import Link from "next/link";

export default function AdminCouponsPage() {
  const { user, authChecked } = useAppShell();

  if (!authChecked) return null;
  if (!user?.is_admin) {
    return (
      <div className="py-24 text-center font-mono text-sm text-[var(--muted)]">
        Access denied.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-1">
            <Link href="/admin" className="hover:text-cyan-400 transition-colors">
              Admin
            </Link>
            <span>/</span>
            <span className="text-zinc-200">Coupons & Pricing</span>
          </div>
          <h1 className="font-display font-bold text-2xl text-zinc-100">
            Coupon Codes & Checkout Pricing Override
          </h1>
        </div>
        <Link
          href="/admin"
          className="text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 px-3.5 py-2 rounded-xl transition-colors"
        >
          ← Back to Admin
        </Link>
      </div>

      <CouponsTab />
    </div>
  );
}
