"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import {
  Wand2, FileSpreadsheet, Settings2, CheckCircle, XCircle, Loader,
  RefreshCw, Send, Pencil, Globe, Users, Building2, ChevronRight,
  AlertCircle, Sparkles, X, Check, UploadCloud, CalendarClock
} from "lucide-react";
import toast from "react-hot-toast";
import ScheduleModal from "@/components/ScheduleModal";

const COUNTRIES = [
  "Any", "Algeria", "Australia", "Austria", "Belgium", "Brazil", "Canada",
  "China", "Denmark", "Egypt", "Finland", "France", "Germany", "India",
  "Ireland", "Italy", "Japan", "Jordan", "Lebanon", "Libya", "Malaysia",
  "Morocco", "Netherlands", "New Zealand", "Nigeria", "Norway", "Pakistan",
  "Poland", "Portugal", "Qatar", "Saudi Arabia", "South Africa", "Spain",
  "Sweden", "Switzerland", "Tunisia", "Turkey", "UAE", "United Kingdom",
  "United States",
];

type LeadStatus = "pending" | "approved" | "rejected" | "sent" | "failed" | "sending";

interface Lead {
  email: string;
  companyName: string;
  companySize: "Startup/Small" | "Enterprise/Large";
  address: string;
  rawData: Record<string, string>;
  subject: string;
  body: string;
  status: LeadStatus;
  error?: string;
}

type Step = "setup" | "generating" | "review";

