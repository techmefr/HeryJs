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
 * A belongsToMany relation touches only the pivot table, never the related
 * row itself, and always as one deleteMany plus one createMany -- never one
 * query per id, whether the caller sent one id or a thousand. `sync` is
 * detach-everything-not-listed then attach-everything-listed, expressed as a
 * single deleteMany with a `notIn` rather than a diff computed in memory.
 * Returns the pivot's full related-key list after the mutation, so a caller
 * gets back the resolved state rather than having to re-fetch it.
 */
export async function applyRelationMutation(
  pivot: PivotDelegate,
  foreignKey: string,
  relatedKey: string,
  parentId: string,
  input: RelationMutationInput,
): Promise<string[]> {
  if (input.sync) {
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
