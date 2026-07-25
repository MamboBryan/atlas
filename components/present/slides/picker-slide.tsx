"use client";
import type { Palette } from "@/lib/present/palettes";
import type { AgendaItemLite } from "@/lib/present/slide-state";
export function PickerSlide(_: { palette: Palette; item: AgendaItemLite; state: "oneshot-idle" | "oneshot-revealed" | "shuffle-idle" | "shuffle-revealed"; index: number; total: number; meetingTitle: string; meetingId: string }) {
  return <div>PickerSlide stub</div>;
}