export default function HyperCampaignPage() {
  // ─── Step ─────────────────────────────────────────────
  const [step, setStep] = useState<Step>("setup");

  // ─── Setup state ──────────────────────────────────────
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sheetUrl, setSheetUrl] = useState("");
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [sourceMode, setSourceMode] = useState<"sheet" | "csv">("csv");
  const [emailColumn, setEmailColumn] = useState("");
  const [companyColumn, setCompanyColumn] = useState("");
  const [targetCountry, setTargetCountry] = useState("Any");
  const [startupRules, setStartupRules] = useState(
    "Be warm and enthusiastic. Tell them we love their vision and want to grow together. Focus on agility, passion, and potential."
  );
  const [enterpriseRules, setEnterpriseRules] = useState(
    "Be formal and highly professional. Focus on ROI, scalability, and measurable business outcomes. Reference their market position."
  );
  const [baseEmailTemplate, setBaseEmailTemplate] = useState("");
  const [customInstructions, setCustomInstructions] = useState(
    "Use the base email template. Personalize the greeting to the company, and tweak the tone as requested, but keep the core message the same."
  );
  const [startRow, setStartRow] = useState("");
  const [endRow, setEndRow] = useState("");

  // ─── Generation state ─────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);

  // ─── Review state ─────────────────────────────────────
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [delaySecs, setDelaySecs] = useState<number>(3);
  const [sendMode, setSendMode] = useState<"live" | "draft">("live");

  // ─── Scheduler state ──────────────────────────────────
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [campaignSchedule, setCampaignSchedule] = useState<{schedules: any[], settings?: any} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Source handlers ──────────────────────────────────
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
        toast.error(data.error || "Failed to load sheet.");
        return;
      }
      applyData(data.rows, data.headers);
      toast.success(`Loaded ${data.count} contacts from "${data.spreadsheetTitle}"`);
    } catch (err: any) {
      toast.error(err.message || "Network error.");
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data?.length > 0) {
          const hdrs = Object.keys(results.data[0] as object);
          applyData(results.data as any[], hdrs);
          toast.success(`Loaded ${results.data.length} rows from CSV!`);
        } else {
          toast.error("CSV is empty or malformed.");
        }
      },
    });
  };

  const applyData = (newRows: any[], newHeaders: string[]) => {
    setRows(newRows);
    setHeaders(newHeaders);
    setEmailColumn(newHeaders.find((h) => /email/i.test(h)) ?? newHeaders[0]);
    setCompanyColumn(newHeaders.find((h) => /company|business|org|name/i.test(h)) ?? newHeaders[0]);
  };

  // ─── Generate campaign ────────────────────────────────
  const handleGenerate = async () => {
    if (rows.length === 0) return toast.error("No contacts loaded.");
    if (!emailColumn) return toast.error("Please select the email column.");

    setIsGenerating(true);
    setStep("generating");

    try {
      const res = await fetch("/api/campaign/hyper-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          emailColumn,
          companyColumn,
          targetCountry: targetCountry === "Any" ? "" : targetCountry,
          startupRules,
          enterpriseRules,
          baseEmailTemplate,
          customInstructions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Generation failed.");
        setStep("setup");
        return;
      }
      setLeads(data.leads);
      setStep("review");
      toast.success(`Generated ${data.leads.filter((l: Lead) => l.status === "pending").length} emails ready for review!`);
    } catch (err: any) {
      toast.error(err.message || "Network error");
      setStep("setup");
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Review actions ───────────────────────────────────
  const startEdit = (i: number) => {
    setEditingIndex(i);
    setEditSubject(leads[i].subject);
    setEditBody(leads[i].body);
  };

  const saveEdit = (i: number) => {
    const updated = [...leads];
    updated[i] = { ...updated[i], subject: editSubject, body: editBody };
    setLeads(updated);
    setEditingIndex(null);
  };

  const rejectLead = (i: number) => {
    const updated = [...leads];
    updated[i] = { ...updated[i], status: "rejected" };
    setLeads(updated);
  };

  const sendLead = async (i: number) => {
    const lead = leads[i];
    const updated = [...leads];
    updated[i] = { ...updated[i], status: "sending" };
    setLeads(updated);

    try {
      const res = await fetch("/api/campaign/send-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          to: lead.email, 
          subject: lead.subject, 
          body: lead.body,
          draftOnly: sendMode === "draft"
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        updated[i] = { ...updated[i], status: "failed", error: data.error };
        toast.error(`Failed to process ${lead.email}: ${data.error}`);
      } else {
        updated[i] = { ...updated[i], status: "sent" };
        toast.success(sendMode === "draft" ? `Draft saved for ${lead.companyName}!` : `Email sent to ${lead.companyName}!`);
      }
    } catch (err: any) {
      updated[i] = { ...updated[i], status: "failed", error: err.message };
      toast.error(err.message);
    }
    setLeads([...updated]);
  };

  const approveAndSendAll = async () => {
    const pending = leads.filter((l) => l.status === "pending");
    if (pending.length === 0) return toast.error("No pending leads to process.");
    
    toast(`Processing ${pending.length} emails...`, { icon: sendMode === "draft" ? "📝" : "📨" });
    
    for (let i = 0; i < leads.length; i++) {
      if (leads[i].status === "pending") {
        await sendLead(i);
        // Add delay between sends if in live mode or even drafts to avoid rate limits
        if (delaySecs > 0) {
          await new Promise((r) => setTimeout(r, delaySecs * 1000));
        }
      }
    }
  };

  const stats = {
    total: leads.length,
    pending: leads.filter((l) => l.status === "pending").length,
    sent: leads.filter((l) => l.status === "sent").length,
    rejected: leads.filter((l) => l.status === "rejected").length,
    failed: leads.filter((l) => l.status === "failed").length,
    startups: leads.filter((l) => l.companySize === "Startup/Small").length,
    enterprises: leads.filter((l) => l.companySize === "Enterprise/Large").length,
  };

  return (
    <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={26} color="#a855f7" /> Hyper-Personalized AI Campaign
          </h1>
          <p className="page-subtitle">
            AI classifies each company → generates custom emails per size → you review &amp; approve
          </p>
        </div>
        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(["setup", "generating", "review"] as Step[]).map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "0.75rem", fontWeight: 700,
                background: step === s ? "var(--accent-purple)" : steps_done(s, step) ? "var(--accent-green)" : "var(--bg-elevated)",
                color: step === s || steps_done(s, step) ? "white" : "var(--text-muted)",
                border: `2px solid ${step === s ? "var(--accent-purple)" : steps_done(s, step) ? "var(--accent-green)" : "var(--border-subtle)"}`,
              }}>
                {steps_done(s, step) ? <Check size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: "0.8rem", color: step === s ? "var(--text-primary)" : "var(--text-muted)", fontWeight: step === s ? 700 : 400, whiteSpace: "nowrap" }}>
                {s === "setup" ? "Campaign Setup" : s === "generating" ? "AI Generation" : "Review & Approve"}
              </span>
              {i < 2 && <ChevronRight size={14} color="var(--text-muted)" style={{ marginLeft: -2 }} />}
            </div>
          ))}
        </div>
      </div>

      {/* ── STEP 1: SETUP ── */}
      {step === "setup" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Data Source */}
          <div className="glass-card" style={{ padding: 28 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <FileSpreadsheet size={18} color="var(--accent-blue)" /> 1. Import Contacts
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {/* Sheet */}
              <div style={{ padding: 20, background: sourceMode === "sheet" ? "rgba(108,99,255,0.08)" : "var(--bg-secondary)", border: `1px solid ${sourceMode === "sheet" ? "rgba(108,99,255,0.4)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-md)", cursor: "pointer" }} onClick={() => setSourceMode("sheet")}>
                <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <FileSpreadsheet size={16} color="var(--accent-purple)" /> Google Sheets
                </div>
                <input
                  className="input"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => { setSheetUrl(e.target.value); setSourceMode("sheet"); }}
                  style={{ marginBottom: 10 }}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 3, display: "block" }}>Start Row</label>
                    <input type="number" className="input" min={2} placeholder="e.g. 2" value={startRow} onChange={(e) => setStartRow(e.target.value)} onClick={(e) => e.stopPropagation()} />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 3, display: "block" }}>End Row</label>
                    <input type="number" className="input" min={2} placeholder="e.g. 50" value={endRow} onChange={(e) => setEndRow(e.target.value)} onClick={(e) => e.stopPropagation()} />
                  </div>
                </div>
                <button className="btn btn-primary" style={{ width: "100%" }} onClick={(e) => { e.stopPropagation(); handleFetchSheet(); }} disabled={isFetchingSheet || !sheetUrl.trim()}>
                  {isFetchingSheet ? <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Loader size={14} className="animate-spin" /> Fetching...</span> : <span style={{ display: "flex", alignItems: "center", gap: 6 }}><FileSpreadsheet size={14} /> Load Sheet</span>}
                </button>
              </div>

              {/* CSV */}
              <div style={{ padding: 20, background: sourceMode === "csv" ? "rgba(0,212,255,0.06)" : "var(--bg-secondary)", border: `1px solid ${sourceMode === "csv" ? "rgba(0,212,255,0.4)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between" }} onClick={() => { setSourceMode("csv"); fileInputRef.current?.click(); }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <UploadCloud size={16} color="var(--accent-blue)" /> Upload CSV
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
                    Download your Sheet as CSV and upload it here. Works offline, no OAuth needed.
                  </p>
                </div>
                <button className="btn btn-secondary" style={{ width: "100%" }} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  <UploadCloud size={14} /> Browse .CSV
                </button>
                <input type="file" accept=".csv" style={{ display: "none" }} ref={fileInputRef} onChange={handleFileUpload} />
              </div>
            </div>

            {/* Column Mapping (appears after load) */}
            {headers.length > 0 && (
              <div style={{ padding: 16, background: "rgba(0,230,118,0.06)", border: "1px solid rgba(0,230,118,0.2)", borderRadius: "var(--radius-md)", marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 12, color: "var(--accent-green)", display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle size={14} /> {rows.length} contacts loaded — Map columns:
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 4, fontWeight: 600 }}>Email Column *</label>
                    <select className="input" value={emailColumn} onChange={(e) => setEmailColumn(e.target.value)}>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 4, fontWeight: 600 }}>Company Name Column</label>
                    <select className="input" value={companyColumn} onChange={(e) => setCompanyColumn(e.target.value)}>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Targeting & Rules */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}>
            {/* Country selector */}
            <div className="glass-card" style={{ padding: 28 }}>
              <h3 style={{ fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Globe size={18} color="var(--accent-blue)" /> 2. Target Country
              </h3>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.6 }}>
                Filter and contextualize emails for companies in this region.
              </p>
              <select className="input" value={targetCountry} onChange={(e) => setTargetCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {targetCountry !== "Any" && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(108,99,255,0.08)", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--accent-purple)" }}>
                  🎯 AI will reference <strong>{targetCountry}</strong> context in emails
                </div>
              )}
            </div>

            {/* Rules */}
            <div className="glass-card" style={{ padding: 28 }}>
              <h3 style={{ fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Settings2 size={18} color="var(--accent-purple)" /> 3. Custom AI Rules per Company Size
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: "0.8rem", marginBottom: 6, color: "var(--accent-blue)" }}>
                    <Users size={14} /> Startup / Small Company
                  </label>
                  <textarea
                    className="input"
                    rows={5}
                    value={startupRules}
                    onChange={(e) => setStartupRules(e.target.value)}
                    placeholder="Warm and enthusiastic tone..."
                    style={{ resize: "vertical", lineHeight: 1.6, fontSize: "0.83rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: "0.8rem", marginBottom: 6, color: "var(--accent-purple)" }}>
                    <Building2 size={14} /> Enterprise / Large Company
                  </label>
                  <textarea
                    className="input"
                    rows={5}
                    value={enterpriseRules}
                    onChange={(e) => setEnterpriseRules(e.target.value)}
                    placeholder="Formal and authoritative tone..."
                    style={{ resize: "vertical", lineHeight: 1.6, fontSize: "0.83rem" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Base Template & Instructions */}
          <div className="glass-card" style={{ padding: 28 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <Pencil size={18} color="var(--accent-blue)" /> 4. Base Email Template &amp; Custom Instructions
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
              Provide your core email structure, and optionally tell Gemini exactly what to modify. 
              The Startup/Enterprise tone rules will still be applied to tailor the email!
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontWeight: 600, fontSize: "0.8rem", marginBottom: 6, color: "var(--text-primary)" }}>
                  Base Email Template (Optional)
                </label>
                <textarea
                  className="input"
                  rows={6}
                  value={baseEmailTemplate}
                  onChange={(e) => setBaseEmailTemplate(e.target.value)}
                  placeholder="Hi [Name], I noticed [Company] is doing great work... Let's connect!"
                  style={{ resize: "vertical", lineHeight: 1.6, fontSize: "0.83rem" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontWeight: 600, fontSize: "0.8rem", marginBottom: 6, color: "var(--text-primary)" }}>
                  Instructions for AI (Modification Rules)
                </label>
                <textarea
                  className="input"
                  rows={6}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Only change the greeting to match the company name, leave everything else exactly as is..."
                  style={{ resize: "vertical", lineHeight: 1.6, fontSize: "0.83rem", background: "rgba(0,0,0,0.2)" }}
                />
              </div>
            </div>
          </div>

          {/* Launch */}
          <div className="glass-card" style={{ padding: 24, background: "linear-gradient(135deg, rgba(108,99,255,0.1), rgba(168,85,247,0.08))", border: "1px solid rgba(108,99,255,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles size={16} color="var(--accent-purple)" /> Ready to Analyze &amp; Generate
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {rows.length > 0
                    ? `${rows.length} contacts loaded • AI will classify each company and write custom emails`
                    : "Load your contacts above first to continue"}
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: "12px 28px", fontSize: "0.95rem", gap: 8 }}
                onClick={handleGenerate}
                disabled={rows.length === 0 || isGenerating}
              >
                {rows.length === 0 ? "Load Contacts ⬆️" : <><Sparkles size={16} /> Generate Campaign</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: GENERATING ── */}
      {step === "generating" && (
        <div className="glass-card" style={{ padding: 60, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, rgba(108,99,255,0.2), rgba(168,85,247,0.2))", display: "grid", placeItems: "center", border: "2px solid rgba(108,99,255,0.4)", animation: "pulse 2s infinite" }}>
            <Sparkles size={28} color="var(--accent-purple)" />
          </div>
          <div>
            <h2 style={{ fontWeight: 800, marginBottom: 8 }}>AI is Working...</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 4 }}>
              Classifying companies as Startup or Enterprise and crafting personalized emails
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Processing {rows.length} contacts — this may take {Math.ceil(rows.length * 4)} seconds
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-purple)", animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 3: REVIEW ── */}
      {step === "review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Stats bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
            {[
              { label: "Total", value: stats.total, color: "#6c63ff" },
              { label: "Pending", value: stats.pending, color: "#ffd600" },
              { label: "Sent", value: stats.sent, color: "#00e676" },
              { label: "Rejected", value: stats.rejected, color: "#ff5252" },
              { label: "Startups", value: stats.startups, color: "#00d4ff" },
              { label: "Enterprises", value: stats.enterprises, color: "#a855f7" },
            ].map(({ label, value, color }) => (
              <div key={label} className="glass-card" style={{ padding: 14, textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Actions bar with scheduling controls */}
          <div className="glass-card" style={{ padding: 16, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Action:</label>
              <select className="input" style={{ width: 140, padding: "6px 10px", fontSize: "0.8rem" }} value={sendMode} onChange={(e) => setSendMode(e.target.value as any)}>
                <option value="live">Live Send Now</option>
                <option value="draft">Save as Drafts (For Later)</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Delay (sec):</label>
              <input type="number" className="input" style={{ width: 70, padding: "6px 10px", fontSize: "0.8rem" }} min={0} value={delaySecs} onChange={(e) => setDelaySecs(Number(e.target.value))} />
            </div>

            <div style={{ height: 24, width: 1, background: "var(--border-subtle)" }} />
            
            <button
              onClick={() => setIsScheduleOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
                background: campaignSchedule ? "rgba(168,85,247,0.1)" : "transparent",
                border: `1px solid ${campaignSchedule ? "rgba(168,85,247,0.4)" : "var(--border-subtle)"}`,
                borderRadius: "var(--radius-md)", color: campaignSchedule ? "var(--accent-purple)" : "var(--text-secondary)",
                fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", transition: "all 0.2s"
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(168,85,247,0.15)"}
              onMouseLeave={e => e.currentTarget.style.background = campaignSchedule ? "rgba(168,85,247,0.1)" : "transparent"}
            >
              <CalendarClock size={16} /> 
              {campaignSchedule ? "Schedule Configured" : "Advanced Schedule"}
            </button>

            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => { setStep("setup"); setLeads([]); setCampaignSchedule(null); }}>
                <RefreshCw size={15} /> New Campaign
              </button>
              <button className="btn btn-primary" onClick={approveAndSendAll} disabled={stats.pending === 0} style={campaignSchedule ? { background: "linear-gradient(135deg, #6c63ff 0%, #a855f7 100%)" } : {}}>
                {campaignSchedule ? <CalendarClock size={15} /> : sendMode === "draft" ? <Pencil size={15} /> : <Send size={15} />} 
                {campaignSchedule ? "Execute Schedule" : sendMode === "draft" ? "Save Drafts" : "Send All Pending"} ({stats.pending})
              </button>
            </div>
          </div>

          {/* Review table */}
          <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 700, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 8 }}>
              📋 Campaign Review Board
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)" }}>
                    {["Company", "Email", "Company Size", "Location", "Email Draft", "Actions"].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)", background: lead.status === "rejected" ? "rgba(255,82,82,0.04)" : lead.status === "sent" ? "rgba(0,230,118,0.04)" : "transparent", opacity: lead.status === "rejected" ? 0.5 : 1 }}>
                      {/* Company */}
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>{lead.companyName}</td>
                      {/* Email */}
                      <td style={{ padding: "12px 16px", color: "var(--text-muted)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.email}</td>
                      {/* Size Badge */}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "3px 10px", borderRadius: "var(--radius-sm)",
                          fontSize: "0.72rem", fontWeight: 700,
                          background: lead.companySize === "Startup/Small" ? "rgba(0,212,255,0.12)" : "rgba(168,85,247,0.12)",
                          color: lead.companySize === "Startup/Small" ? "var(--accent-blue)" : "#a855f7",
                          border: `1px solid ${lead.companySize === "Startup/Small" ? "rgba(0,212,255,0.3)" : "rgba(168,85,247,0.3)"}`,
                        }}>
                          {lead.companySize === "Startup/Small" ? <Users size={10} /> : <Building2 size={10} />}
                          {lead.companySize === "Startup/Small" ? "Startup" : "Enterprise"}
                        </span>
                      </td>
                      {/* Location */}
                      <td style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: "0.78rem" }}>{lead.address}</td>
                      {/* Draft */}
                      <td style={{ padding: "12px 16px", maxWidth: 280 }}>
                        {editingIndex === i ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <input
                              className="input"
                              value={editSubject}
                              onChange={(e) => setEditSubject(e.target.value)}
                              style={{ fontSize: "0.78rem", padding: "6px 10px" }}
                              placeholder="Subject..."
                            />
                            <textarea
                              className="input"
                              rows={4}
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                              style={{ fontSize: "0.76rem", resize: "vertical", lineHeight: 1.5 }}
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn btn-primary" style={{ padding: "4px 12px", fontSize: "0.75rem" }} onClick={() => saveEdit(i)}>
                                <Check size={12} /> Save
                              </button>
                              <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={() => setEditingIndex(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            {lead.status === "failed" ? (
                              <span style={{ color: "#ff5252", fontSize: "0.78rem" }}>⚠️ {lead.error}</span>
                            ) : (
                              <>
                                <div style={{ fontWeight: 600, marginBottom: 3, color: "var(--accent-purple)", fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {lead.subject}
                                </div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.76rem", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                                  {lead.body}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Actions */}
                      <td style={{ padding: "12px 16px" }}>
                        {lead.status === "sent" ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--accent-green)", fontWeight: 600, fontSize: "0.78rem" }}>
                            <CheckCircle size={14} /> Sent
                          </span>
                        ) : lead.status === "sending" ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontSize: "0.78rem" }}>
                            <Loader size={14} className="animate-spin" /> Sending...
                          </span>
                        ) : lead.status === "rejected" ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#ff5252", fontWeight: 600, fontSize: "0.78rem" }}>
                            <X size={14} /> Rejected
                          </span>
                        ) : lead.status === "failed" ? (
                          <span style={{ color: "#ff5252", fontSize: "0.78rem" }}>Failed</span>
                        ) : (
                          <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                            <button
                              title="Edit"
                              style={{ padding: "5px 10px", borderRadius: "var(--radius-sm)", background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)", color: "var(--accent-blue)", cursor: "pointer", fontSize: "0.72rem", display: "flex", alignItems: "center", gap: 4 }}
                              onClick={() => startEdit(i)}
                            >
                              <Pencil size={11} /> Edit
                            </button>
                            <button
                              title={sendMode === "draft" ? "Save as Draft" : "Approve & Send"}
                              style={{ padding: "5px 10px", borderRadius: "var(--radius-sm)", background: "rgba(0,230,118,0.12)", border: "1px solid rgba(0,230,118,0.3)", color: "var(--accent-green)", cursor: "pointer", fontSize: "0.72rem", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
                              onClick={() => sendLead(i)}
                            >
                              {sendMode === "draft" ? <Pencil size={11} /> : <Send size={11} />} 
                              {sendMode === "draft" ? "Save Draft" : "Send"}
                            </button>
                            <button
                              title="Reject"
                              style={{ padding: "5px 8px", borderRadius: "var(--radius-sm)", background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.2)", color: "#ff5252", cursor: "pointer", fontSize: "0.72rem" }}
                              onClick={() => rejectLead(i)}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Schedule Modal */}
      <ScheduleModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        totalLeads={stats.pending}
        onSave={(schedules, settings) => {
          setCampaignSchedule({ schedules, settings });
          setIsScheduleOpen(false);
          toast.success("Schedule configuration saved!");
        }}
      />
    </div>
  );
}

function steps_done(s: Step, current: Step) {
  const order: Step[] = ["setup", "generating", "review"];
  return order.indexOf(s) < order.indexOf(current);
}
