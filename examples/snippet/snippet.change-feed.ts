import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ChangeFeedRegistry } from '#technical/change-feed/change-feed.registry';
import {
  canUpdateAnySnippet,
  canViewSnippet,
  canViewAnySnippet,
} from './snippet.policy';
import { SNIPPET_VISIBLE_RECORD_LOADER } from './snippet-record.loader';
import type { SnippetRecordLoader } from './snippet-record.loader';
import { SNIPPET_SIGNAL_CHANNEL } from './snippet.service';
import { toSnippetView } from './snippet.view';

@Injectable()
export class SnippetChangeFeed implements OnModuleInit {
  constructor(
    private readonly feed: ChangeFeedRegistry,
    @Inject(SNIPPET_VISIBLE_RECORD_LOADER)
    private readonly loader: SnippetRecordLoader,
  ) {}

  onModuleInit(): void {
    this.feed.register({
      model: 'Snippet',
      channel: SNIPPET_SIGNAL_CHANNEL,
      canViewAny: canViewAnySnippet,
      canView: canViewSnippet,
      canBroadcast: canUpdateAnySnippet,
      load: (id) => this.loader.load(id),
      toView: toSnippetView,
    });
  }
}
