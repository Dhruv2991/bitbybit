"use client";

import { useState, useEffect, useRef } from "react";
import { getSupabaseClient, resolveAdminStatus } from "@/lib/supabase";
import type { User } from "@/types/database";
import AnimatedBackground from "@/components/pages/AnimatedBackground";
import HomePage             from "@/components/pages/HomePage";
import ProblemsPage         from "@/components/pages/ProblemsPage";
import LeaderboardPage      from "@/components/pages/LeaderboardPage";
import ArenaPage            from "@/components/pages/ArenaPage";
import AdminPage            from "@/components/pages/AdminPage";
import WeeklyChallengePage  from "@/components/pages/WeeklyChallengePage";
import AboutPage            from "@/components/pages/AboutPage";
import PrivacyPolicyPage    from "@/components/pages/PrivacyPolicyPage";
import TermsPage            from "@/components/pages/TermsPage";
import RefundPolicyPage     from "@/components/pages/RefundPolicyPage";
import ProfilePage          from "@/components/pages/ProfilePage";
import GlobalSearch          from "@/components/GlobalSearch";
import { effectiveStreak }  from "@/lib/streak";

const PAGE_KEY = "bb_page";
type PageId = "home" | "problems" | "leaderboard" | "arena" | "weekly" | "admin" | "about" | "privacy" | "terms" | "refunds" | "profile";

const NAV_ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: "home",        label: "Home",        icon: "⌂"   },
  { id: "problems",    label: "Problems",    icon: "{ }" },
  { id: "leaderboard", label: "Leaderboard", icon: "⚡"  },
  { id: "arena",       label: "Arena",       icon: "🏆"  },
  { id: "weekly",      label: "Weekly",      icon: "🏅"  },
];

type ToastType = "ok" | "err" | "warn" | "info";
interface Toast { id: number; msg: string; type: ToastType; }

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
    return {
      name:     su.user_metadata?.full_name || github,
      github,
      is_admin: cachedAdmin === '1',
    };
  } catch { return null; }
}

// Wipes any locally-cached auth data. Used whenever we detect a session
// that can't actually be validated/refreshed anymore (expired or reused
// refresh token after the tab's been left open/closed for a long time) —
// without this, a broken token stays cached forever and every DB call
// keeps silently failing until someone manually clears site data.
function clearAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("bitbybit-auth");
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith("bb_admin_")) localStorage.removeItem(k);
    });
  } catch {}
}

