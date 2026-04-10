"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area
} from "recharts";
import { TrendingUp, Mail, Users, Zap, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import Link from "next/link";

const WEEKLY_DATA = [
  { day: "Mon", leads: 12, emails: 8 },
  { day: "Tue", leads: 34, emails: 28 },
  { day: "Wed", leads: 22, emails: 19 },
  { day: "Thu", leads: 67, emails: 55 },
  { day: "Fri", leads: 89, emails: 71 },
  { day: "Sat", leads: 45, emails: 37 },
  { day: "Sun", leads: 18, emails: 14 },
];

export default function DashboardPage() {
  const supabase = createClient();
  const [stats, setStats] = useState({
    totalLeads: 0,
    emailsSent: 0,
    credits: 100,
    openRate: 32.4,
    campaigns: 0,
    leadsToday: 0,
  });
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, leadsRes, emailsRes, campaignsRes] = await Promise.all([
        supabase.from("profiles").select("credits_balance, emails_sent_today").eq("id", user.id).single(),
        supabase.from("leads").select("id, created_at", { count: "exact" }).eq("user_id", user.id),
        supabase.from("email_logs").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase.from("campaigns").select("id", { count: "exact" }).eq("user_id", user.id),
      ]);

      const today = new Date().toISOString().split("T")[0];
      const leadsToday = leadsRes.data?.filter(l => l.created_at?.startsWith(today)).length ?? 0;

      setStats({
        totalLeads: leadsRes.count ?? 0,
        emailsSent: emailsRes.count ?? 0,
        credits: profileRes.data?.credits_balance ?? 0,
        openRate: 32.4,
        campaigns: campaignsRes.count ?? 0,
        leadsToday,
      });

      const { data: recent } = await supabase
        .from("leads")
        .select("id, company_name, email, niche, location, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6);

      setRecentLeads(recent ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const STAT_CARDS = [
    {
      label: "Total Leads",
      value: stats.totalLeads,
      icon: <Users size={20} />,
      change: "+18%",
      positive: true,
      accent: "#6c63ff",
      suffix: "",
    },
    {
      label: "Emails Sent",
      value: stats.emailsSent,
      icon: <Mail size={20} />,
      change: "+12%",
      positive: true,
      accent: "#00d4ff",
      suffix: "",
    },
    {
      label: "Open Rate",
      value: stats.openRate,
      icon: <TrendingUp size={20} />,
      change: "+2.1%",
      positive: true,
      accent: "#00e676",
      suffix: "%",
    },
    {
      label: "Remaining Credits",
      value: stats.credits,
      icon: <Zap size={20} />,
      change: stats.leadsToday > 0 ? `-${stats.leadsToday} today` : "No change",
      positive: false,
      accent: "#ffd600",
      suffix: "",
    },
  ];

  return (
    <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontSize: "1.6rem" }}>
            Command Center 🚀
          </h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/dashboard/emails">
            <button className="btn btn-primary" id="start-search-btn">
              <Mail size={16} /> New Campaign
            </button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {loading
          ? [1, 2, 3, 4].map(i => (
            <div key={i} className="stat-card" style={{ minHeight: 120 }}>
              <div style={{ height: 16, width: "60%", background: "var(--bg-elevated)", borderRadius: 4, marginBottom: 12, animation: "pulse-glow 1.5s infinite" }} />
              <div style={{ height: 32, width: "40%", background: "var(--bg-elevated)", borderRadius: 4 }} />
            </div>
          ))
          : STAT_CARDS.map((card) => (
            <div key={card.label} className="stat-card" style={{ "--accent-color": card.accent } as React.CSSProperties}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ padding: 8, background: `${card.accent}15`, borderRadius: 10, color: card.accent }}>
                  {card.icon}
                </div>
              </div>
              <div className="stat-value">
                {typeof card.value === "number" && card.suffix !== "%"
                  ? card.value.toLocaleString()
                  : card.value}{card.suffix}
              </div>
              <div className="stat-label">{card.label}</div>
              <div className={`stat-change ${card.positive ? "positive" : "negative"}`}>
                {card.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {card.change}
              </div>
            </div>
          ))}
      </div>

      {/* Charts Row */}
      <div className="two-col">
        {/* Leads + Emails Area Chart */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Weekly Activity</h3>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>Leads vs Emails sent</p>
            </div>
            <span className="badge badge-green">↑ +23%</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={WEEKLY_DATA} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6c63ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6c63ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="emailsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-muted)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "var(--text-primary)" }}
              />
              <Area type="monotone" dataKey="leads" stroke="#6c63ff" strokeWidth={2} fill="url(#leadsGrad)" name="Leads" />
              <Area type="monotone" dataKey="emails" stroke="#00d4ff" strokeWidth={2} fill="url(#emailsGrad)" name="Emails" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Quick Actions */}
        <div className="glass-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Quick Launch</h3>
          {[
            { href: "/dashboard/emails", icon: "✉️", title: "AI Email Sender", subtitle: "Upload Google Sheets & send personalized emails", color: "#6c63ff", id: "quick-campaigns" },
            { href: "/dashboard/settings", icon: "⚙️", title: "Settings", subtitle: "Manage account, integrations & credits", color: "#00e676", id: "quick-settings" },
          ].map(({ href, icon, title, subtitle, color, id }) => (
            <Link href={href} key={title}>
              <div
                id={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = color;
                  (e.currentTarget as HTMLElement).style.background = `${color}10`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                }}
              >
                <div style={{
                  width: 40, height: 40,
                  background: `${color}15`,
                  borderRadius: 10,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "1.2rem",
                  flexShrink: 0,
                }}>{icon}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{title}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</div>
                </div>
                <ArrowUpRight size={16} color="var(--text-muted)" style={{ marginLeft: "auto" }} />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Leads Table */}
      <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--bg-secondary)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Clock size={16} color="var(--text-muted)" />
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Recent Leads</h3>
          </div>
          <Link href="/dashboard/emails">
            <button className="btn btn-ghost btn-sm" id="view-all-leads-btn">AI Email Sender →</button>
          </Link>
        </div>

        {loading ? (
          <div suppressHydrationWarning style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            <div className="spinner spinner-lg" style={{ margin: "0 auto 16px" }} />
            Loading...
          </div>
        ) : recentLeads.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>✉️</div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No emails sent yet. Start your first AI campaign!</p>
            <Link href="/dashboard/emails">
              <button className="btn btn-primary" style={{ marginTop: 16 }} id="get-started-btn">Start Campaign →</button>
            </Link>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: "none", borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Niche</th>
                  <th>Location</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{lead.company_name || "—"}</td>
                    <td>
                      <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.82rem", color: "var(--accent-blue)" }}>
                        {lead.email || "No email found"}
                      </span>
                    </td>
                    <td><span className="badge badge-purple">{lead.niche || "—"}</span></td>
                    <td style={{ color: "var(--text-muted)" }}>{lead.location || "—"}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Credit Usage */}
      <div className="glass-card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Credit Usage</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
              {stats.credits} of {stats.credits + stats.totalLeads} credits remaining
            </p>
          </div>
          <Link href="/dashboard/settings">
            <button className="btn btn-primary btn-sm" id="buy-more-credits-btn">⚙️ Settings</button>
          </Link>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${Math.max(5, (stats.credits / (stats.credits + stats.totalLeads || 1)) * 100)}%` }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <span>Used: {stats.totalLeads} credits</span>
          <span>Available: {stats.credits} credits</span>
        </div>
      </div>
    </div>
  );
}
