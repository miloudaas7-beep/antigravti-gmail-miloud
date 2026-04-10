"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<any>(null);
  const supabase = createClient();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    checkUser();
  }, [supabase.auth]);

  return (
    <header className={`landing-header${scrolled ? " landing-header--scrolled" : ""}`}>
      {/* Logo Group */}
      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        <Link href="/" className="landing-logo" id="landing-logo-link">
          <div className="landing-logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" />
            </svg>
          </div>
          <span className="landing-logo-text">
            Smart<span className="landing-logo-accent">Scout</span>
          </span>
        </Link>

        {/* Free Branding Badge */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          background: "linear-gradient(90deg, rgba(108,99,255,0.15) 0%, rgba(168,85,247,0.15) 100%)",
          border: "1px solid rgba(168,85,247,0.3)",
          borderRadius: "20px",
          color: "#dfcdff",
          fontSize: "0.75rem",
          fontWeight: 700,
          letterSpacing: "0.02em",
          boxShadow: "0 0 10px rgba(108,99,255,0.2)"
        }}>
          <span style={{ fontSize: "14px" }}>✨</span>
          Free Plan — Unlimited Access
        </div>
      </div>

      {/* CTA Buttons */}
      <nav className="landing-header-nav" aria-label="Main navigation">
        {user ? (
          <Link
            href="/dashboard"
            className="landing-btn landing-btn-primary"
            style={{ padding: "10px 24px", fontWeight: 700 }}
          >
            Go to Dashboard &rarr;
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              id="header-login-btn"
              className="landing-btn landing-btn-ghost"
            >
              تسجيل الدخول
            </Link>
            <Link
              href="/login"
              id="header-signup-btn"
              className="landing-btn landing-btn-primary"
            >
              <span>إنشاء حساب</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
