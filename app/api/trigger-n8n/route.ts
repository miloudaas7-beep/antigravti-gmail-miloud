import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { startOfDay, addDays } from "date-fns";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { rows, prompt, emailColumn, nameColumn, schedules, settings } =
      await request.json();

    if (!rows || rows.length === 0 || !schedules || schedules.length === 0) {
      return NextResponse.json(
        { error: "Missing rows or schedule data" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── 1. Create Campaign ──────────────────────────────────────────────────
    const { data: campaign, error: campError } = await supabase
      .from("campaigns")
      .insert({
        user_id: user.id,
        name: `Auto Campaign - ${new Date().toLocaleDateString()}`,
        subject: "AI Outreach",
        template: prompt,
        status: "scheduled",
        total_leads: rows.length,
      })
      .select("id")
      .single();

    if (campError || !campaign) {
      throw new Error(`Failed to create campaign: ${campError?.message}`);
    }

    // ── 2. Insert Leads ─────────────────────────────────────────────────────
    const newLeads = rows
      .map((r: any) => ({
        user_id: user.id,
        email: r[emailColumn] || "",
        company_name: r[nameColumn] || "",
        source: "csv_import",
      }))
      .filter((lead: any) => lead.email !== "");

    const { data: insertedLeads, error: leadsError } = await supabase
      .from("leads")
      .insert(newLeads)
      .select("id, email, company_name");

    if (leadsError || !insertedLeads) {
      throw new Error(`Failed to insert leads: ${leadsError?.message}`);
    }

    // ── 3. Compute scheduled_at timestamps (same logic as old /schedule) ────
    const tz = settings?.timezone || "UTC";
    const nowInTZ = toZonedTime(new Date(), tz);
    const localMidnight = startOfDay(nowInTZ);
    let baseDate = fromZonedTime(localMidnight, tz);

    // Shift to tomorrow if first slot has already passed
    if (schedules?.[0]?.times?.length > 0) {
      const firstS = schedules[0];
      const firstTargetDate = addDays(baseDate, firstS.dayIndex - 1);
      const firstDateStr = firstTargetDate.toISOString().split("T")[0];
      const firstTimeUTC = fromZonedTime(
        `${firstDateStr} ${firstS.times[0]}:00`,
        tz
      );
      if (firstTimeUTC <= new Date()) {
        baseDate = addDays(baseDate, 1);
      }
    }

    let globalLeadIndex = 0;
    const campaignLeadsData: any[] = [];
    let currentDayOffset = 0;

    while (globalLeadIndex < insertedLeads.length && schedules.length > 0) {
      for (const s of schedules) {
        if (globalLeadIndex >= insertedLeads.length) break;
        const targetDate = new Date(baseDate);
        targetDate.setUTCDate(
          targetDate.getUTCDate() + (s.dayIndex - 1) + currentDayOffset
        );
        const targetDateStr = targetDate.toISOString().split("T")[0];

        for (const t of s.times) {
          if (globalLeadIndex >= insertedLeads.length) break;
          const scheduledTimeUTC = fromZonedTime(
            `${targetDateStr} ${t}:00`,
            tz
          );
          campaignLeadsData.push({
            campaign_id: campaign.id,
            lead_id: insertedLeads[globalLeadIndex].id,
            user_id: user.id,
            // New status: n8n will handle generation + sending
            status: "generating_in_background",
            scheduled_at: scheduledTimeUTC.toISOString(),
          });
          globalLeadIndex++;
        }
      }
      const maxDayIndex = schedules.reduce(
        (max: number, s: any) => Math.max(max, s.dayIndex),
        1
      );
      currentDayOffset += maxDayIndex;
    }

    // ── 4. Insert campaign_leads ────────────────────────────────────────────
    const { error: clError } = await supabase
      .from("campaign_leads")
      .insert(campaignLeadsData);
    if (clError) {
      throw new Error(`Failed to map campaign leads: ${clError.message}`);
    }

    // ── 5. Save pattern schedules (for UI reference) ────────────────────────
    const scheduleData = schedules.map((s: any) => ({
      campaign_id: campaign.id,
      user_id: user.id,
      day_index: s.dayIndex,
      range_start: s.rangeStart,
      range_end: s.rangeEnd,
      time_slots: s.times,
      is_active: true,
    }));
    await supabase.from("campaign_schedules").insert(scheduleData);

    // ── 6. Build n8n payload ────────────────────────────────────────────────
    const n8nWebhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      console.warn("[TRIGGER-N8N] NEXT_PUBLIC_N8N_WEBHOOK_URL is not set. Skipping n8n call.");
    } else {
      const leadsPayload = campaignLeadsData.map((cl, idx) => ({
        campaignLeadId: cl.campaign_id, // will fetch real IDs from DB if needed
        email: insertedLeads[idx]?.email,
        company_name: insertedLeads[idx]?.company_name,
        scheduled_at: cl.scheduled_at,
      }));

      // ── Fetch the real campaign_leads IDs we just inserted ─────────────────
      const { data: insertedCLs } = await supabase
        .from("campaign_leads")
        .select("id, scheduled_at")
        .eq("campaign_id", campaign.id)
        .eq("user_id", user.id)
        .order("scheduled_at", { ascending: true });

      const enrichedLeads = (insertedCLs ?? []).map((cl: any) => {
        const matched = insertedLeads.find((_, i) =>
          campaignLeadsData[i]?.scheduled_at === cl.scheduled_at
        );
        return {
          campaignLeadId: cl.id,
          scheduled_at: cl.scheduled_at,
        };
      });

      const n8nPayload = {
        userId: user.id,
        campaignId: campaign.id,
        prompt,
        leads: enrichedLeads.length > 0 ? enrichedLeads : leadsPayload,
      };

      // ── Fire and forget — do NOT await so the UI gets a fast 200 ───────────
      fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n8nPayload),
      }).catch((err) =>
        console.error("[TRIGGER-N8N] Failed to reach n8n webhook:", err.message)
      );
    }

    // ── 7. Return immediately — UI doesn't block ────────────────────────────
    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      queued: campaignLeadsData.length,
    });
  } catch (err: any) {
    console.error("[TRIGGER-N8N] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
