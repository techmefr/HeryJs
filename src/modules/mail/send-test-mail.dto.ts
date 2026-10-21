import { z } from 'zod';

export const sendTestMailSchema = z.object({
  to: z.string().email(),
});

export type SendTestMailDto = z.infer<typeof sendTestMailSchema>;
