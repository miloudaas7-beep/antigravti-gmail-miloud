import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "SmartScout AI — Lead Generation & Cold Email Platform",
  description: "AI-powered B2B lead discovery and automated cold email SaaS. Find leads, personalize with AI, and send at scale.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange={false}>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#12121e",
                color: "#f0f0ff",
                border: "1px solid rgba(108,99,255,0.3)",
                fontFamily: "'Inter', sans-serif",
                fontSize: "0.875rem",
              },
              success: {
                iconTheme: { primary: "#00e676", secondary: "#12121e" },
              },
              error: {
                iconTheme: { primary: "#ff2d55", secondary: "#12121e" },
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}

