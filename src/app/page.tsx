"use client";
// ════════════════════════════════════════════════════════════
// src/app/page.tsx
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { getSupabaseClient, resolveAdminStatus } from "@/lib/supabase";
import type { User } from "@/types/database";
import dynamic from "next/dynamic";

function PageSkeleton() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#00e87a] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const HomePage        = dynamic(() => import("@/components/pages/HomePage"),        { loading: PageSkeleton, ssr: false });
const ProblemsPage    = dynamic(() => import("@/components/pages/ProblemsPage"),    { loading: PageSkeleton, ssr: false });
const LeaderboardPage = dynamic(() => import("@/components/pages/LeaderboardPage"), { loading: PageSkeleton, ssr: false });
const ArenaPage       = dynamic(() => import("@/components/pages/ArenaPage"),       { loading: PageSkeleton, ssr: false });
const AdminPage       = dynamic(() => import("@/components/pages/AdminPage"),       { loading: PageSkeleton, ssr: false });

type PageId = "home" | "problems" | "leaderboard" | "arena" | "admin";
const PAGE_KEY = "bb_page";

const NAV_ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: "home",        label: "Home",        icon: "⌂" },
  { id: "problems",    label: "Problems",    icon: "{ }" },
  { id: "leaderboard", label: "Leaderboard", icon: "⚡" },
  { id: "arena",       label: "Arena",       icon: "🏆" },
];

