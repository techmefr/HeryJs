import { Module } from '@nestjs/common';
import { AuthModule } from '@heryjs/core/auth';
import { CapabilitiesService } from '@heryjs/core/capabilities';
import { ChangeFeedModule } from '@heryjs/core/realtime';
import { HistoryModule } from '@heryjs/core/resources';
import { PrismaModule } from '@heryjs/core/database';
import { PrivacyModule } from '@heryjs/core/privacy';
import { SearchModule } from '@heryjs/core/drivers';
import { SignalModule } from '@heryjs/core/realtime';
import { SharingModule } from '@heryjs/core/resources';
import { SnippetChangeFeed } from './snippet.change-feed';
import { SnippetController } from './snippet.controller';
import { SnippetPersonalData } from './snippet.personal-data';
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
    SharingModule,
    HistoryModule,
    PrivacyModule,
  ],
  controllers: [SnippetController],
  providers: [
    SnippetService,
    SnippetPolicy,
    SnippetChangeFeed,
    SnippetPersonalData,
    CapabilitiesService,
    { provide: SNIPPET_RECORD_LOADER, useClass: SnippetRecordLoader },
    {
      provide: SNIPPET_VISIBLE_RECORD_LOADER,
      useClass: SnippetVisibleRecordLoader,
    },
  ],
})
export class SnippetModule {}
