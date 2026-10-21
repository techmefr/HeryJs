import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { CapabilitiesService } from '#technical/capabilities/capabilities.service';
import { ChangeFeedModule } from '#technical/change-feed/change-feed.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { SearchModule } from '#technical/search/search.module';
import { SignalModule } from '#technical/signal/signal.module';
import { SnippetChangeFeed } from './snippet.change-feed';
import { SnippetController } from './snippet.controller';
import { SnippetPolicy } from './snippet.policy';
import { SnippetService } from './snippet.service';
import {
  SNIPPET_RECORD_LOADER,
  SNIPPET_VISIBLE_RECORD_LOADER,
  SnippetRecordLoader,
  SnippetVisibleRecordLoader,
} from './snippet-record.loader';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SearchModule,
    SignalModule,
    ChangeFeedModule,
  ],
  controllers: [SnippetController],
  providers: [
    SnippetService,
    SnippetPolicy,
    SnippetChangeFeed,
    CapabilitiesService,
    { provide: SNIPPET_RECORD_LOADER, useClass: SnippetRecordLoader },
    {
      provide: SNIPPET_VISIBLE_RECORD_LOADER,
      useClass: SnippetVisibleRecordLoader,
    },
  ],
})
export class SnippetModule {}
