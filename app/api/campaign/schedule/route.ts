import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { startOfDay, addDays } from "date-fns";

export async function POST(request: Request) {
  try {
    const { rows, prompt, emailColumn, nameColumn, schedules, settings } = await request.json();

    if (!rows || rows.length === 0 || !schedules || schedules.length === 0) {
      return NextResponse.json({ error: "Missing rows or schedule data" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Create the Campaign
    const { data: campaign, error: campError } = await supabase.from("campaigns").insert({
      user_id: user.id,
      name: `Auto Campaign - ${new Date().toLocaleDateString()}`,
      subject: "AI Outreach",
      template: prompt,
      status: "scheduled",
      total_leads: rows.length,
    }).select("id").single();

    if (campError || !campaign) {
      throw new Error(`Failed to create campaign: ${campError?.message}`);
    }

    // 2. Insert New Leads
    const newLeads = rows.map((r: any) => ({
      user_id: user.id,
      email: r[emailColumn] || "",
      company_name: r[nameColumn] || "",
      source: "csv_import"
    })).filter((lead: any) => lead.email !== "");

    const { data: insertedLeads, error: leadsError } = await supabase
      .from("leads")
      .insert(newLeads)
      .select("id, email");

    if (leadsError || !insertedLeads) {
      throw new Error(`Failed to insert leads: ${leadsError?.message}`);
    }

    // ── Compute base date (local midnight) in the user's timezone ──
    // We must NOT use Date.UTC() here, as it collapses the timezone offset.
    // Instead: get the current moment in the target timezone, snap to midnight,
    // then convert that local midnight back to a UTC timestamp.
    const tz = settings?.timezone || "UTC";

    // toZonedTime: shifts `now` into the target timezone so we can do date math
    const nowInTZ = toZonedTime(new Date(), tz);
    // startOfDay: snap to midnight in that timezone (e.g. 2026-04-17 00:00 +01:00)
    const localMidnight = startOfDay(nowInTZ);
    // fromZonedTime: convert that local midnight back to a true UTC Date
    let baseDate = fromZonedTime(localMidnight, tz);

    // Shift baseDate to tomorrow if the first scheduled time has already passed
    if (schedules && schedules.length > 0 && schedules[0].times && schedules[0].times.length > 0) {
      const firstS = schedules[0];
      const firstTargetDate = addDays(baseDate, firstS.dayIndex - 1);
      const firstDateStr = firstTargetDate.toISOString().split('T')[0];
      const firstTimeUTC = fromZonedTime(`${firstDateStr} ${firstS.times[0]}:00`, tz);

      if (firstTimeUTC <= new Date()) {
        // The first slot has already passed today — start from tomorrow
        baseDate = addDays(baseDate, 1);
      }
    }

    let globalLeadIndex = 0;
    const campaignLeadsData = [];
    let currentDayOffset = 0;

    // 3. Link them & assign scheduled_at, automatically wrapping to new days if leads exceed slots
    while (globalLeadIndex < insertedLeads.length && schedules.length > 0) {
      for (const s of schedules) {
        if (globalLeadIndex >= insertedLeads.length) break;

        // Calculate target date by adding dayIndex - 1 + currentDayOffset
        const targetDate = new Date(baseDate);
        targetDate.setUTCDate(targetDate.getUTCDate() + (s.dayIndex - 1) + currentDayOffset);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        for (const t of s.times) {
          if (globalLeadIndex >= insertedLeads.length) break;

          const localTimeStr = `${targetDateStr} ${t}:00`;
          const scheduledTimeUTC = fromZonedTime(localTimeStr, tz);

          campaignLeadsData.push({
            campaign_id: campaign.id,
            lead_id: insertedLeads[globalLeadIndex].id,
            user_id: user.id,
            status: "pending",
            scheduled_at: scheduledTimeUTC.toISOString()
          });

          globalLeadIndex++;
        }
      }
      
      // Advance offset by the maximum dayIndex in the provided schedules
      const maxDayIndex = schedules.reduce((max: number, s: any) => Math.max(max, s.dayIndex), 1);
      currentDayOffset += maxDayIndex;
    }

    const { error: clError } = await supabase.from("campaign_leads").insert(campaignLeadsData);
    if (clError) {
      throw new Error(`Failed to map campaign leads: ${clError.message}`);
    }

    // NOTE: campaign_schedules insert removed — scheduling is now owned by n8n.
    // The campaign_leads table with scheduled_at timestamps is the source of truth.

    return NextResponse.json({ success: true, campaignId: campaign.id });

  } catch (err: any) {
    console.error("Scheduled Save Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
