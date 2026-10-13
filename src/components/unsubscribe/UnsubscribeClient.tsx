"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  MailX,
  MailCheck,
  ShieldCheck,
  ArrowLeft,
  Sun,
  Moon,
  AlertCircle,
  RefreshCw,
  Send,
  XCircle,
  HelpCircle,
} from "lucide-react";
import {
  unsubscribeEmailAction,
  resubscribeEmailAction,
} from "@/app/actions/unsubscribe";

type FlowStatus = "loading" | "unsubscribed" | "resubscribed" | "idle" | "error";

const REASON_OPTIONS = [
  "Too many emails",
  "No longer active on Bit by Bit",
  "Not interested in contests or weekly challenges",
  "Prefer checking the site manually",
];

export default function UnsubscribeClient() {
  const searchParams = useSearchParams();
  const rawEmailParam = searchParams.get("email");

  const [emailInput, setEmailInput] = useState("");
  const [activeEmail, setActiveEmail] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [status, setStatus] = useState<FlowStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isPending, startTransition] = useTransition();

  // Initialize theme from DOM / localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("bb_theme") as "dark" | "light" | null;
      const initial =
        stored ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      setTheme(initial);
      applyTheme(initial);
    } catch {}
  }, []);

  function applyTheme(t: "dark" | "light") {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(t);
    root.setAttribute("data-theme", t);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("bb_theme", next);
    } catch {}
    applyTheme(next);
  }

  // Handle URL email parameter on load
  useEffect(() => {
    if (rawEmailParam && rawEmailParam.trim()) {
      const cleanEmail = rawEmailParam.trim();
      setEmailInput(cleanEmail);
      setActiveEmail(cleanEmail);

      // Trigger automatic opt-out for direct email links
      startTransition(async () => {
        setStatus("loading");
        const res = await unsubscribeEmailAction(cleanEmail, "Direct email unsubscribe link clicked");
        if (res.success) {
          setStatus("unsubscribed");
        } else {
          setErrorMessage(res.error || "Failed to process unsubscribe request.");
          setStatus("error");
        }
      });
    } else {
      setStatus("idle");
    }
  }, [rawEmailParam]);

  // Handle manual unsubscribe submission
  async function handleManualUnsubscribe(e: React.FormEvent) {
    e.preventDefault();
    const target = emailInput.trim();
    if (!target) {
      setErrorMessage("Please enter your email address.");
      setStatus("error");
      return;
    }

    startTransition(async () => {
      setStatus("loading");
      setErrorMessage("");
      const fullReason = selectedReason
        ? customReason
          ? `${selectedReason} - ${customReason}`
          : selectedReason
        : customReason || "Web page manual submission";

      const res = await unsubscribeEmailAction(target, fullReason);
      if (res.success) {
        setActiveEmail(target);
        setStatus("unsubscribed");
      } else {
        setErrorMessage(res.error || "Failed to unsubscribe. Please verify your email.");
        setStatus("error");
      }
    });
  }

  // Handle re-subscribe action
  function handleResubscribe() {
    if (!activeEmail) return;

    startTransition(async () => {
      setStatus("loading");
      const res = await resubscribeEmailAction(activeEmail);
      if (res.success) {
        setStatus("resubscribed");
      } else {
        setErrorMessage(res.error || "Failed to update preferences.");
        setStatus("error");
      }
    });
  }

  // Handle re-opt-out from resubscribed state
  function handleReOptOut() {
    if (!activeEmail) return;

    startTransition(async () => {
      setStatus("loading");
      const res = await unsubscribeEmailAction(activeEmail, "Re-opted out by user");
      if (res.success) {
        setStatus("unsubscribed");
      } else {
        setErrorMessage(res.error || "Failed to unsubscribe.");
        setStatus("error");
      }
    });
  }

  return (
    <>
      {/* Top Header Navigation */}
      <header className="border-b border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md bg-white/70 dark:bg-slate-950/70 sticky top-0 z-40 transition-colors">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-mono text-sm font-bold tracking-tight text-slate-900 dark:text-zinc-100 group"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-cyan-400 group-hover:scale-125 transition-transform" />
            <span className="font-display font-black text-base tracking-normal">BitByBit</span>
            <span className="hidden sm:inline-block text-xs font-mono text-slate-400 dark:text-zinc-500 font-normal">
              / preferences
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors py-1 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Platform</span>
            </Link>

            <button
              onClick={toggleTheme}
              aria-label="Toggle visual theme"
              className="p-2 rounded-xl text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200/80 dark:border-slate-800 transition-all"
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-600" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-12 bg-dot-grid relative">
        <div className="w-full max-w-xl mx-auto animate-fade-up">
          {/* Card Wrapper */}
          <div className="bg-white/95 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-sm dark:shadow-2xl overflow-hidden p-6 sm:p-8 transition-all">

            {/* State 1: Loading / Processing */}
            {status === "loading" && (
              <div className="text-center py-10 space-y-4">
                <div className="relative w-12 h-12 mx-auto">
                  <div className="w-12 h-12 rounded-full border-2 border-sky-600/20 dark:border-cyan-400/20" />
                  <div className="w-12 h-12 rounded-full border-2 border-sky-600 dark:border-cyan-400 border-t-transparent animate-spin absolute inset-0" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-display font-bold text-lg text-slate-900 dark:text-zinc-100">
                    Updating email preferences
                  </h2>
                  <p className="font-mono text-xs text-slate-500 dark:text-zinc-400">
                    Applying opt-out status for{" "}
                    <span className="text-slate-800 dark:text-zinc-200 font-semibold">
                      {activeEmail || emailInput || "your email"}
                    </span>
                    ...
                  </p>
                </div>
              </div>
            )}

            {/* State 2: Unsubscribed Confirmation (Success) */}
            {status === "unsubscribed" && (
              <div className="space-y-6">
                {/* Header Badge & Icon */}
                <div className="text-center space-y-3">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 shadow-xs">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-semibold tracking-wide uppercase bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Opt-out confirmed
                    </div>

                    <h1 className="font-display font-black text-2xl sm:text-3xl text-slate-900 dark:text-zinc-100 tracking-tight">
                      You are unsubscribed
                    </h1>

                    <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed max-w-md mx-auto">
                      <span className="font-mono font-medium text-slate-900 dark:text-zinc-200 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded border border-slate-200/80 dark:border-slate-700/60 inline-block break-all">
                        {activeEmail}
                      </span>{" "}
                      has been opted out of marketing &amp; promotional communications.
                    </p>
                  </div>
                </div>

                {/* Preference Transparency Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Disabled updates</span>
                    </div>
                    <ul className="text-[11px] text-slate-500 dark:text-zinc-400 space-y-1 font-mono">
                      <li>• Arena contest announcements</li>
                      <li>• Weekly challenge releases</li>
                      <li>• Activity &amp; subscription nudges</li>
                    </ul>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold text-sky-600 dark:text-cyan-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Essential notices</span>
                    </div>
                    <ul className="text-[11px] text-slate-500 dark:text-zinc-400 space-y-1 font-mono">
                      <li>• Payment &amp; renewal receipts</li>
                      <li>• Issued certificate deliveries</li>
                      <li>• Critical security notifications</li>
                    </ul>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleResubscribe}
                    disabled={isPending}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/70 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 transition-all active:scale-[0.98]"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
                    <span>Opt back in / Re-subscribe</span>
                  </button>

                  <Link
                    href="/"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-zinc-950 shadow-xs transition-all active:scale-[0.98]"
                  >
                    <span>Return to BitByBit</span>
                  </Link>
                </div>
              </div>
            )}

            {/* State 3: Resubscribed (Opted back in) */}
            {status === "resubscribed" && (
              <div className="space-y-6 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-50 dark:bg-cyan-500/10 text-sky-600 dark:text-cyan-400 border border-sky-200 dark:border-cyan-500/20 shadow-xs mx-auto">
                  <MailCheck className="w-7 h-7" />
                </div>

                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-semibold tracking-wide uppercase bg-sky-50 dark:bg-cyan-500/10 text-sky-700 dark:text-cyan-300 border border-sky-200 dark:border-cyan-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 dark:bg-cyan-400" />
                    Subscription active
                  </div>

                  <h1 className="font-display font-black text-2xl sm:text-3xl text-slate-900 dark:text-zinc-100 tracking-tight">
                    Welcome back!
                  </h1>

                  <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed max-w-md mx-auto">
                    You have successfully re-subscribed for{" "}
                    <span className="font-mono font-medium text-slate-900 dark:text-zinc-200">
                      {activeEmail}
                    </span>
                    . You will receive challenge updates, contest broadcasts, and platform announcements.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleReOptOut}
                    disabled={isPending}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
                  >
                    <MailX className="w-3.5 h-3.5" />
                    <span>Unsubscribe again</span>
                  </button>

                  <Link
                    href="/"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-mono font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-zinc-950 shadow-xs transition-all active:scale-[0.98]"
                  >
                    <span>Go to Arena</span>
                  </Link>
                </div>
              </div>
            )}

            {/* State 4: Idle / Manual Entry Form */}
            {status === "idle" && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-xs font-mono font-medium text-slate-500 dark:text-zinc-400">
                    <MailX className="w-4 h-4 text-rose-500" />
                    <span>Email Opt-Out Management</span>
                  </div>
                  <h1 className="font-display font-black text-2xl sm:text-3xl text-slate-900 dark:text-zinc-100 tracking-tight">
                    Unsubscribe from promotional emails
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                    Enter the email address you would like to remove from Bit by Bit challenge drops, contest announcements, and marketing notifications.
                  </p>
                </div>

                <form onSubmit={handleManualUnsubscribe} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="unsubscribe-email"
                      className="block text-xs font-mono font-medium text-slate-700 dark:text-zinc-300"
                    >
                      Email address
                    </label>
                    <input
                      id="unsubscribe-email"
                      type="email"
                      required
                      placeholder="you@domain.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="w-full bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-sky-500 dark:focus:border-cyan-400 focus:ring-1 focus:ring-sky-500/20 dark:focus:ring-cyan-400/20 transition-all"
                    />
                  </div>

                  {/* Optional Feedback Pills */}
                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      Reason for leaving (optional):
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {REASON_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSelectedReason(selectedReason === opt ? "" : opt)}
                          className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-all ${
                            selectedReason === opt
                              ? "bg-slate-900 text-white border-slate-900 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/40"
                              : "bg-slate-100/70 hover:bg-slate-200/70 dark:bg-slate-950/50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-zinc-400 border-slate-200/80 dark:border-slate-800"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isPending || !emailInput.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-mono text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400 dark:text-zinc-950 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.99]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Unsubscribe email address</span>
                  </button>
                </form>
              </div>
            )}

            {/* State 5: Error State */}
            {status === "error" && (
              <div className="space-y-5 text-center py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>

                <div className="space-y-1.5">
                  <h2 className="font-display font-bold text-xl text-slate-900 dark:text-zinc-100">
                    Unable to complete request
                  </h2>
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-mono">
                    {errorMessage || "An unexpected error occurred. Please try again."}
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      setStatus("idle");
                      setErrorMessage("");
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-medium text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Try again with another email</span>
                  </button>

                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
                  >
                    <span>Back to Home</span>
                  </Link>
                </div>
              </div>
            )}

          </div>

          {/* Compliance & Legal Notice */}
          <div className="mt-6 text-center space-y-2 text-[11px] font-mono text-slate-400 dark:text-zinc-500">
            <p>
              Bit by Bit complies with CAN-SPAM, GDPR, and CASL regulations. Opt-out requests are processed immediately.
            </p>
            <div className="flex items-center justify-center gap-4 text-slate-500 dark:text-zinc-400">
              <Link href="/privacy" className="hover:underline">
                Privacy Policy
              </Link>
              <span>•</span>
              <Link href="/terms" className="hover:underline">
                Terms of Service
              </Link>
              <span>•</span>
              <Link href="/refunds" className="hover:underline">
                Refund Policy
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
