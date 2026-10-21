import { Injectable } from '@nestjs/common';
import { validateCronExpression } from 'cron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { env } from '#technical/config/env';

export const backupSettingsSchema = z.object({
  enabled: z.boolean(),
  cron: z
    .string()
    .min(1)
    .refine((expression) => validateCronExpression(expression).valid, {
      message: 'is not a valid cron expression',
    }),
  keep: z.number().int().min(1).max(365),
});

export type BackupSettings = z.infer<typeof backupSettingsSchema>;

const SETTINGS_FILE = 'settings.json';

/**
 * What an operator changes from the admin panel, kept in a file next to the
 * dumps. A database row would not survive the thing a backup is for -- losing
 * the database -- and would need a migration for three values. The file is
 * per machine, which matches the dumps themselves: they live on that machine
 * too. Until someone saves, the environment variables are the settings.
 */
@Injectable()
export class BackupSettingsStore {
  private get file(): string {
    return path.join(env.BACKUP_DIR, SETTINGS_FILE);
  }

  defaults(): BackupSettings {
    return {
      enabled: env.BACKUP_ENABLED,
      cron: env.BACKUP_CRON,
      keep: env.BACKUP_KEEP,
    };
  }

  async get(): Promise<BackupSettings> {
    try {
      const stored = backupSettingsSchema.safeParse(
        JSON.parse(await readFile(this.file, 'utf8')),
      );

      return stored.success ? stored.data : this.defaults();
    } catch {
      return this.defaults();
    }
  }

  async save(settings: BackupSettings): Promise<BackupSettings> {
    await mkdir(env.BACKUP_DIR, { recursive: true });
    await writeFile(this.file, JSON.stringify(settings, null, 2));

    return settings;
  }
}
