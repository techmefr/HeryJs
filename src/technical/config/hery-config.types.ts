import type { HttpResilienceConfig } from '#technical/http-client/http-resilience';

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

export type HeryConfigQuotaPeriod = 'total' | 'day' | 'month';

/**
 * A named limit every tenant gets unless a `QuotaOverride` row says otherwise.
 * `period` says when the count starts again: `month` and `day` follow the UTC
 * calendar, `total` never does (a gauge of what a tenant holds, rather than
 * what it did this month). Independent of `billingQuotas`, which grants a
 * limit per plan; this one is per tenant and needs no billing provider.
 */
export interface HeryConfigQuota {
  limit: number;
  period?: HeryConfigQuotaPeriod;
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

export interface HeryConfigI18n {
  supportedLocales: string[];
  defaultLocale: string;
  fallbacks?: Record<string, string[]>;
}

/**
 * Logging is the one slice where every declared driver is active at once: each
 * line goes to all of them, so `stdout` plus a collector is two entries rather
 * than a choice. `default` names the driver the query route prefers to read
 * from when more than one can answer, and `stdout` alone is what a project
 * that declares nothing gets.
 */
export interface HeryConfigLogging extends HeryConfigDrivers {
  retentionDays?: number;
  maxEntriesPerTenant?: number;
}

/**
 * Every field is optional because the defaults are the point: the dashboard
 * records in development and in nothing else. `enabled: true` is the explicit
 * opt-in for a deployed environment, and the routes are then behind an admin
 * capability rather than gone.
 */
export interface HeryConfigPrivacy {
  exportRetentionDays?: number;
}

/**
 * What becomes of the shares a user granted once that user is erased. `revoke`
 * (the default) deletes them with the user; `keep` leaves them in place, so a
 * record shared by someone who left stays shared. Shares granted to the user
 * go with the user either way.
 */
export type HeryConfigGrantorErasure = 'revoke' | 'keep';

export interface HeryConfigSharing {
  onGrantorErasure?: HeryConfigGrantorErasure;
}

/**
 * Who may open the admin studio in production. `operator` (the default) is
 * the platform operator alone; `tenant-admin` also lets a tenant admin in,
 * bounded to its own tenant by the same tenant context every route runs in.
 */
export type HeryConfigStudioAccess = 'operator' | 'tenant-admin';

export interface HeryConfigAdmin {
  studioAccess?: HeryConfigStudioAccess;
}

/**
 * The NODE_ENV values that open the devtools routes (seeders included) and
 * accept the development secrets; `['development', 'test']` when absent. Any
 * other value, an unset NODE_ENV among them, runs as production. A shared
 * environment such as `demo` may be listed: its seeders then stay behind an
 * operator or an admin, and the boot logs a warning.
 */
export interface HeryConfigDevTools {
  environments?: string[];
}

export interface HeryConfigDevDashboard {
  enabled?: boolean;
  retentionHours?: number;
  maxEntriesPerTenant?: number;
  slowQueryMs?: number;
  nPlusOneThreshold?: number;
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
  logging?: HeryConfigLogging;
  devTools?: HeryConfigDevTools;
  devDashboard?: HeryConfigDevDashboard;
  privacy?: HeryConfigPrivacy;
  sharing?: HeryConfigSharing;
  admin?: HeryConfigAdmin;
  mail?: HeryConfigDrivers;
  export?: HeryConfigDrivers;
  import?: HeryConfigDrivers;
  storage?: HeryConfigDrivers;
  httpClient?: HeryConfigDrivers & { resilience?: HttpResilienceConfig };
  featureFlags?: HeryConfigDrivers;
  errorReporter?: HeryConfigDrivers;
  sms?: HeryConfigDrivers;
  embeddings?: HeryConfigDrivers;
  push?: HeryConfigDrivers;
  billing?: HeryConfigDrivers;
  billingQuotas?: HeryConfigBillingQuotas;
  quotas?: Record<string, HeryConfigQuota>;
  /**
   * A plan name granted to a tenant with no subscription at all, for the
   * common freemium shape. Absent by default: a tenant with no matching
   * subscription is refused, not silently unlimited, because failing open on
   * a missing subscription is the reading that gives away the product for
   * free to anyone the mirror has not heard from yet.
   */
  billingFreePlan?: string;
}
