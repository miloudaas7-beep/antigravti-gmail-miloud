export const dynamic = 'force-dynamic';

import Sidebar from "@/components/Sidebar";
import TopNav from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { SidebarProvider } from "@/lib/SidebarContext";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseConfigured = supabaseUrl && supabaseUrl.startsWith("http");

  if (supabaseConfigured) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }

  return (
    <LanguageProvider>
      <SidebarProvider>
        <div className="dashboard-wrapper">
          <Sidebar />
          <div className="dashboard-main">
            <TopNav />
            <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "28px" }} className="main-content">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </LanguageProvider>
  );
}

