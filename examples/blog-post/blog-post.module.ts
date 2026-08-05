import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { CapabilitiesService } from '#technical/capabilities/capabilities.service';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SearchModule } from '#technical/search/search.module';
import { SignalModule } from '#technical/signal/signal.module';
import { BlogPostController } from './blog-post.controller';
import { BlogPostPolicy } from './blog-post.policy';
import { BlogPostService } from './blog-post.service';
import {
  BLOG_POST_RECORD_LOADER,
  BLOG_POST_VISIBLE_RECORD_LOADER,
  BlogPostRecordLoader,
  BlogPostVisibleRecordLoader,
} from './blog-post-record.loader';

@Module({
  imports: [PrismaModule, AuthModule, SearchModule, SignalModule],
  controllers: [BlogPostController],
  providers: [
    BlogPostService,
    BlogPostPolicy,
    CapabilitiesService,
    { provide: BLOG_POST_RECORD_LOADER, useClass: BlogPostRecordLoader },
    {
      provide: BLOG_POST_VISIBLE_RECORD_LOADER,
      useClass: BlogPostVisibleRecordLoader,
    },
  ],
})
export class BlogPostModule {}
