"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient, resolveAdminStatus } from "@/lib/supabase";
import type { User } from "@/types/database";
import { effectiveStreak } from "@/lib/streak";
import { setAiUser } from "@/lib/gemini";
import { isActiveSubscription } from "@/lib/subscription";

export type PageId =
  | "home" | "problems" | "leaderboard" | "arena" | "weekly"
  | "admin" | "about" | "privacy" | "terms" | "refunds" | "profile" | "subscribe";

export type ToastType = "ok" | "err" | "warn" | "info";
export interface Toast { id: number; msg: string; type: ToastType; }

export interface LiveItem {
  id: string; label: string; page: PageId; type: "arena" | "weekly"; status: "live" | "upcoming";
}

// Each real Next.js route maps back to the legacy PageId so the rest of the
// app (nav highlighting, guards, breadcrumb) can keep working unchanged.
export const ROUTE_TO_PAGE: Record<string, PageId> = {
  "/": "home",
  "/problems": "problems",
  "/leaderboard": "leaderboard",
  "/arena": "arena",
  "/weekly": "weekly",
  "/admin": "admin",
  "/about": "about",
  "/privacy": "privacy",
  "/terms": "terms",
  "/refunds": "refunds",
  "/profile": "profile",
  "/subscribe": "subscribe",
};

export const PAGE_TO_ROUTE: Record<PageId, string> = {
  home: "/", problems: "/problems", leaderboard: "/leaderboard", arena: "/arena",
  weekly: "/weekly", admin: "/admin", about: "/about", privacy: "/privacy",
  terms: "/terms", refunds: "/refunds", profile: "/profile", subscribe: "/subscribe",
};

interface AppShellContextValue {
  user: User | null;
  authChecked: boolean;
  arenaLocked: boolean;
  setArenaLocked: (v: boolean) => void;
  toasts: Toast[];
  showToast: (msg: string, type?: ToastType) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
  liveItems: LiveItem[];
  userStreak: number;
  navigate: (id: PageId) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  switchAccount: () => Promise<void>;
}

const AppShellCtx = createContext<AppShellContextValue | null>(null);

export function useAppShell() {
  const ctx = useContext(AppShellCtx);
  if (!ctx) throw new Error("useAppShell must be used inside <AppShellProvider>");
  return ctx;
}

function readStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("bitbybit-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const su = parsed?.user ?? parsed?.session?.user;
    if (!su?.user_metadata?.user_name) return null;
    const github = su.user_metadata?.user_name;
    const cachedAdmin = localStorage.getItem(`bb_admin_${github}`);
    return { name: su.user_metadata?.full_name || github, github, is_admin: cachedAdmin === "1" };
  } catch { return null; }
}

