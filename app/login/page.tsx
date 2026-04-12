"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Mail, Lock, User as UserIcon } from "lucide-react";

  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleGoogleLogin = async (isSignup = false) => {
    if (isSignup) {
      if (!fullName) return toast.error("Please enter your Full Name");
      if (!email) return toast.error("Please enter your Email");
      if (!password) return toast.error("Please enter a Password");
      if (password !== confirmPassword) return toast.error("Passwords do not match");
      if (password.length < 6) return toast.error("Password must be at least 6 characters");
      
      // Store custom credentials temporarily to link them in the callback
      document.cookie = `hybrid_pwd=${encodeURIComponent(password)}; path=/; max-age=300; SameSite=Lax`;
      document.cookie = `hybrid_name=${encodeURIComponent(fullName)}; path=/; max-age=300; SameSite=Lax`;
    }

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

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.error("Please fill in all fields.");
    
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "rgba(255,255,255,0.03)", padding: 6, borderRadius: "var(--radius-md)", marginBottom: 24 }}>
          <button 
            onClick={() => setTab("signin")}
            style={{ padding: "8px 0", background: tab === "signin" ? "var(--bg-elevated)" : "transparent", color: tab === "signin" ? "var(--text-primary)" : "var(--text-muted)", borderRadius: "var(--radius-sm)", border: tab === "signin" ? "1px solid var(--border-subtle)" : "1px solid transparent", cursor: "pointer", transition: "all 0.2s", fontWeight: 600, fontSize: "0.9rem" }}
          >
            Sign In
          </button>
          <button 
            onClick={() => setTab("signup")}
            style={{ padding: "8px 0", background: tab === "signup" ? "var(--bg-elevated)" : "transparent", color: tab === "signup" ? "var(--text-primary)" : "var(--text-muted)", borderRadius: "var(--radius-sm)", border: tab === "signup" ? "1px solid var(--border-subtle)" : "1px solid transparent", cursor: "pointer", transition: "all 0.2s", fontWeight: 600, fontSize: "0.9rem" }}
          >
            Sign Up
          </button>
        </div>

        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: 8, letterSpacing: "-0.03em" }}>
          {tab === "signin" ? "Welcome back" : "Create an account"}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 36 }}>
          {tab === "signin" ? "Sign in to access your lead generation dashboard" : "Sign up to automate your cold email campaigns"}
        </p>

        {tab === "signup" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
            <div className="input-group" style={{ position: "relative" }}>
              <UserIcon size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input type="text" className="input" placeholder="Full Name" style={{ paddingLeft: 40, width: "100%" }} value={fullName} onChange={e => setFullName(e.target.value)} disabled={loading} />
            </div>
            <div className="input-group" style={{ position: "relative" }}>
              <Mail size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input type="email" className="input" placeholder="Email Address" style={{ paddingLeft: 40, width: "100%" }} value={email} onChange={e => setEmail(e.target.value)} disabled={loading} />
            </div>
            <div className="input-group" style={{ position: "relative" }}>
              <Lock size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input type="password" className="input" placeholder="Password" style={{ paddingLeft: 40, width: "100%" }} value={password} onChange={e => setPassword(e.target.value)} disabled={loading} />
            </div>
            <div className="input-group" style={{ position: "relative" }}>
              <Lock size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input type="password" className="input" placeholder="Confirm Password" style={{ paddingLeft: 40, width: "100%" }} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={loading} />
            </div>
            
            {/* Google Sign-in Button For Signup (The Hybrid Verify) */}
            <button
              id="google-signup-btn"
              onClick={() => handleGoogleLogin(true)}
              disabled={loading}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "14px 24px",
                background: loading ? "rgba(108,99,255,0.4)" : "linear-gradient(135deg, #6c63ff 0%, #a855f7 100%)",
                border: "none", borderRadius: "var(--radius-md)", color: "#fff", fontSize: "0.95rem", fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "all var(--transition-fast)", marginTop: 8
              }}
            >
              {loading ? <div className="spinner" style={{ width: 20, height: 20 }} /> : <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
              Verify & Sign Up with Google
            </button>
          </div>
        ) : (
          <form style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }} onSubmit={handleManualLogin}>
            <div className="input-group" style={{ position: "relative" }}>
              <Mail size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input type="email" className="input" placeholder="Email Address" style={{ paddingLeft: 40, width: "100%" }} value={email} onChange={e => setEmail(e.target.value)} disabled={loading} required />
            </div>
            <div className="input-group" style={{ position: "relative" }}>
              <Lock size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input type="password" className="input" placeholder="Password" style={{ paddingLeft: 40, width: "100%" }} value={password} onChange={e => setPassword(e.target.value)} disabled={loading} required />
            </div>
            <button type="submit" className="btn btn-secondary" style={{ width: "100%", padding: "12px", justifyContent: "center", fontWeight: 700 }} disabled={loading}>
              Sign In
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>OR DIRECT LOGIN</span>
              <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
            </div>
            {/* Google Sign-in Button For Login */}
            <button
              type="button"
              id="google-login-btn"
              onClick={() => handleGoogleLogin(false)}
              disabled={loading}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "12px 24px",
                background: loading ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "all var(--transition-fast)",
              }}
              onMouseEnter={e => { if (!loading) (e.target as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = loading ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.06)"; }}
            >
              {loading ? <div className="spinner" style={{ width: 20, height: 20 }} /> : <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
              Continue with Google
            </button>
          </form>
        )}

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
