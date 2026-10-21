import { z } from 'zod';

export const restoreBackupSchema = z.object({ confirm: z.string().min(1) });

export type RestoreBackupDto = z.infer<typeof restoreBackupSchema>;
