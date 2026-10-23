import { faker } from '@faker-js/faker';
import { resolveDefaultLocale } from '@heryjs/core/i18n';

export interface BlogPostFactoryOverrides {
  ownerId: string;
  tenantId?: string;
  title?: string;
  slug?: string;
  summary?: Record<string, string>;
  body?: string;
  privateNote?: string;
  trashed?: boolean;
}

export interface BlogPostFactoryOptions {
  count?: number;
}

function buildBlogPost(overrides: BlogPostFactoryOverrides) {
  return {
    title: overrides.title ?? faker.lorem.words(3),
    slug:
      overrides.slug ??
      `${faker.lorem.slug(3)}-${faker.string.alphanumeric({ length: 6, casing: 'lower' })}`,
    summary: overrides.summary ?? {
      [resolveDefaultLocale()]: faker.lorem.words(3),
    },
    body: overrides.body ?? `<p>${faker.lorem.sentence()}</p>`,
    privateNote: overrides.privateNote ?? faker.string.alphanumeric(24),
    ownerId: overrides.ownerId,
    ...(overrides.tenantId ? { tenantId: overrides.tenantId } : {}),
    deletedAt: overrides.trashed ? new Date() : null,
  };
}

export function blogPostFactory(
  overrides: BlogPostFactoryOverrides,
): ReturnType<typeof buildBlogPost>;
export function blogPostFactory(
  overrides: BlogPostFactoryOverrides,
  options: Required<BlogPostFactoryOptions>,
): ReturnType<typeof buildBlogPost>[];
export function blogPostFactory(
  overrides: BlogPostFactoryOverrides,
  options: BlogPostFactoryOptions = {},
) {
  if (options.count === undefined) {
    return buildBlogPost(overrides);
  }

  return Array.from({ length: options.count }, () => buildBlogPost(overrides));
}
