"use client";

import { useState, useEffect } from "react";
import {
  Activity, RefreshCw, Loader, Send, Pencil, CheckCircle,
  X, MessageSquare, TrendingUp, TrendingDown, HelpCircle,
  Mail, ChevronDown, Clock, User
} from "lucide-react";
import toast from "react-hot-toast";

type Sentiment = "Interested/Positive" | "Not Interested/Negative" | "General Inquiry";

interface Reply {
  threadId: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  date: string;
  snippet: string;
  fullBody: string;
  sentiment: Sentiment;
  suggestedReply: string;
  messageCount: number;
}

const SENTIMENT_CONFIG: Record<Sentiment, { label: string; color: string; bg: string; border: string; icon: any }> = {
  "Interested/Positive": {
    label: "Positive",
    color: "#00e676",
    bg: "rgba(0,230,118,0.1)",
    border: "rgba(0,230,118,0.3)",
    icon: TrendingUp,
  },
  "Not Interested/Negative": {
    label: "Negative",
    color: "#ff5252",
    bg: "rgba(255,82,82,0.1)",
    border: "rgba(255,82,82,0.3)",
    icon: TrendingDown,
  },
  "General Inquiry": {
    label: "Inquiry",
    color: "#ffd600",
    bg: "rgba(255,214,0,0.1)",
    border: "rgba(255,214,0,0.3)",
    icon: HelpCircle,
  },
};

