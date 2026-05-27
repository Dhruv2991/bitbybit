"use client";
// ════════════════════════════════════════════════════════════
// src/app/page.tsx — Root page
// ════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
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

const HomePage = dynamic(() => import("@/components/pages/HomePage"), {
  loading: PageSkeleton,
  ssr: false,
});
const ProblemsPage = dynamic(() => import("@/components/pages/ProblemsPage"), {
  loading: PageSkeleton,
  ssr: false,
});
const LeaderboardPage = dynamic(
  () => import("@/components/pages/LeaderboardPage"),
  { loading: PageSkeleton, ssr: false },
);
const ArenaPage = dynamic(() => import("@/components/pages/ArenaPage"), {
  loading: PageSkeleton,
  ssr: false,
});
const AdminPage = dynamic(() => import("@/components/pages/AdminPage"), {
  loading: PageSkeleton,
  ssr: false,
});

type PageId = "home" | "problems" | "leaderboard" | "arena" | "admin";

function AuthLoader() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <img
          src="/logo.png"
          alt="BitByBit"
          className="w-28 h-28 object-contain animate-pulse"
        />
        <div className="w-32 h-[1px] bg-[#1a1a1a] overflow-hidden rounded">
          <div className="h-full w-1/2 bg-[#00e87a] animate-[slide_1s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<PageId>("home");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [arenaLocked, setArenaLocked] = useState(false);

  useEffect(() => {
    let resolved = false;

    function resolve(sessionUser: User | null) {
      if (resolved) return;
      resolved = true;
      setUser(sessionUser);
      setLoading(false);
    }

    // Hard timeout — always fires after 3s no matter what
    const timeout = setTimeout(() => {
      console.warn("[auth] Timed out waiting for Supabase auth — treating as logged out");
      resolve(null);
    }, 3000);

    // Kick off auth detection
    async function init() {
      try {
        const db = getSupabaseClient();

        // Race: getSession vs onAuthStateChange — whichever fires first wins
        const sessionPromise = db.auth.getSession().then(async ({ data: { session }, error }) => {
          if (error) {
            console.warn("[auth] getSession error:", error.message);
            resolve(null);
            return;
          }
          if (session?.user) {
            const github = session.user.user_metadata.user_name as string;
            const isAdmin = await resolveAdminStatus(github);
            resolve({
              name: session.user.user_metadata.full_name || github,
              github,
              is_admin: isAdmin,
            });
          } else {
            resolve(null);
          }
        }).catch(() => resolve(null));

        // Also subscribe to changes for sign-in/sign-out after initial load
        const { data: { subscription } } = db.auth.onAuthStateChange(async (event, session) => {
          if (!resolved) {
            // First event — use it to resolve initial auth
            if (session?.user) {
              const github = session.user.user_metadata.user_name as string;
              const isAdmin = await resolveAdminStatus(github);
              resolve({
                name: session.user.user_metadata.full_name || github,
                github,
                is_admin: isAdmin,
              });
            } else {
              resolve(null);
            }
          } else {
            // Subsequent events (sign in/out after page loaded)
            if (session?.user) {
              const github = session.user.user_metadata.user_name as string;
              const isAdmin = await resolveAdminStatus(github);
              setUser({
                name: session.user.user_metadata.full_name || github,
                github,
                is_admin: isAdmin,
              });
            } else {
              setUser(null);
              setPage("home");
            }
          }
        });

        return () => {
          subscription.unsubscribe();
        };
      } catch (err) {
        console.error("[auth] Fatal init error:", err);
        resolve(null);
      }
    }

    const cleanupPromise = init();

    return () => {
      clearTimeout(timeout);
      cleanupPromise.then((cleanup) => cleanup?.());
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
    const db = getSupabaseClient();
    await db.auth.signOut();
    setUser(null);
    setPage("home");
  }

  if (loading) {
    return <AuthLoader />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a] flex items-center justify-between px-6 h-14">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("home")}
        >
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
                ${page === id ? "text-[#00e87a] bg-[#00e87a10]" : "text-[#666] hover:text-[#e0e0e0]"}`}
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