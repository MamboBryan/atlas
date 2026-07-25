"use client";
import type { Palette } from "@/lib/present/palettes";
import type { AgendaItemLite, PromptLite } from "@/lib/present/slide-state";
export function PromptSlide(_: { palette: Palette; item: AgendaItemLite; prompt: PromptLite; state: "open" | "closed"; index: number; total: number; meetingTitle: string; meetingId: string }) {
  return <div>PromptSlide stub</div>;
}
