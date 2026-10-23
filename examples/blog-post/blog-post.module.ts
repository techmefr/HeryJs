import { Module } from '@nestjs/common';
import { AuthModule } from '@heryjs/core/auth';
import { CapabilitiesService } from '@heryjs/core/capabilities';
import { ChangeFeedModule } from '@heryjs/core/realtime';
import { PrismaModule } from '@heryjs/core/database';
import { PrivacyModule } from '@heryjs/core/privacy';
import { SearchModule } from '@heryjs/core/drivers';
import { SignalModule } from '@heryjs/core/realtime';
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
