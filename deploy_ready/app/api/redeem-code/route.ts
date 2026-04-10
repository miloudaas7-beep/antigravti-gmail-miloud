import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    // Notice we use the service_role key to bypass RLS for fetching the promo code if needed
    // However, if RLS allows reading promo codes, the standard client is fine. 
    // We'll use the standard client first. If it fails due to RLS, it means the SQL migration RLS isn't properly set, 
    // but the migration allows anon reading.
    const { data: promoCode, error: promoError } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", code)
      .eq("is_active", true)
      .single();

    if (promoError || !promoCode) {
      return NextResponse.json({ error: "Code is invalid or has expired" }, { status: 400 });
    }

    const creditValue = promoCode.credit_value;

    // Fetch user's current profile to get the balance
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
    }

    const currentBalance = profile.credits_balance || 0;
    const newBalance = currentBalance + creditValue;

    // Update the balance
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ credits_balance: newBalance })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      added_credits: creditValue,
      new_balance: newBalance
    });

  } catch (error: any) {
    console.error("Redeem code error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
