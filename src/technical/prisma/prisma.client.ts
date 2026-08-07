import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  AUDITED_MODELS,
  AUDITED_OPERATIONS,
  writeAuditLog,
} from '../audit/audit-log';
import { env } from '../config/env';
import { TenantContextStorage } from '../tenancy/tenant-context';
import { TraceContextStorage } from '../tracing/trace-context';

interface PrismaQueryEvent {
  query: string;
  params: string;
  duration: number;
}

const TENANT_SCOPED_MODELS = new Set([
  'Team',
  'TeamMember',
  'BlogPost',
  'BlogPostNote',
  'BlogPostTag',
  'Tag',
  'Comment',
  'AppNotification',
]);

/**
 * Models with no tenantId at all, and the reason each one has none. Everything
 * else in the schema carries one: multi-tenancy is not a feature a project turns
 * on later, it is the shape every table has from the first migration, because
 * retrofitting a boundary onto rows that were written without one is the part
 * that cannot be done safely afterwards.
 *
 * `pnpm lint:rls` refuses a model that is in neither this list nor one of the
 * two below.
 */
export const TENANT_FREE_MODELS = new Set([
  // better-auth's own tables. Each row hangs off a User, which does carry a
  // tenantId, and better-auth reads them through its own adapter with its own
  // queries -- a column here would be stamped by nobody.
  'Session',
  'Account',
  'ApiKey',
  // Email-verification and password-reset tokens, looked up by their own value
  // before any session exists, so there is no tenant to scope the lookup by.
  'Verification',
]);

/**
 * The other side of the same question. A model carrying a tenantId is either
 * governed by the extension below -- filtered on every read, stamped on every
 * write, and covered by a Postgres row-level policy -- or it is written from
 * somewhere the extension cannot reach it: better-auth's own adapter, a queue
 * worker with no ambient request, or deliberately outside the extension chain.
 * None of those set `app.tenant_id`, so a policy there would block the very
 * writes that fill the table.
 *
 * Every one of these passes an explicit tenantId at the call site, which is
 * weaker than a boundary and recorded here for that reason: `pnpm lint:rls`
 * requires each tenantId-carrying model to appear in exactly one of the two
 * sets, so adding a tenant table forces the choice instead of defaulting to
 * "no policy, nobody noticed".
 */
export const APP_ENFORCED_TENANT_MODELS = new Set([
  // Written by better-auth's own adapter, which runs its own transactions.
  'User',
  // Written by writeAuditLog against the raw client, deliberately outside the
  // extension chain so an audit entry cannot be scoped away by the boundary it
  // is recording a crossing of.
  'AuditLog',
  // Global rows are the point of a feature flag: tenantId is nullable, and the
  // extension would stamp the current tenant onto a flag meant for everyone.
  'FeatureFlag',
  // Written by a queue worker as well as by a request. A worker runs outside
  // any request, so there is no ambient tenant to stamp or filter by, and the
  // call site passes the tenantId the job carries instead.
  'MailLog',
  'WebhookEndpoint',
  'WebhookEvent',
]);

type TenantHandling =
  'stamp-data' | 'stamp-entries' | 'stamp-and-filter' | 'filter';

/**
 * Every Prisma operation on a tenant-scoped model has to be classified here.
 * This used to be an allowlist of filtered operations, and anything missing from
 * it ran unscoped: `upsert` let one tenant overwrite another tenant's row, and
 * `aggregate` and `groupBy` counted rows across the whole table. An allowlist
 * guarding a boundary has to fail closed, so an unclassified operation now
 * throws instead of quietly crossing it.
 */
const TENANT_HANDLING = new Map<string, TenantHandling>([
  ['create', 'stamp-data'],
  ['createMany', 'stamp-entries'],
  ['createManyAndReturn', 'stamp-entries'],
  ['upsert', 'stamp-and-filter'],
  ['findUnique', 'filter'],
  ['findUniqueOrThrow', 'filter'],
  ['findFirst', 'filter'],
  ['findFirstOrThrow', 'filter'],
  ['findMany', 'filter'],
  ['count', 'filter'],
  ['aggregate', 'filter'],
  ['groupBy', 'filter'],
  ['update', 'filter'],
  ['updateMany', 'filter'],
  ['updateManyAndReturn', 'filter'],
  ['delete', 'filter'],
  ['deleteMany', 'filter'],
]);

