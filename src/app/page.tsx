"use client";
// ════════════════════════════════════════════════════════════
// src/app/page.tsx
//
// KEY DESIGN:
//  1. Content renders IMMEDIATELY — no auth gate, no loading screen.
//     The page mounts with user=null and shows all public content.
//  2. Auth resolves in the background and silently upgrades the UI
//     (shows username, enables submit buttons, etc).
//  3. Session is read from localStorage first (instant, no network)
//     then validated with getUser() in the background.
//  4. SIGNED_OUT only fires on explicit signOut() — never on refresh.
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { getSupabaseClient, resolveAdminStatus } from "@/lib/supabase";
import type { User } from "@/types/database";
import dynamic from "next/dynamic";

// All pages load lazily — but NO loading spinner blocks the shell
const HomePage        = dynamic(() => import("@/components/pages/HomePage"),        { ssr: false });
const ProblemsPage    = dynamic(() => import("@/components/pages/ProblemsPage"),    { ssr: false });
const LeaderboardPage = dynamic(() => import("@/components/pages/LeaderboardPage"), { ssr: false });
const ArenaPage       = dynamic(() => import("@/components/pages/ArenaPage"),       { ssr: false });
const AdminPage       = dynamic(() => import("@/components/pages/AdminPage"),       { ssr: false });

type PageId = "home" | "problems" | "leaderboard" | "arena" | "admin";
const PAGE_KEY = "bb_page";

const NAV_ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: "home",        label: "Home",        icon: "⌂"  },
  { id: "problems",    label: "Problems",    icon: "{ }" },
  { id: "leaderboard", label: "Leaderboard", icon: "⚡" },
  { id: "arena",       label: "Arena",       icon: "🏆" },
];

