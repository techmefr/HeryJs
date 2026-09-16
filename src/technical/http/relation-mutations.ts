import { InvalidQueryException } from '#technical/errors/invalid-query.exception';

export interface RelationMutationInput {
  attach?: string[];
  detach?: string[];
  sync?: string[];
}

export interface PivotDelegate {
  createMany: (args: Record<string, unknown>) => Promise<unknown>;
  deleteMany: (args: Record<string, unknown>) => Promise<unknown>;
  findMany: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>[]>;
}

/**
 * The related model's own delegate, read through the tenant-scoped client, so
 * that resolving the ids the caller sent is itself scoped.
 */
export interface RelatedDelegate {
  findMany: (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>[]>;
}

/**
 * Ids arrive from client input, and a pivot row is written with no foreign key
 * check this side of the database, so nothing but this stopped a caller from
 * pointing a pivot row at another tenant's record -- then reading that record
 * straight back by including the relation.
 *
 * The lookup goes through the tenant-scoped delegate, which is what makes it
 * safe: a foreign id simply does not come back, so the comparison is between
 * what was asked for and what this tenant can actually see. Checking the ids
 * against a raw client would mean re-deriving the boundary here and getting it
 * wrong the day the boundary moves.
 *
 * Rejected as a 400 naming the unknown ids rather than a 403: from the
 * caller's side an id it cannot see is indistinguishable from an id that does
 * not exist, and saying "forbidden" would confirm the row is real.
 */
async function assertRelatedIdsAreVisible(
  related: RelatedDelegate,
  relation: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const unique = [...new Set(ids)];
  const rows = await related.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  const visible = new Set(rows.map((row) => row.id as string));
  const unknown = unique.filter((id) => !visible.has(id));

  if (unknown.length > 0) {
    throw new InvalidQueryException(relation, unknown);
  }
}

/**
 * A belongsToMany relation touches only the pivot table, never the related
 * row itself, and always as one deleteMany plus one createMany -- never one
 * query per id, whether the caller sent one id or a thousand. `sync` is
 * detach-everything-not-listed then attach-everything-listed, expressed as a
 * single deleteMany with a `notIn` rather than a diff computed in memory.
 * Returns the pivot's full related-key list after the mutation, so a caller
 * gets back the resolved state rather than having to re-fetch it.
 *
 * Only the ids being written are checked. `detach` needs none: removing a
 * pivot row the caller's own parent owns can only ever remove one of its own
 * links, and an id it cannot see matches nothing.
 */
export async function applyRelationMutation(
  pivot: PivotDelegate,
  related: RelatedDelegate,
  relation: string,
  foreignKey: string,
  relatedKey: string,
  parentId: string,
  input: RelationMutationInput,
): Promise<string[]> {
  if (input.sync) {
    await assertRelatedIdsAreVisible(related, relation, input.sync);

    await pivot.deleteMany({
      where: { [foreignKey]: parentId, [relatedKey]: { notIn: input.sync } },
    });

    if (input.sync.length > 0) {
      await pivot.createMany({
        data: input.sync.map((relatedId) => ({
          [foreignKey]: parentId,
          [relatedKey]: relatedId,
        })),
        skipDuplicates: true,
      });
    }
  } else {
    if (input.detach && input.detach.length > 0) {
      await pivot.deleteMany({
        where: { [foreignKey]: parentId, [relatedKey]: { in: input.detach } },
      });
    }

    if (input.attach && input.attach.length > 0) {
      await assertRelatedIdsAreVisible(related, relation, input.attach);

      await pivot.createMany({
        data: input.attach.map((relatedId) => ({
          [foreignKey]: parentId,
          [relatedKey]: relatedId,
        })),
        skipDuplicates: true,
      });
    }
  }

  const rows = await pivot.findMany({
    where: { [foreignKey]: parentId },
    select: { [relatedKey]: true },
  });

  return rows.map((row) => row[relatedKey] as string);
}
