import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  AUDITED_OPERATIONS,
  writeAuditLog,
  writeAuditLogInTransaction,
} from '../audit/audit-log';
import { env } from '../config/env';
import { heryConfig } from '../config/hery-config';
import { recordHistoryOf } from '../history/history-recorder';
import {
  modelChangeMessages,
  outboxEmitsFor,
  stageOutboxMessages,
} from '../outbox/outbox-stage';
import { defaultKeyring } from '../secrets/default-keyring';
import { redactEncryptedColumns } from '../secrets/encrypted-columns';
import { encryptedFieldsExtension } from '../secrets/encrypted-fields.extension';
import { TenantContextStorage } from '../tenancy/tenant-context';
import { TelemetryBus } from '../tracing/telemetry-bus';
import { TraceContextStorage } from '../tracing/trace-context';
import { modelRegistries } from './model-annotations';
import { warnWhenRowLevelSecurityDisabled } from './row-level-security';
import { AmbientTransactionStorage } from './transaction-context';
import type { AfterCommitCallback } from './transaction-context';

const logger = new Logger('AtomicTransaction');
const ATOMIC_TRANSACTION_TIMEOUT_MS = 30_000;
const ATOMIC_TRANSACTION_MAX_WAIT_MS = 10_000;

interface PrismaQueryEvent {
  query: string;
  params: string;
  duration: number;
}

/**
 * A relation pulled in through `include` or a nested `select` is fetched by
 * the same query as its parent, and the interceptor below only ever saw the
 * top-level operation -- so the relation came back with whatever the caller
 * asked for and no tenant predicate at all. Any related row reachable by id
 * was therefore readable across the boundary, verbatim, inside the parent's
 * payload.
 *
 * The rewrite happens here rather than where the query is built because it has
 * to hold for every caller: a generated search route, a hand-written service,
 * a future one nobody has written yet. Query building stays a pure function of
 * its input, with no ambient request to read.
 */
function relationTargets(model: string): Map<string, string> {
  const cached = RELATION_TARGETS.get(model);

  if (cached) {
    return cached;
  }

  const definition = Prisma.dmmf.datamodel.models.find(
    (candidate) => candidate.name === model,
  );
  const targets = new Map(
    (definition?.fields ?? [])
      .filter((field) => field.kind === 'object')
      .map((field) => [field.name, field.type]),
  );

  RELATION_TARGETS.set(model, targets);

  return targets;
}

const RELATION_TARGETS = new Map<string, Map<string, string>>();

function carriesTenantId(model: string): boolean {
  const registries = modelRegistries();

  return (
    registries.tenantScoped.has(model) ||
    registries.appEnforcedTenant.has(model)
  );
}

/**
 * Walks `include`/`select` and stamps the predicate onto every nested relation
 * whose model carries a tenantId. `_count` is walked too: a count of another
 * tenant's rows discloses their existence as surely as returning them.
 */
function scopeNestedRelations(
  model: string,
  node: unknown,
  tenantId: string,
): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  const targets = relationTargets(model);

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '_count') {
      scopeNestedRelations(
        model,
        (value as { select?: unknown })?.select,
        tenantId,
      );
      continue;
    }

    const target = targets.get(key);

    if (!target) {
      continue;
    }

    // `include: { notes: true }` is the common shape and carries nowhere to
    // put a predicate, so it is rewritten into the object form that does.
    // Skipping it -- as a `typeof value === 'object'` check would -- leaves
    // the most ordinary include in the codebase unscoped.
    if (value === true) {
      if (carriesTenantId(target)) {
        (node as Record<string, unknown>)[key] = { where: { tenantId } };
      }

      continue;
    }

    if (!value || typeof value !== 'object') {
      continue;
    }

    const branch = value as {
      where?: Record<string, unknown>;
      select?: unknown;
      include?: unknown;
    };

    if (carriesTenantId(target)) {
      branch.where = { ...branch.where, tenantId };
    }

    scopeNestedRelations(target, branch.select, tenantId);
    scopeNestedRelations(target, branch.include, tenantId);
  }
}

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

export function isRowLevelSecured(model: string): boolean {
  return modelRegistries().tenantScoped.has(model);
}

