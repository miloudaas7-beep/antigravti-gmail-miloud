"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: [
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ].join(" "),
        queryParams: { 
          access_type: "offline",
          prompt: "consent"
        },
      },
    });
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-orb auth-bg-orb-1" />
      <div className="auth-bg-orb auth-bg-orb-2" />

      {/* Animated grid background */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "linear-gradient(rgba(108,99,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(108,99,255,0.06) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
        maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%)",
      }} />

      <div className="auth-card">
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48,
            background: "linear-gradient(135deg, #6c63ff 0%, #a855f7 100%)",
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            boxShadow: "0 0 20px rgba(108,99,255,0.4)",
            flexShrink: 0,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
              Smart<span style={{ background: "linear-gradient(135deg,#6c63ff,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Scout</span> AI
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Lead Intelligence Platform</div>
          </div>
        </div>

        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: 8, letterSpacing: "-0.03em" }}>
          Welcome back
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 36 }}>
          Sign in to access your lead generation dashboard
        </p>

        {/* Feature bullets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 36 }}>
          {[
            { icon: "🔍", text: "AI-powered lead discovery from Google Maps" },
            { icon: "✉️", text: "Automated Gmail outreach with AI personalization" },
            { icon: "📊", text: "Real-time analytics & Google Sheets sync" },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              <span style={{ fontSize: "1rem" }}>{icon}</span>
              {text}
            </div>
          ))}
        </div>

        {/* Google Sign-in Button */}
        <button
          id="google-login-btn"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "14px 24px",
            background: loading ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-primary)",
            fontSize: "0.95rem",
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "all var(--transition-fast)",
          }}
          onMouseEnter={e => { if (!loading) (e.target as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.background = loading ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.06)"; }}
        >
          {loading ? (
            <div className="spinner" style={{ width: 20, height: 20 }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loading ? "Connecting to Google..." : "Continue with Google"}
        </button>

        <div style={{ marginTop: 20, padding: "16px", background: "rgba(108,99,255,0.06)", border: "1px solid rgba(108,99,255,0.15)", borderRadius: "var(--radius-md)" }}>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6, textAlign: "center" }}>
            🔒 We request Gmail Send & Google Sheets permissions to power your email campaigns and sync leads automatically. We never store your raw passwords.
          </p>
        </div>

        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
          By continuing, you agree to our Terms of Service & Privacy Policy.
        </p>
      </div>
    </div>
  );
}
