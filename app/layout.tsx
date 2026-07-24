import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { geist, nunito } from "@/lib/fonts";
import { ThemeProvider } from "@/components/app/theme-provider";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Team meeting rituals",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable, nunito.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
