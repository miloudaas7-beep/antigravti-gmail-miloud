"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Send, Play, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import toast from "react-hot-toast";

interface CampaignLead {
  id: string;
  lead: { company_name: string; email: string };
  status: string;
  sent_at: string | null;
  error_message?: string;
}

export default function SenderPage() {
  const supabase = createClient();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<CampaignLead[]>([]);
  const [dailyCount, setDailyCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const DAILY_LIMIT = 400;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [campRes, profileRes] = await Promise.all([
      supabase.from("campaigns").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("emails_sent_today").eq("id", user.id).single(),
    ]);

    const allCamps = campRes.data ?? [];
    setCampaigns(allCamps);
    if (allCamps.length > 0 && !selectedCampaign) setSelectedCampaign(allCamps[0].id);
    setDailyCount(profileRes.data?.emails_sent_today ?? 0);
  };

  const loadLogs = async (campaignId: string) => {
    const { data } = await supabase
      .from("campaign_leads")
      .select("id, status, sent_at, error_message, lead:lead_id(company_name, email)")
      .eq("campaign_id", campaignId)
      .order("sent_at", { ascending: false });
    setLogs((data ?? []) as any);
  };

  const handleCampaignChange = async (id: string) => {
    setSelectedCampaign(id);
    await loadLogs(id);
  };

  const startSending = async () => {
    if (!selectedCampaign) { toast.error("Select a campaign"); return; }
    if (dailyCount >= DAILY_LIMIT) {
      toast.error(`Daily limit of ${DAILY_LIMIT} emails reached. Try again tomorrow.`);
      return;
    }
    setShowConfirm(false);
    setSending(true);
    setProgress({ done: 0, total: 0 });

    try {
      const res = await fetch("/api/sender/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: selectedCampaign }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Sending failed");
        setSending(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          if (data.type === "progress") {
            setProgress({ done: data.done, total: data.total });
            setDailyCount(data.dailyTotal);
          }
          if (data.type === "sent") {
            setLogs(prev => [
              { id: data.id, lead: { company_name: data.to_name, email: data.to_email }, status: "sent", sent_at: new Date().toISOString() },
              ...prev,
            ]);
          }
          if (data.type === "failed") {
            setLogs(prev => [
              { id: data.id, lead: { company_name: data.to_name, email: data.to_email }, status: "failed", sent_at: null, error_message: data.error },
              ...prev,
            ]);
          }
          if (data.type === "done") {
            toast.success(`Sending complete! ${data.sent} emails sent.`);
          }
        }
      }
    } catch (e: any) {
      toast.error("Sending interrupted");
    }

    setSending(false);
    loadData();
  };

  const selectedCamp = campaigns.find(c => c.id === selectedCampaign);
  const remaining = DAILY_LIMIT - dailyCount;
  const limitPct = (dailyCount / DAILY_LIMIT) * 100;

  return (
    <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontSize: "1.6rem" }}>🚀 Auto-Sender</h1>
          <p className="page-subtitle">Gmail-powered automated outreach — 45–60s delay between emails</p>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12 }}>⚠️ Confirm Send</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: 20 }}>
              You are about to send emails from your Gmail account to <strong>{selectedCamp?.total_leads ?? 0} recipients</strong>.
            </p>
            <div style={{ background: "rgba(255,214,0,0.06)", border: "1px solid rgba(255,214,0,0.2)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: "0.82rem", color: "var(--accent-yellow)", fontWeight: 600, marginBottom: 6 }}>Anti-Spam Protections Active:</div>
              <ul style={{ fontSize: "0.8rem", color: "var(--text-secondary)", paddingLeft: 16, lineHeight: 2 }}>
                <li>45–60 second delay between emails</li>
                <li>Daily limit: 400 emails max</li>
                <li>Remaining today: {remaining} emails</li>
              </ul>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button id="confirm-send-btn" className="btn btn-primary" style={{ flex: 1 }} onClick={startSending}>
                <Send size={16} /> Start Sending
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Control Panel */}
      <div className="glass-card" style={{ padding: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, alignItems: "flex-end" }}>
          <div className="input-group">
            <label className="input-label">Select Campaign</label>
            <select
              id="campaign-select"
              className="input select"
              value={selectedCampaign}
              onChange={e => handleCampaignChange(e.target.value)}
            >
              <option value="">— Choose a campaign —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.total_leads} leads)</option>
              ))}
            </select>
          </div>

          <div style={{ paddingBottom: 2 }}>
            <button
              id="start-sending-btn"
              className="btn btn-primary btn-lg"
              onClick={() => setShowConfirm(true)}
              disabled={sending || !selectedCampaign || dailyCount >= DAILY_LIMIT}
            >
              {sending ? (
                <><div className="spinner" style={{ width: 16, height: 16 }} /> Sending...</>
              ) : (
                <><Play size={16} /> Start Sending</>
              )}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 24 }}>
          {[
            { label: "Daily Sent", value: dailyCount, accent: "#6c63ff" },
            { label: "Remaining", value: remaining, accent: "#00d4ff" },
            { label: "Daily Limit", value: DAILY_LIMIT, accent: "#ffd600" },
            { label: "Delay", value: "45–60s", accent: "#00e676" },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{ padding: 16, background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: accent }}>{value}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Daily limit progress */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: "0.78rem", color: "var(--text-muted)" }}>
            <span>Daily email quota</span>
            <span>{dailyCount} / {DAILY_LIMIT}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${limitPct}%`, background: limitPct > 85 ? "linear-gradient(135deg,#ff6d00,#ff2d55)" : "var(--gradient-purple)" }} />
          </div>
          {limitPct > 85 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: "0.78rem", color: "var(--accent-yellow)" }}>
              <AlertTriangle size={14} /> Approaching daily limit — {remaining} emails remaining
            </div>
          )}
        </div>

        {/* Live progress during send */}
        {sending && progress.total > 0 && (
          <div style={{ marginTop: 20, padding: 16, background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-active)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", fontWeight: 600 }}>
                <div className="live-dot" />
                Sending in progress
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{progress.done} / {progress.total}</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <div style={{ marginTop: 8, fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={12} />
              Next email in ~45–60 seconds
            </div>
          </div>
        )}
      </div>

      {/* Live Table */}
      <div className="live-table-wrapper">
        <div className="live-table-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {sending && <div className="live-dot" />}
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
              {sending ? "Live Feed" : "Email Log"}
            </span>
            {logs.length > 0 && <span className="badge badge-muted">{logs.length} entries</span>}
          </div>
        </div>

        {logs.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📬</div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {selectedCampaign ? "No emails sent yet for this campaign. Press Start Sending." : "Select a campaign to view its email log."}
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                {["Status", "Recipient", "Email", "Sent At"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid var(--border-subtle)", animation: "fadeIn 0.3s ease" }}>
                  <td style={{ padding: "12px 16px" }}>
                    {log.status === "sent" ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent-green)", fontSize: "0.8rem", fontWeight: 600 }}>
                        <CheckCircle2 size={14} /> Sent
                      </span>
                    ) : log.status === "failed" ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#ff2d55", fontSize: "0.8rem", fontWeight: 600 }}>
                        <XCircle size={14} /> Failed
                      </span>
                    ) : (
                      <span className="badge badge-yellow">Pending</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {(log.lead as any)?.company_name ?? "—"}
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: "0.8rem", color: "var(--accent-blue)" }}>
                    {(log.lead as any)?.email ?? "—"}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    {log.sent_at ? new Date(log.sent_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
