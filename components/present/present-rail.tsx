"use client";
import type { Palette } from "@/lib/present/palettes";
import type { PresentComment } from "@/components/present/present-shell";
export function PresentRail(_: { palette: Palette; viewerId: string; meetingId: string; currentAgendaItemId: string | null; comments: PresentComment[]; reactionsByComment: Record<string, { emoji: string; user_id: string }[]> }) {
  return <aside style={{ width: 320, background: "white", color: "black" }}>PresentRail stub</aside>;
}
