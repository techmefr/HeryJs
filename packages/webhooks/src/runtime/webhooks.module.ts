import { Module } from '@nestjs/common';
import { AuthModule } from '#kernel/auth/auth.module';
import { ExpositionModule } from '#kernel/exposition/exposition.module';
import { JobsModule } from '#kernel/jobs/jobs.module';
import { NotificationsModule } from '#kernel/notifications/notifications.module';
import { SignalModule } from '#kernel/signal/signal.module';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhooksController } from './webhooks.controller';
import { WebhooksProcessor } from './webhooks.processor';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    AuthModule,
    ExpositionModule,
    JobsModule,
    NotificationsModule,
    SignalModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksProcessor, WebhookSignatureGuard],
})
export class WebhooksModule {}