export default function App() {
  // Start with page restored from sessionStorage (or "home")
  const [page, setPageState] = useState<PageId>(() => {
    if (typeof window === "undefined") return "home";
    try { return (sessionStorage.getItem(PAGE_KEY) as PageId) || "home"; } catch { return "home"; }
  });

  // user=null initially — content renders anyway, auth fills in silently
  const [user,         setUser]         = useState<User | null>(null);
  // authReady: true once we've confirmed the session state (either way)
  // Used only to show/hide the Sign In button correctly — NOT to block content
  const [authReady,    setAuthReady]    = useState(true);
  const [arenaLocked,  setArenaLocked]  = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const resolving = useRef(false);

  function setPage(id: PageId) {
    setPageState(id);
    try { sessionStorage.setItem(PAGE_KEY, id); } catch {}
  }

  // ── Auth: runs in background, never blocks render ────────
  useEffect(() => {
    const db = getSupabaseClient();
    let alive = true;

    async function buildUser(su: any): Promise<User> {
      const github  = su.user_metadata?.user_name as string;
      const isAdmin = await resolveAdminStatus(github);
      return {
        name:     su.user_metadata?.full_name || github,
        github,
        is_admin: isAdmin,
      };
    }

    // Step 1 — Read from localStorage via getSession() — this is INSTANT,
    // no network needed. If there's a cached token, we show the user
    // immediately before any network call completes.
    db.auth.getSession().then(async ({ data: { session } }) => {
      if (!alive || resolving.current) return;
      if (session?.user) {
        resolving.current = true;
        const u = await buildUser(session.user);
        if (!alive) return;
        setUser(u);
        setAuthReady(true);

        // Step 2 — Validate the token in the background (silent, no UI change)
        // If the token is expired, Supabase auto-refreshes it. If the user
        // genuinely signed out elsewhere, getUser() returns null — but we
        // only clear state if that's confirmed, never on ambiguous results.
        db.auth.getUser().then(async ({ data: { user: su }, error }) => {
          if (!alive) return;
          if (error || !su) {
            // Token truly invalid — clear silently
            setUser(null);
          } else if (su.user_metadata?.user_name !== u.github) {
            // User switched accounts — rebuild
            const fresh = await buildUser(su);
            if (alive) setUser(fresh);
          }
        }).catch(() => {
          // Network down — keep the localStorage-based user, don't log out
        });
      } else {
        // No cached session — mark auth as ready with no user
        if (alive) setAuthReady(true);
      }
    }).catch(() => {
      if (alive) setAuthReady(true);
    });

    // Step 3 — Listen for real auth events (sign in / sign out only)
    const { data: { subscription } } = db.auth.onAuthStateChange(async (event, session) => {
      if (!alive) return;

      if (event === "SIGNED_IN" && session?.user) {
        // OAuth redirect just completed — build user from fresh session
        resolving.current = true;
        const u = await buildUser(session.user);
        if (!alive) return;
        setUser(u);
        setAuthReady(true);
        resolving.current = false;

      } else if (event === "SIGNED_OUT") {
        // Only fires when signOut() is explicitly called
        setUser(null);
        setPage("home");

      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        // Auto-refresh succeeded — update user silently, no UI disruption
        if (!user) {
          const u = await buildUser(session.user);
          if (alive) setUser(u);
        }
      }

      // INITIAL_SESSION, USER_UPDATED, PASSWORD_RECOVERY etc → ignored
      // These fire on every page load and caused the spurious logouts
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  function navigate(id: PageId) {
    if (arenaLocked && id !== "arena") {
      alert("Proctor active — cannot leave the arena.");
      return;
    }
    if (id === "admin" && !user?.is_admin) {
      alert("Access denied.");
      return;
    }
    setPage(id);
    setMobileMenuOpen(false);
  }

  async function signIn() {
    const db = getSupabaseClient();
    const origin = window.location.origin;
    await db.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: origin.includes("localhost")
          ? origin
          : "https://bitbybit-alpha.vercel.app/",
      },
    });
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    // SIGNED_OUT event handles setUser(null) + setPage("home")
  }

  // ── Auth button label logic ──────────────────────────────
  // While auth hasn't resolved yet: show nothing (avoids flash of "Sign In"
  // for users who ARE logged in — their session is loading from localStorage)
  const authButton = !authReady ? null : user ? (
    <button
      onClick={signOut}
      className="px-4 py-1.5 rounded-lg font-mono text-sm border border-[#2a2a2a]
        text-[#666] hover:text-[#ff4d4d] hover:border-[#ff4d4d40] transition-all">
      Sign Out
    </button>
  ) : (
    <button
      onClick={signIn}
      className="px-4 py-1.5 rounded-lg font-mono text-sm bg-[#00e87a]
        text-black font-bold hover:bg-[#00ff88] transition-all">
      Sign In with GitHub
    </button>
  );

  const mobileAuthButton = !authReady ? null : user ? (
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
      className="w-full py-3 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl
        hover:bg-[#00ff88] transition-all">
      Sign In with GitHub
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">

      {/* ── Header ──────────────────────────────────────── */}
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
                  ${page === id
                    ? "text-[#00e87a] bg-[#00e87a10]"
                    : "text-[#666] hover:text-[#e0e0e0]"}`}>
                {label}
              </button>
            ))}
            {user?.is_admin && (
              <button onClick={() => navigate("admin")}
                className={`px-4 py-1.5 rounded-lg font-mono text-sm transition-all
                  ${page === "admin"
                    ? "text-[#a78bfa] bg-[#a78bfa10]"
                    : "text-[#666] hover:text-[#e0e0e0]"}`}>
                ⚙ Admin
              </button>
            )}
          </nav>

          {/* Right: user pill + auth button + hamburger */}
          <div className="flex items-center gap-2">
            {user && (
              <div className="hidden md:flex items-center gap-2 bg-[#111] border border-[#1f1f1f]
                rounded-full px-3 py-1">
                <span className="w-2 h-2 bg-[#00e87a] rounded-full animate-pulse" />
                <span className="text-sm font-mono text-[#e0e0e0] max-w-[120px] truncate">
                  {user.name}
                </span>
              </div>
            )}

            {/* Desktop auth button (hidden until auth resolves — no flash) */}
            <div className="hidden md:block">{authButton}</div>

            {/* Mobile: avatar or sign-in shortcut */}
            {user ? (
              <div className="md:hidden w-7 h-7 rounded-full bg-[#1a1a1a] border border-[#2a2a2a]
                flex items-center justify-center text-[#00e87a] text-xs font-bold font-mono">
                {user.name[0]?.toUpperCase()}
              </div>
            ) : authReady ? (
              <button onClick={signIn}
                className="md:hidden px-3 py-1 rounded-lg font-mono text-xs bg-[#00e87a]
                  text-black font-bold">
                Sign In
              </button>
            ) : null}

            {/* Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5
                rounded-lg border border-[#1f1f1f] hover:border-[#2a2a2a] transition-all"
              aria-label="Menu">
              <span className={`block w-5 h-0.5 bg-[#666] transition-all
                ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <span className={`block w-5 h-0.5 bg-[#666] transition-all
                ${mobileMenuOpen ? "opacity-0" : ""}`} />
              <span className={`block w-5 h-0.5 bg-[#666] transition-all
                ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#1a1a1a] bg-[#0a0a0a] px-4 py-3 space-y-1">
            {NAV_ITEMS.map(({ id, label, icon }) => (
              <button key={id} onClick={() => navigate(id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-mono
                  text-sm text-left transition-all
                  ${page === id
                    ? "bg-[#00e87a10] text-[#00e87a] border border-[#00e87a20]"
                    : "text-[#666] hover:bg-[#111] hover:text-[#e0e0e0]"}`}>
                <span className="text-base w-5 text-center">{icon}</span>
                {label}
              </button>
            ))}
            {user?.is_admin && (
              <button onClick={() => navigate("admin")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-mono
                  text-sm text-left transition-all
                  ${page === "admin"
                    ? "bg-[#a78bfa10] text-[#a78bfa] border border-[#a78bfa20]"
                    : "text-[#666] hover:bg-[#111] hover:text-[#e0e0e0]"}`}>
                <span className="text-base w-5 text-center">⚙</span>
                Admin
              </button>
            )}
            <div className="pt-2 border-t border-[#1a1a1a] mt-2">
              {mobileAuthButton}
            </div>
          </div>
        )}
      </header>

      {/* ── Page content — renders immediately, no auth gate ── */}
      <main className="flex-1 px-4 md:px-6 py-4 md:py-6 max-w-7xl mx-auto w-full">
        {page === "home"        && <HomePage      user={user} onNavigate={navigate} />}
        {page === "problems"    && <ProblemsPage  user={user} />}
        {page === "leaderboard" && <LeaderboardPage />}
        {page === "arena"       && <ArenaPage     user={user} onArenaLockChange={setArenaLocked} />}
        {page === "admin"       && user?.is_admin && <AdminPage user={user} />}
      </main>

      {/* ── Mobile bottom tab bar ─────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a]/95
        backdrop-blur border-t border-[#1a1a1a] flex items-stretch">
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <button key={id} onClick={() => navigate(id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all
              ${page === id ? "text-[#00e87a]" : "text-[#444]"}`}>
            <span className="text-lg leading-none">{icon}</span>
            <span className="text-[10px] font-mono">{label}</span>
          </button>
        ))}
      </nav>

      {/* Spacer so content isn't hidden behind tab bar */}
      <div className="md:hidden h-16" />
    </div>
  );
}