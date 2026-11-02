"use client";

import React, { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";

interface CoordinatorAnnouncementsTabProps {
  showToast: (msg: string, type?: "ok" | "err" | "warn" | "info") => void;
}

export default function CoordinatorAnnouncementsTab({ showToast }: CoordinatorAnnouncementsTabProps) {
  const db = getSupabaseClient();
  const [text, setText] = useState("");
  const [active, setActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await (db.from("app_config") as any)
        .select("*")
        .in("key", ["announcement_text", "announcement_active", "announcement_expires_at"]);

      for (const c of data || []) {
        if (c.key === "announcement_text") setText(c.value || "");
        if (c.key === "announcement_active") setActive(c.value === "true");
        if (c.key === "announcement_expires_at") setExpiresAt(c.value || "");
      }
    } catch (err: any) {
      showToast("Failed to load announcement config: " + (err.message || ""), "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(nextActive?: boolean) {
    setSaving(true);
    try {
      await Promise.all([
        (db.from("app_config") as any).upsert({
          key: "announcement_text",
          value: text,
        }),
        (db.from("app_config") as any).upsert({
          key: "announcement_active",
          value: String(nextActive ?? active),
        }),
        (db.from("app_config") as any).upsert({
          key: "announcement_expires_at",
          value: expiresAt || "",
        }),
      ]);
      showToast("Announcement settings saved successfully", "ok");
    } catch (err: any) {
      showToast("Save failed: " + (err.message || ""), "err");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500 font-mono text-sm">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-3" />
        Loading announcement settings...
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 animate-fade-up">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold font-mono text-slate-900 dark:text-zinc-100">
          Global Announcements Banner
        </h2>
        <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 mt-0.5">
          Broadcast important dates, contest reminders, or operational updates across all pages.
        </p>
      </div>

      {/* Live Preview */}
      <div className="bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
        <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2 font-bold">
          Live User View Preview
        </div>
        {active && text.trim() ? (
          <div className="w-full bg-gradient-to-r from-sky-500/15 via-blue-500/15 to-indigo-500/15 border border-sky-400/30 rounded-lg px-4 py-2.5 flex items-center gap-3 text-sky-950 dark:text-sky-200 text-xs font-mono">
            <span className="shrink-0 text-base">📢</span>
            <span className="flex-1 font-medium">{text}</span>
            <span className="text-[10px] bg-sky-200 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300 px-2 py-0.5 rounded font-bold">
              Active Banner
            </span>
          </div>
        ) : (
          <div className="w-full bg-slate-100 dark:bg-zinc-800/50 border border-dashed border-slate-300 dark:border-zinc-700 rounded-lg p-3 text-center text-slate-400 dark:text-zinc-500 text-xs font-mono">
            Banner is currently inactive / disabled.
          </div>
        )}
      </div>

      {/* Edit Form */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5 shadow-sm">
        {/* Toggle active */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-zinc-800">
          <div>
            <label className="text-sm font-bold font-mono text-slate-900 dark:text-zinc-100">
              Banner Active Status
            </label>
            <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
              When toggled ON, this announcement is shown to all users at the top of the app.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActive(!active)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
              active ? "bg-emerald-500" : "bg-slate-300 dark:bg-zinc-700"
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                active ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Message Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold font-mono text-slate-700 dark:text-zinc-300">
            Announcement Message
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="e.g. 🏆 Arena Round 4 starts tomorrow at 6:00 PM IST! Make sure to register beforehand."
            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-3 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
          />
          <p className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
            Keep it clear and concise. Emojis and links are supported.
          </p>
        </div>

        {/* Expiry Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold font-mono text-slate-700 dark:text-zinc-300">
            Expiration Date (Optional)
          </label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-sky-500"
          />
          <p className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
            Leave blank if the announcement should remain active until manually disabled.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
          <button
            onClick={() => load()}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-mono hover:bg-slate-200 dark:hover:bg-zinc-700 transition"
          >
            Reset
          </button>
          <button
            onClick={() => save()}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-medium shadow-sm transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Announcement"}
          </button>
        </div>
      </div>
    </div>
  );
}

