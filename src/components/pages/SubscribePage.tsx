"use client";
/**
 * SubscribePage
 *
 * One-time lifetime subscription page.
 * - Reads fee + UPI from app_config table (admin-adjustable)
 * - User pays via UPI, enters transaction ID
 * - Admin confirms manually in AdminPage → Subscribers section
 * - Confirmed subscribers get access to all weekly problems
 */

import { useState, useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { User, Subscriber } from "@/types/database";

// ── QR helper (same pattern as ArenaPage) ───────────────────
declare global {
  interface Window {
    _sqrLoaded?: boolean;
    _sqrCbs?: Array<() => void>;
  }
}
function loadQrScript(cb: () => void) {
  if (typeof window === "undefined") return;
  if (window._sqrLoaded) { cb(); return; }
  if (!window._sqrCbs) window._sqrCbs = [];
  window._sqrCbs.push(cb);
  if (document.getElementById("sqr-script")) return;
  const s = document.createElement("script");
  s.id = "sqr-script";
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  s.onload = () => {
    window._sqrLoaded = true;
    window._sqrCbs?.forEach((fn) => fn());
    window._sqrCbs = [];
  };
  document.head.appendChild(s);
}

function UpiQr({ upiUrl, size = 180 }: { upiUrl: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ok,  setOk]  = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!upiUrl) return;
    loadQrScript(() => {
      const el = ref.current;
      if (!el) return;
      el.innerHTML = "";
      try {
        new (window as any).QRCode(el, {
          text: upiUrl, width: size, height: size,
          colorDark: "#000", colorLight: "#fff",
        });
        setOk(true);
      } catch { setErr(true); }
    });
  }, [upiUrl, size]);

  if (err) return (
    <div style={{ width: size, height: size }}
      className="flex items-center justify-center bg-white rounded-lg text-[10px] text-gray-400 font-mono p-2 text-center">
      QR unavailable
    </div>
  );
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {!ok && (
        <div style={{ width: size, height: size }}
          className="absolute inset-0 bg-white rounded-lg flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div ref={ref} className={ok ? "" : "opacity-0"} />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────

interface Props {
  user: User | null;
}

export default function SubscribePage({ user }: Props) {
  const db = getSupabaseClient();

  const [fee,        setFee]        = useState<number | null>(null);
  const [upiId,      setUpiId]      = useState("");
  const [myStatus,   setMyStatus]   = useState<Subscriber | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [txnId,      setTxnId]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [err,        setErr]        = useState("");
  const [copied,     setCopied]     = useState(false);

  useEffect(() => { load(); }, [user]);

  async function load() {
    setLoading(true);
    try {
      // Load fee + UPI from app_config
      const { data: configs } = await (db.from("app_config") as any)
        .select("*")
        .in("key", ["subscription_fee", "subscription_upi"]);

      for (const c of configs || []) {
        if (c.key === "subscription_fee") setFee(Number(c.value));
        if (c.key === "subscription_upi") setUpiId(c.value);
      }

      // Load user's subscription status
      if (user?.github) {
        const { data: sub } = await (db.from("subscribers") as any)
          .select("*")
          .eq("github", user.github)
          .maybeSingle();
        setMyStatus(sub || null);
      }
    } catch {}
    setLoading(false);
  }

  async function submitPayment() {
    if (!user || !txnId.trim() || fee === null) return;
    const tid = txnId.trim();
    if (tid.length < 6) { setErr("Transaction ID seems too short"); return; }

    setSubmitting(true);
    setErr("");
    try {
      // Check if already submitted
      const { data: existing } = await (db.from("subscribers") as any)
        .select("id")
        .eq("github", user.github)
        .maybeSingle();

      if (existing) {
        setErr("You already have a subscription request. Please wait for admin confirmation.");
        setSubmitting(false);
        return;
      }

      const { error } = await (db.from("subscribers") as any).insert({
        github: user.github,
        name:   user.name,
        txn_id: tid,
        status: "pending",
      });

      if (error) throw error;

      setSubmitted(true);
      setMyStatus({ id: "", github: user.github, name: user.name, txn_id: tid, status: "pending", created_at: new Date().toISOString() });
    } catch (e: any) {
      setErr(e.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const upiUrl = fee !== null && upiId
    ? `upi://pay?${new URLSearchParams({ pa: upiId, pn: "BitByBit", am: String(fee), cu: "INR", tn: "BitByBit Lifetime Subscription" })}`
    : "";

  // ── What to show based on status ─────────────────────────

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="spinner" />
      <span className="text-[#bbb] text-xs font-mono">Loading…</span>
    </div>
  );

  // Already confirmed subscriber
  if (myStatus?.status === "confirmed") return (
    <div className="max-w-lg mx-auto py-12 text-center animate-fade-up">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="font-display font-bold text-2xl text-[#e0e0e0] mb-2">You're subscribed!</h1>
      <p className="text-[#777] font-mono text-sm mb-6">
        Lifetime access to all weekly problems and challenges.
      </p>
      <div className="bg-[#00e87a08] border border-[#00e87a20] rounded-2xl px-5 py-4 text-left space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[#00e87a]">✓</span>
          <span className="text-[#bbb]">All weekly challenge problems unlocked</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[#00e87a]">✓</span>
          <span className="text-[#bbb]">Every future weekly challenge included</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[#00e87a]">✓</span>
          <span className="text-[#bbb]">Arena contests still require separate entry fee</span>
        </div>
      </div>
    </div>
  );

  // Pending review
  if (myStatus?.status === "pending") return (
    <div className="max-w-lg mx-auto py-12 text-center animate-fade-up">
      <div className="text-5xl mb-4">⏳</div>
      <h1 className="font-display font-bold text-2xl text-[#e0e0e0] mb-2">Payment under review</h1>
      <p className="text-[#777] font-mono text-sm mb-4">
        Your transaction ID <span className="text-[#f0b429]">{myStatus.txn_id}</span> has been received.
        Admin will confirm shortly.
      </p>
      <p className="text-[10px] text-[#555] font-mono">
        Once confirmed, all weekly problems will be unlocked automatically.
      </p>
    </div>
  );

  // Rejected — allow resubmission
  if (myStatus?.status === "rejected") return (
    <div className="max-w-lg mx-auto py-12 text-center animate-fade-up">
      <div className="text-5xl mb-4">❌</div>
      <h1 className="font-display font-bold text-2xl text-[#e0e0e0] mb-2">Payment rejected</h1>
      <p className="text-[#777] font-mono text-sm mb-6">
        Your previous transaction was rejected. Please make a new payment and resubmit.
      </p>
      <button
        onClick={async () => {
          // Delete rejected entry so user can resubmit
          await (db.from("subscribers") as any).delete().eq("github", user?.github);
          setMyStatus(null);
        }}
        className="px-6 py-2.5 bg-[#f0b429] text-black font-mono font-bold text-sm rounded-xl hover:bg-[#fbbf24] transition-all"
      >
        Try Again →
      </button>
    </div>
  );

  // Not signed in
  if (!user) return (
    <div className="max-w-lg mx-auto py-12 text-center animate-fade-up">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="font-display font-bold text-2xl text-[#e0e0e0] mb-2">Sign in to subscribe</h1>
      <p className="text-[#777] font-mono text-sm">
        Please sign in with GitHub to get a lifetime subscription.
      </p>
    </div>
  );

  // Main payment page
  return (
    <div className="max-w-lg mx-auto animate-fade-up">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="text-4xl mb-3">⭐</div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-[#e0e0e0] mb-2">
          Lifetime Subscription
        </h1>
        <p className="text-[#777] font-mono text-sm">
          One-time payment · Unlock all weekly problems forever
        </p>
      </div>

      {/* What you get */}
      <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-5 mb-6 space-y-3">
        <p className="text-[10px] text-[#666] font-mono uppercase tracking-widest mb-3">What's included</p>
        {[
          ["✓", "All current and future weekly challenge problems", "#00e87a"],
          ["✓", "Early-solver time bonus (solve earlier = more points)", "#00e87a"],
          ["✓", "Weekly leaderboard participation", "#00e87a"],
          ["→", "Arena contests require separate entry fee per contest", "#555"],
        ].map(([icon, text, color], i) => (
          <div key={i} className="flex items-start gap-3 text-xs font-mono">
            <span style={{ color }} className="shrink-0 mt-0.5">{icon}</span>
            <span className="text-[#bbb]">{text}</span>
          </div>
        ))}
      </div>

      {/* Payment card */}
      <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl overflow-hidden">
        {/* Price */}
        <div className="px-5 py-4 border-b border-[#161616] text-center">
          <div className="text-4xl font-display font-bold text-[#00e87a] mb-1">
            {fee !== null ? `₹${fee}` : "—"}
          </div>
          <div className="text-[10px] font-mono text-[#555]">one-time · lifetime access</div>
        </div>

        {/* QR + UPI */}
        <div className="px-5 py-5">
          <p className="text-[10px] text-[#666] font-mono uppercase tracking-widest mb-4 text-center">
            Scan to pay via UPI
          </p>

          {upiUrl ? (
            <div className="flex justify-center mb-4 bg-white p-3 rounded-xl">
              <UpiQr upiUrl={upiUrl} size={180} />
            </div>
          ) : (
            <div className="h-[206px] flex items-center justify-center text-[#444] font-mono text-xs mb-4">
              Loading payment details…
            </div>
          )}

          {/* UPI ID */}
          <div className="bg-[#111] rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 mb-4">
            <span className="text-sm font-mono text-[#ccc] truncate">{upiId || "—"}</span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(upiId).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="text-[10px] font-mono text-[#00e87a] shrink-0 hover:text-[#00ff88] transition-colors"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>

          {/* UPI app shortcuts */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { name: "GPay",    url: `gpay://upi/pay?pa=${upiId}&pn=BitByBit&cu=INR` },
              { name: "PhonePe", url: `phonepe://pay?pa=${upiId}&pn=BitByBit&cu=INR` },
              { name: "Paytm",   url: `paytmmp://pay?pa=${upiId}&pn=BitByBit&cu=INR` },
            ].map((app) => (
              <a key={app.name} href={app.url}
                className="flex items-center justify-center px-2 py-2 bg-[#111] border border-[#1a1a1a] rounded-xl text-xs font-mono text-[#ccc] hover:border-[#333] hover:text-[#e0e0e0] transition-all text-center">
                {app.name}
              </a>
            ))}
          </div>

          {/* Transaction ID input */}
          <div className="mb-4">
            <label className="block text-[10px] text-[#666] font-mono uppercase tracking-widest mb-2">
              Enter Transaction / UTR ID after payment
            </label>
            <input
              value={txnId}
              onChange={e => { setTxnId(e.target.value); setErr(""); }}
              placeholder="e.g. 423987654321"
              className="w-full bg-[#060606] border border-[#1a1a1a] rounded-xl px-3.5 py-2.5 text-sm font-mono
                text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a30] transition-colors"
            />
            {err && <p className="text-[10px] text-[#ff4d4d] font-mono mt-1.5">{err}</p>}
          </div>

          {submitted ? (
            <div className="text-center py-3 bg-[#00e87a08] border border-[#00e87a20] rounded-xl">
              <p className="text-sm font-mono text-[#00e87a] font-bold">✓ Submitted!</p>
              <p className="text-[10px] font-mono text-[#555] mt-1">Admin will confirm shortly.</p>
            </div>
          ) : (
            <button
              onClick={submitPayment}
              disabled={submitting || !txnId.trim()}
              className="w-full py-3 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl
                hover:bg-[#00ff88] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit Payment →"}
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-[10px] text-[#444] font-mono mt-4">
        Payments are verified manually. Access is granted within a few hours.
      </p>
    </div>
  );
}