export default function EmailTrackingPage() {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReply, setSelectedReply] = useState<Reply | null>(null);
  const [editedSuggestedReply, setEditedSuggestedReply] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [filter, setFilter] = useState<"all" | Sentiment>("all");

  const loadReplies = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tracking/replies");
      const data = await res.json();
      if (!res.ok) {
        if (data.needsAuth) {
          setError("Gmail not connected. Go to Settings to connect your Google account.");
        } else {
          setError(data.error || "Failed to load replies.");
        }
        return;
      }
      setReplies(data.replies);
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadReplies(); }, []);

  const openReply = (reply: Reply) => {
    setSelectedReply(reply);
    setEditedSuggestedReply(reply.suggestedReply);
  };

  const sendReply = async () => {
    if (!selectedReply) return;
    setIsSending(true);
    try {
      const res = await fetch("/api/campaign/send-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selectedReply.fromEmail,
          subject: `Re: ${selectedReply.subject}`,
          body: editedSuggestedReply,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Reply sent to ${selectedReply.fromEmail}!`);
      setSelectedReply(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to send reply.");
    } finally {
      setIsSending(false);
    }
  };

  const stats = {
    total: replies.length,
    positive: replies.filter((r) => r.sentiment === "Interested/Positive").length,
    negative: replies.filter((r) => r.sentiment === "Not Interested/Negative").length,
    inquiry: replies.filter((r) => r.sentiment === "General Inquiry").length,
  };

  const filtered = filter === "all" ? replies : replies.filter((r) => r.sentiment === filter);

  return (
    <div style={{ width: "100%", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
            <Activity size={26} color="#00e676" /> Email Tracking
          </h1>
          <p className="page-subtitle">
            Monitor client replies from your campaigns — AI classifies sentiment and drafts responses
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadReplies} disabled={isLoading}>
          {isLoading ? <Loader size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {isLoading ? "Scanning..." : "Refresh"}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Total Replies", value: stats.total, color: "#6c63ff", icon: MessageSquare },
          { label: "Positive 🎉", value: stats.positive, color: "#00e676", icon: TrendingUp },
          { label: "Negative", value: stats.negative, color: "#ff5252", icon: TrendingDown },
          { label: "Inquiry", value: stats.inquiry, color: "#ffd600", icon: HelpCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="glass-card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, display: "grid", placeItems: "center", border: `1px solid ${color}33`, flexShrink: 0 }}>
              <Icon size={20} color={color} />
            </div>
            <div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {([
          { key: "all", label: `All (${stats.total})` },
          { key: "Interested/Positive", label: `✅ Positive (${stats.positive})` },
          { key: "General Inquiry", label: `❓ Inquiry (${stats.inquiry})` },
          { key: "Not Interested/Negative", label: `❌ Negative (${stats.negative})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: "7px 16px", borderRadius: "var(--radius-md)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
              background: filter === key ? "rgba(108,99,255,0.15)" : "var(--bg-secondary)",
              border: `1px solid ${filter === key ? "rgba(108,99,255,0.4)" : "var(--border-subtle)"}`,
              color: filter === key ? "var(--accent-purple)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{ padding: 16, background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.25)", borderRadius: "var(--radius-md)", color: "#ff5252", display: "flex", alignItems: "center", gap: 10 }}>
          <X size={16} />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={loadReplies}>Retry</button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <div className="glass-card" style={{ padding: 60, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(0,230,118,0.1)", border: "2px solid rgba(0,230,118,0.3)", display: "grid", placeItems: "center" }}>
            <Loader size={22} color="#00e676" className="animate-spin" />
          </div>
          <div>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Scanning Gmail for replies...</p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>AI is analyzing the sentiment of each message</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="glass-card" style={{ padding: 60, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-muted)" }}>
          <Mail size={40} />
          <p style={{ fontWeight: 600, fontSize: "1rem" }}>No replies found</p>
          <p style={{ fontSize: "0.83rem" }}>
            {filter === "all"
              ? "No client replies detected in your Gmail inbox yet. Replies appear here after you send campaigns."
              : `No "${filter}" replies found. Try changing the filter.`}
          </p>
        </div>
      )}

      {/* Reply Table */}
      {!isLoading && filtered.length > 0 && (
        <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 700, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 8 }}>
            📥 Client Replies ({filtered.length})
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)" }}>
                  {["Sender", "Subject", "Reply Preview", "Sentiment", "Date", "Action"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((reply) => {
                  const cfg = SENTIMENT_CONFIG[reply.sentiment];
                  const Icon = cfg.icon;
                  return (
                    <tr key={reply.threadId} style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Sender */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--gradient-purple)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                            <User size={14} color="white" />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{reply.fromName || reply.fromEmail}</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{reply.fromEmail}</div>
                          </div>
                        </div>
                      </td>
                      {/* Subject */}
                      <td style={{ padding: "14px 16px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                        {reply.subject}
                      </td>
                      {/* Snippet */}
                      <td style={{ padding: "14px 16px", maxWidth: 240, color: "var(--text-muted)", fontSize: "0.79rem", lineHeight: 1.5 }}>
                        <div style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {reply.snippet}
                        </div>
                      </td>
                      {/* Sentiment badge */}
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px",
                          borderRadius: "var(--radius-md)", fontSize: "0.72rem", fontWeight: 700,
                          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                          whiteSpace: "nowrap"
                        }}>
                          <Icon size={11} /> {cfg.label}
                        </span>
                      </td>
                      {/* Date */}
                      <td style={{ padding: "14px 16px", color: "var(--text-muted)", fontSize: "0.76rem", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock size={11} />
                          {new Date(reply.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </div>
                      </td>
                      {/* Action */}
                      <td style={{ padding: "14px 16px" }}>
                        <button
                          style={{
                            padding: "6px 14px", borderRadius: "var(--radius-sm)", cursor: "pointer",
                            background: "rgba(108,99,255,0.1)", border: "1px solid rgba(108,99,255,0.3)",
                            color: "var(--accent-purple)", fontSize: "0.76rem", fontWeight: 600,
                            display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap"
                          }}
                          onClick={() => openReply(reply)}
                        >
                          <Pencil size={11} /> View &amp; Reply
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Reply Modal ── */}
      {selectedReply && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)", width: "100%", maxWidth: 680,
            display: "flex", flexDirection: "column", gap: 0,
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)", maxHeight: "90vh", overflow: "hidden",
          }}>
            {/* Modal header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>{selectedReply.fromName || selectedReply.fromEmail}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{selectedReply.fromEmail} · {selectedReply.subject}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {(() => {
                  const cfg = SENTIMENT_CONFIG[selectedReply.sentiment];
                  const Icon = cfg.icon;
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: "var(--radius-md)", fontSize: "0.72rem", fontWeight: 700, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                      <Icon size={11} /> {cfg.label}
                    </span>
                  );
                })()}
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelectedReply(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div style={{ padding: 24, overflow: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Their message */}
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Their Message</div>
                <div style={{ padding: 16, background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", fontSize: "0.85rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>
                  {selectedReply.fullBody}
                </div>
              </div>

              {/* AI suggested reply */}
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--accent-purple)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Pencil size={11} /> AI Suggested Reply (Editable)
                </div>
                <textarea
                  className="input"
                  rows={7}
                  value={editedSuggestedReply}
                  onChange={(e) => setEditedSuggestedReply(e.target.value)}
                  style={{ lineHeight: 1.7, fontSize: "0.85rem", resize: "vertical" }}
                />
              </div>
            </div>

            {/* Modal actions */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={sendReply}
                disabled={isSending || !editedSuggestedReply.trim()}
              >
                {isSending
                  ? <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><Loader size={15} className="animate-spin" /> Sending...</span>
                  : <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><Send size={15} /> Send Reply to {selectedReply.fromEmail}</span>
                }
              </button>
              <button className="btn btn-ghost" onClick={() => setSelectedReply(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
