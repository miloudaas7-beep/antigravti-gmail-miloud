"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Mail, Settings, Zap, LogOut, Sparkles, X
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useSidebar } from "@/lib/SidebarContext";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLanguage();
  const { isOpen, close } = useSidebar();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getNavItems = () => [
    {
      section: "Core",
      items: [
        { href: "/dashboard", label: t("sidebar", "dashboard"), icon: LayoutDashboard, id: "nav-dashboard" },
      ],
    },
    {
      section: "Campaigns",
      items: [
        { href: "/dashboard/emails", label: t("sidebar", "emailCampaigns"), icon: Mail, id: "nav-emails" },
        { href: "/dashboard/campaign", label: t("sidebar", "hyperCampaign"), icon: Sparkles, id: "nav-campaign" },
      ],
    },
    {
      section: "Account",
      items: [
        { href: "/dashboard/settings", label: t("sidebar", "settings"), icon: Settings, id: "nav-settings" },
      ],
    },
  ];

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar${isOpen ? " sidebar-open" : ""}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Zap size={20} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.02em" }}>
              Smart<span style={{ background: "linear-gradient(135deg,#6c63ff,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Scout</span>
            </div>
            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>AI Platform</div>
          </div>
          {/* Close button — only appears on mobile */}
          <button
            className="sidebar-close-btn"
            onClick={close}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {getNavItems().map(({ section, items }) => (
            <div key={section}>
              <div className="sidebar-section-label">{section}</div>
              {items.map(({ href, label, icon: Icon, id }) => {
                const isActive = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    id={id}
                    className={`nav-item${isActive ? " active" : ""}`}
                    onClick={close}
                  >
                    <Icon size={16} className="nav-icon" />
                    {label}
                    {href === "/dashboard/campaign" && (
                      <span className="badge badge-purple" style={{ marginLeft: "auto", fontSize: "0.6rem" }}>NEW</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: "12px", borderTop: "1px solid var(--border-subtle)" }}>
          <button
            id="sidebar-logout-btn"
            onClick={handleLogout}
            className="nav-item"
            style={{ width: "100%", background: "none", border: "1px solid transparent", cursor: "pointer" }}
          >
            <LogOut size={16} className="nav-icon" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
