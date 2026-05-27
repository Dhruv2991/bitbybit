"use client";
// ════════════════════════════════════════════════════════════
// src/app/page.tsx — Root page (mirrors original index.html SPA)
// All navigation is client-side (no page reloads), same as original.
// ════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { getSupabaseClient, resolveAdminStatus } from "@/lib/supabase";
import type { User } from "@/types/database";

// Page components (lazy-imported for bundle splitting)
import dynamic from "next/dynamic";
const HomePage = dynamic(() => import("@/components/pages/HomePage"));
const ProblemsPage = dynamic(() => import("@/components/pages/ProblemsPage"));
const LeaderboardPage = dynamic(
  () => import("@/components/pages/LeaderboardPage"),
);
const ArenaPage = dynamic(() => import("@/components/pages/ArenaPage"));
const AdminPage = dynamic(() => import("@/components/pages/AdminPage"));

type PageId = "home" | "problems" | "leaderboard" | "arena" | "admin";

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-[#333] text-sm font-mono animate-pulse">
        Loading...
      </div>
    </div>
  );
}

export default function App() {
  const db = getSupabaseClient();
  const [page, setPage] = useState<PageId>("home");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [arenaLocked, setArenaLocked] = useState(false);

  // ── Session init ─────────────────────────────────────────
  useEffect(() => {
    // onAuthStateChange fires for INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
    // It reliably fires on every page load (including hard refreshes and OAuth redirects),
    // so we use it as the single source of truth for both loading state and user state.
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        const github = session.user.user_metadata.user_name as string;
        const isAdmin = await resolveAdminStatus(github);
        setUser({
          name: session.user.user_metadata.full_name || github,
          github,
          is_admin: isAdmin,
        });
      } else {
        setUser(null);
      }
      // Always clear loading once we know the auth state,
      // whether the user is signed in or not.
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
    const origin = window.location.origin;
    const redirect = origin.includes("localhost")
      ? origin
      : "https://bitbybit-alpha.vercel.app/";
    await db.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: redirect },
    });
  }

  async function signOut() {
    await db.auth.signOut();
    setUser(null);
    setPage("home");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ──────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a]
        flex items-center justify-between px-6 h-14"
      >
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("home")}
        >
          {/* Replaced generic "B" box with your custom logo asset */}
          <img
            src="/logo.png"
            alt="BitByBit Logo"
            className="w-7 h-7 object-contain"
          />
          <span className="font-display font-bold text-lg select-none">
            BitBy<span className="text-[#00e87a]">Bit</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {(["home", "problems", "leaderboard", "arena"] as PageId[]).map(
            (id) => (
              <button
                key={id}
                onClick={() => navigate(id)}
                className={`px-4 py-1.5 rounded-lg font-mono text-sm capitalize transition-all
                ${
                  page === id
                    ? "text-[#00e87a] bg-[#00e87a10]"
                    : "text-[#666] hover:text-[#e0e0e0]"
                }`}
              >
                {id}
              </button>
            ),
          )}
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
              <span className="text-sm font-mono text-[#e0e0e0]">
                {user.name}
              </span>
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
        {page === "home" && <HomePage user={user} onNavigate={navigate} />}
        {page === "problems" && <ProblemsPage user={user} />}
        {page === "leaderboard" && <LeaderboardPage />}
        {page === "arena" && (
          <ArenaPage user={user} onArenaLockChange={setArenaLocked} />
        )}
        {page === "admin" && user?.is_admin && <AdminPage user={user} />}
      </main>
    </div>
  );
}