export function createTenantScopedPrismaClient() {
  const registries = modelRegistries();
  const rlsEnabled = warnWhenRowLevelSecurityDisabled(heryConfig, (message) =>
    new Logger('RowLevelSecurity').warn(message),
  );
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
    TelemetryBus.emit({
      kind: 'query',
      sql: event.query,
      durationMs: event.duration,
    });
  });

  // Audit is applied first, so it stays the outer layer: the tenant extension
  // below sometimes bypasses its own `query(args)` and calls the raw client
  // directly (the RLS branch runs its own transaction against `rawClient`
  // rather than proceeding down the chain), and only a layer that wraps
  // *around* that call still observes its result. An audit extension applied
  // second would sit inside the tenant layer and never run on that branch.
  const encryptedClient = rawClient.$extends(
    encryptedFieldsExtension(defaultKeyring),
  );
  const auditedClient = encryptedClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);

          if (
            registries.audited.has(model) &&
            AUDITED_OPERATIONS.has(operation)
          ) {
            const record = result as { id?: string } | null;

            const entry = {
              tenantId: TenantContextStorage.getTenantId(),
              model,
              operation,
              recordId: record?.id ?? null,
              data: redactEncryptedColumns(model, result),
              userId: TenantContextStorage.getUserId(),
              impersonatedBy: TenantContextStorage.getImpersonatedBy(),
            };
            const ambient = AmbientTransactionStorage.current();

            if (ambient) {
              await writeAuditLogInTransaction(ambient.tx, entry);
            } else {
              await writeAuditLog(rawClient, entry);
            }
          }

          const ambient = AmbientTransactionStorage.current();

          await recordHistoryOf(ambient ? ambient.tx : rawClient, {
            model,
            operation,
            args,
            result,
          });

          return result;
        },
      },
    },
  });

  return auditedClient.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!registries.tenantScoped.has(model)) {
            // A model outside the boundary can still include one inside it
            // (a User with its BlogPosts), and the policy hides those rows
            // unless the tenant travels with the query.
            const tenantId = TenantContextStorage.findTenantId();

            if (
              !rlsEnabled ||
              tenantId === null ||
              AmbientTransactionStorage.current() ||
              !readsRelations(args)
            ) {
              return query(args);
            }

            return rawClient.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

              return runOnDelegate(tx, model, operation, args);
            });
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

          scopeNestedRelations(
            model,
            (args as { include?: unknown }).include,
            tenantId,
          );
          scopeNestedRelations(
            model,
            (args as { select?: unknown }).select,
            tenantId,
          );

          const emitsOutbox = outboxEmitsFor(model, operation);

          const runAndStage = async (
            tx: Prisma.TransactionClient,
          ): Promise<unknown> => {
            const result = await runOnDelegate(tx, model, operation, args);

            if (emitsOutbox) {
              await stageOutboxMessages(
                tx,
                modelChangeMessages({
                  model,
                  operation,
                  args,
                  result,
                  tenantId,
                }),
              );
            }

            return result;
          };

          const ambient = AmbientTransactionStorage.current();

          if (ambient) {
            return runAndStage(ambient.tx);
          }

          if (!rlsEnabled && !emitsOutbox) {
            return query(args);
          }

          // A write that has to be announced travels in one transaction with
          // its outbox row: both commit or neither does. Row-level security
          // relies on a session-local setting, which only survives for the
          // lifetime of a single transaction (this also holds under
          // pgBouncer's transaction pooling mode, since the whole block below
          // runs on one pooled connection), so the same block carries it and
          // the setting and the query it protects always travel together.
          return rawClient.$transaction(async (tx) => {
            if (rlsEnabled) {
              await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
            }

            return runAndStage(tx);
          });
        },
      },
    },
    client: {
      async $atomic<T>(callback: () => Promise<T>): Promise<T> {
        if (AmbientTransactionStorage.current()) {
          return callback();
        }

        const afterCommit: AfterCommitCallback[] = [];
        const tenantId = TenantContextStorage.getTenantId();

        const result = await rawClient.$transaction(
          async (tx) => {
            if (rlsEnabled) {
              await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
            }

            return AmbientTransactionStorage.run({ tx, afterCommit }, callback);
          },
          {
            timeout: ATOMIC_TRANSACTION_TIMEOUT_MS,
            maxWait: ATOMIC_TRANSACTION_MAX_WAIT_MS,
          },
        );

        for (const callbackAfterCommit of afterCommit) {
          try {
            await callbackAfterCommit();
          } catch (error) {
            logger.warn(
              `a side effect queued for after commit failed: ${(error as Error).message}`,
            );
          }
        }

        return result;
      },
    },
  });
}

function readsRelations(args: unknown): boolean {
  const { include, select } = (args ?? {}) as {
    include?: unknown;
    select?: Record<string, unknown>;
  };

  return (
    include !== undefined ||
    Object.values(select ?? {}).some((value) => typeof value === 'object')
  );
}

function runOnDelegate(
  tx: Prisma.TransactionClient,
  model: string,
  operation: string,
  args: unknown,
): Promise<unknown> {
  const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
  const delegates = tx as unknown as Record<
    string,
    Record<string, (opArgs: unknown) => Promise<unknown>>
  >;
  const run = delegates[delegateName]?.[operation];

  if (!run) {
    throw new Error(
      `No Prisma delegate for model "${model}" operation "${operation}"`,
    );
  }

  return run(args);
}

export type TenantScopedPrismaClient = ReturnType<
  typeof createTenantScopedPrismaClient
>;

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');
