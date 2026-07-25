import { z } from "zod";

export const postComment = z.object({
  meeting_id: z.string().uuid(),
  agenda_item_id: z.string().uuid().nullable(),
  body: z.string().trim().min(1).max(500),
});
export type PostCommentInput = z.infer<typeof postComment>;

export const deleteMyComment = z.object({
  comment_id: z.string().uuid(),
});
export type DeleteMyCommentInput = z.infer<typeof deleteMyComment>;

export const commentEmoji = z.enum(["👍", "❤️", "😂", "🔥"]);
export type CommentEmoji = z.infer<typeof commentEmoji>;

export const toggleReaction = z.object({
  comment_id: z.string().uuid(),
  emoji: commentEmoji,
});
export type ToggleReactionInput = z.infer<typeof toggleReaction>;
