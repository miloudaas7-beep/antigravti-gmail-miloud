import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { startOfDay, addDays } from "date-fns";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { rows, prompt, emailColumn, nameColumn, schedules, settings } =
      await request.json();

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "Missing contacts data" },
        { status: 400 }
      );
    }

    if (!prompt || !emailColumn) {
      return NextResponse.json(
        { error: "Missing prompt or email column" },
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

    // ── 1. Create Campaign record ──────────────────────────────────────────
    const { data: campaign, error: campError } = await supabase
      .from("campaigns")
      .insert({
        user_id: user.id,
        name: `n8n Campaign - ${new Date().toLocaleDateString()}`,
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

    // ── 2. Insert Leads ────────────────────────────────────────────────────
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

    // ── 3. Compute scheduled_at timestamps ────────────────────────────────
    // If no schedules provided, mark all leads as immediate dispatch (null scheduled_at)
    const hasSchedules = schedules && schedules.length > 0;
    const campaignLeadsData: any[] = [];

    if (hasSchedules) {
      const tz = settings?.timezone || "UTC";
      const nowInTZ = toZonedTime(new Date(), tz);
      const localMidnight = startOfDay(nowInTZ);
      let baseDate = fromZonedTime(localMidnight, tz);

      // Shift to tomorrow if the first scheduled time has already passed
      if (schedules[0]?.times?.length > 0) {
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
    } else {
      // No schedule: assign all leads without a scheduled_at (immediate dispatch via n8n)
      for (const lead of insertedLeads) {
        campaignLeadsData.push({
          campaign_id: campaign.id,
          lead_id: lead.id,
          user_id: user.id,
          status: "generating_in_background",
          scheduled_at: null,
        });
      }
    }

    // ── 4. Insert campaign_leads ───────────────────────────────────────────
    const { error: clError } = await supabase
      .from("campaign_leads")
      .insert(campaignLeadsData);

    if (clError) {
      throw new Error(`Failed to map campaign leads: ${clError.message}`);
    }

    // ── 5. Build and fire the n8n payload ─────────────────────────────────
    // Fetch inserted campaign_lead IDs to enrich the payload
    const { data: insertedCLs } = await supabase
      .from("campaign_leads")
      .select("id, lead_id, scheduled_at")
      .eq("campaign_id", campaign.id)
      .eq("user_id", user.id)
      .order("scheduled_at", { ascending: true, nullsFirst: true });

    // Build enriched leads array: contacts + scheduling info
    const enrichedLeads = (insertedCLs ?? []).map((cl: any) => {
      const lead = insertedLeads.find((l) => l.id === cl.lead_id);
      return {
        campaignLeadId: cl.id,
        email: lead?.email,
        company_name: lead?.company_name,
        scheduled_at: cl.scheduled_at ?? null,
        // Pass the full raw row data for maximum personalization
        rowData: rows.find(
          (r: any) => (r[emailColumn] || "").trim().toLowerCase() === (lead?.email || "").toLowerCase()
        ) ?? {},
      };
    });

    const n8nPayload = {
      userId: user.id,
      campaignId: campaign.id,
      // Raw instructions — n8n AI does the writing
      prompt,
      // All enriched contacts (with IDs and scheduling timestamps)
      leads: enrichedLeads,
      // Scheduling meta
      isScheduled: hasSchedules,
      settings: settings ?? {},
    };

    const n8nWebhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      console.warn(
        "[EXECUTE-SEND] NEXT_PUBLIC_N8N_WEBHOOK_URL is not set. Skipping n8n call."
      );
    } else {
      // Fire-and-forget — do NOT await so the UI gets a fast 200
      fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n8nPayload),
      }).catch((err) =>
        console.error("[EXECUTE-SEND] Failed to reach n8n webhook:", err.message)
      );
    }

    // ── 6. Return immediately ──────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      queued: campaignLeadsData.length,
    });
  } catch (err: any) {
    console.error("[EXECUTE-SEND] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
