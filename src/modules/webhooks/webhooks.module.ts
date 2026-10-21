import { Module } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { ExpositionModule } from '#technical/exposition/exposition.module';
import { JobsModule } from '#technical/jobs/jobs.module';
import { NotificationsModule } from '#technical/notifications/notifications.module';
import { SignalModule } from '#technical/signal/signal.module';
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
