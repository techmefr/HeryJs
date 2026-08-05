import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type {
  Seeder,
  SeederContext,
  SeederOptions,
} from '#technical/seeders/seeder.types';
import { blogPostFactory } from './blog-post.factory';

@Injectable()
export class BlogPostSeeder implements Seeder {
  name = 'blogPosts';
  description = 'Create sample blog posts for the current tenant';
  defaultCount = 3;
  maxCount = 100;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async run(context: SeederContext, options?: SeederOptions) {
    const count = options?.count ?? this.defaultCount;

    await this.prisma.blogPost.createMany({
      data: blogPostFactory(
        { ownerId: context.ownerId, tenantId: context.tenantId },
        { count },
      ) as unknown as Prisma.BlogPostCreateManyInput[],
    });

    return { count };
  }
}
