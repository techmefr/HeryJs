import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().min(1).max(255),
});

export const addTeamMemberSchema = z.object({
  userId: z.string().min(1),
});

export const switchTeamSchema = z.object({
  teamId: z.string().min(1),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
export type SwitchTeamInput = z.infer<typeof switchTeamSchema>;
