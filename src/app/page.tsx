"use client";
// ════════════════════════════════════════════════════════════
// src/app/page.tsx — all alert() replaced with inline toasts
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { getSupabaseClient, resolveAdminStatus } from "@/lib/supabase";
import type { User } from "@/types/database";
import dynamic from "next/dynamic";

const HomePage = dynamic(() => import("@/components/pages/HomePage"), {
  ssr: false,
});
const ProblemsPage = dynamic(() => import("@/components/pages/ProblemsPage"), {
  ssr: false,
});
const LeaderboardPage = dynamic(
  () => import("@/components/pages/LeaderboardPage"),
  { ssr: false },
);
const ArenaPage = dynamic(() => import("@/components/pages/ArenaPage"), {
  ssr: false,
});
const AdminPage = dynamic(() => import("@/components/pages/AdminPage"), {
  ssr: false,
});

type PageId = "home" | "problems" | "leaderboard" | "arena" | "admin";
const PAGE_KEY = "bb_page";

const NAV_ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "problems", label: "Problems", icon: "{ }" },
  { id: "leaderboard", label: "Leaderboard", icon: "⚡" },
  { id: "arena", label: "Arena", icon: "🏆" },
];

type ToastType = "ok" | "err" | "warn" | "info";
interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

export default function App() {
  const [page, setPageState] = useState<PageId>(() => {
    if (typeof window === "undefined") return "home";
    try {
      return (sessionStorage.getItem(PAGE_KEY) as PageId) || "home";
    } catch {
      return "home";
    }
  });

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(true);
  const [arenaLocked, setArenaLocked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);
  const resolving = useRef(false);

  function showToast(msg: string, type: ToastType = "info") {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4500,
    );
  }

  function setPage(id: PageId) {
    setPageState(id);
    try {
      sessionStorage.setItem(PAGE_KEY, id);
    } catch {}
  }

  useEffect(() => {
    const db = getSupabaseClient();
    let alive = true;

    async function buildUser(su: any): Promise<User> {
      const github = su.user_metadata?.user_name as string;
      const isAdmin = await resolveAdminStatus(github);
      return {
        name: su.user_metadata?.full_name || github,
        github,
        is_admin: isAdmin,
      };
    }

    db.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!alive || resolving.current) return;
        if (session?.user) {
          resolving.current = true;
          const u = await buildUser(session.user);
          if (!alive) return;
          setUser(u);
          setAuthReady(true);
          resolving.current = false;

          db.auth
            .getUser()
            .then(async ({ data: { user: su }, error }) => {
              if (!alive) return;
              if (error || !su) {
                setUser(null);
              } else if (su.user_metadata?.user_name !== u.github) {
                const fresh = await buildUser(su);
                if (alive) setUser(fresh);
              }
            })
            .catch(() => {});
        } else {
          if (alive) setAuthReady(true);
        }
      })
      .catch(() => {
        if (alive) setAuthReady(true);
      });

    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(async (event, session) => {
      if (!alive) return;

      if (event === "SIGNED_IN" && session?.user) {
        resolving.current = true;
        const u = await buildUser(session.user);
        if (!alive) return;
        setUser(u);
        setAuthReady(true);
        resolving.current = false;
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setPage("home");
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        if (!user) {
          const u = await buildUser(session.user);
          if (alive) setUser(u);
        }
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  function navigate(id: PageId) {
    if (arenaLocked && id !== "arena") {
      showToast("Proctor active — you cannot leave the arena.", "warn");
      return;
    }
    if (id === "admin" && !user?.is_admin) {
      showToast("Access denied.", "err");
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
        redirectTo: origin,
      },
    });
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
  }

  const authButton = !authReady ? null : user ? (
    <div className="flex items-center gap-2">
      <img
        src={`https://github.com/${user.github}.png?size=28`}
        alt={user.name}
        className="w-7 h-7 rounded-full object-cover hidden sm:block"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      <button
        onClick={signOut}
        className="px-4 py-1.5 rounded-lg font-mono text-sm border border-[#2a2a2a]
          text-[#666] hover:text-[#ff4d4d] hover:border-[#ff4d4d40] transition-all"
      >
        Sign Out
      </button>
    </div>
  ) : (
    <button
      onClick={signIn}
      className="px-4 py-1.5 rounded-lg font-mono text-sm bg-[#00e87a]
        text-black font-bold hover:bg-[#00ff88] transition-all"
    >
      Sign In with GitHub
    </button>
  );

  const mobileAuthButton = !authReady ? null : user ? (
    <div className="flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-2">
        <img
          src={`https://github.com/${user.github}.png?size=28`}
          alt={user.name}
          className="w-7 h-7 rounded-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="text-sm font-mono text-[#e0e0e0] truncate max-w-[160px]">
          {user.name}
        </span>
      </div>
      <button
        onClick={signOut}
        className="text-xs font-mono text-[#666] hover:text-[#ff4d4d] transition-colors px-2 py-1"
      >
        Sign Out
      </button>
    </div>
  ) : (
    <div className="px-4 py-2">
      <button
        onClick={signIn}
        className="w-full py-2 rounded-lg font-mono text-sm bg-[#00e87a] text-black font-bold hover:bg-[#00ff88] transition-all"
      >
        Sign In with GitHub
      </button>
    </div>
  );

  const toastColors: Record<ToastType, string> = {
    ok: "bg-[#00e87a] text-black",
    err: "bg-[#ff4d4d] text-white",
    warn: "bg-[#f0b429] text-black",
    info: "bg-[#1f1f1f] text-[#e0e0e0] border border-[#2a2a2a]",
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* ── Global toasts ─────────────────────────────── */}
      <div className="fixed top-20 right-4 md:right-6 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${toastColors[t.type]} px-4 py-3 rounded-lg font-mono text-sm shadow-xl pointer-events-auto`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Navbar ──────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 flex items-center justify-between h-14">
          {/* Logo */}
          <button
            className="flex items-center gap-2 shrink-0"
            onClick={() => navigate("home")}
          >
            <img
              src="/logo.png"
              alt="BitByBit"
              className="w-7 h-7 object-contain"
            />
            <span className="font-display font-bold text-lg select-none">
              BitBy<span className="text-[#00e87a]">Bit</span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`px-3 py-1.5 rounded-lg font-mono text-sm transition-all
                  ${
                    page === item.id
                      ? "bg-[#00e87a15] text-[#00e87a] font-bold"
                      : "text-[#666] hover:text-[#e0e0e0] hover:bg-[#111]"
                  }`}
              >
                {item.label}
              </button>
            ))}
            {user?.is_admin && (
              <button
                onClick={() => navigate("admin")}
                className={`px-3 py-1.5 rounded-lg font-mono text-sm transition-all
                  ${
                    page === "admin"
                      ? "bg-[#a78bfa15] text-[#a78bfa] font-bold"
                      : "text-[#555] hover:text-[#a78bfa]"
                  }`}
              >
                Admin
              </button>
            )}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {user && (
              <span className="text-xs font-mono text-[#666]">{user.name}</span>
            )}
            {authButton}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button" // Fixes error #1
            aria-label="Toggle mobile menu" // Fixes error #2
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="md:hidden p-2 text-[#666] hover:text-[#e0e0e0] transition-colors"
          >
            <div
              className={`w-5 h-0.5 bg-current mb-1.5 transition-all ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`}
            />
            <div
              className={`w-5 h-0.5 bg-current mb-1.5 transition-all ${mobileMenuOpen ? "opacity-0" : ""}`}
            />
            <div
              className={`w-5 h-0.5 bg-current transition-all ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`}
            />
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#1a1a1a] bg-[#0a0a0a] pb-3">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`w-full text-left px-4 py-3 font-mono text-sm transition-all flex items-center gap-2
                  ${page === item.id ? "text-[#00e87a] bg-[#00e87a08]" : "text-[#666] hover:text-[#e0e0e0]"}`}
              >
                <span className="w-5">{item.icon}</span>
                {item.label}
              </button>
            ))}
            {user?.is_admin && (
              <button
                onClick={() => navigate("admin")}
                className={`w-full text-left px-4 py-3 font-mono text-sm transition-all flex items-center gap-2
                  ${page === "admin" ? "text-[#a78bfa]" : "text-[#555] hover:text-[#a78bfa]"}`}
              >
                <span className="w-5">⚙</span>
                Admin
              </button>
            )}
            <div className="mt-2 border-t border-[#1a1a1a] pt-2">
              {mobileAuthButton}
            </div>
          </div>
        )}
      </header>

      {/* ── Page content ─────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {page === "home" && <HomePage user={user} onNavigate={navigate} />}
        {page === "problems" && <ProblemsPage user={user} />}
        {page === "leaderboard" && <LeaderboardPage />}
        {page === "arena" && (
          <ArenaPage user={user} onArenaLockChange={setArenaLocked} />
        )}
        {page === "admin" && user?.is_admin && <AdminPage user={user} />}
      </main>

      {/* ── Bottom mobile nav ─────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur
        border-t border-[#1a1a1a] flex z-40 safe-area-inset-bottom"
      >
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 font-mono text-[10px] transition-all
              ${page === item.id ? "text-[#00e87a]" : "text-[#444]"}`}
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="md:hidden h-16" />
    </div>
  );
}
