import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;

  // If env vars not configured yet, allow through (dev setup mode)
  if (
    !supabaseUrl ||
    !supabaseKey ||
    !supabaseUrl.startsWith("http") ||
    supabaseKey === "your_supabase_anon_key"
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const isAuthPath = pathname.startsWith("/login") || pathname.startsWith("/auth");

    if (!user && pathname.startsWith("/dashboard")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    if (user && isAuthPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  } catch (e) {
    // Auth check failed — allow through rather than crash
    console.error("[middleware] auth check failed:", e);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/auth/:path*"],
};