export function createTenantScopedPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const rawClient = new PrismaClient({
    adapter,
    log: [{ emit: 'event', level: 'query' }],
  });

  // Same instrumentation as the tenant/audit extensions below: a step per
  // query, keyed off whatever trace context the pipeline middleware already
  // opened for this request -- a no-op outside of one (production, or any
  // call made off the request lifecycle, e.g. a seeder script).
  (
    rawClient as unknown as {
      $on(event: 'query', callback: (event: PrismaQueryEvent) => void): void;
    }
  ).$on('query', (event) => {
    TraceContextStorage.pushStep({
      stage: 'prisma',
      label: 'query',
      status: 'ok',
      durationMs: event.duration,
      detail: { sql: event.query, params: event.params },
    });
  });

  // Audit is applied first, so it stays the outer layer: the tenant extension
  // below sometimes bypasses its own `query(args)` and calls the raw client
  // directly (the RLS branch runs its own transaction against `rawClient`
  // rather than proceeding down the chain), and only a layer that wraps
  // *around* that call still observes its result. An audit extension applied
  // second would sit inside the tenant layer and never run on that branch.
  const auditedClient = rawClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);

          if (AUDITED_MODELS.has(model) && AUDITED_OPERATIONS.has(operation)) {
            const record = result as { id?: string } | null;

            await writeAuditLog(rawClient, {
              tenantId: TenantContextStorage.getTenantId(),
              model,
              operation,
              recordId: record?.id ?? null,
              data: result,
              userId: TenantContextStorage.getUserId(),
              impersonatedBy: TenantContextStorage.getImpersonatedBy(),
            });
          }

          return result;
        },
      },
    },
  });

  return auditedClient.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const handling = TENANT_HANDLING.get(operation);

          if (handling === undefined) {
            throw new Error(
              `Operation "${operation}" on tenant-scoped model "${model}" has no entry in TENANT_HANDLING. Classify it there rather than letting it run across the tenant boundary.`,
            );
          }

          const tenantId = TenantContextStorage.getTenantId();
          const scopedArgs = args as {
            data?: Record<string, unknown> | Record<string, unknown>[];
            create?: Record<string, unknown>;
            where?: Record<string, unknown>;
          };

          if (handling === 'stamp-data') {
            scopedArgs.data = {
              ...(scopedArgs.data as Record<string, unknown>),
              tenantId,
            };
          } else if (handling === 'stamp-entries') {
            scopedArgs.data = (
              Array.isArray(scopedArgs.data)
                ? scopedArgs.data
                : [scopedArgs.data ?? {}]
            ).map((entry) => ({ ...entry, tenantId }));
          } else if (handling === 'stamp-and-filter') {
            // An upsert is both halves at once: the row it may create has to
            // carry the tenant, and the row it may update has to be found
            // inside it.
            scopedArgs.create = { ...scopedArgs.create, tenantId };
            scopedArgs.where = { ...scopedArgs.where, tenantId };
          } else {
            scopedArgs.where = { ...scopedArgs.where, tenantId };
          }

          if (!env.RLS_ENABLED) {
            return query(args);
          }

          // Row-level security relies on a session-local setting, which only
          // survives for the lifetime of a single transaction (this also
          // holds under pgBouncer's transaction pooling mode, since the
          // whole block below runs on one pooled connection). Every
          // tenant-scoped operation is wrapped so the setting and the query
          // it protects always travel together.
          const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
          return rawClient.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
            const delegates = tx as unknown as Record<
              string,
              Record<string, (opArgs: unknown) => unknown>
            >;
            const run = delegates[delegateName]?.[operation];
            if (!run) {
              throw new Error(
                `No Prisma delegate for model "${model}" operation "${operation}"`,
              );
            }
            return run(args);
          });
        },
      },
    },
  });
}

export type TenantScopedPrismaClient = ReturnType<
  typeof createTenantScopedPrismaClient
>;

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');
