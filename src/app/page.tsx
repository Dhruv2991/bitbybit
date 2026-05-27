"use client";
// ════════════════════════════════════════════════════════════
// src/app/page.tsx — Root page
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

const HomePage      = dynamic(() => import("@/components/pages/HomePage"),      { loading: PageSkeleton, ssr: false });
const ProblemsPage  = dynamic(() => import("@/components/pages/ProblemsPage"),  { loading: PageSkeleton, ssr: false });
const LeaderboardPage = dynamic(() => import("@/components/pages/LeaderboardPage"), { loading: PageSkeleton, ssr: false });
const ArenaPage     = dynamic(() => import("@/components/pages/ArenaPage"),     { loading: PageSkeleton, ssr: false });
const AdminPage     = dynamic(() => import("@/components/pages/AdminPage"),     { loading: PageSkeleton, ssr: false });

type PageId = "home" | "problems" | "leaderboard" | "arena" | "admin";
const PAGE_KEY = "bb_page";

function AuthLoader() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <img src="/logo.png" alt="BitByBit" className="w-28 h-28 object-contain animate-pulse" />
        <div className="w-32 h-[1px] bg-[#1a1a1a] overflow-hidden rounded">
          <div className="h-full w-1/2 bg-[#00e87a] animate-[slide_1s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPageState] = useState<PageId>("home");
  const [user, setUser]      = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [arenaLocked, setArenaLocked] = useState(false);

  // Track whether we've confirmed auth state at least once so we never
  // show a logged-out flash before the session is confirmed.
  const authConfirmed = useRef(false);

  function setPage(id: PageId) {
    setPageState(id);
    try { sessionStorage.setItem(PAGE_KEY, id); } catch { /* private mode */ }
  }

  // Restore last page from sessionStorage on first render
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PAGE_KEY) as PageId | null;
      if (saved) setPageState(saved);
    } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    const db = getSupabaseClient();
    let isMounted = true;

    async function buildUser(supabaseUser: NonNullable<Awaited<ReturnType<typeof db.auth.getUser>>["data"]["user"]>): Promise<User> {
      const github  = supabaseUser.user_metadata.user_name as string;
      const isAdmin = await resolveAdminStatus(github);
      return {
        name:     supabaseUser.user_metadata.full_name || github,
        github,
        is_admin: isAdmin,
      };
    }

    // ── Step 1: try getUser() first ──────────────────────────────────────
    // getUser() makes a real network call to Supabase to validate the token.
    // This is more reliable than getSession() which only reads localStorage
    // and can return stale/empty data before the client has fully initialised.
    db.auth.getUser().then(async ({ data: { user: sbUser }, error }) => {
      if (!isMounted) return;
      if (error || !sbUser) {
        // No valid session — but only treat as logged-out once we've
        // also confirmed via getSession (covers the case where getUser
        // races with the token being read from storage).
        db.auth.getSession().then(async ({ data: { session } }) => {
          if (!isMounted) return;
          if (session?.user) {
            const u = await buildUser(session.user);
            if (!isMounted) return;
            setUser(u);
          } else {
            setUser(null);
          }
          authConfirmed.current = true;
          setLoading(false);
        }).catch(() => {
          if (!isMounted) return;
          setUser(null);
          authConfirmed.current = true;
          setLoading(false);
        });
        return;
      }
      const u = await buildUser(sbUser);
      if (!isMounted) return;
      setUser(u);
      authConfirmed.current = true;
      setLoading(false);
    }).catch(() => {
      // Network down — fall back to getSession (cached token)
      db.auth.getSession().then(async ({ data: { session } }) => {
        if (!isMounted) return;
        if (session?.user) {
          const u = await buildUser(session.user);
          if (!isMounted) return;
          setUser(u);
        } else {
          setUser(null);
        }
        authConfirmed.current = true;
        setLoading(false);
      }).catch(() => {
        if (!isMounted) return;
        setUser(null);
        authConfirmed.current = true;
        setLoading(false);
      });
    });

    // ── Step 2: subscribe to auth events for subsequent changes ─────────
    // Only act on SIGNED_IN and SIGNED_OUT — ignore INITIAL_SESSION,
    // TOKEN_REFRESHED, USER_UPDATED etc. to avoid spurious logouts.
    const { data: { subscription } } = db.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      console.debug("[auth] event:", event);

      if (event === "SIGNED_IN" && session?.user) {
        const u = await buildUser(session.user);
        if (!isMounted) return;
        setUser(u);
        // If getUser() hasn't resolved yet, finish loading now
        if (!authConfirmed.current) {
          authConfirmed.current = true;
          setLoading(false);
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setPage("home");
        if (!authConfirmed.current) {
          authConfirmed.current = true;
          setLoading(false);
        }
      }
      // All other events (INITIAL_SESSION, TOKEN_REFRESHED, USER_UPDATED…)
      // are intentionally ignored to prevent refresh-induced logouts.
    });

    // Safety net: resolve loading after 10 s no matter what
    const timeout = setTimeout(() => {
      if (!isMounted) return;
      console.warn("[auth] timeout — resolving as logged out");
      if (!authConfirmed.current) {
        authConfirmed.current = true;
        setLoading(false);
      }
    }, 10_000);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  function navigate(id: PageId) {
    if (arenaLocked && id !== "arena") {
      alert("Proctor system active! Cannot leave live workspace.");
      return;
    }
    if (id === "admin" && !user?.is_admin) {
      alert("Access denied.");
      return;
    }
    setPage(id);
  }

  async function signIn() {
    const db = getSupabaseClient();
    const origin   = window.location.origin;
    const redirect = origin.includes("localhost") ? origin : "https://bitbybit-alpha.vercel.app/";
    await db.auth.signInWithOAuth({ provider: "github", options: { redirectTo: redirect } });
  }

  async function signOut() {
    const db = getSupabaseClient();
    await db.auth.signOut();
    // SIGNED_OUT event will call setUser(null) + setPage("home")
  }

  if (loading) return <AuthLoader />;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a] flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("home")}>
          <img src="/logo.png" alt="BitByBit Logo" className="w-7 h-7 object-contain" />
          <span className="font-display font-bold text-lg select-none">
            BitBy<span className="text-[#00e87a]">Bit</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {(["home", "problems", "leaderboard", "arena"] as PageId[]).map((id) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`px-4 py-1.5 rounded-lg font-mono text-sm capitalize transition-all
                ${page === id ? "text-[#00e87a] bg-[#00e87a10]" : "text-[#666] hover:text-[#e0e0e0]"}`}
            >
              {id}
            </button>
          ))}
          {user?.is_admin && (
            <button
              onClick={() => navigate("admin")}
              className={`px-4 py-1.5 rounded-lg font-mono text-sm transition-all
                ${page === "admin" ? "text-[#a78bfa] bg-[#a78bfa10]" : "text-[#666] hover:text-[#e0e0e0]"}`}
            >
              ⚙ Admin
            </button>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2 bg-[#111] border border-[#1f1f1f] rounded-full px-3 py-1">
              <span className="w-2 h-2 bg-[#00e87a] rounded-full animate-pulse" />
              <span className="text-sm font-mono text-[#e0e0e0]">{user.name}</span>
            </div>
          )}
          <button
            onClick={user ? signOut : signIn}
            className={
              user
                ? "px-4 py-1.5 rounded-lg font-mono text-sm border border-[#2a2a2a] text-[#666] hover:text-[#ff4d4d] hover:border-[#ff4d4d40] transition-all"
                : "px-4 py-1.5 rounded-lg font-mono text-sm bg-[#00e87a] text-black font-bold hover:bg-[#00ff88] transition-all"
            }
          >
            {user ? "Sign Out" : "Sign In with GitHub"}
          </button>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────── */}
      <main className="flex-1 px-4 md:px-6 py-6 max-w-7xl mx-auto w-full">
        {page === "home"        && <HomePage      user={user} onNavigate={navigate} />}
        {page === "problems"    && <ProblemsPage  user={user} />}
        {page === "leaderboard" && <LeaderboardPage />}
        {page === "arena"       && <ArenaPage     user={user} onArenaLockChange={setArenaLocked} />}
        {page === "admin"       && user?.is_admin && <AdminPage user={user} />}
      </main>
    </div>
  );
}