"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AnimatedBackground from "@/components/pages/AnimatedBackground";
import GlobalSearch from "@/components/GlobalSearch";
import { useAppShell, ROUTE_TO_PAGE, PAGE_TO_ROUTE, type PageId } from "./AppShellContext";

interface NavEntry {
  id: PageId;
  label: string;
  href?: string;
  badge?: string;
  badgeColor?: string;
  icon: (props: { className?: string }) => JSX.Element;
}

interface NavGroup {
  group: string;
  items: NavEntry[];
}

function IconHome({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconProblems({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function IconLeaderboard({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

function IconArena({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
      <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function IconWeekly({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IconProfile({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconAbout({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function IconAdmin({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const toastColors: Record<string, string> = {
  ok: "bg-zinc-900 border border-emerald-500/30 text-emerald-400 shadow-xl",
  err: "bg-zinc-900 border border-rose-500/30 text-rose-400 shadow-xl",
  warn: "bg-zinc-900 border border-amber-500/30 text-amber-400 shadow-xl",
  info: "bg-zinc-900 border border-zinc-700 text-zinc-200 shadow-xl",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const page: PageId = ROUTE_TO_PAGE[pathname] ?? "home";
  const isFullBleed = pathname === "/problems" || pathname.startsWith("/problems/") || pathname === "/arena" || pathname.startsWith("/arena/");
  const {
    user, authChecked, toasts, liveItems, userStreak,
    navigate, signIn, signOut, switchAccount,
  } = useAppShell();

  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Handle outside click for profile dropdown
  useEffect(() => {
    if (!profileOpen) return;
    function handlePointer(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setProfileOpen(false); }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [profileOpen]);

  // Handle outside click for notification popover
  useEffect(() => {
    if (!notifOpen) return;
    function handlePointer(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setNotifOpen(false); }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [notifOpen]);

  function go(id: PageId) {
    setNotifOpen(false);
    setMobileDrawerOpen(false);
    setProfileOpen(false);
    navigate(id);
  }

  const liveCount = liveItems.filter(i => i.status === "live").length;
  const upcomingCount = liveItems.filter(i => i.status === "upcoming").length;

  const NAV_GROUPS: NavGroup[] = [
    {
      group: "Learn & Practice",
      items: [
        { id: "home", label: "Dashboard", icon: IconHome },
        { id: "problems", label: "Problem Set", icon: IconProblems },
        { id: "weekly", label: "Weekly DSA", icon: IconWeekly, badge: "New", badgeColor: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" },
      ],
    },
    {
      group: "Compete",
      items: [
        {
          id: "arena",
          label: "Arena Contests",
          icon: IconArena,
          badge: liveCount > 0 ? `${liveCount} Live` : undefined,
          badgeColor: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium",
        },
        { id: "leaderboard", label: "Leaderboard", icon: IconLeaderboard },
      ],
    },
    {
      group: "General",
      items: [
        { id: "profile", label: "My Profile", icon: IconProfile },
        { id: "about", label: "About & Docs", icon: IconAbout },
      ],
    },
  ];

  if (user?.is_admin) {
    NAV_GROUPS.push({
      group: "Management",
      items: [
        { id: "admin", label: "Admin Console", icon: IconAdmin, badge: "Admin", badgeColor: "bg-purple-500/10 text-purple-400 border border-purple-500/20" },
      ],
    });
  }

  const activeEntry = NAV_GROUPS.flatMap(g => g.items).find(i => i.id === page) || { label: page.toUpperCase() };

  const bellDropdown = notifOpen && (
    <div className="absolute right-0 top-12 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-[100] animate-slide-down">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-medium text-zinc-100">Contests & Challenges</span>
          {liveCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
        </div>
        <div className="flex items-center gap-1.5">
          {liveCount > 0 && <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md font-medium border border-emerald-500/20">{liveCount} live</span>}
          {upcomingCount > 0 && <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md font-medium border border-amber-500/20">{upcomingCount} soon</span>}
        </div>
      </div>
      {liveItems.length === 0 ? (
        <div className="px-4 py-8 text-center text-zinc-400 font-mono text-xs">
          No live contests right now. Check back soon!
        </div>
      ) : (
        <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
          {liveItems.map(item => (
            <button key={item.id + item.status} onClick={() => { setNotifOpen(false); go(item.page); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-all text-left group">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0 text-sm">
                {item.type === "arena" ? "🏆" : "🏅"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors truncate">{item.label}</p>
                <p className="text-[10px] font-mono text-zinc-400 mt-0.5 flex items-center gap-1.5">
                  <span>{item.type === "arena" ? "Arena Contest" : "Weekly DSA"}</span>
                  <span>·</span>
                  {item.status === "live" ? (
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> LIVE
                    </span>
                  ) : (
                    <span className="text-amber-400">UPCOMING</span>
                  )}
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-500 group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all shrink-0">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col antialiased selection:bg-cyan-500/20 selection:text-cyan-300">
      <AnimatedBackground />
      <GlobalSearch user={user} navigate={(id: string) => go(id as PageId)} open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Floating Toast notifications container */}
      <div className="fixed top-5 right-5 z-[300] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`${toastColors[t.type]} px-3.5 py-2.5 rounded-lg font-mono text-xs shadow-xl pointer-events-auto animate-slide-down flex items-center justify-between`}>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-1 min-h-screen relative">
        {/* ========================================================================= */}
        {/* DESKTOP SIDEBAR — Compact w-20 by default, expands to w-64 on hover       */}
        {/* ========================================================================= */}
        <aside
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          className={`hidden md:flex flex-col fixed top-0 left-0 bottom-0 bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] transition-all duration-300 ease-in-out select-none backdrop-blur-xl
            ${sidebarHovered ? "w-64 z-50 shadow-2xl shadow-black/80 ring-1 ring-white/[0.05]" : "w-20 z-40"}`}
        >
          {/* Sidebar Header / Brand */}
          <div className="h-16 px-4 flex items-center border-b border-[var(--sidebar-border)] shrink-0 overflow-hidden">
            <button
              onClick={() => go("home")}
              className="flex items-center gap-3 overflow-hidden text-left focus:outline-none group w-full"
              title="BitByBit Home"
            >
              <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-700/90 p-1.5 flex items-center justify-center shrink-0 group-hover:border-cyan-500/60 shadow-md group-hover:shadow-[0_0_15px_rgba(0,229,255,0.3)] transition-all">
                <img src="/logo.png" alt="BitByBit" className="w-full h-full object-contain filter drop-shadow-sm" />
              </div>
              <div
                className={`flex flex-col min-w-0 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap
                  ${sidebarHovered ? "opacity-100 max-w-[170px] translate-x-0" : "opacity-0 max-w-0 -translate-x-3 pointer-events-none"}`}
              >
                <span className="font-display font-bold text-[17px] tracking-tight text-white group-hover:text-cyan-300 transition-colors leading-tight">
                  BitByBit
                </span>
                <span className="text-xs font-mono text-zinc-400 font-medium tracking-tight truncate mt-0.5">
                  TeamCodeLocked
                </span>
              </div>
            </button>
          </div>

          {/* Sidebar Navigation */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4 space-y-5">
            {NAV_GROUPS.map((group, gIdx) => (
              <div key={group.group + gIdx} className="space-y-1">
                <div
                  className={`transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap
                    ${sidebarHovered ? "px-3 pb-1.5 text-xs font-mono font-semibold tracking-wider uppercase text-zinc-400 opacity-100 max-h-6" : "w-8 h-px bg-zinc-800/80 my-2 mx-auto opacity-50 max-h-2"}`}
                >
                  {sidebarHovered ? group.group : ""}
                </div>

                {group.items.map(item => {
                  const isActive = page === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => go(item.id)}
                      title={item.label}
                      className={`w-full flex items-center rounded-xl font-mono text-sm transition-all duration-200 group relative
                        ${isActive
                          ? "bg-cyan-500/10 text-cyan-300 font-medium border border-cyan-500/25 shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
                        }
                        ${sidebarHovered ? "px-3 py-2.5 gap-3" : "px-0 py-2.5 justify-center"}`}
                    >
                      <div className={`shrink-0 w-6 h-6 flex items-center justify-center ${isActive ? "text-cyan-400" : "text-zinc-400 group-hover:text-zinc-200"}`}>
                        <Icon className="w-[19px] h-[19px]" />
                      </div>
                      <span
                        className={`text-left truncate font-medium transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap
                          ${sidebarHovered ? "opacity-100 max-w-[130px] translate-x-0 flex-1" : "opacity-0 max-w-0 -translate-x-3 pointer-events-none"}`}
                      >
                        {item.label}
                      </span>
                      {item.badge && (
                        <span
                          className={`text-xs font-mono px-2 py-0.5 rounded-full shrink-0 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap
                            ${item.badgeColor || "bg-zinc-800 text-zinc-400 border border-zinc-700"}
                            ${sidebarHovered ? "opacity-100 max-w-[80px] scale-100" : "opacity-0 max-w-0 scale-75 pointer-events-none"}`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Sidebar Footer User Card */}
          <div className="p-2.5 border-t border-[var(--sidebar-border)] shrink-0 overflow-hidden">
            {!authChecked ? (
              <div className="h-10 rounded-lg bg-zinc-900 animate-pulse" />
            ) : user ? (
              <button
                onClick={() => go("profile")}
                className={`w-full flex items-center rounded-lg hover:bg-zinc-800/60 transition-colors group text-left
                  ${sidebarHovered ? "p-2 gap-2.5" : "p-1.5 justify-center"}`}
                title={user.name}
              >
                <div className="relative shrink-0">
                  <img
                    src={`https://github.com/${user.github}.png?size=64`}
                    alt={user.name}
                    className="w-8 h-8 rounded-full object-cover ring-1 ring-zinc-700 group-hover:ring-zinc-500"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {userStreak > 0 && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-zinc-900 text-[10px] flex items-center justify-center font-bold text-amber-400 border border-amber-500/30">
                      🔥
                    </span>
                  )}
                </div>
                <div
                  className={`min-w-0 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap
                    ${sidebarHovered ? "opacity-100 max-w-[150px] translate-x-0 flex-1" : "opacity-0 max-w-0 -translate-x-3 pointer-events-none"}`}
                >
                  <p className="text-sm font-mono font-medium text-zinc-200 truncate">{user.name}</p>
                  <p className="text-xs font-mono text-zinc-500 truncate">@{user.github}</p>
                </div>
              </button>
            ) : (
              <button
                onClick={signIn}
                className={`w-full btn-primary text-sm py-2 flex items-center justify-center gap-2
                  ${sidebarHovered ? "px-3" : "px-0"}`}
                title="Sign in with GitHub"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span
                  className={`transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap
                    ${sidebarHovered ? "opacity-100 max-w-[100px] translate-x-0" : "opacity-0 max-w-0 pointer-events-none"}`}
                >
                  Sign In
                </span>
              </button>
            )}
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* MAIN LAYOUT WRAPPER                                                       */}
        {/* ========================================================================= */}
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-out md:pl-20">
          {/* TOPBAR / HEADER */}
          <header
            className="sticky top-0 z-30 h-16 border-b border-[var(--topbar-border)] bg-[var(--topbar-bg)] backdrop-blur-xl flex items-center justify-between px-4 sm:px-6 lg:px-8"
          >
            {/* Left: Mobile menu button + Brand + Breadcrumb */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="md:hidden p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800/60 transition-colors"
                aria-label="Open menu"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              {/* Mobile Brand */}
              <button
                onClick={() => go("home")}
                className="md:hidden flex items-center gap-2.5 text-left focus:outline-none"
              >
                <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-700/90 p-1 flex items-center justify-center shrink-0 shadow-sm">
                  <img src="/logo.png" alt="BitByBit" className="w-full h-full object-contain" />
                </div>
                <div className="flex flex-col">
                  <span className="font-display font-bold text-base tracking-tight text-white leading-tight">
                    BitByBit
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 font-medium leading-tight">
                    TeamCodeLocked
                  </span>
                </div>
              </button>

              {/* Dynamic Breadcrumbs */}
              <div className="hidden sm:flex items-center gap-2 text-sm font-mono">
                <span className="text-zinc-500">~</span>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-100 font-semibold flex items-center gap-1.5">
                  {activeEntry.label}
                </span>
              </div>
            </div>

            {/* Center: Command Palette Trigger */}
            <div className="hidden sm:flex items-center max-w-xs w-full mx-4">
              <button
                onClick={() => setSearchOpen(true)}
                className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-xl bg-zinc-900/40 backdrop-blur-md border border-white/[0.08] text-zinc-400 hover:border-white/[0.16] hover:text-zinc-200 transition-colors text-sm font-mono shadow-sm group"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span>Quick search...</span>
                </div>
                <kbd className="text-xs font-mono bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-700 text-zinc-300 shadow-xs">
                  ⌘K
                </kbd>
              </button>
            </div>

            {/* Right: Quick actions (Streak, Notifications, User Profile) */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="sm:hidden p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800/60 transition-colors"
                title="Search"
                aria-label="Search"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>

              {/* Streak Badge */}
              {userStreak > 0 && (
                <div
                  title={`${userStreak}-day coding streak!`}
                  className="flex items-center gap-1.5 text-xs font-mono font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg shadow-sm"
                >
                  <span>🔥</span>
                  <span>{userStreak}d</span>
                </div>
              )}

              {/* Notification / Contests Button */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen(o => !o)}
                  aria-label="Notifications"
                  className="relative p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800/60 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  {liveCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-[var(--bg)]" />
                  )}
                </button>
                {bellDropdown}
              </div>

              {/* User profile dropdown button */}
              {!authChecked ? (
                <div className="w-7 h-7 rounded-full bg-zinc-800 animate-pulse" />
              ) : user ? (
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen(o => !o)}
                    aria-haspopup="menu"
                    aria-expanded={profileOpen}
                    aria-label="User menu"
                    className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-zinc-800/60 transition-colors"
                  >
                    <img
                      src={`https://github.com/${user.github}.png?size=64`}
                      alt={user.name}
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-700"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <svg className={`w-3 h-3 text-zinc-400 transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Profile Dropdown */}
                  {profileOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-11 w-60 bg-zinc-900/90 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden z-[100] animate-slide-down"
                    >
                      <div className="px-4 py-3 border-b border-white/[0.06] bg-zinc-950/40">
                        <p className="text-xs font-mono font-medium text-zinc-100 truncate">{user.name}</p>
                        <p className="text-[10px] font-mono text-zinc-400 truncate">@{user.github}</p>
                      </div>

                      <div className="py-1">
                        <button
                          role="menuitem"
                          onClick={() => { setProfileOpen(false); go("profile"); }}
                          className="w-full text-left px-4 py-2 text-xs font-mono text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.04] transition-colors flex items-center gap-2.5"
                        >
                          <IconProfile className="w-3.5 h-3.5 text-zinc-400" />
                          <span>My Profile & Stats</span>
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => { setProfileOpen(false); go("profile"); }}
                          className="w-full text-left px-4 py-2 text-xs font-mono text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.04] transition-colors flex items-center gap-2.5"
                        >
                          <svg className="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                          </svg>
                          <span>Certificates</span>
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => { setProfileOpen(false); switchAccount(); }}
                          className="w-full text-left px-4 py-2 text-xs font-mono text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.04] transition-colors flex items-center gap-2.5"
                        >
                          <svg className="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 2v6h-6" />
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                            <path d="M3 22v-6h6" />
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                          </svg>
                          <span>Switch Account</span>
                        </button>
                      </div>

                      <div className="border-t border-white/[0.06] pt-1">
                        <button
                          role="menuitem"
                          onClick={() => { setProfileOpen(false); signOut(); }}
                          className="w-full text-left px-4 py-2.5 text-xs font-mono text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2.5"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                          </svg>
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={signIn}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  Sign In
                </button>
              )}
            </div>
          </header>

          {/* MAIN CONTENT AREA — full-bleed for workspace, padded for all other pages */}
          {isFullBleed ? (
            <main className="flex-1 w-full min-h-0">
              {children}
            </main>
          ) : (
            <main className="flex-1 w-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-8 md:py-10">
              {children}
            </main>
          )}

          {/* FOOTER */}
          <footer className="border-t border-zinc-800/80 bg-zinc-950/60 py-6 px-4 sm:px-6 lg:px-8 mt-auto">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-zinc-400">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="BitByBit" className="w-5 h-5 object-contain opacity-70" />
                <span>
                  © {new Date().getFullYear()} TeamCodeLocked · BMS College of Engineering
                </span>
              </div>
              <div className="flex items-center gap-4">
                <a
                  href="https://www.instagram.com/teamcodelocked/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-200 transition-colors"
                >
                  Instagram
                </a>
                <button onClick={() => go("about")} className="hover:text-zinc-200 transition-colors">About & Legal</button>
                <button onClick={() => go("privacy")} className="hover:text-zinc-200 transition-colors">Privacy</button>
                <button onClick={() => go("terms")} className="hover:text-zinc-200 transition-colors">Terms</button>
                <button onClick={() => go("refunds")} className="hover:text-zinc-200 transition-colors">Refunds</button>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE DRAWER OVERLAY & SIDEBAR                                           */}
      {/* ========================================================================= */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-zinc-950 border-r border-zinc-800 h-full flex flex-col z-10 animate-slide-right shadow-2xl">
            {/* Drawer Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700/90 p-1 flex items-center justify-center shrink-0 shadow-md">
                  <img src="/logo.png" alt="BitByBit" className="w-full h-full object-contain filter drop-shadow-sm" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-display font-bold text-[17px] tracking-tight text-white leading-tight">
                    BitByBit
                  </span>
                  <span className="text-xs font-mono text-zinc-400 font-medium tracking-tight truncate mt-0.5">
                    TeamCodeLocked
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800/60 transition-colors font-mono text-sm"
                  aria-label="Close menu"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Navigation */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {NAV_GROUPS.map((group, gIdx) => (
                <div key={group.group + gIdx} className="space-y-1">
                  <div className="px-3 pb-1 text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-500">
                    {group.group}
                  </div>
                  {group.items.map(item => {
                    const isActive = page === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => go(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-mono text-xs transition-colors
                          ${isActive
                            ? "bg-cyan-500/10 text-cyan-300 font-medium border border-cyan-500/25"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40"
                          }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.badge && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${item.badgeColor || "bg-zinc-800 text-zinc-400 border border-zinc-700"}`}>
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
              {user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={`https://github.com/${user.github}.png?size=64`}
                      alt={user.name}
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-700"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-medium text-zinc-100 truncate">{user.name}</p>
                      <p className="text-[10px] font-mono text-zinc-500 truncate">@{user.github}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => { setMobileDrawerOpen(false); switchAccount(); }}
                      className="py-1.5 px-2 rounded-lg font-mono text-[10px] border border-zinc-800 text-zinc-400 hover:text-zinc-200 bg-transparent text-center"
                    >
                      Switch
                    </button>
                    <button
                      onClick={() => { setMobileDrawerOpen(false); signOut(); }}
                      className="py-1.5 px-2 rounded-lg font-mono text-[10px] border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 text-center"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={signIn}
                  className="w-full btn-primary text-xs py-2"
                >
                  Sign In with GitHub
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MOBILE BOTTOM THUMB BAR                                                   */}
      {/* ========================================================================= */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-around px-2 py-1.5 shadow-2xl">
        {[
          { id: "home" as PageId, label: "Home", icon: IconHome },
          { id: "problems" as PageId, label: "Problems", icon: IconProblems },
          { id: "arena" as PageId, label: "Arena", icon: IconArena, badge: liveCount > 0 },
          { id: "leaderboard" as PageId, label: "Rankings", icon: IconLeaderboard },
          { id: "profile" as PageId, label: "Profile", icon: IconProfile },
        ].map(item => {
          const isActive = page === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={`flex-1 flex flex-col items-center py-1.5 px-1 rounded-lg transition-all relative font-mono text-[10px]
                ${isActive ? "text-cyan-400 font-medium" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </div>
              <span className="mt-0.5 tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="md:hidden h-14" />
    </div>
  );
}
