"use client";

import { CheckCircle2, Zap, Star } from "lucide-react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { SidebarProvider } from "@/lib/SidebarContext";

const TIERS = [
  {
    name: "Starter",
    price: 25,
    credits: "2,000",
    features: ["Personalized AI Emails", "Google Sheets Import", "Community Support"],
    popular: false,
  },
  {
    name: "Professional",
    price: 49,
    credits: "5,000",
    features: ["Everything in Starter", "Basic Analytics", "Priority Email Support", "Live Draft Editing"],
    popular: true,
  },
  {
    name: "Business",
    price: 79,
    credits: "10,000",
    features: ["Everything in Pro", "Custom Output Rules", "Target Country Filtering", "24/7 Priority Support"],
    popular: false,
  },
  {
    name: "Enterprise",
    price: 99,
    credits: "15,000",
    features: ["Everything in Business", "Dedicated Account Manager", "Custom SSO", "Unlimited Teams"],
    popular: false,
  },
];

export default function PricingPage() {
  return (
    <LanguageProvider>
      <SidebarProvider>
        <div className="layout-app">
          <TopNav />
          <div style={{ flex: 1, padding: "80px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        
        <div style={{ textAlign: "center", maxWidth: 700, marginBottom: 60 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 100, background: "rgba(108,99,255,0.1)", color: "var(--accent-purple)", fontWeight: 700, fontSize: "0.85rem", marginBottom: 20 }}>
            <Zap size={16} /> Power up your outreach
          </div>
          <h1 style={{ fontSize: "3rem", fontWeight: 900, marginBottom: 20, lineHeight: 1.1 }}>
            Simple, transparent pricing
          </h1>
          <p style={{ fontSize: "1.1rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            Pay for exactly what you need. All plans include full access to the AI engine. Upgrade, downgrade, or cancel anytime.
          </p>
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 1200 }}>
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className="glass-card"
              style={{
                width: 280,
                padding: "30px 24px",
                position: "relative",
                border: tier.popular ? "2px solid var(--accent-purple)" : "1px solid var(--border-subtle)",
                transform: tier.popular ? "scale(1.03)" : "none",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {tier.popular && (
                <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "var(--gradient-purple)", color: "white", padding: "4px 14px", borderRadius: 100, fontSize: "0.75rem", fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
                  <Star size={12} fill="white" /> MOST POPULAR
                </div>
              )}
              
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 8 }}>{tier.name}</h3>
              <div style={{ paddingBottom: 24, borderBottom: "1px solid var(--border-subtle)", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: "2.5rem", fontWeight: 900 }}>${tier.price}</span>
                  <span style={{ color: "var(--text-muted)" }}>/mo</span>
                </div>
                <div style={{ fontSize: "0.9rem", color: "var(--accent-purple)", fontWeight: 700, marginTop: 8 }}>
                  {tier.credits} Credits included
                </div>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: 0, gap: 14, display: "flex", flexDirection: "column", flex: 1 }}>
                {tier.features.map((f, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                    <CheckCircle2 size={16} color="var(--accent-green)" style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>

              <button className={tier.popular ? "btn btn-primary" : "btn btn-secondary"} style={{ width: "100%", marginTop: 30, padding: "12px 0" }}>
                Subscribe Now
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 60, textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 16 }}>Need a custom volume plan?</p>
          <button className="btn btn-ghost" style={{ border: "1px solid var(--border-subtle)" }}>Contact Sales</button>
        </div>

      </div>
    </div>
    </SidebarProvider>
    </LanguageProvider>
  );
}
