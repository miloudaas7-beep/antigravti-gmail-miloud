"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Bell, ChevronDown, User, Infinity, Globe, Sun, Moon, Menu } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Language } from "@/lib/i18n/dictionaries";
import { useTheme } from "next-themes";
import { useSidebar } from "@/lib/SidebarContext";

const FLAGS: Record<Language, string> = {
  en: "🇺🇸",
  ar: "🇸🇦",
  fr: "🇫🇷",
  de: "🇩🇪",
};

export default function TopNav() {
  const [user, setUser] = useState<{ email?: string; name?: string; avatar?: string } | null>(null);
  const supabase = createClient();
  const { lang, setLang, t } = useLanguage();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { toggle } = useSidebar();

  useEffect(() => {
    setMounted(true);
    const fetchProfile = async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      setUser({
        email: u.email ?? "",
        name: u.user_metadata?.full_name ?? u.email ?? "",
        avatar: u.user_metadata?.avatar_url ?? "",
      });
    };
    fetchProfile();
  }, []);

  const isDark = resolvedTheme === "dark";

  return (
    <header className="topnav">
      {/* Hamburger — mobile only */}
      <button
        className="hamburger-btn"
        onClick={toggle}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div style={{ flex: 1 }} />

      <div className="topnav-right">
        {/* Language Selector */}
        <div style={{ position: "relative" }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px" }}
            onClick={() => setShowLangMenu(!showLangMenu)}
          >
            <Globe size={16} color="var(--text-muted)" />
            <span style={{ fontSize: "1rem" }}>{FLAGS[lang]}</span>
            <ChevronDown size={14} color="var(--text-muted)" />
          </button>

          {showLangMenu && (
            <div style={{
              position: "absolute", top: "100%", right: 0, marginTop: 8,
              background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)", padding: 6, zIndex: 200, minWidth: 120,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
            }}>
              {(Object.keys(FLAGS) as Language[]).map((l) => (
                <button
                  key={l}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "8px 12px", borderRadius: "var(--radius-sm)",
                    background: lang === l ? "rgba(108,99,255,0.1)" : "transparent",
                    color: "var(--text-primary)", fontSize: "0.85rem", border: "none", cursor: "pointer",
                  }}
                  onClick={() => { setLang(l); setShowLangMenu(false); }}
                >
                  <span style={{ fontSize: "1.1rem" }}>{FLAGS[l]}</span>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          className="btn btn-ghost btn-icon btn-sm theme-toggle"
          aria-label="Toggle theme"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {mounted ? (
            isDark ? <Sun size={16} color="#ffd600" /> : <Moon size={16} color="#6c63ff" />
          ) : (
            <Sun size={16} />
          )}
        </button>

        {/* Free Plan Badge — hidden on very small screens */}
        <div suppressHydrationWarning className="credit-badge plan-badge" id="plan-display"
          style={{ background: "rgba(0,230,118,0.08)", borderColor: "rgba(0,230,118,0.25)", color: "var(--accent-green)", animation: "none" }}>
          <Infinity size={14} />
          <span suppressHydrationWarning>{t("topnav", "freePlan")}</span>
        </div>

        {/* Notifications */}
        <button className="btn btn-ghost btn-icon btn-sm" id="notifications-btn" style={{ position: "relative" }}>
          <Bell size={16} />
        </button>

        {/* User Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} id="user-menu">
          {user?.avatar ? (
            <img src={user.avatar} alt="avatar" style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--accent-purple)" }} />
          ) : (
            <div style={{ width: 32, height: 32, background: "var(--gradient-purple)", borderRadius: "50%", display: "grid", placeItems: "center" }}>
              <User size={14} color="white" />
            </div>
          )}
          <span className="user-name-label" style={{ fontSize: "0.8rem", color: "var(--text-secondary)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.name ?? "..."}
          </span>
          <ChevronDown size={14} color="var(--text-muted)" className="user-chevron" />
        </div>
      </div>
    </header>
  );
}
