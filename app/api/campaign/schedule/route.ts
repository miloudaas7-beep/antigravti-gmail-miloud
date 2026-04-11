import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { rows, prompt, emailColumn, nameColumn, schedules } = await request.json();

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
      subject: "AI Outreach", // Could be dynamic later
      template: prompt, // Saving the prompt so the cron job knows what to ask the AI
      status: "scheduled",
      total_leads: rows.length,
    }).select("id").single();

    if (campError || !campaign) {
      throw new Error(`Failed to create campaign: ${campError?.message}`);
    }

    // 2. Insert New Leads (if they don't exist, though we just insert to be safe for this bulk list)
    // We parse them from the CSV.
    const newLeads = rows.map((r: any) => ({
      user_id: user.id,
      email: r[emailColumn] || "",
      company_name: r[nameColumn] || "",
      source: "csv_import"
    })).filter((lead: any) => lead.email !== "");

    // Actually, upserting or just inserting. Since they are just raw CSV, let's insert and get their IDs.
    // Wait, Supabase bulk insert max rows per request limit is around 1000.
    // To ensure returning IDs, we just insert.
    const { data: insertedLeads, error: leadsError } = await supabase
      .from("leads")
      .insert(newLeads)
      .select("id, email");

    if (leadsError || !insertedLeads) {
      throw new Error(`Failed to insert leads: ${leadsError?.message}`);
    }

    // 3. Link them in campaign_leads queue
    const campaignLeadsData = insertedLeads.map((lead: any) => ({
      campaign_id: campaign.id,
      lead_id: lead.id,
      user_id: user.id,
      status: "pending"
    }));

    const { error: clError } = await supabase.from("campaign_leads").insert(campaignLeadsData);
    if (clError) {
      throw new Error(`Failed to map campaign leads: ${clError.message}`);
    }

    // 4. Save the Pattern Schedules
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
