import { z } from "zod";

export const addMember = z.object({
  email: z.string().email(),
  display_name: z.string().min(1).max(80),
});

export const setRole = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

export const deactivate = z.object({ user_id: z.string().uuid() });

export type AddMemberInput = z.infer<typeof addMember>;
export type SetRoleInput = z.infer<typeof setRole>;
export type DeactivateInput = z.infer<typeof deactivate>;
