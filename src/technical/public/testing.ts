export { CAPABILITY_CHECK } from '../capabilities/capability.decorator';
export { ChangeFeedRegistry } from '../change-feed/change-feed.registry';
export type { ChangeFeedSubscriber } from '../change-feed/change-feed.types';
export { InMemoryChangeFeedBackend } from '../change-feed/in-memory-change-feed.backend';
export { driverToken } from '../drivers/driver-token';
export { setNotifierMailChannel } from '../notifier/notifier-mail-channel';
export type { NotifierMailChannel } from '../notifier/notifier-mail-channel';
export { setNotifierPushChannel } from '../notifier/notifier-push-channel';
export type {
  NotifierPushChannel,
  NotifierPushDelivery,
} from '../notifier/notifier-push-channel';
export {
  setNotifierSmsChannel,
  setNotifierSmsConsent,
} from '../notifier/notifier-sms-channel';
export type { NotifierSmsConsentDecision } from '../notifier/notifier-sms-channel';
export { OUTBOX_RELAY_OPTIONS } from '../outbox/outbox.runner';
export { createTenantScopedPrismaClient } from '../prisma/prisma.client';
export { inTenantTransaction } from '../prisma/row-level-security';
export { RATE_LIMIT_BUCKET } from '../rate-limit/rate-limit.decorator';
export type { TelemetryRecord } from '../tracing/telemetry-bus';
export { VectorEmbeddingHandler } from '../vector/vector-embedding.handler';
export { VectorSearchService } from '../vector/vector-search.service';
export type { VectorTarget } from '../vector/vector-target';
export { VectorModule } from '../vector/vector.module';
