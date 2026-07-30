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
      view: permissionPresetSchema.default('own'),
      create: permissionPresetSchema.default('own'),
      update: permissionPresetSchema.default('own'),
      delete: permissionPresetSchema.default('own'),
    })
    .default({ view: 'own', create: 'own', update: 'own', delete: 'own' }),
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

// The team preset resolves against a teamId column, both when deciding on a
// single record and when scoping a collection. Without that field declared the
// resource would generate but deny everything at runtime.
function assertPresetsAreSatisfiable(
  blueprint: Blueprint,
  report: (message: string) => void,
): void {
  const teamActions = Object.entries(blueprint.permissions)
    .filter(([, preset]) => preset === 'team')
    .map(([action]) => action);

  if (teamActions.length === 0) {
    return;
  }

  if (!blueprint.fields.some((field) => field.name === 'teamId')) {
    report(
      `permissions ${teamActions.join(', ')} use the team preset but no "teamId" field is declared`,
    );
  }
}

// CapabilitiesGuard builds its subject with an empty teamIds, so the team
// preset denies every request until the auth layer resolves memberships.
// Generating silently would ship a resource that answers 403 to everyone.
export function warnAboutUnwiredTeamPreset(
  blueprint: Blueprint,
): string | undefined {
  const teamActions = Object.entries(blueprint.permissions)
    .filter(([, preset]) => preset === 'team')
    .map(([action]) => action);

  return teamActions.length > 0
    ? `permissions ${teamActions.join(', ')} use the team preset, but CapabilitiesGuard does not resolve team memberships yet: these actions will deny every request until you populate subject.teamIds.`
    : undefined;
}

export function loadBlueprint(filePath: string): Blueprint {
  const raw = yaml.load(readFileSync(filePath, 'utf8'));
  const blueprint = blueprintSchema.parse(raw);
  const problems: string[] = [];

  assertPresetsAreSatisfiable(blueprint, (message) => problems.push(message));

  if (problems.length > 0) {
    throw new Error(
      `Incoherent blueprint ${filePath}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  }

  return blueprint;
}
