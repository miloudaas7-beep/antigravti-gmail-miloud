"use client";

import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import {
  FileSpreadsheet, Settings2, CheckCircle, Loader,
  Globe, Users, Building2, Pencil, Sparkles, UploadCloud, CalendarClock
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

export default function HyperCampaignPage() {
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

  const [isDispatched, setIsDispatched] = useState(false);
  const [dispatchedCampaignId, setDispatchedCampaignId] = useState<string | null>(null);

  // ─── Scheduler state ──────────────────────────────────
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Local Storage Persistence for Prompts ──────────────
  useEffect(() => {
    const savedStartup = localStorage.getItem("smartscout_startupRules");
    const savedEnterprise = localStorage.getItem("smartscout_enterpriseRules");
    const savedBase = localStorage.getItem("smartscout_baseEmailTemplate");
    const savedCustom = localStorage.getItem("smartscout_customInstructions");

    if (savedStartup) setStartupRules(savedStartup);
    if (savedEnterprise) setEnterpriseRules(savedEnterprise);
    if (savedBase) setBaseEmailTemplate(savedBase);
    if (savedCustom) setCustomInstructions(savedCustom);
  }, []);

  useEffect(() => {
    localStorage.setItem("smartscout_startupRules", startupRules);
    localStorage.setItem("smartscout_enterpriseRules", enterpriseRules);
    localStorage.setItem("smartscout_baseEmailTemplate", baseEmailTemplate);
    localStorage.setItem("smartscout_customInstructions", customInstructions);
  }, [startupRules, enterpriseRules, baseEmailTemplate, customInstructions]);

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

  // ─── Schedule / Launch Campaign ────────────────────────────────
  const launchCampaign = async (schedules?: any[], settings?: any) => {
    if (rows.length === 0) return toast.error("No contacts loaded.");
    if (!emailColumn) return toast.error("Please select an email column.");

    setIsScheduling(true);
    try {
      const combinedPrompt = `Base Template:\n${baseEmailTemplate}\n\nCustom Instructions:\n${customInstructions}\n\nStartup Rules:\n${startupRules}\n\nEnterprise Rules:\n${enterpriseRules}\n\nTarget Country: ${targetCountry}`;
      
      const payload = {
        rows,
        prompt: combinedPrompt,
        emailColumn,
        nameColumn: companyColumn,
        schedules: schedules ?? [],
        settings: settings ?? {}
      };

      const res = await fetch("/api/execute-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger n8n");
      
      setDispatchedCampaignId(data.campaignId ?? null);
      setIsDispatched(true);
      setIsScheduleOpen(false);
      
      toast.success(
        schedules?.length 
        ? `✅ Campaign scheduled! n8n will process ${data.queued ?? rows.length} contacts.`
        : `✅ Campaign dispatched to n8n! Processing ${rows.length} contacts.`,
        { duration: 8000 }
      );
    } catch(e: any) {
      toast.error(e.message || "Network error");
    } finally {
      setIsScheduling(false);
    }
  };

  if (isDispatched) {
    return (
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 28, alignItems: "center", paddingTop: 40 }}>
        <div className="glass-card" style={{ padding: 40, textAlign: "center", maxWidth: 600 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(0,230,118,0.12)", border: "2px solid rgba(0,230,118,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CheckCircle size={32} color="var(--accent-green)" />
          </div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 12 }}>Handed Off to n8n!</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6 }}>
            Your campaign rules and <strong>{rows.length}</strong> contacts have been sent directly to n8n. n8n will generate, personalize, and dispatch the emails securely in the background.
          </p>
          {dispatchedCampaignId && (
            <div style={{ background: "var(--bg-secondary)", padding: 12, borderRadius: "var(--radius-sm)", marginBottom: 24, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Campaign ID: <strong>{dispatchedCampaignId}</strong>
            </div>
          )}
          <button className="btn btn-secondary" onClick={() => { setIsDispatched(false); setRows([]); }}>
            Create Another Campaign
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontSize: "1.8rem", display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={26} color="#a855f7" /> Hyper-Personalized AI Campaign
          </h1>
          <p className="page-subtitle">
            Configure your AI rules and pass them to n8n for background generation and scheduling.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Data Source */}
        <div className="glass-card" style={{ padding: 28 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <FileSpreadsheet size={18} color="var(--accent-blue)" /> 1. Import Contacts
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
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

            <div style={{ padding: 20, background: sourceMode === "csv" ? "rgba(0,212,255,0.06)" : "var(--bg-secondary)", border: `1px solid ${sourceMode === "csv" ? "rgba(0,212,255,0.4)" : "var(--border-subtle)"}`, borderRadius: "var(--radius-md)", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between" }} onClick={() => { setSourceMode("csv"); fileInputRef.current?.click(); }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <UploadCloud size={16} color="var(--accent-blue)" /> Upload CSV
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
                  Download your Sheet as CSV and upload it here.
                </p>
              </div>
              <button className="btn btn-secondary" style={{ width: "100%" }} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <UploadCloud size={14} /> Browse .CSV
              </button>
              <input type="file" accept=".csv" style={{ display: "none" }} ref={fileInputRef} onChange={handleFileUpload} />
            </div>
          </div>

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
                <Sparkles size={16} color="var(--accent-purple)" /> Delegate to n8n
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                {rows.length > 0
                  ? `Launch ${rows.length} contacts to n8n now, or schedule them for later.`
                  : "Load your contacts above first to continue"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="btn btn-secondary"
                style={{ padding: "12px 28px", fontSize: "0.95rem", gap: 8 }}
                onClick={() => setIsScheduleOpen(true)}
                disabled={rows.length === 0 || isScheduling}
              >
                <CalendarClock size={16} /> Schedule For Later
              </button>
              
              <button
                className="btn btn-primary"
                style={{ padding: "12px 28px", fontSize: "0.95rem", gap: 8 }}
                onClick={() => launchCampaign()}
                disabled={rows.length === 0 || isScheduling}
              >
                {isScheduling ? (
                  <><Loader size={16} className="animate-spin" /> Dispatching...</>
                ) : (
                  <><Sparkles size={16} /> Trigger n8n Now</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ScheduleModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        totalLeads={rows.length}
        onSave={(schedules, settings) => launchCampaign(schedules, settings)}
      />
    </div>
  );
}
