"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { User, Save, Key, Link } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter, useSearchParams } from "next/navigation";

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [profile, setProfile] = useState<any>(null);
  const [token, setToken] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    // Handle OAuth callback redirects
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    
    if (success) {
      toast.success("Google Account connected successfully!");
      // Remove query param
      router.replace("/dashboard/settings");
    } else if (error) {
      toast.error(`Connection failed: ${error}`);
      router.replace("/dashboard/settings");
    }

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [pRes, tRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("user_tokens").select("refresh_token, access_token, google_sheet_id, token_expiry").eq("user_id", user.id).single(),
      ]);
      setProfile({ ...pRes?.data, email: user.email, avatar: user.user_metadata?.avatar_url });
      setToken(tRes?.data);
    };
    load();
  }, [searchParams, router]);

  const handleGoogleConnect = () => {
    // Ping our new Auth route which will redirect to the Google consent screen
    window.location.href = "/api/auth/google";
  };

  const formatExpiry = (ts: string) => ts ? new Date(ts).toLocaleDateString() : "Unknown";

  const handleRedeem = async () => {
    if (!promoCode.trim()) return toast.error("Please enter a code");
    setRedeeming(true);
    try {
      const res = await fetch("/api/redeem-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to redeem code");
      
      toast.success(`Redeemed! Added ${data.added_credits} credits. New balance: ${data.new_balance}`);
      setProfile((prev: any) => ({ ...prev, credits_balance: data.new_balance }));
      setPromoCode("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 700, display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ fontSize: "1.6rem" }}>⚙️ Settings</h1>
          <p className="page-subtitle">Manage your account and integrations</p>
        </div>
      </div>

      {/* Profile */}
      <div className="glass-card" style={{ padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <User size={18} color="var(--accent-purple)" />
          <h3 style={{ fontSize: "0.95rem" }}>Profile</h3>
        </div>
        {profile && (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {profile.avatar ? (
              <img src={profile.avatar} alt="Avatar" style={{ width: 56, height: 56, borderRadius: "50%", border: "2px solid var(--accent-purple)" }} />
            ) : (
              <div style={{ width: 56, height: 56, background: "var(--gradient-purple)", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "1.5rem" }}>
                {profile.email?.[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 700 }}>{profile.full_name || profile.email}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{profile.email}</div>
              <span className="badge badge-purple" style={{ marginTop: 6 }}>{profile.plan ?? "free"} plan</span>
            </div>
          </div>
        )}
      </div>

      {/* Credits & Usage */}
      <div className="glass-card" style={{ padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Key size={18} color="var(--accent-blue)" />
          <h3 style={{ fontSize: "0.95rem" }}>Credits & Usage</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { label: "Available Credits", value: profile?.credits_balance ?? 0 },
            { label: "Emails Sent Today", value: profile?.emails_sent_today ?? 0 },
            { label: "Daily Email Limit", value: "400" },
            { label: "Plan", value: profile?.plan ?? "free" },
          ].map(({ label, value }) => (
            <div key={label} style={{ padding: 16, background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Redeem Code */}
        <div style={{ marginTop: 24, padding: 20, background: "rgba(108,99,255,0.06)", borderRadius: "var(--radius-md)", border: "1px dashed rgba(108,99,255,0.4)" }}>
          <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: 12 }}>
             Have a promo code? (شحن الرصيد)
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input 
              type="text" 
              className="input" 
              placeholder="e.g. WELCOME100" 
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              style={{ flex: 1 }}
              disabled={redeeming}
            />
            <button className="btn btn-primary" onClick={handleRedeem} disabled={redeeming || !promoCode.trim()}>
              {redeeming ? "Verifying..." : "Apply"}
            </button>
          </div>
        </div>
      </div>

      {/* Google Integrations */}
      <div className="glass-card" style={{ padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Link size={18} color="var(--accent-green)" />
          <h3 style={{ fontSize: "0.95rem" }}>Google Integrations</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          
          {/* Gmail API Card */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "1.4rem" }}>✉️</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Gmail API</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>Used to send emails from your account</div>
              </div>
            </div>
            {token?.refresh_token ? (
              <span className="badge badge-green">CONNECTED</span>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={handleGoogleConnect}>
                Connect Account
              </button>
            )}
          </div>

            {/* Google Sheets Card */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", border: `1px solid ${token?.refresh_token ? "rgba(0,230,118,0.3)" : "var(--border-subtle)"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "1.4rem" }}>📊</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Google Sheets</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                  {token?.refresh_token
                    ? "Access granted — spreadsheets scope active"
                    : "Connect your Google account to enable"}
                </div>
              </div>
            </div>
            {token?.refresh_token ? (
              <span className="badge badge-green">CONNECTED</span>
            ) : (
               <span className="badge badge-muted">PENDING</span>
            )}
          </div>

        </div>
        
        {token && (
           <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {token.token_expiry && (
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    Token expires: {formatExpiry(token.token_expiry)}
                  </p>
              )}
              <button className="btn btn-ghost btn-sm" onClick={handleGoogleConnect} style={{ fontSize: "0.75rem", padding: "4px 8px" }}>
                Reconnect Account
              </button>
           </div>
        )}
      </div>
    </div>
  );
}
