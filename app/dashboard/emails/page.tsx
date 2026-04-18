"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import {
  UploadCloud, Settings2, Wand2, Mail, Clock,
  Link2, FileSpreadsheet, ChevronRight, Send,
  CheckCircle, Loader, RefreshCw, AlertCircle, Calendar, Zap
} from "lucide-react";
import toast from "react-hot-toast";
import ScheduleModal from "@/components/ScheduleModal";

type Step = "source" | "template" | "config";

export default function AIEmailSenderPage() {
  // Step navigation
  const [step, setStep] = useState<Step>("source");

  // Data source
  const [sourceMode, setSourceMode] = useState<"sheet" | "csv">("sheet");
  const [sheetUrl, setSheetUrl] = useState("");
  const [startRow, setStartRow] = useState("");
  const [endRow, setEndRow] = useState("");
  const [sheetTitle, setSheetTitle] = useState("");
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);

  // Loaded data
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [emailColumn, setEmailColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");

  // Instructions for n8n
  const [prompt, setPrompt] = useState("Write a professional outreach email introducing our services to {{Company Name}}. Keep it under 150 words, use a friendly tone, and end with a clear call to action.");

  // Scheduling
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [dispatched, setDispatched] = useState(false);
  const [dispatchedCampaignId, setDispatchedCampaignId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Google Sheet Import ─────────────────────────────────────
  const handleFetchSheet = async () => {
    if (!sheetUrl.trim()) return toast.error("Please paste your Google Sheet URL.");
    setIsFetchingSheet(true);
    try {
      const res = await fetch("/api/campaign/fetch-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl, startRow, endRow }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsAuth) {
          toast.error("Google account not connected! Go to Settings first.", { duration: 5000 });
        } else {
          toast.error(data.error || "Failed to load sheet.");
        }
        return;
      }
      setRows(data.rows);
      setHeaders(data.headers);
      setSheetTitle(data.spreadsheetTitle);
      const emailCol = data.headers.find((h: string) => /email/i.test(h)) ?? data.headers[0];
      const nameCol = data.headers.find((h: string) => /name|company/i.test(h)) ?? data.headers[0];
      setEmailColumn(emailCol);
      setNameColumn(nameCol);
      toast.success(`Loaded ${data.count} contacts from "${data.spreadsheetTitle}"`);
      setStep("template");
    } catch (err: any) {
      toast.error(err.message || "Network error.");
    } finally {
      setIsFetchingSheet(false);
    }
  };

  // ─── CSV Upload ──────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data?.length > 0) {
          const hdrs = Object.keys(results.data[0] as object);
          setHeaders(hdrs);
          setRows(results.data as any[]);
          setSheetTitle(file.name.replace(".csv", ""));
          const emailCol = hdrs.find(h => /email/i.test(h)) ?? hdrs[0];
          const nameCol = hdrs.find(h => /name|company/i.test(h)) ?? hdrs[0];
          setEmailColumn(emailCol);
          setNameColumn(nameCol);
          toast.success(`Loaded ${results.data.length} rows from CSV!`);
          setStep("template");
        } else {
          toast.error("CSV is empty or malformed.");
        }
      },
      error: (error) => toast.error("Failed to parse CSV: " + error.message),
    });
  };

  // ─── Dispatch to n8n (immediate or scheduled) ────────────────
  const dispatchToN8n = async (schedules?: any[], settings?: { timezone: string; skipWeekends: boolean }) => {
    if (rows.length === 0) return toast.error("No contacts loaded.");
    if (!prompt.trim()) return toast.error("Please write your instructions for the AI.");
    if (!emailColumn) return toast.error("Please select the Email column.");

    setIsScheduling(true);
    try {
      const res = await fetch("/api/trigger-n8n", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          prompt,
          emailColumn,
          nameColumn,
          schedules: schedules ?? [],
          settings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send to n8n.");
        return;
      }
      setDispatchedCampaignId(data.campaignId ?? null);
      setDispatched(true);
      setIsScheduleOpen(false);
      toast.success(
        schedules?.length
          ? `Campaign scheduled! n8n will send ${data.queued ?? rows.length} emails.`
          : `Campaign dispatched to n8n! Processing ${rows.length} contacts.`
      );
    } catch (err: any) {
      toast.error(err.message || "Network error");
    } finally {
      setIsScheduling(false);
    }
  };

  const handleSendNow = () => dispatchToN8n();
  const handleSaveSchedule = (schedules: any[], settings?: { timezone: string; skipWeekends: boolean }) =>
    dispatchToN8n(schedules, settings);

  // ─── Stepper UI ──────────────────────────────────────────────
  const STEPS: { id: Step; label: string; icon: any }[] = [
    { id: "source", label: "Import Contacts", icon: FileSpreadsheet },
    { id: "template", label: "Instructions", icon: Wand2 },
    { id: "config", label: "Launch", icon: Send },
  ];

  const stepIndex = STEPS.findIndex(s => s.id === step);

  // ─── Success State ───────────────────────────────────────────
  if (dispatched) {
    return (
      <div style={{ width: "100%", maxWidth: 700, margin: "60px auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 24, textAlign: "center" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(0,230,118,0.15)", border: "2px solid rgba(0,230,118,0.4)", display: "grid", placeItems: "center", animation: "pulse-glow 2s infinite" }}>
          <CheckCircle size={40} color="var(--accent-green)" />
        </div>
        <div>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 8 }}>Campaign Dispatched! 🚀</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", maxWidth: 500, lineHeight: 1.7 }}>
            Your contacts and instructions have been sent to <strong style={{ color: "var(--accent-purple)" }}>n8n</strong>. It will handle personalized email generation and delivery in the background.
          </p>
        </div>

        <div className="glass-card" style={{ padding: 24, width: "100%", textAlign: "left" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Contacts sent", value: rows.length },
              { label: "Data source", value: sheetTitle || "CSV Upload" },
              { label: "Campaign ID", value: dispatchedCampaignId ? dispatchedCampaignId.slice(0, 8) + "…" : "—" },
              { label: "Status", value: "Queued in n8n" },
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: 14, background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <button
          className="btn btn-secondary"
          onClick={() => {
            setDispatched(false);
            setDispatchedCampaignId(null);
            setStep("source");
            setRows([]);
            setSheetUrl("");
            setSheetTitle("");
          }}
        >
          <RefreshCw size={16} /> Start New Campaign
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
            <Wand2 size={26} /> AI Email Campaign Builder
          </h1>
          <p className="page-subtitle">Import contacts → Set instructions → n8n generates &amp; sends personalized emails</p>
        </div>
        {rows.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.3)", borderRadius: "var(--radius-md)" }}>
            <FileSpreadsheet size={14} color="var(--accent-green)" />
            <span style={{ fontSize: "0.82rem", color: "var(--accent-green)", fontWeight: 600 }}>{rows.length} contacts • {sheetTitle}</span>
          </div>
        )}
      </div>

      {/* Stepper */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.id === step;
          const isDone = i < stepIndex;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : undefined }}>
              <button
                onClick={() => { if (isDone || isActive) setStep(s.id); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 16px", borderRadius: "var(--radius-md)",
                  background: isActive ? "rgba(108,99,255,0.15)" : isDone ? "rgba(0,230,118,0.08)" : "transparent",
                  border: isActive ? "1px solid rgba(108,99,255,0.4)" : isDone ? "1px solid rgba(0,230,118,0.25)" : "1px solid transparent",
                  cursor: isDone || isActive ? "pointer" : "default",
                  whiteSpace: "nowrap",
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: isActive ? "var(--accent-purple)" : isDone ? "var(--accent-green)" : "var(--bg-elevated)",
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}>
                  {isDone ? <CheckCircle size={14} color="white" /> : <Icon size={13} color={isActive ? "white" : "var(--text-muted)"} />}
                </div>
                <span suppressHydrationWarning style={{ fontSize: "0.82rem", fontWeight: 600, color: isActive ? "var(--accent-purple)" : isDone ? "var(--accent-green)" : "var(--text-muted)" }}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: isDone ? "rgba(0,230,118,0.3)" : "var(--border-subtle)", margin: "0 4px" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── STEP 1: Source ── */}
      {step === "source" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Google Sheets */}
          <div
            className="glass-card"
            style={{ padding: 28, cursor: "pointer", border: sourceMode === "sheet" ? "1px solid rgba(108,99,255,0.5)" : "1px solid var(--border-subtle)", transition: "all 0.2s" }}
            onClick={() => setSourceMode("sheet")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, background: "rgba(108,99,255,0.15)", borderRadius: 10, display: "grid", placeItems: "center" }}>
                <Link2 size={18} color="var(--accent-purple)" />
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Import from Google Sheets</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Requires connected Google account</div>
              </div>
            </div>
            <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
              Paste the URL of any Google Sheet you own or have access to. The AI will read it directly using your connected account.
            </p>
            <input
              className="input"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onClick={e => e.stopPropagation()}
              onChange={e => { setSheetUrl(e.target.value); setSourceMode("sheet"); }}
              style={{ marginBottom: 12 }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4, display: "block", fontWeight: 600 }}>Start Row (Optional)</label>
                <input
                  type="number"
                  className="input"
                  min={2}
                  placeholder="e.g. 2"
                  value={startRow}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setStartRow(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4, display: "block", fontWeight: 600 }}>End Row (Optional)</label>
                <input
                  type="number"
                  className="input"
                  min={2}
                  placeholder="e.g. 100"
                  value={endRow}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setEndRow(e.target.value)}
                />
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={e => { e.stopPropagation(); handleFetchSheet(); }}
              disabled={isFetchingSheet || !sheetUrl.trim()}
            >
              {isFetchingSheet ? (
                <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}><Loader size={16} className="animate-spin" /> Fetching...</span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}><FileSpreadsheet size={16} /> Load Sheet</span>
              )}
            </button>
          </div>

          {/* CSV Upload */}
          <div
            className="glass-card"
            style={{ padding: 28, cursor: "pointer", border: sourceMode === "csv" ? "1px solid rgba(0,212,255,0.5)" : "1px solid var(--border-subtle)", transition: "all 0.2s" }}
            onClick={() => { setSourceMode("csv"); fileInputRef.current?.click(); }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, background: "rgba(0,212,255,0.15)", borderRadius: 10, display: "grid", placeItems: "center" }}>
                <UploadCloud size={18} color="var(--accent-blue)" />
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Upload CSV File</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Works offline, no auth needed</div>
              </div>
            </div>
            <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6 }}>
              Download your Google Sheet as CSV (File → Download → CSV) and upload it here. Great for testing without OAuth.
            </p>
            <input type="file" accept=".csv" style={{ display: "none" }} ref={fileInputRef} onChange={handleFileUpload} />
            <button className="btn btn-secondary" style={{ width: "100%" }} onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              <UploadCloud size={16} /> Browse .CSV File
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Instructions ── */}
      {step === "template" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="glass-card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
            <h3 style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Wand2 size={18} color="var(--accent-purple)" /> Instructions for n8n AI
            </h3>

            <div>
              <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                Column Mappings
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 4 }}>Email Column *</div>
                  <select className="input" value={emailColumn} onChange={e => setEmailColumn(e.target.value)}>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 4 }}>Name/Company Column</div>
                  <select className="input" value={nameColumn} onChange={e => setNameColumn(e.target.value)}>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                Email Instructions (tone, key points, how to address each lead)
              </label>
              <textarea
                className="input"
                rows={9}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Write a friendly, concise outreach email to {{Company Name}}. Focus on our AI analytics solution. Keep under 120 words and end with a meeting invite CTA..."
                style={{ padding: 12, lineHeight: 1.7, resize: "vertical" }}
              />
            </div>

            <div style={{ padding: 12, background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: "var(--radius-md)", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              💡 <strong>Tip:</strong> n8n's AI will receive all contact columns ({headers.join(", ")}) together with your instructions to craft a personalized email for each recipient.
            </div>

            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setStep("config")}>
              Next: Launch Campaign <ChevronRight size={16} />
            </button>
          </div>

          {/* Preview table */}
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: "0.9rem", color: "var(--text-muted)" }}>
              📋 Loaded Contacts Preview ({rows.length} total)
            </h3>
            <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 400 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)" }}>
                    {headers.slice(0, 4).map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "var(--text-muted)", borderBottom: "1px solid var(--border-muted)", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      {headers.slice(0, 4).map(h => (
                        <td key={h} style={{ padding: "8px 10px", color: "var(--text-primary)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row[h] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 8 && (
                <div style={{ padding: 10, textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  +{rows.length - 8} more rows
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: Launch ── */}
      {step === "config" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Campaign summary */}
          <div className="glass-card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 24 }}>
            <h3 style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={18} color="var(--accent-blue)" /> Campaign Summary
            </h3>

            <div style={{ padding: 16, background: "rgba(255,214,0,0.06)", border: "1px solid rgba(255,214,0,0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 2 }}>
                <div>📨 Contacts to send: <strong style={{ color: "var(--text-primary)" }}>{rows.length}</strong></div>
                <div>📋 Email column: <strong style={{ color: "var(--text-primary)" }}>{emailColumn}</strong></div>
                <div>🏷️ Name column: <strong style={{ color: "var(--text-primary)" }}>{nameColumn}</strong></div>
                <div>📝 Data source: <strong style={{ color: "var(--text-primary)" }}>{sheetTitle || "CSV"}</strong></div>
              </div>
            </div>

            <div style={{ padding: 16, background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: "var(--radius-md)", fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
              <strong style={{ color: "var(--accent-purple)" }}>How it works:</strong> Your contacts and instructions are sent to n8n, which will use AI to write a unique, personalized email for each recipient and dispatch them via Gmail — no generation happens in the browser.
            </div>

            <button className="btn btn-ghost" onClick={() => setStep("template")}>
              ← Back to Instructions
            </button>
          </div>

          {/* Launch actions */}
          <div className="glass-card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Send size={18} color="var(--accent-green)" /> Launch Campaign
            </h3>

            {/* Send Now via n8n */}
            <div style={{ padding: 20, background: "linear-gradient(145deg, rgba(108,99,255,0.1) 0%, rgba(168,85,247,0.1) 100%)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <Zap size={16} color="var(--accent-purple)" /> Trigger n8n Now
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                Immediately hand off all contacts and your instructions to n8n. It will generate and send each email autonomously in the background.
              </p>
              <button
                id="trigger-n8n-now-btn"
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={handleSendNow}
                disabled={isScheduling}
              >
                {isScheduling ? (
                  <><Loader size={16} className="animate-spin" /> Dispatching...</>
                ) : (
                  <><Send size={16} /> Send via n8n Now</>
                )}
              </button>
            </div>

            {/* Schedule Mode */}
            <div style={{ padding: 20, background: "rgba(108,99,255,0.06)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <Calendar size={16} color="var(--accent-purple)" /> Advanced Scheduling
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                Build a drip schedule to spread emails over multiple days. n8n will receive the full schedule and handle timed dispatch.
              </p>
              <button
                id="schedule-campaign-btn"
                className="btn btn-secondary"
                style={{ width: "100%" }}
                onClick={() => setIsScheduleOpen(true)}
                disabled={isScheduling}
              >
                <Calendar size={16} /> {isScheduling ? "Saving..." : "Schedule For Later"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ScheduleModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        onSave={handleSaveSchedule}
        totalLeads={rows.length}
      />
    </div>
  );
}
