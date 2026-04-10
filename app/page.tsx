import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LandingPage from "@/app/landing/page";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Authenticated users go straight to the dashboard
  if (user) {
    redirect("/dashboard");
  }

  // Guests see the public landing page
  return <LandingPage />;
}
