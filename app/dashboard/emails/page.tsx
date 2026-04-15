"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import {
  UploadCloud, Play, Settings2, Wand2, Mail, Clock,
  Link2, FileSpreadsheet, ChevronRight, Send, Eye,
  CheckCircle, XCircle, Loader, RefreshCw, AlertCircle, Calendar
} from "lucide-react";
import toast from "react-hot-toast";
import ScheduleModal from "@/components/ScheduleModal";

type RowResult = {
  email: string;
  name: string;
  subject: string;
  status: "sent" | "preview" | "failed";
  preview: string;
  error?: string;
};

type Step = "source" | "template" | "config" | "results";

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

  // Template
  const [prompt, setPrompt] = useState("Write a professional outreach email introducing our services to {{Company Name}}. Keep it under 150 words and end with a clear call to action.");

  // Config
  const [dailyLimit, setDailyLimit] = useState(30);
  const [delaySecs, setDelaySecs] = useState(10);

  // Results
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selectedResult, setSelectedResult] = useState<RowResult | null>(null);

  // Scheduling
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

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
      // Auto-detect email and name columns
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

  // ─── Run Campaign ────────────────────────────────────────────
  const runCampaign = async (actualSend: boolean) => {
    if (rows.length === 0) return toast.error("No contacts loaded.");
    if (!prompt.trim()) return toast.error("Please write your email prompt.");
    if (!emailColumn) return toast.error("Please select the Email column.");

    setIsRunning(true);
    setResults([]);
    setSummary(null);
    setStep("results");

    try {
      const res = await fetch("/api/campaign/generate-and-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: rows.slice(0, dailyLimit),
          prompt,
          emailColumn,
          nameColumn,
          dailyLimit,
          delaySecs,
          actualSend,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsAuth) {
          toast.error("Gmail not connected. Go to Settings to connect!", { duration: 6000 });
          setStep("config");
        } else {
          toast.error(data.error || "Campaign failed.");
          setStep("config");
        }
        return;
      }
      setResults(data.results);
      setSummary(data.summary);
      if (actualSend) {
        toast.success(`Campaign complete! ${data.summary.sent} emails sent.`);
      } else {
        toast.success("Preview generated for all contacts!");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error");
      setStep("config");
    } finally {
      setIsRunning(false);
    }
  };

  // ─── Schedule Campaign ───────────────────────────────────────
  const handleSaveSchedule = async (schedules: any[], settings?: { timezone: string, skipWeekends: boolean }) => {
    if (rows.length === 0) return toast.error("No contacts loaded.");
    if (!prompt.trim()) return toast.error("Please write your email prompt.");
    if (!emailColumn) return toast.error("Please select the Email column.");

    setIsScheduling(true);
    try {
      const res = await fetch("/api/campaign/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          prompt,
          emailColumn,
          nameColumn,
          schedules,
          settings // <-- Pass the settings object with timezone
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save schedule.");
        return;
      }
      toast.success("Campaign scheduled successfully!");
      setIsScheduleOpen(false);
      
      // Update UI to show Success State (or redirect)
      setSummary({ total: rows.length, sent: 0, previews: 0, failed: 0 });
      setStep("results");
    } catch (err: any) {
      toast.error(err.message || "Network error");
    } finally {
      setIsScheduling(false);
    }
  };

  // ─── Stepper UI ──────────────────────────────────────────────
  const STEPS: { id: Step; label: string; icon: any }[] = [
    { id: "source", label: "Import Contacts", icon: FileSpreadsheet },
    { id: "template", label: "Email Template", icon: Wand2 },
    { id: "config", label: "Configuration", icon: Settings2 },
    { id: "results", label: "Results", icon: Send },
  ];

  const stepIndex = STEPS.findIndex(s => s.id === step);

  return (
    <div style={{ width: "100%", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
            <Wand2 size={26} /> AI Email Campaign Builder
          </h1>
          <p className="page-subtitle">Import contacts → AI personalizes each email → Send via Gmail</p>
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

      {/* ── STEP 2: Template ── */}
      {step === "template" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="glass-card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
            <h3 style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Wand2 size={18} color="var(--accent-purple)" /> AI Prompt / Email Template
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
                Email Prompt (AI will use all contact data to personalize)
              </label>
              <textarea
                className="input"
                rows={9}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Write a personalized outreach email to {{Company Name}} about our digital marketing services..."
                style={{ padding: 12, lineHeight: 1.7, resize: "vertical" }}
              />
            </div>

            <div style={{ padding: 12, background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: "var(--radius-md)", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              💡 <strong>Tip:</strong> The AI automatically has access to all columns in your sheet ({headers.join(", ")}). Just describe what you want in plain language.
            </div>

            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => setStep("config")}>
              Next: Configure Sending <ChevronRight size={16} />
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

      {/* ── STEP 3: Config ── */}
      {step === "config" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="glass-card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 24 }}>
            <h3 style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Settings2 size={18} color="var(--accent-blue)" /> Sending Configuration
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Daily Limit
                </label>
                <input type="number" className="input" min={1} max={rows.length} value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))} />
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>{rows.length} contacts loaded</div>
              </div>
              <div>
                <label style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Delay Between Sends (sec)
                </label>
                <input type="number" className="input" min={1} value={delaySecs} onChange={e => setDelaySecs(Number(e.target.value))} />
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>Avoids spam filters</div>
              </div>
            </div>

            <div style={{ padding: 16, background: "rgba(255,214,0,0.06)", border: "1px solid rgba(255,214,0,0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertCircle size={14} color="#ffd600" /> Campaign Summary
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 2 }}>
                <div>📨 Will process: <strong style={{ color: "var(--text-primary)" }}>{Math.min(dailyLimit, rows.length)} contacts</strong></div>
                <div>⏱ Time estimate: <strong style={{ color: "var(--text-primary)" }}>~{Math.round((Math.min(dailyLimit, rows.length) * delaySecs) / 60)} minutes</strong></div>
                <div>📋 Email column: <strong style={{ color: "var(--text-primary)" }}>{emailColumn}</strong></div>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Play size={18} color="var(--accent-green)" /> Launch Campaign
            </h3>

            {/* Preview Mode */}
            <div style={{ padding: 20, background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <Eye size={16} color="var(--accent-blue)" /> Preview Mode
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                AI will generate all personalized emails and show them to you — but nothing will actually be sent. Perfect for reviewing before launch.
              </p>
              <button
                className="btn btn-secondary"
                style={{ width: "100%" }}
                onClick={() => runCampaign(false)}
                disabled={isRunning}
              >
                <Eye size={16} /> Generate Previews
              </button>
            </div>

            {/* Send Mode */}
            <div style={{ padding: 20, background: "linear-gradient(145deg, rgba(108,99,255,0.1) 0%, rgba(168,85,247,0.1) 100%)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <Send size={16} color="var(--accent-purple)" /> Live Send via Gmail
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                Generates & sends each email from your connected Gmail account with the configured delay between each send.
              </p>
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={() => runCampaign(true)}
                disabled={isRunning}
              >
                <Send size={16} /> Send Campaign Now
              </button>
            </div>

            {/* Schedule Mode */}
            <div style={{ padding: 20, background: "rgba(108,99,255,0.06)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <Calendar size={16} color="var(--accent-purple)" /> Advanced Scheduling
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                Build a pattern to distribute emails over 30 days automatically while your PC is off.
              </p>
              <button
                className="btn btn-secondary"
                style={{ width: "100%" }}
                onClick={() => setIsScheduleOpen(true)}
                disabled={isRunning || isScheduling}
              >
                <Calendar size={16} /> {isScheduling ? "Saving..." : "Schedule For Later"}
              </button>
            </div>

            <button className="btn btn-ghost" onClick={() => setStep("template")}>
              ← Back to Template
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Results ── */}
      {step === "results" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Summary bar */}
          {summary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Total Processed", value: summary.total, color: "#6c63ff" },
                { label: "Sent / Previewed", value: summary.sent + summary.previews, color: "#00e676" },
                { label: "Failed", value: summary.failed, color: "#ff5252" },
                { label: "Mode", value: summary.sent > 0 ? "Live" : "Preview", color: "#00d4ff" },
              ].map(({ label, value, color }) => (
                <div key={label} className="glass-card" style={{ padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {isRunning && (
            <div className="glass-card" style={{ padding: 40, textAlign: "center" }}>
              <Loader size={32} className="animate-spin" style={{ margin: "0 auto 16px", color: "var(--accent-purple)" }} />
              <p style={{ color: "var(--text-muted)", marginBottom: 6 }}>AI is generating personalized emails...</p>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>This may take a moment. Do not close this tab.</p>
            </div>
          )}

          {results.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Results list */}
              <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 700, fontSize: "0.9rem" }}>
                  📬 Email Results
                </div>
                <div style={{ overflowY: "auto", maxHeight: 480 }}>
                  {results.map((r, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedResult(r)}
                      style={{
                        padding: "12px 20px",
                        borderBottom: "1px solid var(--border-subtle)",
                        cursor: "pointer",
                        background: selectedResult?.email === r.email ? "rgba(108,99,255,0.08)" : "transparent",
                        display: "flex", alignItems: "center", gap: 12, transition: "background 0.15s",
                      }}
                    >
                      <div>
                        {r.status === "sent" ? <CheckCircle size={16} color="var(--accent-green)" /> :
                          r.status === "preview" ? <Eye size={16} color="var(--accent-blue)" /> :
                            <XCircle size={16} color="#ff5252" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || r.email}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.subject || r.error || r.email}</div>
                      </div>
                      <span className={`badge ${r.status === "sent" ? "badge-green" : r.status === "preview" ? "badge-blue" : "badge-muted"}`} style={{ fontSize: "0.65rem", flexShrink: 0 }}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Email preview panel */}
              <div className="glass-card" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
                {selectedResult ? (
                  <>
                    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 4 }}>To: {selectedResult.email}</div>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent-purple)" }}>Subject: {selectedResult.subject}</div>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", fontSize: "0.88rem", lineHeight: 1.8, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                      {selectedResult.status === "failed" ? (
                        <div style={{ color: "#ff5252", display: "flex", alignItems: "center", gap: 8 }}>
                          <XCircle size={16} /> {selectedResult.error}
                        </div>
                      ) : selectedResult.preview}
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", gap: 8 }}>
                    <Mail size={32} />
                    <p style={{ fontSize: "0.85rem" }}>Click a result to preview the email</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => { setStep("source"); setRows([]); setResults([]); setSummary(null); setSheetUrl(""); }}>
              <RefreshCw size={16} /> Start New Campaign
            </button>
            <button className="btn btn-ghost" onClick={() => setStep("config")}>
              ← Back to Config
            </button>
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
