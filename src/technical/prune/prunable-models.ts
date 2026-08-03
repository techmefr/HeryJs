import { Prisma } from '@prisma/client';

/**
 * A model is prunable exactly when it carries `deletedAt` -- the same
 * reserved field the blueprint schema stamps on every generated resource.
 * Reading it off Prisma's own DMMF, rather than maintaining another
 * generator-patched model list alongside TENANT_SCOPED_MODELS and
 * AUDITED_MODELS, means a new soft-deletable resource is prunable the moment
 * it exists, with nothing to wire up and nothing that can drift.
 */
export function prunableModels(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'deletedAt'))
    .map((model) => model.name);
}
