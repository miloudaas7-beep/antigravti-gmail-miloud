import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime } from "date-fns-tz";

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

    // Compute base date in target timezone
    const tz = settings?.timezone || "UTC";
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());

    const [cYear, cMonth, cDay] = dateParts.split('-').map(Number);
    const baseDate = new Date(Date.UTC(cYear, cMonth - 1, cDay));

    // Shift baseDate to tomorrow if the first scheduled time has already passed
    if (schedules && schedules.length > 0 && schedules[0].times && schedules[0].times.length > 0) {
      const firstS = schedules[0];
      const testDate = new Date(baseDate);
      testDate.setUTCDate(testDate.getUTCDate() + (firstS.dayIndex - 1));
      const testDateStr = testDate.toISOString().split('T')[0];
      const testTimeStr = `${testDateStr} ${firstS.times[0]}:00`;
      const testTimeUTC = fromZonedTime(testTimeStr, tz);
      
      if (testTimeUTC <= new Date()) {
        baseDate.setUTCDate(baseDate.getUTCDate() + 1);
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

    // 4. Save the Pattern Schedules (Keeping for UI reference, though cron skips it now)
    const scheduleData = schedules.map((s: any) => ({
      campaign_id: campaign.id,
      user_id: user.id,
      day_index: s.dayIndex,
      range_start: s.rangeStart,
      range_end: s.rangeEnd,
      time_slots: s.times,
      is_active: true
    }));

    const { error: schedError } = await supabase.from("campaign_schedules").insert(scheduleData);
    if (schedError) {
      throw new Error(`Failed to save schedules: ${schedError.message}`);
    }

    return NextResponse.json({ success: true, campaignId: campaign.id });

  } catch (err: any) {
    console.error("Scheduled Save Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
