import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveDefaultLocale } from '#technical/i18n/locale.config';
import type {
  PersonalDataDeclaration,
  PersonalDataField,
  PersonalDataHook,
  SearchIndexRemover,
  StoredFileRemover,
} from './personal-data.types';

export const ERASED_TEXT = '[erased]';

const EPOCH = new Date(0);

/**
 * What a personal field holds once its row is anonymised: nothing where the
 * column allows nothing, and the smallest value of its type where it does not.
 * A translatable column is JSON, which Prisma writes as `DbNull` and not as
 * `null`.
 */
export function erasedValue(field: PersonalDataField): unknown {
  if (field.translatable) {
    return field.optional
      ? Prisma.DbNull
      : { [resolveDefaultLocale()]: ERASED_TEXT };
  }

  if (field.optional) {
    return null;
  }

  switch (field.type) {
    case 'int':
      return 0;
    case 'boolean':
      return false;
    case 'datetime':
      return EPOCH;
    case 'string':
    case 'richtext':
    case 'slug':
    case 'file':
    case 'encrypted':
      return ERASED_TEXT;
  }
}

/**
 * A slug is unique per tenant, so one value cannot overwrite every row: each
 * erased row gets its own, made from its id and never from what it held.
 */
export function erasedSlug(id: string): string {
  return `deleted-${id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
}

export function personalSlugFields(
  declaration: PersonalDataDeclaration,
): PersonalDataField[] {
  return declaration.fields.filter(
    (field) => field.personal && field.type === 'slug',
  );
}

export function anonymisedData(
  declaration: PersonalDataDeclaration,
): Record<string, unknown> {
  return Object.fromEntries(
    declaration.fields
      .filter((field) => field.personal && field.type !== 'slug')
      .map((field) => [field.name, erasedValue(field)]),
  );
}

/**
 * A model that holds a foreign key to another registered model has to be
 * erased first, or deleting the one it points at is refused by the database.
 */
function referencedModels(model: string): Set<string> {
  const definition = Prisma.dmmf.datamodel.models.find(
    (candidate) => candidate.name === model,
  );

  return new Set(
    (definition?.fields ?? [])
      .filter(
        // The side holding the key is the single-valued one, named after its
        // own `<name>Id` column. The runtime DMMF does not carry the key
        // columns themselves.
        (field) =>
          field.kind === 'object' &&
          !field.isList &&
          definition?.fields.some(
            (column) => column.name === `${field.name}Id`,
          ),
      )
      .map((field) => field.type),
  );
}

export function eraseOrder(
  declarations: readonly PersonalDataDeclaration[],
): PersonalDataDeclaration[] {
  const registered = new Set(
    declarations.map((declaration) => declaration.model),
  );
  const remaining = [...declarations];
  const ordered: PersonalDataDeclaration[] = [];

  while (remaining.length > 0) {
    const index = remaining.findIndex(
      (candidate) =>
        // Ready once nothing still waiting holds a key to it.
        !remaining.some(
          (other) =>
            other !== candidate &&
            registered.has(other.model) &&
            referencedModels(other.model).has(candidate.model),
        ),
    );
    // A cycle has no safe order; take the next one and let the database say so.
    const [next] = remaining.splice(index === -1 ? 0 : index, 1);

    ordered.push(next!);
  }

  return ordered;
}

/**
 * Where each resource's declaration lives, collected at boot. A generated
 * resource registers itself the way it registers with the change feed, so the
 * kernel never imports a resource and an uninstalled one simply is not here.
 */
@Injectable()
export class PersonalDataRegistry {
  private readonly declarations = new Map<string, PersonalDataDeclaration>();
  private readonly registeredHooks = new Map<string, PersonalDataHook>();
  private remover: StoredFileRemover | null = null;
  private readonly indexRemovers = new Map<string, SearchIndexRemover>();

  register(declaration: PersonalDataDeclaration): void {
    this.declarations.set(declaration.model, declaration);
  }

  all(): PersonalDataDeclaration[] {
    return eraseOrder([...this.declarations.values()]);
  }

  registerHook(hook: PersonalDataHook): void {
    this.registeredHooks.set(hook.name, hook);
  }

  hooks(): PersonalDataHook[] {
    return [...this.registeredHooks.values()];
  }

  registerFileRemover(remover: StoredFileRemover): void {
    this.remover = remover;
  }

  fileRemover(): StoredFileRemover | null {
    return this.remover;
  }

  registerSearchIndexRemover(
    engine: string,
    remover: SearchIndexRemover,
  ): void {
    this.indexRemovers.set(engine, remover);
  }

  searchIndexRemovers(): SearchIndexRemover[] {
    return [...this.indexRemovers.values()];
  }
}
