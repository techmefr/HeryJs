import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { CapabilitiesService } from '#technical/capabilities/capabilities.service';
import { ChangeFeedModule } from '#technical/change-feed/change-feed.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { PrivacyModule } from '#technical/privacy/privacy.module';
import { SearchModule } from '#technical/search/search.module';
import { SignalModule } from '#technical/signal/signal.module';
import { BlogPostChangeFeed } from './blog-post.change-feed';
import { BlogPostController } from './blog-post.controller';
import { BlogPostPersonalData } from './blog-post.personal-data';
import { BlogPostPolicy } from './blog-post.policy';
import { BlogPostService } from './blog-post.service';
import {
  BLOG_POST_RECORD_LOADER,
  BLOG_POST_VISIBLE_RECORD_LOADER,
  BlogPostRecordLoader,
  BlogPostVisibleRecordLoader,
} from './blog-post-record.loader';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SearchModule,
    SignalModule,
    ChangeFeedModule,
    PrivacyModule,
  ],
  controllers: [BlogPostController],
  providers: [
    BlogPostService,
    BlogPostPolicy,
    BlogPostChangeFeed,
    BlogPostPersonalData,
    CapabilitiesService,
    { provide: BLOG_POST_RECORD_LOADER, useClass: BlogPostRecordLoader },
    {
      provide: BLOG_POST_VISIBLE_RECORD_LOADER,
      useClass: BlogPostVisibleRecordLoader,
    },
  ],
})
export class BlogPostModule {}