function clearAuthStorage(github?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("bitbybit-auth");
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Preserve global settings
      if (k === "bb_theme") continue;

      // Clear all auth, admin, solved, AI usage, drafts, and editorials
      if (
        k.startsWith("bb_admin_") ||
        k.startsWith("bb_ai_") ||
        k === "bb_solved" ||
        k.startsWith("bb_draft__") ||
        k.startsWith("bb_arena_draft__") ||
        k.startsWith("bb_editorial_")
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // Also clear session sync flags from sessionStorage
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const sk = sessionStorage.key(i);
      if (sk && sk.startsWith("bb_member_synced_")) {
        sessionKeysToRemove.push(sk);
      }
    }
    sessionKeysToRemove.forEach(sk => sessionStorage.removeItem(sk));
  } catch {}
}

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [arenaLocked, setArenaLocked] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [liveItems, setLiveItems] = useState<LiveItem[]>([]);
  const [userStreak, setUserStreak] = useState(0);
  const [theme] = useState<"dark" | "light">("dark");

  const toastCounter = useRef(0);
  const resolving = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  }, []);

  function toggleTheme() {
    // Light mode removed permanently per design requirements
  }

  function showToast(msg: string, type: ToastType = "info") {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }

  // Real navigation now — this is what makes every page a shareable URL
  // instead of hidden client-side state.
  function navigate(id: PageId) {
    if (arenaLocked && id !== "arena") {
      showToast("Contest in progress — you cannot leave the arena.", "warn");
      return;
    }
    if (id === "admin" && !user?.is_admin) {
      showToast("Access denied.", "err");
      return;
    }
    router.push(PAGE_TO_ROUTE[id]);
  }

  useEffect(() => {
    const db = getSupabaseClient();
    let alive = true;
    const stored = readStoredUser();
    if (stored) setUser(stored);
    setAuthChecked(true);

    async function buildUser(su: any): Promise<User> {
      const github = su.user_metadata?.user_name as string;
      const isAdmin = await resolveAdminStatus(github);
      return { name: su.user_metadata?.full_name || github, github, is_admin: isAdmin };
    }

    async function syncEmail(session: any) {
      const token = session?.access_token;
      if (!token) return;
      try {
        await fetch("/api/auth/sync", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      } catch {}
    }

    db.auth.getSession().then(async ({ data: { session }, error }) => {
      if (!alive) return;
      if (error) {
        clearAuthStorage();
        await db.auth.signOut({ scope: "local" }).catch(() => {});
        setUser(null);
        return;
      }
      if (session?.user) {
        if (resolving.current) return;
        resolving.current = true;
        const u = await buildUser(session.user);
        if (!alive) return;
        setUser(u);
        resolving.current = false;
        syncEmail(session);
      } else {
        clearAuthStorage();
        setUser(null);
      }
    }).catch(async () => {
      if (!alive) return;
      clearAuthStorage();
      await db.auth.signOut({ scope: "local" }).catch(() => {});
      setUser(null);
    });

    const { data: { subscription } } = db.auth.onAuthStateChange(async (event, session) => {
      if (!alive) return;
      if (event === "SIGNED_IN" && session?.user) {
        if (resolving.current) return;
        resolving.current = true;
        const u = await buildUser(session.user);
        if (!alive) return;
        setUser(u);
        resolving.current = false;
        if (u?.github) {
          const syncKey = `bb_member_synced_${u.github}`;
          try {
            if (!sessionStorage.getItem(syncKey)) {
              (db.from("members") as any).upsert({
                github: u.github, name: u.name, total_points: 0, problems_solved: 0, streak: 0,
              }, { onConflict: "github", ignoreDuplicates: true }).then(() => {
                try { sessionStorage.setItem(syncKey, "1"); } catch {}
              });
            }
          } catch {
            (db.from("members") as any).upsert({
              github: u.github, name: u.name, total_points: 0, problems_solved: 0, streak: 0,
            }, { onConflict: "github", ignoreDuplicates: true }).then(() => {});
          }
        }
        syncEmail(session);
      } else if (event === "SIGNED_OUT") {
        const signingOutGithub = user?.github;
        clearAuthStorage(signingOutGithub);
        setUser(null);
        router.push("/");
      }
    });

    return () => { alive = false; subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        getSupabaseClient().auth.getSession().catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!user?.github) {
      setUserStreak(0);
      setAiUser("", false);
      return;
    }
    const db = getSupabaseClient();
    (async () => {
      try {
        const [{ data: mData }, { data: subData }] = await Promise.all([
          (db.from("members") as any).select("streak, last_solved_at").eq("github", user.github).maybeSingle(),
          (db.from("subscribers") as any).select("status, current_period_end").eq("github", user.github).maybeSingle(),
        ]);
        if (alive) {
          setUserStreak(effectiveStreak(mData?.streak, mData?.last_solved_at));
          const isSub = !!user.is_admin || isActiveSubscription(subData?.status, subData?.current_period_end);
          setAiUser(user.github, isSub);
        }
      } catch {
        if (alive) {
          setUserStreak(0);
          setAiUser(user.github, !!user.is_admin);
        }
      }
    })();
    return () => { alive = false; };
  }, [user?.github, user?.is_admin]);

  useEffect(() => {
    async function checkLive() {
      const db = getSupabaseClient();
      const items: LiveItem[] = [];

      const { data: liveContests } = await db.from("contests").select("id, title, status").eq("status", "live");
      (liveContests || []).forEach((c: any) => items.push({ id: c.id, label: c.title, page: "arena", type: "arena", status: "live" }));

      const { data: upcomingContests } = await db.from("contests").select("id, title, status").eq("status", "upcoming");
      (upcomingContests || []).forEach((c: any) => items.push({ id: c.id, label: c.title, page: "arena", type: "arena", status: "upcoming" }));

      const { data: weekly } = await (db.from("weekly_challenges") as any)
        .select("id, title, status, starts_at, ends_at")
        .in("status", ["active", "upcoming"]);
      (weekly || []).forEach((w: any) => {
        const now = Date.now();
        const started = new Date(w.starts_at).getTime() <= now;
        const ended = new Date(w.ends_at).getTime() < now;
        if (started && !ended) items.push({ id: w.id, label: w.title, page: "weekly", type: "weekly", status: "live" });
        else if (!started) items.push({ id: w.id, label: w.title, page: "weekly", type: "weekly", status: "upcoming" });
      });

      setLiveItems(items);
    }
    checkLive();
    const interval = setInterval(checkLive, 60000);
    return () => clearInterval(interval);
  }, []);

  async function signIn() {
    const db = getSupabaseClient();
    await db.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } },
    });
  }

  async function signOut() {
    const github = user?.github;
    clearAuthStorage(github || undefined);
    await getSupabaseClient().auth.signOut();
  }

  async function switchAccount() {
    await signOut();
    await signIn();
  }

  return (
    <AppShellCtx.Provider value={{
      user, authChecked, arenaLocked, setArenaLocked, toasts, showToast,
      theme, toggleTheme, liveItems, userStreak, navigate, signIn, signOut, switchAccount,
    }}>
      {children}
    </AppShellCtx.Provider>
  );
}
