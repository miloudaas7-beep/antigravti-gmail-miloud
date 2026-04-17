"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Archive, Clock, Send, AlertCircle, CheckCircle2,
  RefreshCw, Mail, Building2, Calendar, Loader,
  Timer, Inbox, TrendingUp, XCircle, Wifi, WifiOff
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

// ─── Types ──────────────────────────────────────────────────────────────────
interface QueueItem {
  id: string;
  status: "pending" | "sent" | "failed";
  scheduled_at: string;
  sent_at: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  lead: {
    id: string;
    email: string;
    company_name: string | null;
    location: string | null;
  } | null;
  campaign: {
    id: string;
    name: string;
    subject: string | null;
  } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatCountdown(ms: number): { text: string; urgency: "normal" | "warn" | "critical" | "overdue" } {
  if (ms <= 0) return { text: "00:00:00", urgency: "overdue" };

  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  const text = `${pad(h)}:${pad(m)}:${pad(s)}`;

  let urgency: "normal" | "warn" | "critical" | "overdue" = "normal";
  if (ms < 5 * 60 * 1000) urgency = "critical";       // < 5 min
  else if (ms < 60 * 60 * 1000) urgency = "warn";     // < 1 hour

  return { text, urgency };
}

function formatScheduledDay(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowMidnight = new Date(todayMidnight.getTime() + 86400000);
  const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dMidnight.getTime() === todayMidnight.getTime()) return "Today";
  if (dMidnight.getTime() === tomorrowMidnight.getTime()) return "Tomorrow";

  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Countdown component (isolated so only it re-renders every second) ───────
function CountdownTimer({ scheduledAt, serverDelta }: { scheduledAt: string; serverDelta: number }) {
  const [ms, setMs] = useState<number>(() => {
    const target = new Date(scheduledAt).getTime();
    const serverNow = Date.now() + serverDelta;
    return target - serverNow;
  });

  useEffect(() => {
    const id = setInterval(() => {
      const target = new Date(scheduledAt).getTime();
      const serverNow = Date.now() + serverDelta;
      setMs(target - serverNow);
    }, 1000);
    return () => clearInterval(id);
  }, [scheduledAt, serverDelta]);

  const { text, urgency } = formatCountdown(ms);

  const colors: Record<string, string> = {
    normal: "#6c63ff",
    warn: "#f59e0b",
    critical: "#ef4444",
    overdue: "#8b5cf6",
  };

  const glows: Record<string, string> = {
    normal: "rgba(108,99,255,0.3)",
    warn: "rgba(245,158,11,0.35)",
    critical: "rgba(239,68,68,0.4)",
    overdue: "rgba(139,92,246,0.35)",
  };

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "10px 22px",
          borderRadius: 12,
          background: `rgba(${urgency === "critical" ? "239,68,68" : urgency === "warn" ? "245,158,11" : "108,99,255"},0.08)`,
          border: `1.5px solid ${colors[urgency]}`,
          boxShadow: `0 0 16px ${glows[urgency]}`,
          fontFamily: "'Courier New', monospace",
          fontSize: "1.65rem",
          fontWeight: 800,
          color: colors[urgency],
          letterSpacing: "0.06em",
          transition: "color 0.5s, border-color 0.5s, box-shadow 0.5s",
          animation: urgency === "critical" ? "pulse 1s ease-in-out infinite" : "none",
        }}
      >
        <Timer size={18} style={{ flexShrink: 0, opacity: 0.8 }} />
        {text}
      </div>
      <div
        style={{
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          marginTop: 5,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {urgency === "overdue" ? "Processing soon..." : "Time Remaining"}
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: "pending" | "sent" | "failed" }) {
  const cfg = {
    pending: { label: "SCHEDULED", bg: "rgba(108,99,255,0.12)", border: "rgba(108,99,255,0.4)", color: "#6c63ff", dot: true },
    sent:    { label: "SENT",      bg: "rgba(0,230,118,0.12)",   border: "rgba(0,230,118,0.4)",   color: "#00e676", dot: false },
    failed:  { label: "FAILED",    bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.4)",   color: "#ef4444", dot: false },
  }[status];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 20,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        whiteSpace: "nowrap",
      }}
    >
      {cfg.dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: cfg.color,
            animation: "pulse 1.5s ease-in-out infinite",
            flexShrink: 0,
          }}
        />
      )}
      {!cfg.dot && status === "sent" && <CheckCircle2 size={10} />}
      {!cfg.dot && status === "failed" && <XCircle size={10} />}
      {cfg.label}
    </span>
  );
}

