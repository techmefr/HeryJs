import type { RelationInstruction } from './list-query';

export interface PrismaRelationDelegate {
  findMany: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>[]>;
  groupBy: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>[]>;
}

export type PrismaRelationClient = Record<string, PrismaRelationDelegate>;

const COUNT_LIKE_TYPES = new Set(['count', 'exists']);

/**
 * Everything parseSearchRequest could not fold into Prisma's own `include`
 * clause: avg/sum/min/max on any relation (Prisma has no inline equivalent),
 * and anything at all on a morphMany relation (Prisma has no relation there
 * to attach to). Each instruction becomes exactly one query across the whole
 * page, keyed back to its parent by foreignKey -- never one query per record.
 *
 * Also normalizes Prisma's own `_count` (from a hasMany count/exists that did
 * reach `include`) into the same `_aggregates` bucket the manual path writes
 * to, so callers past this point never need to know which path produced a
 * given aggregate.
 */
export async function resolveRelationInstructions(
  prisma: PrismaRelationClient,
  records: Record<string, unknown>[],
  instructions: RelationInstruction[] | undefined,
): Promise<void> {
  for (const record of records) {
    const nativeCount = record._count as Record<string, number> | undefined;

    if (nativeCount) {
      record._aggregates = {
        ...(record._aggregates as Record<string, unknown> | undefined),
        ...nativeCount,
      };
      delete record._count;
    }
  }

  if (!instructions || instructions.length === 0) {
    return;
  }

  const ids = records.map((record) => record.id as string);

  for (const instruction of instructions) {
    const delegate = prisma[instruction.childDelegate];

    if (!delegate) {
      throw new Error(
        `no Prisma delegate named "${instruction.childDelegate}"`,
      );
    }

    const where = {
      [instruction.foreignKey]: { in: ids },
      ...(instruction.discriminator
        ? { [instruction.discriminator]: instruction.discriminatorValue }
        : {}),
      ...(instruction.where ?? {}),
    };

    if (instruction.kind === 'include') {
      const rows = await delegate.findMany({
        where,
        ...(instruction.orderBy ? { orderBy: instruction.orderBy } : {}),
        ...(instruction.select ? { select: instruction.select } : {}),
      });

      const grouped = new Map<string, Record<string, unknown>[]>();

      for (const row of rows) {
        const parentId = row[instruction.foreignKey] as string;
        const bucket = grouped.get(parentId) ?? [];
        bucket.push(row);
        grouped.set(parentId, bucket);
      }

      for (const record of records) {
        record[instruction.relation] = grouped.get(record.id as string) ?? [];
      }

      continue;
    }

    const countLike = COUNT_LIKE_TYPES.has(instruction.aggregateType);
    const rows = await delegate.groupBy({
      by: [instruction.foreignKey],
      where,
      ...(countLike
        ? { _count: { _all: true } }
        : {
            [`_${instruction.aggregateType}`]: { [instruction.field!]: true },
          }),
    });

    const valueByParentId = new Map<string, number | null>();

    for (const row of rows) {
      const parentId = row[instruction.foreignKey] as string;
      const value = countLike
        ? (row._count as { _all: number })._all
        : ((row[`_${instruction.aggregateType}`] as Record<string, number>)[
            instruction.field!
          ] ?? null);
      valueByParentId.set(parentId, value);
    }

    for (const record of records) {
      record._aggregates = {
        ...(record._aggregates as Record<string, unknown> | undefined),
        [instruction.aggregateKey]:
          valueByParentId.get(record.id as string) ?? (countLike ? 0 : null),
      };
    }
  }
}
