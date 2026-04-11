"use client";

import { useState, useEffect } from "react";
import { X, Calendar, Clock, Plus, Zap, Copy, Save, AlertCircle, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

type DaySchedule = {
  dayIndex: number;
  rangeStart: number;
  rangeEnd: number;
  times: string[];
};

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (schedules: DaySchedule[]) => void;
  totalLeads: number;
}

export default function ScheduleModal({ isOpen, onClose, onSave, totalLeads }: ScheduleModalProps) {
  const [scheduleSet, setScheduleSet] = useState<DaySchedule[]>([
    { dayIndex: 1, rangeStart: 1, rangeEnd: Math.min(30, totalLeads), times: [] }
  ]);
  const [activeDay, setActiveDay] = useState<number>(1);

  // Auto Generate Inputs
  const [dailyVolume, setDailyVolume] = useState<number>(30);
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("17:00");

  // Manual Add Input
  const [newTime, setNewTime] = useState<string>("09:00");

  useEffect(() => {
    if (isOpen && scheduleSet.length === 1 && scheduleSet[0].times.length === 0) {
       // Optional: reset on open
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentDay = scheduleSet.find(s => s.dayIndex === activeDay);

  // ==============================
  // LOGIC: Auto Generate Times
  // ==============================
  const handleAutoGenerate = () => {
    if (dailyVolume < 1) return toast.error("Daily volume must be at least 1");
    
    const parseTime = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    
    const startMins = parseTime(startTime);
    const endMins = parseTime(endTime);
    
    if (startMins >= endMins) return toast.error("Start time must be before End time.");

    const diff = endMins - startMins;
    const generatedTimes: string[] = [];

    if (dailyVolume === 1) {
      generatedTimes.push(startTime);
    } else {
      const interval = diff / (dailyVolume - 1);
      for (let i = 0; i < dailyVolume; i++) {
        const total = Math.round(startMins + (interval * i));
        const h = Math.floor(total / 60).toString().padStart(2, "0");
        const m = (total % 60).toString().padStart(2, "0");
        generatedTimes.push(`${h}:${m}`);
      }
    }

    setScheduleSet(prev => prev.map(day => {
      if (day.dayIndex === activeDay) {
        return {
          ...day,
          times: generatedTimes,
          rangeStart: 1,
          rangeEnd: dailyVolume
        };
      }
      return day;
    }));
    toast.success(`Generated ${generatedTimes.length} time slots!`);
  };

  // ==============================
  // LOGIC: Manual Add Time
  // ==============================
  const handleAddTime = () => {
    if (!newTime) return;
    setScheduleSet(prev => prev.map(day => {
      if (day.dayIndex === activeDay) {
        if (day.times.includes(newTime)) {
          toast.error("Time already exists");
          return day;
        }
        const updated = [...day.times, newTime].sort(); // sort chronologically
        return { ...day, times: updated, rangeStart: 1, rangeEnd: updated.length };
      }
      return day;
    }));
  };

  const handleRemoveTime = (timeToRemove: string) => {
    setScheduleSet(prev => prev.map(day => {
      if (day.dayIndex === activeDay) {
        const updated = day.times.filter(t => t !== timeToRemove);
        return { ...day, times: updated, rangeEnd: day.rangeStart + updated.length - 1 };
      }
      return day;
    }));
  };

  // ==============================
  // LOGIC: Global Sync (Apply 30 Days)
  // ==============================
  const handleApply30Days = () => {
    if (!currentDay || currentDay.times.length === 0) {
      return toast.error("Please generate a pattern for Day 1 first!");
    }
    
    const volume = currentDay.times.length;
    let daysRequired = Math.ceil(totalLeads / volume);
    if (daysRequired > 30) daysRequired = 30; // Hard cap at 30 days visualization
    if (daysRequired < 1) daysRequired = 1;

    const newSet: DaySchedule[] = [];
    for (let i = 1; i <= daysRequired; i++) {
      const rStart = (i - 1) * volume + 1;
      let rEnd = i * volume;
      if (rEnd > totalLeads) rEnd = totalLeads;

      const itemsForThisDay = rEnd - rStart + 1;
      
      newSet.push({
        dayIndex: i,
        rangeStart: rStart,
        rangeEnd: rEnd,
        times: currentDay.times.slice(0, itemsForThisDay) // truncate times if last day has fewer leads
      });
    }

    setScheduleSet(newSet);
    setActiveDay(1);
    toast.success(`Pattern synced across ${daysRequired} days!`);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)" }}>
      <div className="glass-card" style={{ width: 1000, height: "85vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", border: "1px solid rgba(168,85,247,0.4)", boxShadow: "0 0 40px rgba(108,99,255,0.15)" }}>
        
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(108,99,255,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, background: "rgba(168,85,247,0.2)", borderRadius: 10, display: "grid", placeItems: "center" }}>
              <Calendar size={18} color="var(--accent-purple)" />
            </div>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Advanced Schedule Builder</h2>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total Leads: {totalLeads} • Pattern Engine</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          
          {/* Sidebar (Day List) */}
          <div style={{ width: 260, borderRight: "1px solid var(--border-subtle)", background: "rgba(0,0,0,0.2)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border-subtle)" }}>
              Campaign Days
            </div>
            {scheduleSet.map(day => {
               const isActive = day.dayIndex === activeDay;
               return (
                 <div
                   key={day.dayIndex}
                   onClick={() => setActiveDay(day.dayIndex)}
                   style={{
                     padding: "16px", borderBottom: "1px solid rgba(255,255,255,0.03)",
                     cursor: "pointer", transition: "all 0.2s",
                     background: isActive ? "rgba(108,99,255,0.1)" : "transparent",
                     borderLeft: isActive ? "3px solid var(--accent-purple)" : "3px solid transparent",
                   }}
                 >
                   <div style={{ fontWeight: 700, fontSize: "0.9rem", color: isActive ? "var(--text-primary)" : "var(--text-secondary)", marginBottom: 4 }}>
                     Day {day.dayIndex}
                   </div>
                   <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                     Emails: {day.rangeStart} - {day.rangeEnd} ({day.times.length} slots)
                   </div>
                 </div>
               );
            })}
          </div>

          {/* Main Pattern Builder */}
          <div style={{ flex: 1, padding: 32, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 4 }}>Day {activeDay} Pattern</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>IDs {currentDay?.rangeStart} to {currentDay?.rangeEnd}</p>
              </div>
              <button onClick={handleApply30Days} className="btn" style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "var(--accent-blue)", fontSize: "0.8rem", padding: "8px 16px" }}>
                <Copy size={14} style={{ marginRight: 6 }} /> Apply to {Math.ceil(totalLeads / (currentDay?.times.length || 1))} Days
              </button>
            </div>

            {/* Auto Generator Panel */}
            <div style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "var(--radius-md)", padding: 20, marginBottom: 32 }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-purple)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <Zap size={16} /> Auto-Generate Time Slots
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Start Time</label>
                  <input type="time" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>End Time</label>
                  <input type="time" className="input" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Total Emails (Volume)</label>
                  <input type="number" className="input" min={1} value={dailyVolume} onChange={e => setDailyVolume(Number(e.target.value))} />
                </div>
                <button onClick={handleAutoGenerate} className="btn" style={{ background: "var(--accent-purple)", color: "white", padding: "10px 20px" }}>
                  Generate
                </button>
              </div>
            </div>

            {/* Manual Timeline List */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Scheduled Time Slots ({currentDay?.times.length || 0})
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="time" className="input" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ padding: "6px 12px", width: 120, fontSize: "0.8rem" }} />
                  <button onClick={handleAddTime} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem", height: 35 }}>
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {currentDay?.times.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, border: "1px dashed var(--border-subtle)", borderRadius: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <Clock size={32} opacity={0.5} />
                  <div>No times scheduled for Day {activeDay}.</div>
                  <div style={{ fontSize: "0.75rem" }}>Use Auto-Generate above to distribute emails automatically.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignContent: "flex-start", maxHeight: 300, overflowY: "auto", paddingRight: 8 }}>
                  {currentDay?.times.map((t, idx) => (
                    <div key={idx} style={{ 
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", 
                      borderRadius: 20, padding: "6px 14px", fontSize: "0.85rem", fontWeight: 600,
                      display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s"
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-purple)", boxShadow: "0 0 10px var(--accent-purple)" }} />
                      {t}
                      <button onClick={() => handleRemoveTime(t)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", padding: 0, marginLeft: 4, cursor: "pointer", display: "grid", placeItems: "center" }}>
                         <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "0.8rem" }}>
            <AlertCircle size={14} /> Will schedule {scheduleSet.reduce((a,b)=>a+b.times.length, 0)} total emails across {scheduleSet.length} days
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onSave(scheduleSet)} style={{ background: "linear-gradient(135deg, #6c63ff 0%, #a855f7 100%)" }}>
              <Save size={16} /> Save Final Schedule
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
