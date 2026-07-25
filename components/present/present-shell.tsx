"use client";

import type { AgendaItemLite, PromptLite } from "@/lib/present/slide-state";

export type PresentComment = {
  id: string;
  agenda_item_id: string | null;
  author_user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type PresentShellProps = {
  viewerId: string;
  meetingId: string;
  meetingTitle: string;
  initialMeeting: {
    status: "scheduled" | "live" | "ended" | "postponed" | "cancelled";
    current_agenda_item_id: string | null;
    has_started: boolean;
  };
  initialItems: AgendaItemLite[];
  initialPromptsById: Record<string, PromptLite>;
  initialComments: PresentComment[];
  initialReactionsByComment: Record<string, { emoji: string; user_id: string }[]>;
};

export function PresentShell(_props: PresentShellProps) {
  return <div style={{ padding: 32 }}>PresentShell stub</div>;
}
