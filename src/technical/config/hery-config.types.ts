export interface HeryConfigSearchEngine {
  driver: string;
}

export interface HeryConfigPruneRule {
  retentionDays: number;
  lock?: boolean;
}

export interface HeryConfigCache {
  defaultTtlSeconds: number;
}

export interface HeryConfigRateLimitBucket {
  limit: number;
  windowSeconds: number;
}

export interface HeryConfigRateLimit {
  buckets: Record<string, HeryConfigRateLimitBucket>;
}

/**
 * `satisfies HeryConfig` at the config file's own export is the entire
 * contract mechanism: an unknown top-level key or a search engine missing
 * `driver` fails typecheck, not a schema loaded at runtime. Fields are kept
 * optional here only where a project genuinely has nothing to declare yet
 * (Prisma search needs no config at all) -- once a field is worth declaring,
 * its shape inside is closed, not a bag of strings.
 */
export interface HeryConfig {
  search?: {
    default: string;
    engines: Record<string, HeryConfigSearchEngine>;
  };
  prune?: {
    default: HeryConfigPruneRule;
    overrides?: Record<string, Partial<HeryConfigPruneRule>>;
  };
  cache?: HeryConfigCache;
  rateLimit?: HeryConfigRateLimit;
}
