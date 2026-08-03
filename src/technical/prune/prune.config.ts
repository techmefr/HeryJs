import { heryConfig } from '#technical/config/hery-config';

export interface ResolvedPruneRule {
  retentionDays: number;
  lock: boolean;
}

/**
 * `null` means the project never declared a `prune` block at all -- pruning
 * stays off for every model until one is written, the same way search stays
 * on the Prisma default until a project's config says otherwise.
 */
export function resolvePruneRule(model: string): ResolvedPruneRule | null {
  const config = heryConfig.prune;

  if (!config) {
    return null;
  }

  const override = config.overrides?.[model];

  return {
    retentionDays: override?.retentionDays ?? config.default.retentionDays,
    lock: override?.lock ?? config.default.lock ?? false,
  };
}
