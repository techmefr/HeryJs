import type { ResourceContext } from './resource-context';
import type { VectorTarget } from '#technical/vector/vector-target';

export function vectorTargetOf(ctx: ResourceContext): VectorTarget | null {
  if (!ctx.vector) {
    return null;
  }

  return {
    table: ctx.modelPascalName,
    column: ctx.vector.name,
    sourceColumn: ctx.vector.source,
    dimensions: ctx.vector.dimensions,
    softDeletes: ctx.softDeletes,
  };
}
