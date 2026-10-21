import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import { toVectorLiteral } from './vector-literal';
import type { VectorScope } from './vector-scope';
import { assertIdentifier } from './vector-target';
import type { VectorMetric, VectorTarget, VectorTrash } from './vector-target';

export interface SimilarRow {
  id: string;
  distance: number;
}

export interface SimilarQuery {
  vector: readonly number[];
  metric: VectorMetric;
  limit: number;
  tenantId: string;
  scope: VectorScope;
  trash: VectorTrash;
}

type RawQueries = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

const OPERATORS: Record<VectorMetric, string> = {
  cosine: '<=>',
  l2: '<->',
};

function identifier(value: string): Prisma.Sql {
  return Prisma.raw(`"${assertIdentifier(value)}"`);
}

function scopeClause(scope: VectorScope): Prisma.Sql {
  switch (scope.kind) {
    case 'all':
      return Prisma.empty;
    case 'none':
      return Prisma.sql`AND FALSE`;
    case 'owner':
      return Prisma.sql`AND "ownerId" = ${scope.ownerId}`;
    case 'teams':
      return Prisma.sql`AND "teamId" IN (${Prisma.join(scope.teams)})`;
  }
}

function trashClause(trash: VectorTrash): Prisma.Sql {
  switch (trash) {
    case 'exclude':
      return Prisma.sql`AND "deletedAt" IS NULL`;
    case 'only':
      return Prisma.sql`AND "deletedAt" IS NOT NULL`;
    case 'include':
    case 'absent':
      return Prisma.empty;
  }
}

@Injectable()
export class VectorStore {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async similar(
    target: VectorTarget,
    query: SimilarQuery,
  ): Promise<SimilarRow[]> {
    if (query.scope.kind === 'none') {
      return [];
    }

    const table = identifier(target.table);
    const column = identifier(target.column);
    const operator = Prisma.raw(OPERATORS[query.metric]);
    const literal = toVectorLiteral(query.vector);
    const trash = target.softDeletes ? trashClause(query.trash) : Prisma.empty;

    return this.inTenant(
      query.tenantId,
      (tx) =>
        tx.$queryRaw<SimilarRow[]>`
        SELECT "id", (${column} ${operator} ${literal}::vector) AS "distance"
        FROM ${table}
        WHERE "tenantId" = ${query.tenantId}
          AND ${column} IS NOT NULL
          ${scopeClause(query.scope)}
          ${trash}
        ORDER BY ${column} ${operator} ${literal}::vector ASC, "id" ASC
        LIMIT ${query.limit}
      `,
    );
  }

  async readSource(
    target: VectorTarget,
    id: string,
    tenantId: string,
  ): Promise<string | null> {
    const table = identifier(target.table);
    const source = identifier(target.sourceColumn);

    const rows = await this.inTenant(
      tenantId,
      (tx) =>
        tx.$queryRaw<{ source: string | null }[]>`
        SELECT ${source} AS "source"
        FROM ${table}
        WHERE "id" = ${id} AND "tenantId" = ${tenantId}
      `,
    );

    return rows[0]?.source ?? null;
  }

  async write(
    target: VectorTarget,
    id: string,
    tenantId: string,
    vector: readonly number[] | null,
  ): Promise<void> {
    const table = identifier(target.table);
    const column = identifier(target.column);
    const value =
      vector === null
        ? Prisma.sql`NULL`
        : Prisma.sql`${toVectorLiteral(vector)}::vector`;

    await this.inTenant(
      tenantId,
      (tx) =>
        tx.$executeRaw`
        UPDATE ${table}
        SET ${column} = ${value}
        WHERE "id" = ${id} AND "tenantId" = ${tenantId}
      `,
    );
  }

  private inTenant<T>(
    tenantId: string,
    run: (tx: RawQueries) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return run(tx);
    });
  }
}