export default function App() {
  const [page, setPageState] = useState<PageId>(() => {
    if (typeof window === "undefined") return "home";
    try { return (sessionStorage.getItem(PAGE_KEY) as PageId) || "home"; } catch { return "home"; }
  });

  const [user,           setUser]           = useState<User | null>(null);
  const [authChecked,    setAuthChecked]    = useState(false);
  const [arenaLocked,    setArenaLocked]    = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navRef      = useRef<HTMLDivElement>(null);
  const navItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number; opacity: number; color: 'green' | 'purple' }>({ left: 0, width: 0, opacity: 0, color: 'green' });
  const [toasts,         setToasts]         = useState<Toast[]>([]);
  const [liveItems,      setLiveItems]      = useState<{ id: string; label: string; page: PageId; type: 'arena' | 'weekly'; status: 'live' | 'upcoming' }[]>([]);
  const [notifOpen,      setNotifOpen]      = useState(false);
  const [profileOpen,    setProfileOpen]    = useState(false);
  const [searchOpen,     setSearchOpen]     = useState(false);
  const [userStreak,     setUserStreak]     = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Load saved theme preference and apply it to <html data-theme="...">
  useEffect(() => {
    let saved: 'dark' | 'light' = 'dark';
    try {
      const stored = localStorage.getItem('bb_theme');
      if (stored === 'light' || stored === 'dark') saved = stored;
    } catch {}
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  function toggleTheme() {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('bb_theme', next); } catch {}
      return next;
    });
  }
  const toastCounter = useRef(0);
  const resolving    = useRef(false);
  const notifRef     = useRef<HTMLDivElement>(null);
  const notifRefMob  = useRef<HTMLDivElement>(null);
  const profileRef   = useRef<HTMLDivElement>(null);

  // Close the profile dropdown on outside click or Escape
  useEffect(() => {
    if (!profileOpen) return;
    function handlePointer(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [profileOpen]);

  function showToast(msg: string, type: ToastType = "info") {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }

  function setPage(id: PageId) {
    setPageState(id);
    try { sessionStorage.setItem(PAGE_KEY, id); } catch {}
    // Sync URL hash so the page is shareable/bookmarkable
    if (typeof window !== "undefined") {
      window.location.hash = id === "home" ? "" : id;
    }
  }

  // On mount, read URL hash to navigate to the right page.
  // A valid hash always wins over any stored session page, so shared
  // or bookmarked links (e.g. #privacy) work reliably every time —
  // not just on a completely fresh session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const validPages: PageId[] = ["home", "problems", "leaderboard", "arena", "weekly", "admin", "about", "privacy", "terms", "refunds", "profile"];

    function applyHash() {
      const hash = window.location.hash.replace("#", "") as PageId;
      if (hash && validPages.includes(hash)) {
        setPageState(hash);
        try { sessionStorage.setItem(PAGE_KEY, hash); } catch {}
      }
    }

    applyHash(); // initial load
    window.addEventListener("hashchange", applyHash); // back/forward + manual hash edits
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    const db = getSupabaseClient();
    let alive = true;
    const stored = readStoredUser();
    if (stored) setUser(stored);
    setAuthChecked(true);

    async function buildUser(su: any): Promise<User> {
      const github  = su.user_metadata?.user_name as string;
      const isAdmin = await resolveAdminStatus(github);
      return { name: su.user_metadata?.full_name || github, github, is_admin: isAdmin };
    }

    // Writes email/name into `members` (and `subscribers`, if a row
    // already exists) via a server-side route using the service-role
    // key — see /api/auth/sync. This replaced a client-side
    // `db.from("members").update(...)` that failed *silently* whenever
    // RLS didn't allow the anon key to write that column. Runs on every
    // session detection, not just fresh sign-ins, so existing logged-in
    // users get backfilled too and not only people who sign in again.
    async function syncEmail(session: any) {
      const token = session?.access_token;
      if (!token) return;
      try {
        await fetch("/api/auth/sync", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Best-effort — a failed sync here shouldn't block sign-in.
      }
    }

    db.auth.getSession().then(async ({ data: { session }, error }) => {
      if (!alive) return;
      if (error) {
        // The stored refresh token is dead (expired / already rotated by
        // a previous tab or a long-dormant session) and couldn't be
        // renewed. Without this, the SDK keeps hanging onto a token that
        // will fail on every request forever — the only way out used to
        // be manually clearing site data. Purge it and drop back to a
        // clean logged-out state instead.
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
        // No error, but also no session — likely stale/partial data left
        // over in localStorage from a previous visit. Clear it so
        // readStoredUser() doesn't keep resurrecting a dead user on
        // every future load.
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
        // Upsert into members so homepage count reflects all GitHub logins.
        // ignoreDuplicates so an existing member's points/streak are never
        // reset by a later login.
        if (u?.github) {
          (db.from("members") as any).upsert({
            github:          u.github,
            name:            u.name,
            total_points:    0,
            problems_solved: 0,
            streak:          0,
          }, { onConflict: "github", ignoreDuplicates: true }).then(() => {});
        }
        syncEmail(session);
      } else if (event === "SIGNED_OUT") {
        // Fires both on an explicit signOut() and automatically whenever
        // a background token refresh fails — clear local storage in both
        // cases so a dead token never lingers past this point.
        clearAuthStorage();
        setUser(null);
        setPage("home");
      }
    });

    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  // A tab left open (or backgrounded/suspended by the OS/browser) for a
  // long time can come back with an access token that's expired and a
  // refresh token that's no longer valid. Auto-refresh timers don't
  // reliably fire while a tab is hidden, so re-check the session as soon
  // as the user returns — getSession() will attempt a refresh, and the
  // .catch/error handling above will clear things out if that fails,
  // instead of leaving every DB call silently broken until a full
  // reload (or manually clearing site data).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        getSupabaseClient().auth.getSession().catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Fetch the current user's streak for the navbar badge
  useEffect(() => {
    let alive = true;
    if (!user?.github) { setUserStreak(0); return; }
    const db = getSupabaseClient();
    (async () => {
      try {
        const { data }: any = await db.from("members").select("streak, last_solved_at").eq("github", user.github).maybeSingle();
        if (alive) setUserStreak(effectiveStreak(data?.streak, data?.last_solved_at));
      } catch { if (alive) setUserStreak(0); }
    })();
    return () => { alive = false; };
  }, [user?.github]);

  // Poll for live and upcoming contests and weekly challenges every 60s
  useEffect(() => {
    async function checkLive() {
      const db = getSupabaseClient();
      const items: { id: string; label: string; page: PageId; type: 'arena' | 'weekly'; status: 'live' | 'upcoming' }[] = [];

      // Live arena contests
      const { data: liveContests } = await db.from('contests').select('id, title, status').eq('status', 'live');
      (liveContests || []).forEach((c: any) => items.push({ id: c.id, label: c.title, page: 'arena', type: 'arena', status: 'live' }));

      // Upcoming arena contests
      const { data: upcomingContests } = await db.from('contests').select('id, title, status').eq('status', 'upcoming');
      (upcomingContests || []).forEach((c: any) => items.push({ id: c.id, label: c.title, page: 'arena', type: 'arena', status: 'upcoming' }));

      // Live + upcoming weekly challenges
      const { data: weekly } = await (db.from('weekly_challenges') as any)
        .select('id, title, status, starts_at, ends_at')
        .in('status', ['active', 'upcoming']);
      (weekly || []).forEach((w: any) => {
        const now     = Date.now();
        const started = new Date(w.starts_at).getTime() <= now;
        const ended   = new Date(w.ends_at).getTime()   <  now;
        if (started && !ended) {
          items.push({ id: w.id, label: w.title, page: 'weekly', type: 'weekly', status: 'live' });
        } else if (!started) {
          items.push({ id: w.id, label: w.title, page: 'weekly', type: 'weekly', status: 'upcoming' });
        }
      });

      setLiveItems(items);
    }
    checkLive();
    const interval = setInterval(checkLive, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close notif on escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNotifOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  function navigate(id: PageId) {
    setNotifOpen(false);
    if (arenaLocked && id !== "arena") {
      showToast("Contest in progress — you cannot leave the arena.", "warn");
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
    await db.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin,
        // Forces GitHub's account picker to appear instead of silently
        // re-authenticating with whichever GitHub account is active in
        // the browser. Since this function only ever runs when there's
        // no valid persisted Supabase session (i.e. after an explicit
        // sign-out, or on a fresh device), a user who never logs out
        // stays auto-logged-in via their existing session and never
        // hits this flow at all.
        queryParams: { prompt: "select_account" },
      },
    });
  }

  async function signOut() {
    const github = user?.github;
    await getSupabaseClient().auth.signOut();
    if (github) try { localStorage.removeItem(`bb_admin_${github}`); } catch {}
  }

  // Fully signs the current user out, then immediately re-opens the
  // GitHub OAuth flow so they land straight on the account picker
  // (signIn() always passes prompt: "select_account") instead of
  // having to sign out, see the logged-out header, and click sign in
  // again themselves.
  async function switchAccount() {
    setProfileOpen(false);
    await signOut();
    await signIn();
  }

  const toastColors: Record<ToastType, string> = {
    ok:   "bg-[#00e87a] text-black",
    err:  "bg-[#ff4d4d] text-white",
    warn: "bg-[#f0b429] text-black",
    info: "bg-[#1f1f1f] text-[#e0e0e0] border border-[#2a2a2a]",
  };

  const liveCount     = liveItems.filter(i => i.status === 'live').length;
  const upcomingCount = liveItems.filter(i => i.status === 'upcoming').length;

  const bellDropdown = notifOpen && (
    <div className="absolute right-0 top-10 w-72 bg-[#0f0f0f] border border-[#1f1f1f] rounded-2xl shadow-2xl overflow-hidden z-[100]">
      <div className="px-4 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
        <span className="text-xs font-mono font-bold text-[#e0e0e0]">Events</span>
        <div className="flex items-center gap-1.5">
          {liveCount > 0 && (
            <span className="text-[10px] font-mono bg-[#00e87a20] text-[#00e87a] px-2 py-0.5 rounded-lg">{liveCount} live</span>
          )}
          {upcomingCount > 0 && (
            <span className="text-[10px] font-mono bg-[#f0b42920] text-[#f0b429] px-2 py-0.5 rounded-lg">{upcomingCount} upcoming</span>
          )}
        </div>
      </div>
      {liveItems.length === 0 ? (
        <div className="px-4 py-6 text-center text-[#666] font-mono text-xs">Nothing live or upcoming right now</div>
      ) : (
        <div className="divide-y divide-[#1a1a1a]">
          {liveItems.map(item => (
            <button key={item.id + item.status}
              onClick={() => { setNotifOpen(false); navigate(item.page); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#161616] transition-all text-left group">
              <span className="text-base shrink-0">{item.type === 'arena' ? '🏆' : '🏅'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono font-bold text-[#e0e0e0] truncate">{item.label}</p>
                <p className="text-[10px] font-mono text-[#555] mt-0.5">
                  {item.type === 'arena' ? 'Arena Contest' : 'Weekly Challenge'} ·{' '}
                  {item.status === 'live'
                    ? <span className="text-[#00e87a]">LIVE</span>
                    : <span className="text-[#f0b429]">UPCOMING</span>}
                </p>
              </div>
              <span className="text-[10px] font-mono text-[#00e87a] group-hover:translate-x-0.5 transition-transform shrink-0">Go →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  useEffect(() => {
    function measure() {
      const activeKey = page === "admin" && user?.is_admin ? "admin" : page;
      const btn = navItemRefs.current[activeKey as string];
      const container = navRef.current;
      if (btn && container) {
        const btnRect = btn.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        setPillStyle({
          left:    btnRect.left - containerRect.left,
          width:   btnRect.width,
          opacity: 1,
          color:   activeKey === "admin" ? "purple" : "green",
        });
      } else {
        setPillStyle(s => ({ ...s, opacity: 0 }));
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [page, user?.is_admin, authChecked]);

  return (
    <div className="min-h-screen bg-transparent">
      <AnimatedBackground />
      <GlobalSearch user={user} navigate={navigate as (page: string) => void} open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Global toasts */}
      <div className="fixed top-20 right-4 md:right-6 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`${toastColors[t.type]} px-4 py-3 rounded-xl font-mono text-sm shadow-2xl pointer-events-auto animate-slide-down backdrop-blur-sm`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-[#080808]/90 backdrop-blur-xl border-b border-[#161616]" style={{boxShadow: "0 1px 0 rgba(255,255,255,0.03)"}}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 flex items-center justify-between h-14">

          {/* Logo */}
          <button className="flex items-center gap-2.5 shrink-0 group" onClick={() => navigate("home")}>
            <img src="/logo.png" alt="BitByBit" className="w-8 h-8 object-contain" />
            <span className="font-display font-bold text-lg select-none tracking-tight">
              BitBy<span className="text-[#00e87a]">Bit</span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav ref={navRef} className="hidden md:flex items-center gap-0.5 relative">
            <span
              className={`absolute top-0 h-full rounded-xl border transition-all duration-300 ease-out pointer-events-none
                ${pillStyle.color === 'purple' ? 'bg-[#a78bfa15] border-[#a78bfa30]' : 'bg-[#00e87a10] border-[#00e87a20]'}`}
              style={{ left: pillStyle.left, width: pillStyle.width, opacity: pillStyle.opacity }}
            />
            {NAV_ITEMS.map(item => (
              <button key={item.id}
                ref={el => { navItemRefs.current[item.id] = el; }}
                onClick={() => navigate(item.id)}
                className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm transition-colors duration-200
                  ${page === item.id
                    ? "text-[#00e87a] font-bold"
                    : "text-[#666] hover:text-[#e0e0e0]"}`}>
                <span className="text-xs opacity-70">{item.icon}</span>
                {item.label}
              </button>
            ))}
            {user?.is_admin && (
              <button
                ref={el => { navItemRefs.current["admin"] = el; }}
                onClick={() => navigate("admin")}
                className={`relative z-10 px-3.5 py-1.5 rounded-xl font-mono text-sm transition-colors duration-200
                  ${page === "admin"
                    ? "text-[#a78bfa] font-bold"
                    : "text-[#777] hover:text-[#a78bfa]"}`}>
                Admin
              </button>
            )}
          </nav>

          {/* Auth — desktop */}
          <div className="hidden md:flex items-center gap-1">
            {/* Search trigger — icon-only, same treatment as the icons beside it */}
            <button onClick={() => setSearchOpen(true)} title="Search (⌘K)"
              className="p-2 text-[#777] hover:text-[#e0e0e0] transition-colors rounded-xl hover:bg-[#ffffff08]">
              <span className="text-base">🔍</span>
            </button>
            {/* Theme toggle */}
            <button onClick={toggleTheme} title="Toggle theme"
              className="p-2 text-[#777] hover:text-[#e0e0e0] transition-colors rounded-xl hover:bg-[#ffffff08]">
              <span className="text-base">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>
            {/* 🔔 Desktop bell */}
            <div className="relative" ref={notifRef}>
              <button onClick={() => setNotifOpen(o => !o)}
                className="relative p-2 text-[#777] hover:text-[#e0e0e0] transition-colors rounded-xl hover:bg-[#ffffff08]">
                <span className="text-base">🔔</span>
                {liveItems.length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#00e87a] animate-pulse" />
                )}
              </button>
              {bellDropdown}
            </div>
            <div className="w-px h-5 bg-[#1a1a1a] mx-1" />
            {!authChecked ? (
              <div className="w-24 h-8 rounded-xl bg-[#111] animate-pulse" />
            ) : user ? (
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen(o => !o)}
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-xl hover:bg-[#ffffff08] transition-colors">
                  <img
                    src={`https://github.com/${user.github}.png?size=32`}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover ring-1 ring-[#2a2a2a]"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="text-xs font-mono text-[#888]">{user.name}</span>
                  {userStreak > 0 && (
                    <span title={`${userStreak}-day streak`}
                      className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#f0b429] bg-[#f0b42912] border border-[#f0b42925] rounded-full px-1.5 py-0.5">
                      🔥{userStreak}
                    </span>
                  )}
                  <span className={`text-[10px] text-[#555] transition-transform ${profileOpen ? "rotate-180" : ""}`}>▾</span>
                </button>

                {profileOpen && (
                  <div role="menu"
                    className="absolute right-0 top-11 w-56 bg-[#0f0f0f] border border-[#1f1f1f] rounded-2xl shadow-2xl overflow-hidden z-[100] animate-slide-down">
                    <div className="px-4 py-3 border-b border-[#1a1a1a] flex items-center gap-2.5">
                      <img
                        src={`https://github.com/${user.github}.png?size=32`}
                        alt={user.name}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-[#2a2a2a]"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-mono text-[#e0e0e0] truncate">{user.name}</p>
                        <p className="text-[10px] font-mono text-[#666] truncate">@{user.github}</p>
                      </div>
                    </div>
                    <button role="menuitem" onClick={() => { setProfileOpen(false); navigate("profile"); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-mono text-[#aaa] hover:text-[#e0e0e0] hover:bg-[#ffffff06] transition-colors flex items-center gap-2.5">
                      <span className="text-sm">👤</span> My profile
                    </button>
                    <button role="menuitem" onClick={switchAccount}
                      className="w-full text-left px-4 py-2.5 text-xs font-mono text-[#aaa] hover:text-[#e0e0e0] hover:bg-[#ffffff06] transition-colors flex items-center gap-2.5">
                      <span className="text-sm">🔁</span> Switch account
                    </button>
                    <button role="menuitem" onClick={() => { setProfileOpen(false); signOut(); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-mono text-[#aaa] hover:text-[#ff4d4d] hover:bg-[#ff4d4d0a] transition-colors flex items-center gap-2.5 border-t border-[#1a1a1a]">
                      <span className="text-sm">⏻</span> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={signIn}
                className="px-4 py-1.5 rounded-xl font-mono text-sm bg-[#00e87a]
                  text-black font-bold hover:bg-[#00ff88] transition-all shadow-[0_0_16px_rgba(0,232,122,0.2)]">
                Sign in with GitHub
              </button>
            )}
          </div>

          {/* Mobile — bell + hamburger */}
          <div className="md:hidden flex items-center gap-1">
            <button onClick={() => setSearchOpen(true)} title="Search"
              className="p-2 text-[#555] hover:text-[#e0e0e0] transition-colors">
              <span className="text-base">🔍</span>
            </button>
            {/* 🔔 Mobile bell */}
            <div className="relative" ref={notifRefMob}>
              <button onClick={() => setNotifOpen(o => !o)}
                className="relative p-2 text-[#555] hover:text-[#e0e0e0] transition-colors">
                <span className="text-base">🔔</span>
                {liveItems.length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#00e87a] animate-pulse" />
                )}
              </button>
              {bellDropdown}
            </div>
            <button type="button" aria-label="Toggle menu"
              onClick={() => setMobileMenuOpen(o => !o)}
              className="p-2 text-[#555] hover:text-[#e0e0e0] transition-colors">
              <div className={`w-5 h-0.5 bg-current mb-1.5 transition-all duration-200 ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <div className={`w-5 h-0.5 bg-current mb-1.5 transition-all duration-200 ${mobileMenuOpen ? "opacity-0" : ""}`} />
              <div className={`w-5 h-0.5 bg-current transition-all duration-200 ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#1a1a1a] bg-[#0a0a0a]/98 backdrop-blur pb-3">
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => navigate(item.id)}
                className={`w-full text-left px-5 py-3 font-mono text-sm transition-all flex items-center gap-3 relative
                  ${page === item.id ? "text-[#00e87a] bg-[#00e87a06]" : "text-[#777] hover:text-[#e0e0e0]"}`}>
                {page === item.id && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#00e87a] rounded-full" />}
                <span className="w-5 text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
            {user?.is_admin && (
              <button onClick={() => navigate("admin")}
                className={`w-full text-left px-5 py-3 font-mono text-sm flex items-center gap-3
                  ${page === "admin" ? "text-[#a78bfa]" : "text-[#555] hover:text-[#a78bfa]"}`}>
                <span className="w-5">⚙</span> Admin
              </button>
            )}
            <button onClick={() => navigate("about")}
              className={`w-full text-left px-5 py-3 font-mono text-sm flex items-center gap-3
                ${page === "about" ? "text-[#00e87a]" : "text-[#555] hover:text-[#e0e0e0]"}`}>
              <span className="w-5">ℹ</span> About
            </button>
            <button onClick={toggleTheme}
              className="w-full text-left px-5 py-3 font-mono text-sm flex items-center gap-3 text-[#555] hover:text-[#e0e0e0]">
              <span className="w-5">{theme === 'dark' ? '☀️' : '🌙'}</span>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <div className="mt-2 border-t border-[#1a1a1a] pt-2 px-4">
              {!authChecked ? null : user ? (
                <div className="py-2">
                  <div className="flex items-center gap-2 mb-2.5">
                    <img src={`https://github.com/${user.github}.png?size=28`} alt={user.name}
                      className="w-7 h-7 rounded-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <span className="text-sm font-mono text-[#e0e0e0] truncate max-w-[160px]">{user.name}</span>
                    {userStreak > 0 && (
                      <span title={`${userStreak}-day streak`}
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#f0b429] bg-[#f0b42912] border border-[#f0b42925] rounded-full px-1.5 py-0.5 shrink-0">
                        🔥{userStreak}
                      </span>
                    )}
                  </div>
                  <button onClick={() => { setMobileMenuOpen(false); navigate("profile"); }}
                    className="w-full text-center py-2 mb-2 rounded-xl font-mono text-xs border border-[#222] text-[#aaa] hover:text-[#e0e0e0] hover:border-[#2a2a2a] transition-colors">
                    👤 My profile
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setMobileMenuOpen(false); switchAccount(); }}
                      className="flex-1 text-center py-2 rounded-xl font-mono text-xs border border-[#222] text-[#aaa] hover:text-[#e0e0e0] hover:border-[#2a2a2a] transition-colors">
                      🔁 Switch account
                    </button>
                    <button onClick={() => { setMobileMenuOpen(false); signOut(); }}
                      className="flex-1 text-center py-2 rounded-xl font-mono text-xs border border-[#222] text-[#aaa] hover:text-[#ff4d4d] hover:border-[#ff4d4d30] transition-colors">
                      ⏻ Sign out
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={signIn}
                  className="w-full py-2.5 rounded-xl font-mono text-sm bg-[#00e87a] text-black font-bold">
                  Sign in with GitHub
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {page === "home"        && <HomePage        user={user} onNavigate={navigate} />}
        {page === "problems"    && <ProblemsPage    user={user} onNavigate={navigate} />}
        {page === "leaderboard" && <LeaderboardPage />}
        {page === "profile"     && <ProfilePage user={user} onNavigate={navigate} />}
        {page === "arena"       && <ArenaPage       user={user} onArenaLockChange={setArenaLocked} onNavigate={navigate as (page: string) => void} />}
        {page === "weekly"      && <WeeklyChallengePage user={user} onNavigate={navigate as (page: string) => void} />}
        {page === "admin"       && user?.is_admin   && <AdminPage user={user} />}
        {page === "about"       && <AboutPage onNavigate={navigate as (page: string) => void} />}
        {page === "privacy"     && <PrivacyPolicyPage onNavigate={navigate as (page: string) => void} />}
        {page === "terms"       && <TermsPage onNavigate={navigate as (page: string) => void} />}
        {page === "refunds"     && <RefundPolicyPage onNavigate={navigate as (page: string) => void} />}
      </main>

      {/* Footer — copyright + about link */}
      <footer className="border-t border-[#161616] py-5 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <span className="text-[11px] font-mono text-[#555]">
            © {new Date().getFullYear()} Dhruv G Nayak · TeamCodeLocked · BMS College of Engineering
          </span>
          <div className="flex items-center gap-4">
            <a href="https://www.instagram.com/teamcodelocked/" target="_blank" rel="noopener noreferrer"
              className="text-[11px] font-mono text-[#666] hover:text-[#f0b429] transition-colors">
              Instagram
            </a>
            <button onClick={() => navigate("about")}
              className="text-[11px] font-mono text-[#666] hover:text-[#00e87a] transition-colors">
              About & Legal
            </button>
            <button onClick={() => navigate("privacy")}
              className="text-[11px] font-mono text-[#666] hover:text-[#00e87a] transition-colors">
              Privacy
            </button>
            <button onClick={() => navigate("terms")}
              className="text-[11px] font-mono text-[#666] hover:text-[#00e87a] transition-colors">
              Terms
            </button>
            <button onClick={() => navigate("refunds")}
              className="text-[11px] font-mono text-[#666] hover:text-[#00e87a] transition-colors">
              Refunds
            </button>
          </div>
        </div>
      </footer>

      {/* Bottom mobile nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#080808]/98 backdrop-blur-xl
        border-t border-[#161616] flex z-40" style={{boxShadow:"0 -1px 0 rgba(255,255,255,0.02)"}}>
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => navigate(item.id)}
            className={`flex-1 flex flex-col items-center py-3 gap-1 font-mono text-[10px] transition-all relative
              ${page === item.id ? "text-[#00e87a]" : "text-[#555] hover:text-[#aaa]"}`}>
            {page === item.id && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[#00e87a] rounded-full" />
            )}
            <span className="text-base leading-none">{item.icon}</span>
            <span className={page === item.id ? "font-bold" : ""}>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="md:hidden h-16" />
    </div>
  );
}