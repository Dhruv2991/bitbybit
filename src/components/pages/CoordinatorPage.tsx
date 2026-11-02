"use client";

import React, { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import CertificatesTab from "@/components/admin/CertificatesTab";
import CouponsTab from "@/components/admin/CouponsTab";
import CoordinatorContestsTab from "@/components/coordinator/CoordinatorContestsTab";
import CoordinatorAnnouncementsTab from "@/components/coordinator/CoordinatorAnnouncementsTab";
import CoordinatorFeedbackTab from "@/components/coordinator/CoordinatorFeedbackTab";
import type { User, Member } from "@/types/database";

type CoordinatorSection = "certificates" | "contests" | "announcements" | "coupons" | "feedback";

interface CoordinatorPageProps {
  user: User;
}

export default function CoordinatorPage({ user }: CoordinatorPageProps) {
  const [section, setSection] = useState<CoordinatorSection>("certificates");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "warn" | "info" } | null>(null);

  const db = getSupabaseClient();

  function showToast(msg: string, type: "ok" | "err" | "warn" | "info" = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    async function fetchMembers() {
      try {
        const { data, error } = await db
          .from("members")
          .select("*")
          .order("total_points", { ascending: false });
        if (!error && data) {
          setMembers(data as Member[]);
        }
      } catch (err) {
        console.error("Failed to load members", err);
      } finally {
        setLoading(false);
      }
    }
    fetchMembers();
  }, []);

  function handleSelectForCertificate(name: string, github: string, eventName: string) {
    setSection("certificates");
    showToast(`Ready to issue certificate for ${name} (@${github})`, "info");
  }

  const navItems: { id: CoordinatorSection; label: string; icon: string; desc: string }[] = [
    {
      id: "certificates",
      label: "Certificates Hub",
      icon: "🎓",
      desc: "Custom template generator, design coordinates, & issuance",
    },
    {
      id: "contests",
      label: "Contests & Registrations",
      icon: "🏆",
      desc: "Participant roll, export CSV, & status control",
    },
    {
      id: "announcements",
      label: "Announcements",
      icon: "📢",
      desc: "Global banner messages & countdown updates",
    },
    {
      id: "coupons",
      label: "Coupons & Offers",
      icon: "🎟️",
      desc: "Discounts, promotional codes, & campaigns",
    },
    {
      id: "feedback",
      label: "Contest Feedback",
      icon: "💬",
      desc: "Participant ratings, satisfaction, & reviews",
    },
  ];

  return (
    <div className="min-h-screen py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 px-4 py-2.5 rounded-lg font-mono text-xs shadow-xl transition-all animate-slide-down flex items-center gap-2 ${
            toast.type === "ok"
              ? "bg-emerald-600 text-white"
              : toast.type === "err"
              ? "bg-rose-600 text-white"
              : toast.type === "warn"
              ? "bg-amber-500 text-black font-semibold"
              : "bg-sky-600 text-white"
          }`}
        >
          <span>{toast.type === "ok" ? "✓" : toast.type === "err" ? "✕" : "ℹ"}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-sky-900/40 via-blue-900/30 to-indigo-900/40 border border-sky-500/20 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm">
        <div className="absolute -right-8 -top-8 w-48 h-48 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2.5 py-0.5 rounded-full">
                Management Operations
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                BitByBit v3
              </span>
            </div>
            <h1 className="text-2xl font-display font-bold text-white tracking-tight">
              Coordinator Portal
            </h1>
            <p className="text-xs font-mono text-slate-300 mt-1">
              Welcome back, <strong className="text-sky-300">{user.name}</strong> (@{user.github}) • Dedicated operations dashboard for management team
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-400/20 text-sky-200 font-medium">
              Role: {user.role === "super_admin" ? "Super Admin (Full Access)" : user.role || "Coordinator"}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Pills Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-1.5 shadow-sm overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 min-w-max">
          {navItems.map((item) => {
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-mono transition-all ${
                  isActive
                    ? "bg-sky-600 text-white font-bold shadow-sm"
                    : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/60 font-medium"
                }`}
              >
                <span className="text-sm">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="min-h-[500px]">
        {section === "certificates" && (
          <div className="space-y-4">
            <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl p-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold font-mono text-sky-900 dark:text-sky-200">
                  Certificates Engine
                </h3>
                <p className="text-[11px] font-mono text-sky-700 dark:text-sky-400 mt-0.5">
                  Use the Custom Certificate Template tab below to upload high-res image templates, customize text positions, and issue certificates.
                </p>
              </div>
            </div>
            <CertificatesTab members={members} showToast={showToast} />
          </div>
        )}

        {section === "contests" && (
          <CoordinatorContestsTab
            showToast={showToast}
            onSelectForCertificate={handleSelectForCertificate}
          />
        )}

        {section === "announcements" && (
          <CoordinatorAnnouncementsTab showToast={showToast} />
        )}

        {section === "coupons" && (
          <div className="space-y-4">
            <CouponsTab />
          </div>
        )}

        {section === "feedback" && (
          <CoordinatorFeedbackTab showToast={showToast} />
        )}
      </div>
    </div>
  );
}

