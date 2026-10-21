import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ChangeFeedRegistry } from '#technical/change-feed/change-feed.registry';
import {
  canUpdateAnyBlogPost,
  canViewBlogPost,
  canViewAnyBlogPost,
} from './blog-post.policy';
import { BLOG_POST_VISIBLE_RECORD_LOADER } from './blog-post-record.loader';
import type { BlogPostRecordLoader } from './blog-post-record.loader';
import { BLOG_POST_SIGNAL_CHANNEL } from './blog-post.service';
import { toBlogPostView } from './blog-post.view';

@Injectable()
export class BlogPostChangeFeed implements OnModuleInit {
  constructor(
    private readonly feed: ChangeFeedRegistry,
    @Inject(BLOG_POST_VISIBLE_RECORD_LOADER)
    private readonly loader: BlogPostRecordLoader,
  ) {}

  onModuleInit(): void {
    this.feed.register({
      model: 'BlogPost',
      channel: BLOG_POST_SIGNAL_CHANNEL,
      canViewAny: canViewAnyBlogPost,
      canView: canViewBlogPost,
      canBroadcast: canUpdateAnyBlogPost,
      load: (id) => this.loader.load(id),
      toView: toBlogPostView,
    });
  }
}
