import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { googleSans } from "@/lib/fonts";
import { ThemeProvider } from "@/components/app/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Team meeting rituals",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", googleSans.variable)}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
