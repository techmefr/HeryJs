export interface HeryConfigSearchEngine {
  driver: string;
}

/**
 * The shape every module-and-driver slice takes, so that mail, export and any
 * later module are declared the same way rather than each inventing its own
 * key names. `default` names one of the entries in `drivers`; it is the only
 * driver a single-driver module ever uses, and the fallback for a per-call
 * module when the call does not name one.
 *
 * `default` is the one place an environment variable may be read straight
 * inside hery.config.ts: it selects a driver name, it does not carry a
 * secret, and that is what lets MAIL_DRIVER swing an app from log to SMTP
 * with no code diff. Credentials belong to the driver, through
 * parseModuleEnv.
 */
export interface HeryConfigDriver {
  driver: string;
}

export interface HeryConfigDrivers {
  default: string;
  drivers: Record<string, HeryConfigDriver>;
}

/**
 * The mapping this framework can supply without taking a product decision it
 * has no business taking: a plan name to the numeric limit it grants a named
 * feature. What a plan is called, what it costs and what proration on a swap
 * does are not framework questions -- see the research behind #34 -- but "the
 * pro plan allows 50 projects" is a fact a project can simply declare.
 */
export type HeryConfigBillingQuotas = Record<string, Record<string, number>>;

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

export interface HeryConfigI18n {
  supportedLocales: string[];
  defaultLocale: string;
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
  i18n?: HeryConfigI18n;
  mail?: HeryConfigDrivers;
  export?: HeryConfigDrivers;
  import?: HeryConfigDrivers;
  storage?: HeryConfigDrivers;
  httpClient?: HeryConfigDrivers;
  sms?: HeryConfigDrivers;
  push?: HeryConfigDrivers;
  billing?: HeryConfigDrivers;
  billingQuotas?: HeryConfigBillingQuotas;
  /**
   * A plan name granted to a tenant with no subscription at all, for the
   * common freemium shape. Absent by default: a tenant with no matching
   * subscription is refused, not silently unlimited, because failing open on
   * a missing subscription is the reading that gives away the product for
   * free to anyone the mirror has not heard from yet.
   */
  billingFreePlan?: string;
}
