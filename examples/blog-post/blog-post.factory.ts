import { faker } from '@faker-js/faker';

export interface BlogPostFactoryOverrides {
  ownerId: string;
  tenantId?: string;
  title?: string;
  trashed?: boolean;
}

export interface BlogPostFactoryOptions {
  count?: number;
}

function buildBlogPost(overrides: BlogPostFactoryOverrides) {
  return {
    title: overrides.title ?? faker.lorem.words(3),
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
