import { faker } from '@faker-js/faker';

export interface SnippetFactoryOverrides {
  ownerId: string;
  tenantId?: string;
  title?: string;
  summary?: string;
  trashed?: boolean;
}

export interface SnippetFactoryOptions {
  count?: number;
}

function buildSnippet(overrides: SnippetFactoryOverrides) {
  return {
    title: overrides.title ?? faker.lorem.words(3),
    summary: overrides.summary ?? faker.lorem.words(3),
    ownerId: overrides.ownerId,
    ...(overrides.tenantId ? { tenantId: overrides.tenantId } : {}),
    deletedAt: overrides.trashed ? new Date() : null,
  };
}

export function snippetFactory(
  overrides: SnippetFactoryOverrides,
): ReturnType<typeof buildSnippet>;
export function snippetFactory(
  overrides: SnippetFactoryOverrides,
  options: Required<SnippetFactoryOptions>,
): ReturnType<typeof buildSnippet>[];
export function snippetFactory(
  overrides: SnippetFactoryOverrides,
  options: SnippetFactoryOptions = {},
) {
  if (options.count === undefined) {
    return buildSnippet(overrides);
  }

  return Array.from({ length: options.count }, () => buildSnippet(overrides));
}
