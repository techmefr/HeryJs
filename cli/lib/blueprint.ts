import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';

export const permissionPresetSchema = z.enum(['own', 'team', 'all', 'none']);

export const blueprintFieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  type: z.enum(['string', 'int', 'boolean', 'datetime']),
  optional: z.boolean().default(false),
  hidden: z.boolean().default(false),
});

export const blueprintSchema = z.object({
  name: z.string().regex(/^[A-Z][a-zA-Z0-9]*$/),
  fields: z.array(blueprintFieldSchema).default([]),
  permissions: z
    .object({
      create: permissionPresetSchema.default('own'),
      update: permissionPresetSchema.default('own'),
      delete: permissionPresetSchema.default('own'),
    })
    .default({ create: 'own', update: 'own', delete: 'own' }),
  pagination: z
    .object({
      limits: z.array(z.number().int().positive()).default([10, 15, 20]),
      default: z.number().int().positive().default(15),
    })
    .default({ limits: [10, 15, 20], default: 15 }),
  sorts: z.array(z.string()).default(['createdAt']),
  filters: z.array(z.string()).default([]),
});

export type PermissionPreset = z.infer<typeof permissionPresetSchema>;
export type BlueprintField = z.infer<typeof blueprintFieldSchema>;
export type Blueprint = z.infer<typeof blueprintSchema>;

export function loadBlueprint(filePath: string): Blueprint {
  const raw = yaml.load(readFileSync(filePath, 'utf8'));
  return blueprintSchema.parse(raw);
}