// ─── Queue Card ───────────────────────────────────────────────────────────────
function QueueCard({ item, serverDelta }: { item: QueueItem; serverDelta: number }) {
  const dayLabel = formatScheduledDay(item.scheduled_at);
  const timeLabel = formatTime(item.scheduled_at);
  const companyName = item.lead?.company_name || "—";
  const email = item.lead?.email || "—";
  const subject = item.campaign?.subject || null;
  const campaignName = item.campaign?.name || "Campaign";

  return (
    <div
      style={{
        background: "var(--bg-card, rgba(255,255,255,0.03))",
        border: item.status === "sent"
          ? "1px solid rgba(0,230,118,0.25)"
          : item.status === "failed"
          ? "1px solid rgba(239,68,68,0.25)"
          : "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
        borderRadius: 16,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        transition: "border-color 0.4s, box-shadow 0.3s",
        backdropFilter: "blur(12px)",
        boxShadow: item.status === "pending"
          ? "0 4px 24px rgba(108,99,255,0.06)"
          : "none",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "rgba(108,99,255,0.12)",
              border: "1px solid rgba(108,99,255,0.25)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Building2 size={17} color="#6c63ff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: "0.95rem",
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 200,
              }}
            >
              {companyName}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 1 }}>
              {campaignName}
            </div>
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>

      {/* Email + Subject */}
      <div
        style={{
          padding: "12px 14px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.82rem" }}>
          <Mail size={13} color="var(--accent-blue, #00d4ff)" style={{ flexShrink: 0 }} />
          <span style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {email}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: "0.78rem" }}>
          <span style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 1 }}>📝</span>
          <span style={{ color: "var(--text-muted)", fontStyle: subject ? "normal" : "italic", lineHeight: 1.4 }}>
            {subject || "AI will generate subject at send time"}
          </span>
        </div>
      </div>

      {/* Day + Time */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "var(--text-muted)" }}>
        <Calendar size={13} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 600, color: "var(--text-secondary, rgba(255,255,255,0.6))" }}>
          {dayLabel}
        </span>
        <span>·</span>
        <span>{timeLabel}</span>
      </div>

      {/* Countdown or sent info */}
      {item.status === "pending" && (
        <CountdownTimer scheduledAt={item.scheduled_at} serverDelta={serverDelta} />
      )}

      {item.status === "sent" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            background: "rgba(0,230,118,0.08)",
            border: "1px solid rgba(0,230,118,0.25)",
            borderRadius: 10,
            fontSize: "0.82rem",
            color: "#00e676",
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={15} />
          Sent {item.sent_at ? formatTime(item.sent_at) : ""}
          {item.sent_at && ` · ${formatScheduledDay(item.sent_at)}`}
        </div>
      )}

      {item.status === "failed" && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 16px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 10,
            fontSize: "0.78rem",
            color: "#f87171",
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{item.error_message || "Send failed — retry scheduled"}</span>
        </div>
      )}

      {/* Retry indicator */}
      {item.status === "pending" && item.retry_count > 0 && (
        <div style={{ fontSize: "0.7rem", color: "#f59e0b", display: "flex", alignItems: "center", gap: 5 }}>
          <RefreshCw size={11} />
          Retrying ({item.retry_count}/3)
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ArchivePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serverDelta, setServerDelta] = useState(0); // client offset vs server
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "sent" | "failed">("all");
  const supabase = createClient();
  const channelRef = useRef<any>(null);

  // Sync server time once on mount
  const syncServerTime = useCallback(async () => {
    try {
      const clientBefore = Date.now();
      const res = await fetch("/api/server-time");
      const clientAfter = Date.now();
      const { serverTime } = await res.json();
      const rtt = clientAfter - clientBefore;
      const serverMs = new Date(serverTime).getTime();
      // Estimate server time at request midpoint
      const delta = serverMs + rtt / 2 - clientAfter;
      setServerDelta(delta);
    } catch {
      // If fails, assume no delta (client time is close enough)
    }
  }, []);

  // Fetch queue data
  const fetchQueue = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const res = await fetch("/api/campaign/queue");
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to load queue");
        return;
      }
      const { queue: data } = await res.json();
      setQueue(data);
      setLastUpdated(new Date());
    } catch {
      toast.error("Network error loading queue");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Subscribe to Supabase Realtime for live status updates
  const subscribeRealtime = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel("campaign_leads_archive")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaign_leads",
        },
        (payload) => {
          console.log("[ARCHIVE] Realtime event:", payload.eventType);
          // When cron marks something as sent/failed, refresh the queue
          fetchQueue(true);
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;
  }, [supabase, fetchQueue]);

  // Mount
  useEffect(() => {
    syncServerTime();
    fetchQueue();
    subscribeRealtime();

    // Re-sync server time every 10 minutes
    const syncInterval = setInterval(syncServerTime, 10 * 60 * 1000);

    return () => {
      clearInterval(syncInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [syncServerTime, fetchQueue, subscribeRealtime, supabase]);

  // Derived stats
  const pending = queue.filter((q) => q.status === "pending");
  const sent = queue.filter((q) => q.status === "sent");
  const failed = queue.filter((q) => q.status === "failed");

  const filtered = filter === "all" ? queue : queue.filter((q) => q.status === filter);

  // Sort: pending by scheduled_at asc, sent/failed after
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  });

  return (
    <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 28 }}>

      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1
            className="page-title"
            style={{ fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}
          >
            <Archive size={26} color="#6c63ff" />
            Campaign Archive
          </h1>
          <p className="page-subtitle">
            Live countdown monitor — emails send automatically when the timer hits zero
          </p>
        </div>

        {/* Top-right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Realtime indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 20,
              background: realtimeConnected ? "rgba(0,230,118,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${realtimeConnected ? "rgba(0,230,118,0.3)" : "rgba(239,68,68,0.3)"}`,
              fontSize: "0.72rem",
              color: realtimeConnected ? "#00e676" : "#ef4444",
              fontWeight: 600,
            }}
          >
            {realtimeConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {realtimeConnected ? "Live" : "Reconnecting..."}
          </div>

          {/* Refresh button */}
          <button
            onClick={() => fetchQueue(false)}
            disabled={isLoading || isRefreshing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: "var(--radius-md, 10px)",
              background: "rgba(108,99,255,0.1)",
              border: "1px solid rgba(108,99,255,0.3)",
              color: "#6c63ff",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {[
          { label: "Total Scheduled", value: queue.length, icon: Inbox, color: "#6c63ff", bg: "rgba(108,99,255,0.1)", border: "rgba(108,99,255,0.25)" },
          { label: "Pending", value: pending.length, icon: Clock, color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)" },
          { label: "Sent (7d)", value: sent.length, icon: Send, color: "#00e676", bg: "rgba(0,230,118,0.08)", border: "rgba(0,230,118,0.25)" },
          { label: "Failed", value: failed.length, icon: AlertCircle, color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)" },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div
            key={label}
            style={{
              padding: "18px 20px",
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: `${color}20`,
                border: `1px solid ${color}40`,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={18} color={color} />
            </div>
            <div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Server time + Last updated ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 18px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10,
          fontSize: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
        <ServerClock serverDelta={serverDelta} />
        {lastUpdated && (
          <span>Last refreshed: {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>

      {/* ── Filter tabs ── */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["all", "pending", "sent", "failed"] as const).map((f) => {
          const counts: Record<string, number> = {
            all: queue.length,
            pending: pending.length,
            sent: sent.length,
            failed: failed.length,
          };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "7px 16px",
                borderRadius: 20,
                border: filter === f ? "1px solid rgba(108,99,255,0.6)" : "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                background: filter === f ? "rgba(108,99,255,0.15)" : "transparent",
                color: filter === f ? "#6c63ff" : "var(--text-muted)",
                fontSize: "0.8rem",
                fontWeight: filter === f ? 700 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "all 0.2s",
              }}
            >
              {f} ({counts[f]})
            </button>
          );
        })}
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 80,
            gap: 16,
          }}
        >
          <Loader size={36} color="#6c63ff" className="animate-spin" />
          <p style={{ color: "var(--text-muted)" }}>Loading your scheduled emails...</p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!isLoading && sorted.length === 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 40px",
            gap: 16,
            background: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(255,255,255,0.1)",
            borderRadius: 20,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(108,99,255,0.1)",
              border: "1px solid rgba(108,99,255,0.25)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Archive size={30} color="#6c63ff" />
          </div>
          <div>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>
              {filter === "all" ? "No scheduled emails yet" : `No ${filter} emails`}
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", maxWidth: 360, lineHeight: 1.6 }}>
              {filter === "all"
                ? "Use the AI Email Campaign Builder or Hyper Campaign to schedule emails. They will appear here with live countdowns."
                : `Switch to \"All\" to see the full queue.`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <a
              href="/dashboard/emails"
              style={{
                padding: "9px 18px",
                borderRadius: 10,
                background: "rgba(108,99,255,0.15)",
                border: "1px solid rgba(108,99,255,0.4)",
                color: "#6c63ff",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Mail size={14} /> Email Builder
            </a>
            <a
              href="/dashboard/campaign"
              style={{
                padding: "9px 18px",
                borderRadius: 10,
                background: "rgba(168,85,247,0.12)",
                border: "1px solid rgba(168,85,247,0.35)",
                color: "#a855f7",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <TrendingUp size={14} /> Hyper Campaign
            </a>
          </div>
        </div>
      )}

      {/* ── Cards grid ── */}
      {!isLoading && sorted.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 20,
          }}
        >
          {sorted.map((item) => (
            <QueueCard key={item.id} item={item} serverDelta={serverDelta} />
          ))}
        </div>
      )}

      {/* Footer note */}
      {!isLoading && pending.length > 0 && (
        <div
          style={{
            padding: "12px 18px",
            background: "rgba(108,99,255,0.06)",
            border: "1px solid rgba(108,99,255,0.2)",
            borderRadius: 10,
            fontSize: "0.78rem",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Clock size={13} color="#6c63ff" />
          <span>
            <strong style={{ color: "#6c63ff" }}>{pending.length} email{pending.length !== 1 ? "s" : ""}</strong> waiting to be sent.
            The Vercel Cron job processes them every minute — no action needed on your part.
            The cards will automatically update when sent.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Server Clock (ticks every second, isolated component) ───────────────────
function ServerClock({ serverDelta }: { serverDelta: number }) {
  const [now, setNow] = useState(() => new Date(Date.now() + serverDelta));

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date(Date.now() + serverDelta));
    }, 1000);
    return () => clearInterval(id);
  }, [serverDelta]);

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <Clock size={12} />
      Server time: <strong style={{ color: "var(--text-primary)" }}>{now.toUTCString().replace(" GMT", " UTC")}</strong>
    </span>
  );
}
