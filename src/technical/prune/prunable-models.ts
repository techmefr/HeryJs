import { Prisma } from '@prisma/client';

const REQUIRED_FIELDS = ['deletedAt', 'tenantId'];

/**
 * A model is prunable exactly when it carries `deletedAt` and `tenantId` --
 * the two reserved fields the blueprint schema stamps on every generated
 * resource. Reading them off Prisma's own DMMF, rather than maintaining
 * another generator-patched model list alongside TENANT_SCOPED_MODELS and
 * AUDITED_MODELS, means a new soft-deletable resource is prunable the moment
 * it exists, with nothing to wire up and nothing that can drift.
 *
 * `tenantId` is part of that condition and not an assumption: pruning reads
 * the column to attribute each deletion to a tenant's audit chain, and bounds
 * a request-triggered run to the caller's own tenant. A hand-written model
 * carrying `deletedAt` alone would break both, so it is not prunable rather
 * than pruned unsafely.
 */
export function prunableModels(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((model) => {
      const names = new Set(model.fields.map((field) => field.name));
      return REQUIRED_FIELDS.every((field) => names.has(field));
    })
    .map((model) => model.name);
}
