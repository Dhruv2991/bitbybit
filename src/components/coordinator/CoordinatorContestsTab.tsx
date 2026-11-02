"use client";

import React, { useState, useEffect, useMemo } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { Contest, ContestRegistration } from "@/types/database";

interface CoordinatorContestsTabProps {
  showToast: (msg: string, type?: "ok" | "err" | "warn" | "info") => void;
  onSelectForCertificate?: (name: string, github: string, eventName: string) => void;
}

export default function CoordinatorContestsTab({
  showToast,
  onSelectForCertificate,
}: CoordinatorContestsTabProps) {
  const [contests, setContests] = useState<Contest[]>([]);
  const [registrations, setRegistrations] = useState<ContestRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContestId, setSelectedContestId] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const db = getSupabaseClient();

  async function loadData() {
    setLoading(true);
    try {
      const [contestsRes, regsRes] = await Promise.all([
        db.from("contests").select("*").order("created_at", { ascending: false }),
        db.from("contest_registrations").select("*").order("created_at", { ascending: false }),
      ]);

      if (contestsRes.data) setContests(contestsRes.data as Contest[]);
      if (regsRes.data) setRegistrations(regsRes.data as ContestRegistration[]);
    } catch (err: any) {
      showToast("Failed to load contests data: " + (err.message || "Unknown error"), "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Compute counts per contest
  const regCountByContest = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of registrations) {
      map[r.contest_id] = (map[r.contest_id] || 0) + 1;
    }
    return map;
  }, [registrations]);

  // Filter registrations
  const filteredRegistrations = useMemo(() => {
    return registrations.filter((r) => {
      if (selectedContestId !== "all" && r.contest_id !== selectedContestId) {
        return false;
      }
      if (statusFilter !== "all" && r.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (r.name || "").toLowerCase().includes(q);
        const matchesGithub = (r.github || "").toLowerCase().includes(q);
        const matchesContest = (r.contest_name || "").toLowerCase().includes(q);
        if (!matchesName && !matchesGithub && !matchesContest) return false;
      }
      return true;
    });
  }, [registrations, selectedContestId, statusFilter, searchQuery]);

  // Export to CSV
  function exportCSV() {
    if (filteredRegistrations.length === 0) {
      showToast("No registrations to export", "warn");
      return;
    }

    const headers = ["Contest Name", "Participant Name", "GitHub Username", "Status", "Registered At"];
    const rows = filteredRegistrations.map((r) => [
      `"${(r.contest_name || "").replace(/"/g, '""')}"`,
      `"${(r.name || "").replace(/"/g, '""')}"`,
      `"${(r.github || "").replace(/"/g, '""')}"`,
      `"${(r.status || "confirmed").replace(/"/g, '""')}"`,
      `"${r.created_at ? new Date(r.created_at).toLocaleString() : ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const contestNameSlug =
      selectedContestId === "all"
        ? "all-contests"
        : (contests.find((c) => c.id === selectedContestId)?.name || "contest")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-");
    link.setAttribute("download", `bitbybit-${contestNameSlug}-participants.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported ${filteredRegistrations.length} registrations to CSV`, "ok");
  }

  // Update contest status
  async function updateContestStatus(contestId: string, newStatus: "upcoming" | "live" | "ended") {
    setUpdatingStatusId(contestId);
    try {
      const { error } = await (db.from("contests") as any)
        .update({ status: newStatus })
        .eq("id", contestId);

      if (error) throw error;

      setContests((prev) =>
        prev.map((c) => (c.id === contestId ? { ...c, status: newStatus } : c))
      );
      showToast(`Contest status updated to ${newStatus}`, "ok");
    } catch (err: any) {
      showToast("Failed to update status: " + (err.message || "Unknown error"), "err");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500 font-mono text-sm">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-3" />
        Loading contest & registration data...
      </div>
    );
  }

  const liveCount = contests.filter((c) => c.status === "live").length;
  const upcomingCount = contests.filter((c) => c.status === "upcoming").length;
  const selectedContest = contests.find((c) => c.id === selectedContestId);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
          <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">Total Contests</p>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-zinc-100 mt-1">
            {contests.length}
          </p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">Live Contests</p>
          <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-1">
            {liveCount}
          </p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs font-mono text-amber-600 dark:text-amber-400">Upcoming Contests</p>
          <p className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-300 mt-1">
            {upcomingCount}
          </p>
        </div>
        <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4">
          <p className="text-xs font-mono text-sky-600 dark:text-sky-400">Total Registrations</p>
          <p className="text-2xl font-bold font-mono text-sky-700 dark:text-sky-300 mt-1">
            {registrations.length}
          </p>
        </div>
      </div>

      {/* Contest Selection & Overview */}
      <div className="bg-slate-50/60 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-zinc-100">
              Select Contest
            </h3>
            <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
              Filter participants and manage status for a specific event
            </p>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-700 transition"
          >
            ↻ Refresh Data
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <button
            onClick={() => setSelectedContestId("all")}
            className={`p-3 rounded-lg border text-left transition-all ${
              selectedContestId === "all"
                ? "bg-sky-50 dark:bg-sky-950/40 border-sky-400 text-sky-900 dark:text-sky-200 shadow-sm"
                : "bg-white dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 text-slate-800 dark:text-zinc-200"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs font-bold">All Events</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                {registrations.length} regs
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 truncate">
              View all registrations combined
            </p>
          </button>

          {contests.map((c) => {
            const count = regCountByContest[c.id] || 0;
            const isSelected = selectedContestId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedContestId(c.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  isSelected
                    ? "bg-sky-50 dark:bg-sky-950/40 border-sky-400 text-sky-900 dark:text-sky-200 shadow-sm"
                    : "bg-white dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 text-slate-800 dark:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-bold truncate max-w-[140px]">{c.name}</span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                      c.status === "live"
                        ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30"
                        : c.status === "upcoming"
                        ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30"
                        : "bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                  <span>{c.duration_mins || 60}m duration</span>
                  <span className="font-bold text-sky-600 dark:text-sky-400">{count} registered</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Status manager for selected contest */}
        {selectedContest && (
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-600 dark:text-zinc-300">
                Manage <strong>{selectedContest.name}</strong> status:
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 font-bold uppercase">
                {selectedContest.status}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {(["upcoming", "live", "ended"] as const).map((st) => (
                <button
                  key={st}
                  disabled={selectedContest.status === st || updatingStatusId === selectedContest.id}
                  onClick={() => updateContestStatus(selectedContest.id, st)}
                  className={`px-2.5 py-1 text-xs font-mono rounded capitalize transition ${
                    selectedContest.status === st
                      ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-zinc-800 text-slate-400"
                      : "bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 hover:border-sky-500 text-slate-700 dark:text-zinc-200"
                  }`}
                >
                  Set {st}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Registrations List Section */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        {/* Controls Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/70 dark:bg-zinc-950/40">
          <div className="flex items-center gap-3">
            <h3 className="font-mono font-bold text-sm text-slate-900 dark:text-zinc-100">
              Registrations ({filteredRegistrations.length})
            </h3>
            {selectedContest && (
              <span className="text-xs font-mono bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded border border-sky-300 dark:border-sky-800">
                {selectedContest.name}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              placeholder="Search name, GitHub, contest..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 w-56"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-sky-500"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>

            <button
              onClick={exportCSV}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-medium flex items-center gap-1.5 shadow-sm transition"
            >
              <span>📥 Export CSV</span>
            </button>
          </div>
        </div>

        {/* Table */}
        {filteredRegistrations.length === 0 ? (
          <div className="py-16 text-center text-slate-400 dark:text-zinc-500 font-mono text-xs">
            No registrations found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-100/70 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 uppercase text-[10px] border-b border-slate-200 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Participant</th>
                  <th className="px-4 py-3">GitHub</th>
                  <th className="px-4 py-3">Contest</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Registered At</th>
                  <th className="px-4 py-3 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredRegistrations.map((reg) => (
                  <tr
                    key={reg.id}
                    className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={`https://github.com/${reg.github}.png`}
                          alt={reg.name || reg.github}
                          className="w-6 h-6 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 shrink-0"
                          onError={(e) => {
                            (e.target as any).src =
                              "https://github.com/identicons/" + reg.github + ".png";
                          }}
                        />
                        <span className="font-medium text-slate-900 dark:text-zinc-100">
                          {reg.name || reg.github}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://github.com/${reg.github}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                      >
                        @{reg.github}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-zinc-300">
                      {reg.contest_name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          reg.status === "confirmed"
                            ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                            : reg.status === "pending"
                            ? "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                            : "bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20"
                        }`}
                      >
                        {reg.status || "confirmed"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-zinc-400">
                      {reg.created_at ? new Date(reg.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {onSelectForCertificate && (
                        <button
                          onClick={() =>
                            onSelectForCertificate(
                              reg.name || reg.github,
                              reg.github,
                              reg.contest_name
                            )
                          }
                          className="px-2.5 py-1 rounded bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition text-[11px]"
                        >
                          🎓 Issue Certificate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