function AuthLoader() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <img src="/logo.png" alt="BitByBit" className="w-24 h-24 object-contain animate-pulse" />
        <div className="w-32 h-[2px] bg-[#1a1a1a] overflow-hidden rounded">
          <div className="h-full w-1/2 bg-[#00e87a] animate-[slide_1s_ease-in-out_infinite]" />
        </div>
        <p className="text-[#444] text-xs font-mono">Loading session…</p>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPageState]   = useState<PageId>("home");
  const [user, setUser]        = useState<User | null>(null);
  const [loading, setLoading]  = useState(true);
  const [arenaLocked, setArenaLocked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const authConfirmed = useRef(false);

  function setPage(id: PageId) {
    setPageState(id);
    try { sessionStorage.setItem(PAGE_KEY, id); } catch {}
  }

  // Restore last page
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PAGE_KEY) as PageId | null;
      if (saved) setPageState(saved);
    } catch {}
  }, []);

  // ── Auth init ────────────────────────────────────────────
  useEffect(() => {
    const db = getSupabaseClient();
    let alive = true;

    async function buildUser(su: any): Promise<User> {
      const github  = su.user_metadata?.user_name as string;
      const isAdmin = await resolveAdminStatus(github);
      return { name: su.user_metadata?.full_name || github, github, is_admin: isAdmin };
    }

    function finish(u: User | null) {
      if (!alive) return;
      setUser(u);
      if (!authConfirmed.current) { authConfirmed.current = true; setLoading(false); }
    }

    // Primary: getUser() — makes a real network call, immune to stale storage
    db.auth.getUser()
      .then(async ({ data: { user: su }, error }) => {
        if (!alive) return;
        if (!error && su) { finish(await buildUser(su)); }
        else {
          // Fallback to getSession (works offline / when network is slow)
          db.auth.getSession().then(async ({ data: { session } }) => {
            finish(session?.user ? await buildUser(session.user) : null);
          }).catch(() => finish(null));
        }
      })
      .catch(() => {
        db.auth.getSession().then(async ({ data: { session } }) => {
          finish(session?.user ? await buildUser(session.user) : null);
        }).catch(() => finish(null));
      });

    // Listen for real auth events — ONLY SIGNED_IN and SIGNED_OUT
    // Ignoring INITIAL_SESSION / TOKEN_REFRESHED to prevent refresh logouts
    const { data: { subscription } } = db.auth.onAuthStateChange(async (event, session) => {
      if (!alive) return;
      if (event === "SIGNED_IN" && session?.user) {
        const u = await buildUser(session.user);
        if (!alive) return;
        setUser(u);
        if (!authConfirmed.current) { authConfirmed.current = true; setLoading(false); }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setPage("home");
        if (!authConfirmed.current) { authConfirmed.current = true; setLoading(false); }
      }
      // All other events (INITIAL_SESSION with null, TOKEN_REFRESHED, USER_UPDATED)
      // are intentionally ignored — they fire on every refresh and cause false logouts
    });

    // Last-resort timeout
    const t = setTimeout(() => {
      if (!authConfirmed.current && alive) { authConfirmed.current = true; setLoading(false); }
    }, 10_000);

    return () => { alive = false; clearTimeout(t); subscription.unsubscribe(); };
  }, []);

  function navigate(id: PageId) {
    if (arenaLocked && id !== "arena") { alert("Proctor active! Cannot leave arena."); return; }
    if (id === "admin" && !user?.is_admin) { alert("Access denied."); return; }
    setPage(id);
    setMobileMenuOpen(false);
  }

  async function signIn() {
    const db = getSupabaseClient();
    const origin = window.location.origin;
    await db.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: origin.includes("localhost") ? origin : "https://bitbybit-alpha.vercel.app/" },
    });
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    // SIGNED_OUT event handles state reset
  }

  if (loading) return <AuthLoader />;

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">

      {/* ── Header ────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 md:px-6 h-14">

          {/* Logo */}
          <button className="flex items-center gap-2 shrink-0" onClick={() => navigate("home")}>
            <img src="/logo.png" alt="BitByBit" className="w-7 h-7 object-contain" />
            <span className="font-display font-bold text-lg select-none">
              BitBy<span className="text-[#00e87a]">Bit</span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ id, label }) => (
              <button key={id} onClick={() => navigate(id)}
                className={`px-4 py-1.5 rounded-lg font-mono text-sm transition-all
                  ${page === id ? "text-[#00e87a] bg-[#00e87a10]" : "text-[#666] hover:text-[#e0e0e0]"}`}>
                {label}
              </button>
            ))}
            {user?.is_admin && (
              <button onClick={() => navigate("admin")}
                className={`px-4 py-1.5 rounded-lg font-mono text-sm transition-all
                  ${page === "admin" ? "text-[#a78bfa] bg-[#a78bfa10]" : "text-[#666] hover:text-[#e0e0e0]"}`}>
                ⚙ Admin
              </button>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* User pill - desktop */}
            {user && (
              <div className="hidden md:flex items-center gap-2 bg-[#111] border border-[#1f1f1f] rounded-full px-3 py-1">
                <span className="w-2 h-2 bg-[#00e87a] rounded-full animate-pulse" />
                <span className="text-sm font-mono text-[#e0e0e0] max-w-[120px] truncate">{user.name}</span>
              </div>
            )}
            {/* Auth button - desktop */}
            <button onClick={user ? signOut : signIn}
              className={`hidden md:block px-4 py-1.5 rounded-lg font-mono text-sm transition-all
                ${user
                  ? "border border-[#2a2a2a] text-[#666] hover:text-[#ff4d4d] hover:border-[#ff4d4d40]"
                  : "bg-[#00e87a] text-black font-bold hover:bg-[#00ff88]"}`}>
              {user ? "Sign Out" : "Sign In"}
            </button>

            {/* Mobile: avatar or sign-in + hamburger */}
            {user ? (
              <div className="md:hidden flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center
                  text-[#00e87a] text-xs font-bold font-mono">
                  {user.name[0]?.toUpperCase()}
                </div>
              </div>
            ) : (
              <button onClick={signIn}
                className="md:hidden px-3 py-1 rounded-lg font-mono text-xs bg-[#00e87a] text-black font-bold">
                Sign In
              </button>
            )}

            {/* Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg
                border border-[#1f1f1f] hover:border-[#2a2a2a] transition-all"
              aria-label="Menu">
              <span className={`block w-5 h-0.5 bg-[#666] transition-all ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <span className={`block w-5 h-0.5 bg-[#666] transition-all ${mobileMenuOpen ? "opacity-0" : ""}`} />
              <span className={`block w-5 h-0.5 bg-[#666] transition-all ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#1a1a1a] bg-[#0a0a0a] px-4 py-3 space-y-1">
            {NAV_ITEMS.map(({ id, label, icon }) => (
              <button key={id} onClick={() => navigate(id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-mono text-sm text-left transition-all
                  ${page === id
                    ? "bg-[#00e87a10] text-[#00e87a] border border-[#00e87a20]"
                    : "text-[#666] hover:bg-[#111] hover:text-[#e0e0e0]"}`}>
                <span className="text-base w-5 text-center">{icon}</span>
                {label}
              </button>
            ))}
            {user?.is_admin && (
              <button onClick={() => navigate("admin")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-mono text-sm text-left transition-all
                  ${page === "admin"
                    ? "bg-[#a78bfa10] text-[#a78bfa] border border-[#a78bfa20]"
                    : "text-[#666] hover:bg-[#111] hover:text-[#e0e0e0]"}`}>
                <span className="text-base w-5 text-center">⚙</span>
                Admin
              </button>
            )}
            <div className="pt-2 border-t border-[#1a1a1a] mt-2">
              {user ? (
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#00e87a] rounded-full" />
                    <span className="text-sm font-mono text-[#e0e0e0] truncate max-w-[160px]">{user.name}</span>
                  </div>
                  <button onClick={signOut}
                    className="text-xs font-mono text-[#666] hover:text-[#ff4d4d] transition-colors px-2 py-1">
                    Sign Out
                  </button>
                </div>
              ) : (
                <button onClick={signIn}
                  className="w-full py-3 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl hover:bg-[#00ff88] transition-all">
                  Sign In with GitHub
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Page content ──────────────────────────────────── */}
      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 max-w-7xl mx-auto w-full">
        {page === "home"        && <HomePage      user={user} onNavigate={navigate} />}
        {page === "problems"    && <ProblemsPage  user={user} />}
        {page === "leaderboard" && <LeaderboardPage />}
        {page === "arena"       && <ArenaPage user={user} onArenaLockChange={setArenaLocked} />}
        {page === "admin"       && user?.is_admin && <AdminPage user={user} />}
      </main>

      {/* ── Mobile bottom tab bar ─────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a]/95 backdrop-blur
        border-t border-[#1a1a1a] flex items-stretch safe-area-bottom">
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <button key={id} onClick={() => navigate(id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all
              ${page === id ? "text-[#00e87a]" : "text-[#444]"}`}>
            <span className="text-lg leading-none">{icon}</span>
            <span className="text-[10px] font-mono">{label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom padding so content isn't hidden behind tab bar on mobile */}
      <div className="md:hidden h-16" />
    </div>
  );
}