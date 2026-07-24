import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { geist, nunito } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Team meeting rituals",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable, nunito.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
