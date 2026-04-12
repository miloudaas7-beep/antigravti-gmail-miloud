"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Bell, ChevronDown, User, Infinity, Globe, Sun, Moon, Menu, Mail, Plus, Check } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Language } from "@/lib/i18n/dictionaries";
import { useTheme } from "next-themes";
import { useSidebar } from "@/lib/SidebarContext";
import { useMultiAccount } from "@/lib/MultiAccountContext";
import toast from "react-hot-toast";

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
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccEmail, setNewAccEmail] = useState("");
  const [newAccPassword, setNewAccPassword] = useState("");
  
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { toggle } = useSidebar();
  const { accounts, activeAccountId, addAccount, switchAccount } = useMultiAccount();

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccEmail || !newAccPassword) return toast.error("Please fill in both fields");
    if (accounts.length >= 10) return toast.error("Maximum 10 accounts allowed");
    addAccount(newAccEmail);
    setNewAccEmail("");
    setNewAccPassword("");
    setShowAddAccount(false);
    setShowProfileMenu(false);
    toast.success("Account added and switched successfully!");
  };

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

        {/* User Avatar & Profile Dropdown */}
        <div style={{ position: "relative" }}>
          <div 
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} 
            id="user-menu"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="avatar" style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--accent-purple)" }} />
            ) : (
              <div style={{ width: 32, height: 32, background: "var(--gradient-purple)", borderRadius: "50%", display: "grid", placeItems: "center" }}>
                <User size={14} color="white" />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span className="user-name-label" style={{ fontSize: "0.8rem", color: "var(--text-secondary)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1 }}>
                {user?.name ?? "..."}
              </span>
              {activeAccountId && (
                <span style={{ fontSize: "0.65rem", color: "var(--accent-purple)", fontWeight: 600, marginTop: 2 }}>
                  Sender Active
                </span>
              )}
            </div>
            <ChevronDown size={14} color="var(--text-muted)" className="user-chevron" />
          </div>

          {showProfileMenu && (
            <>
              {/* Dropdown Menu */}
              <div style={{
                position: "absolute", top: "calc(100% + 10px)", right: 0, width: 260,
                background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-lg)", padding: "12px 0", zIndex: 300,
                boxShadow: "0 10px 40px rgba(0,0,0,0.4)"
              }}>
                <div style={{ padding: "0 16px 12px", borderBottom: "1px solid var(--border-subtle)", marginBottom: 8 }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{user?.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{user?.email}</div>
                </div>
                
                <div style={{ padding: "0 12px" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, margin: "8px 4px" }}>
                    Connected Sender Accounts ({accounts.length}/10)
                  </div>
                  
                  <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                    {accounts.length === 0 ? (
                      <div style={{ padding: "8px 4px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        No accounts connected yet.
                      </div>
                    ) : (
                      accounts.map(acc => (
                        <button
                          key={acc.id}
                          onClick={() => switchAccount(acc.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px",
                            background: activeAccountId === acc.id ? "rgba(108,99,255,0.1)" : "transparent",
                            border: "1px solid transparent", borderRadius: "var(--radius-sm)", cursor: "pointer",
                            textAlign: "left", transition: "all 0.2s"
                          }}
                        >
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-dark)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Mail size={12} color={activeAccountId === acc.id ? "var(--accent-purple)" : "var(--text-secondary)"} />
                          </div>
                          <span style={{ fontSize: "0.8rem", color: activeAccountId === acc.id ? "var(--text-primary)" : "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {acc.email}
                          </span>
                          {activeAccountId === acc.id && <Check size={14} color="var(--accent-purple)" />}
                        </button>
                      ))
                    )}
                  </div>

                  <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 8, paddingTop: 8 }}>
                    <button
                      onClick={() => { setShowAddAccount(true); setShowProfileMenu(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px",
                        background: "transparent", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)",
                        cursor: "pointer", color: "var(--text-secondary)", fontSize: "0.85rem", transition: "all 0.2s"
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent-purple)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-subtle)"}
                    >
                      <Plus size={14} /> Add new sender account
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showAddAccount && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="glass-card" style={{ width: "100%", maxWidth: 400, padding: 24, borderRadius: "var(--radius-lg)" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 8 }}>Add Gmail Sender</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 20 }}>
              Enter your Gmail address and Google App Password (not your main password) to connect this account.
            </p>
            <form onSubmit={handleAddAccount} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="input-group">
                <input type="email" className="input" placeholder="Sender Gmail Address" required value={newAccEmail} onChange={e => setNewAccEmail(e.target.value)} />
              </div>
              <div className="input-group">
                <input type="password" className="input" placeholder="Google App Password (16 chars)" required value={newAccPassword} onChange={e => setNewAccPassword(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddAccount(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Connect Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
