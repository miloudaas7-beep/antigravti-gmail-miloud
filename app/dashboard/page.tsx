"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area
} from "recharts";
import { TrendingUp, Mail, Users, Zap, ArrowUpRight, ArrowDownRight, Clock, Calendar } from "lucide-react";
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
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [chartData, setChartData] = useState<any[]>([]);

  const [stats, setStats] = useState({
    totalLeads: 0,
    emailsSent: 0,
    credits: "∞",
    openRate: "0.0",
    campaigns: 0,
    leadsToday: 0,
    leadsChange: 0,
    emailsChange: 0,
  });
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      let startDate = new Date();
      if (period === "daily") startDate.setDate(now.getDate() - 1);
      else if (period === "weekly") startDate.setDate(now.getDate() - 7);
      else if (period === "monthly") startDate.setDate(now.getDate() - 30);

      const [leadsRes, emailsRes] = await Promise.all([
        supabase.from("leads").select("id, created_at").eq("user_id", user.id).gte("created_at", startDate.toISOString()),
        supabase.from("email_logs").select("id, status, sent_at").eq("user_id", user.id).gte("sent_at", startDate.toISOString())
      ]);

      const leads = leadsRes.data || [];
      const emails = emailsRes.data || [];

      // Calculate totals
      const totalLeads = leads.length;
      const emailsSent = emails.length;
      
      // Compute Open Rate
      const openedEmails = emails.filter(e => e.status === "opened").length;
      const openRate = emailsSent > 0 ? ((openedEmails / emailsSent) * 100).toFixed(1) : "0.0";

      // Compute graph data
      let aggregatedData: Record<string, { day: string; leads: number; emails: number; dateStr: string }> = {};
      
      const formatGroup = (d: string) => {
        const dateObj = new Date(d);
        if (period === "daily") {
          return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      };

      const daysArray = [ ...Array(period === 'daily' ? 24 : period === 'weekly' ? 7 : 30) ].map((_, i) => {
        const d = new Date(now);
        if (period === 'daily') d.setHours(now.getHours() - (23 - i));
        else d.setDate(now.getDate() - ((period === 'weekly' ? 6 : 29) - i));
        
        const key = period === 'daily' 
            ? `${d.getMonth()}-${d.getDate()}-${d.getHours()}`
            : `${d.getMonth()}-${d.getDate()}`;

        aggregatedData[key] = {
           day: period === 'daily' ? `${d.getHours()}:00` : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
           leads: 0,
           emails: 0,
           dateStr: d.toISOString()
        };
        return key;
      });

      leads.forEach(l => {
          const d = new Date(l.created_at);
          const key = period === 'daily' ? `${d.getMonth()}-${d.getDate()}-${d.getHours()}` : `${d.getMonth()}-${d.getDate()}`;
          if (aggregatedData[key]) aggregatedData[key].leads++;
      });
      emails.forEach(e => {
          const d = new Date(e.sent_at);
          const key = period === 'daily' ? `${d.getMonth()}-${d.getDate()}-${d.getHours()}` : `${d.getMonth()}-${d.getDate()}`;
          if (aggregatedData[key]) aggregatedData[key].emails++;
      });

      const finalChartData = daysArray.map(k => aggregatedData[k]);

      setStats({
        totalLeads,
        emailsSent,
        credits: "∞",
        openRate,
        campaigns: 0,
        leadsToday: leads.filter(l => new Date(l.created_at).getDate() === now.getDate()).length,
        leadsChange: totalLeads > 0 ? 12 : 0, // Placeholder
        emailsChange: emailsSent > 0 ? 8 : 0, // Placeholder
      });
      setChartData(finalChartData);

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
  }, [period, supabase]);

  const STAT_CARDS = [
    {
      label: "Total Leads",
      value: stats.totalLeads,
      icon: <Users size={20} />,
      change: `+${stats.leadsChange}%`,
      positive: stats.leadsChange >= 0,
      accent: "#6c63ff",
      suffix: "",
    },
    {
      label: "Emails Sent",
      value: stats.emailsSent,
      icon: <Mail size={20} />,
      change: `+${stats.emailsChange}%`,
      positive: stats.emailsChange >= 0,
      accent: "#00d4ff",
      suffix: "",
    },
    {
      label: "Open Rate",
      value: stats.openRate,
      icon: <TrendingUp size={20} />,
      change: `Live`,
      positive: true,
      accent: "#00e676",
      suffix: "%",
    },
    {
      label: "Remaining Credits",
      value: "∞",
      icon: <Zap size={20} />,
      change: "Unlimited Free Plan",
      positive: true,
      accent: "#a855f7",
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
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* Time Filter Toggle */}
          <div style={{
            display: "flex", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", 
            borderRadius: "var(--radius-md)", overflow: "hidden", padding: 2
          }}>
            {["daily", "weekly", "monthly"].map(p => (
               <button 
                 key={p}
                 onClick={() => setPeriod(p as any)}
                 style={{
                   padding: "6px 14px", fontSize: "0.8rem", fontWeight: 600, border: "none",
                   background: period === p ? "var(--bg-secondary)" : "transparent",
                   color: period === p ? "var(--text-primary)" : "var(--text-muted)",
                   borderRadius: "var(--radius-md)", cursor: "pointer", transition: "all 0.2s"
                 }}
               >
                 {p.charAt(0).toUpperCase() + p.slice(1)}
               </button>
            ))}
          </div>

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
            <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
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
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={16} color="var(--accent-purple)" />
              Account Usage
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
              Free Plan — Unlimited Credits
            </p>
          </div>
          <Link href="/dashboard/settings">
            <button className="btn btn-primary btn-sm" id="buy-more-credits-btn">⚙️ Settings</button>
          </Link>
        </div>
        <div className="progress-bar" style={{ background: "rgba(168,85,247,0.15)" }}>
          <div
            className="progress-fill"
            style={{ width: `100%`, background: "linear-gradient(90deg, #6c63ff, #a855f7)", borderRadius: "var(--radius-full)" }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <span>Generated: ∞ leads</span>
          <span style={{color: "var(--accent-purple)", fontWeight: 600}}>Always Free</span>
        </div>
      </div>
    </div>
  );
}
