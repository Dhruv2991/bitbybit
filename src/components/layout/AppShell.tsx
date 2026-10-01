"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AnimatedBackground from "@/components/pages/AnimatedBackground";
import GlobalSearch from "@/components/GlobalSearch";
import { useAppShell, ROUTE_TO_PAGE, PAGE_TO_ROUTE, type PageId } from "./AppShellContext";

const NAV_ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "problems", label: "Problems", icon: "{ }" },
  { id: "leaderboard", label: "Leaderboard", icon: "⚡" },
  { id: "arena", label: "Arena", icon: "🏆" },
  { id: "weekly", label: "Weekly", icon: "🏅" },
];

const toastColors: Record<string, string> = {
  ok: "bg-[#00e87a] text-black",
  err: "bg-[#ff4d4d] text-white",
  warn: "bg-[#f0b429] text-black",
  info: "bg-[#1f1f1f] text-[#e0e0e0] border border-[#2a2a2a]",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const page: PageId = ROUTE_TO_PAGE[pathname] ?? "home";
  const {
    user, authChecked, toasts, theme, toggleTheme, liveItems, userStreak,
    navigate, signIn, signOut, switchAccount,
  } = useAppShell();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const navItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number; opacity: number; color: "green" | "purple" }>({ left: 0, width: 0, opacity: 0, color: "green" });
  const notifRef = useRef<HTMLDivElement>(null);
  const notifRefMob = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    function handlePointer(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setProfileOpen(false); }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [profileOpen]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setNotifOpen(false); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    function measure() {
      const activeKey = page === "admin" && user?.is_admin ? "admin" : page;
      const btn = navItemRefs.current[activeKey as string];
      const container = navRef.current;
      if (btn && container) {
        const btnRect = btn.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        setPillStyle({
          left: btnRect.left - containerRect.left,
          width: btnRect.width,
          opacity: 1,
          color: activeKey === "admin" ? "purple" : "green",
        });
      } else {
        setPillStyle(s => ({ ...s, opacity: 0 }));
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [page, user?.is_admin, authChecked]);

  function go(id: PageId) {
    setNotifOpen(false);
    setMobileMenuOpen(false);
    navigate(id);
  }

  const liveCount = liveItems.filter(i => i.status === "live").length;
  const upcomingCount = liveItems.filter(i => i.status === "upcoming").length;

  const bellDropdown = notifOpen && (
    <div className="absolute right-0 top-10 w-72 bg-[#0f0f0f] border border-[#1f1f1f] rounded-2xl shadow-2xl overflow-hidden z-[100]">
      <div className="px-4 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
        <span className="text-xs font-mono font-bold text-[#e0e0e0]">Events</span>
        <div className="flex items-center gap-1.5">
          {liveCount > 0 && <span className="text-[10px] font-mono bg-[#00e87a20] text-[#00e87a] px-2 py-0.5 rounded-lg">{liveCount} live</span>}
          {upcomingCount > 0 && <span className="text-[10px] font-mono bg-[#f0b42920] text-[#f0b429] px-2 py-0.5 rounded-lg">{upcomingCount} upcoming</span>}
        </div>
      </div>
      {liveItems.length === 0 ? (
        <div className="px-4 py-6 text-center text-[#666] font-mono text-xs">Nothing live or upcoming right now</div>
      ) : (
        <div className="divide-y divide-[#1a1a1a]">
          {liveItems.map(item => (
            <button key={item.id + item.status} onClick={() => { setNotifOpen(false); go(item.page); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#161616] transition-all text-left group">
              <span className="text-base shrink-0">{item.type === "arena" ? "🏆" : "🏅"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono font-bold text-[#e0e0e0] truncate">{item.label}</p>
                <p className="text-[10px] font-mono text-[#555] mt-0.5">
                  {item.type === "arena" ? "Arena Contest" : "Weekly Challenge"} ·{" "}
                  {item.status === "live" ? <span className="text-[#00e87a]">LIVE</span> : <span className="text-[#f0b429]">UPCOMING</span>}
                </p>
              </div>
              <span className="text-[10px] font-mono text-[#00e87a] group-hover:translate-x-0.5 transition-transform shrink-0">Go →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent">
      <AnimatedBackground />
      <GlobalSearch user={user} navigate={(id: string) => go(id as PageId)} open={searchOpen} onOpenChange={setSearchOpen} />

      <div className="fixed top-20 right-4 md:right-6 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`${toastColors[t.type]} px-4 py-3 rounded-xl font-mono text-sm shadow-2xl pointer-events-auto animate-slide-down backdrop-blur-sm`}>
            {t.msg}
          </div>
        ))}
      </div>

      <header className="sticky top-0 z-50 border-b" style={{
        borderColor: "var(--nav-border)",
        background: "linear-gradient(180deg, var(--nav-bg-top), var(--nav-bg-bottom))",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
        boxShadow: "var(--nav-shadow)",
      }}>
        <div className="w-full px-4 sm:px-8 lg:px-16 xl:px-24 flex items-center justify-between h-14">
          <button className="flex items-center gap-2.5 shrink-0 group" onClick={() => go("home")}>
            <img src="/logo.png" alt="BitByBit" className="w-8 h-8 object-contain" />
            <span className="font-display font-bold text-lg select-none tracking-tight">
              BitBy<span className="text-[#00e87a]">Bit</span>
            </span>
          </button>

          <nav ref={navRef} className="hidden md:flex items-center gap-0.5 relative">
            <span className={`absolute top-0 h-full rounded-xl border transition-all duration-300 ease-out pointer-events-none
              ${pillStyle.color === "purple" ? "bg-[#a78bfa15] border-[#a78bfa30]" : "bg-[#00e87a10] border-[#00e87a20]"}`}
              style={{ left: pillStyle.left, width: pillStyle.width, opacity: pillStyle.opacity }} />
            {NAV_ITEMS.map(item => (
              <button key={item.id} ref={el => { navItemRefs.current[item.id] = el; }} onClick={() => go(item.id)}
                className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm transition-colors duration-200
                  ${page === item.id ? "text-[#00e87a] font-bold" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
                <span className="text-xs opacity-70">{item.icon}</span>
                {item.label}
              </button>
            ))}
            {user?.is_admin && (
              <button ref={el => { navItemRefs.current["admin"] = el; }} onClick={() => go("admin")}
                className={`relative z-10 px-3.5 py-1.5 rounded-xl font-mono text-sm transition-colors duration-200
                  ${page === "admin" ? "text-[#a78bfa] font-bold" : "text-[var(--muted)] hover:text-[#a78bfa]"}`}>
                Admin
              </button>
            )}
          </nav>

          <div className="hidden md:flex items-center gap-1">
            <button onClick={() => setSearchOpen(true)} title="Search (⌘K)" aria-label="Search"
              className="p-2 text-[var(--muted)] hover:text-[var(--text)] transition-colors rounded-xl hover:bg-[var(--hover-overlay)]">
              <span className="text-base">🔍</span>
            </button>
            <button onClick={toggleTheme} title="Toggle theme" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="p-2 text-[var(--muted)] hover:text-[var(--text)] transition-colors rounded-xl hover:bg-[var(--hover-overlay)]">
              <span className="text-base">{theme === "dark" ? "☀️" : "🌙"}</span>
            </button>
            <div className="relative" ref={notifRef}>
              <button onClick={() => setNotifOpen(o => !o)} aria-label="Notifications"
                className="relative p-2 text-[var(--muted)] hover:text-[var(--text)] transition-colors rounded-xl hover:bg-[var(--hover-overlay)]">
                <span className="text-base">🔔</span>
                {liveItems.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#00e87a] animate-pulse" />}
              </button>
              {bellDropdown}
            </div>
            <div className="w-px h-5 bg-[var(--card)] mx-1" />
            {!authChecked ? (
              <div className="w-24 h-8 rounded-xl bg-[var(--card)] animate-pulse" />
            ) : user ? (
              <div className="relative" ref={profileRef}>
                <button onClick={() => setProfileOpen(o => !o)} aria-haspopup="menu" aria-expanded={profileOpen} aria-label="User menu"
                  className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-xl hover:bg-[var(--hover-overlay)] transition-colors">
                  <img src={`https://github.com/${user.github}.png?size=32`} alt={user.name}
                    className="w-7 h-7 rounded-full object-cover ring-1 ring-[#2a2a2a]"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className="text-xs font-mono text-[var(--muted)]">{user.name}</span>
                  {userStreak > 0 && (
                    <span title={`${userStreak}-day streak`}
                      className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#f0b429] bg-[#f0b42912] border border-[#f0b42925] rounded-full px-1.5 py-0.5">
                      🔥{userStreak}
                    </span>
                  )}
                  <span className={`text-[10px] text-[var(--muted)] transition-transform ${profileOpen ? "rotate-180" : ""}`}>▾</span>
                </button>
                {profileOpen && (
                  <div role="menu" className="absolute right-0 top-11 w-56 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden z-[100] animate-slide-down">
                    <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2.5">
                      <img src={`https://github.com/${user.github}.png?size=32`} alt={user.name}
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-[#2a2a2a]"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div className="min-w-0">
                        <p className="text-sm font-mono text-[var(--text)] truncate">{user.name}</p>
                        <p className="text-[10px] font-mono text-[var(--muted)] truncate">@{user.github}</p>
                      </div>
                    </div>
                    <button role="menuitem" onClick={() => { setProfileOpen(false); go("profile"); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-mono text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover-overlay)] transition-colors flex items-center gap-2.5">
                      <span className="text-sm">👤</span> My profile
                    </button>
                    <button role="menuitem" onClick={() => { setProfileOpen(false); go("profile"); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-mono text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover-overlay)] transition-colors flex items-center gap-2.5">
                      <span className="text-sm">📜</span> My certificates
                    </button>
                    <button role="menuitem" onClick={() => { setProfileOpen(false); switchAccount(); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-mono text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover-overlay)] transition-colors flex items-center gap-2.5">
                      <span className="text-sm">🔁</span> Switch account
                    </button>
                    <button role="menuitem" onClick={() => { setProfileOpen(false); signOut(); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-mono text-[var(--muted)] hover:text-[#ff4d4d] hover:bg-[#ff4d4d0a] transition-colors flex items-center gap-2.5 border-t border-[var(--border)]">
                      <span className="text-sm">⏻</span> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={signIn}
                className="px-4 py-1.5 rounded-xl font-mono text-sm bg-[#00e87a] text-black font-bold hover:bg-[#00ff88] transition-all shadow-[0_0_16px_rgba(0,232,122,0.2)]">
                Sign in with GitHub
              </button>
            )}
          </div>

          <div className="md:hidden flex items-center gap-1">
            <button onClick={() => setSearchOpen(true)} title="Search" aria-label="Search" className="p-2 text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              <span className="text-base">🔍</span>
            </button>
            <div className="relative" ref={notifRefMob}>
              <button onClick={() => setNotifOpen(o => !o)} aria-label="Notifications" className="relative p-2 text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                <span className="text-base">🔔</span>
                {liveItems.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#00e87a] animate-pulse" />}
              </button>
              {bellDropdown}
            </div>
            <button type="button" aria-label="Toggle menu" onClick={() => setMobileMenuOpen(o => !o)} className="p-2 text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              <div className={`w-5 h-0.5 bg-current mb-1.5 transition-all duration-200 ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <div className={`w-5 h-0.5 bg-current mb-1.5 transition-all duration-200 ${mobileMenuOpen ? "opacity-0" : ""}`} />
              <div className={`w-5 h-0.5 bg-current transition-all duration-200 ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--border)] bg-[var(--card)]/98 backdrop-blur pb-3">
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => go(item.id)}
                className={`w-full text-left px-5 py-3 font-mono text-sm transition-all flex items-center gap-3 relative
                  ${page === item.id ? "text-[#00e87a] bg-[#00e87a06]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
                {page === item.id && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#00e87a] rounded-full" />}
                <span className="w-5 text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
            {user?.is_admin && (
              <button onClick={() => go("admin")}
                className={`w-full text-left px-5 py-3 font-mono text-sm flex items-center gap-3
                  ${page === "admin" ? "text-[#a78bfa]" : "text-[var(--muted)] hover:text-[#a78bfa]"}`}>
                <span className="w-5">⚙</span> Admin
              </button>
            )}
            <button onClick={() => go("about")}
              className={`w-full text-left px-5 py-3 font-mono text-sm flex items-center gap-3
                ${page === "about" ? "text-[#00e87a]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
              <span className="w-5">ℹ</span> About
            </button>
            <button onClick={toggleTheme} className="w-full text-left px-5 py-3 font-mono text-sm flex items-center gap-3 text-[var(--muted)] hover:text-[var(--text)]">
              <span className="w-5">{theme === "dark" ? "☀️" : "🌙"}</span>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <div className="mt-2 border-t border-[var(--border)] pt-2 px-4">
              {!authChecked ? null : user ? (
                <div className="py-2">
                  <div className="flex items-center gap-2 mb-2.5">
                    <img src={`https://github.com/${user.github}.png?size=28`} alt={user.name} className="w-7 h-7 rounded-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <span className="text-sm font-mono text-[var(--text)] truncate max-w-[160px]">{user.name}</span>
                    {userStreak > 0 && (
                      <span title={`${userStreak}-day streak`}
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#f0b429] bg-[#f0b42912] border border-[#f0b42925] rounded-full px-1.5 py-0.5 shrink-0">
                        🔥{userStreak}
                      </span>
                    )}
                  </div>
                  <button onClick={() => go("profile")}
                    className="w-full text-center py-2 mb-2 rounded-xl font-mono text-xs border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border)] transition-colors">
                    👤 My profile
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setMobileMenuOpen(false); switchAccount(); }}
                      className="flex-1 text-center py-2 rounded-xl font-mono text-xs border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border)] transition-colors">
                      🔁 Switch account
                    </button>
                    <button onClick={() => { setMobileMenuOpen(false); signOut(); }}
                      className="flex-1 text-center py-2 rounded-xl font-mono text-xs border border-[var(--border)] text-[var(--muted)] hover:text-[#ff4d4d] hover:border-[#ff4d4d30] transition-colors">
                      ⏻ Sign out
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={signIn} className="w-full py-2.5 rounded-xl font-mono text-sm bg-[#00e87a] text-black font-bold">
                  Sign in with GitHub
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="w-full px-4 sm:px-8 lg:px-16 xl:px-24 h-8 flex items-center gap-1.5 text-[11px] font-mono">
          <span className="text-[#00e87a]">$</span>
          <span style={{ color: "var(--muted2)" }}>cd</span>
          <span style={{ color: "var(--text2)" }}>~/{NAV_ITEMS.find(i => i.id === page)?.label.toLowerCase() || page}</span>
          <span className="w-1.5 h-3 bg-[#00e87a] cursor-blink inline-block ml-0.5" />
        </div>
      </div>

      <main className="w-full px-4 sm:px-8 lg:px-16 xl:px-24 py-6 md:py-10">
        {children}
      </main>

      <footer className="border-t border-[#161616] py-5 px-4 sm:px-8 lg:px-16 xl:px-24">
        <div className="w-full flex items-center justify-between flex-wrap gap-3">
          <span className="text-[11px] font-mono text-[#555]">
            © {new Date().getFullYear()} Dhruv G Nayak · TeamCodeLocked · BMS College of Engineering
          </span>
          <div className="flex items-center gap-4">
            <a href="https://www.instagram.com/teamcodelocked/" target="_blank" rel="noopener noreferrer"
              className="text-[11px] font-mono text-[#666] hover:text-[#f0b429] transition-colors">
              Instagram
            </a>
            <button onClick={() => go("about")} className="text-[11px] font-mono text-[#666] hover:text-[#00e87a] transition-colors">About & Legal</button>
            <button onClick={() => go("privacy")} className="text-[11px] font-mono text-[#666] hover:text-[#00e87a] transition-colors">Privacy</button>
            <button onClick={() => go("terms")} className="text-[11px] font-mono text-[#666] hover:text-[#00e87a] transition-colors">Terms</button>
            <button onClick={() => go("refunds")} className="text-[11px] font-mono text-[#666] hover:text-[#00e87a] transition-colors">Refunds</button>
          </div>
        </div>
      </footer>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#080808]/98 backdrop-blur-xl border-t border-[#161616] flex z-40" style={{ boxShadow: "0 -1px 0 rgba(255,255,255,0.02)" }}>
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => go(item.id)}
            className={`flex-1 flex flex-col items-center py-3 gap-1 font-mono text-[10px] transition-all relative
              ${page === item.id ? "text-[#00e87a]" : "text-[#555] hover:text-[#aaa]"}`}>
            {page === item.id && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[#00e87a] rounded-full" />}
            <span className="text-base leading-none">{item.icon}</span>
            <span className={page === item.id ? "font-bold" : ""}>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="md:hidden h-16" />
    </div>
  );
}
