import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all campaign_leads for this user, joined with lead and campaign data
    // Show pending (upcoming) and recently sent/failed (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from("campaign_leads")
      .select(
        `
        id,
        status,
        scheduled_at,
        sent_at,
        error_message,
        retry_count,
        created_at,
        lead:lead_id (
          id,
          email,
          company_name,
          location
        ),
        campaign:campaign_id (
          id,
          name,
          subject
        )
      `
      )
      .eq("user_id", user.id)
      .not("scheduled_at", "is", null)
      .or(
        `status.eq.pending,status.eq.generating_in_background,and(status.eq.sent,sent_at.gte.${sevenDaysAgo.toISOString()}),and(status.eq.failed,created_at.gte.${sevenDaysAgo.toISOString()})`
      )
      .order("scheduled_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("[QUEUE API] Error fetching queue:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ queue: data ?? [] });
  } catch (err: any) {
    console.error("[QUEUE API] Fatal:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
