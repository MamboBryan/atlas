import { Geist, Nunito } from "next/font/google";

export const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const nunito = Nunito({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});
