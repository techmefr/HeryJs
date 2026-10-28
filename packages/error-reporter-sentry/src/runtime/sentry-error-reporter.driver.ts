import { Injectable } from '@nestjs/common';
import type {
  ErrorReportContext,
  ErrorReporterDriver,
} from '@heryjs/core/drivers';
import { parseSentryDsn } from './sentry-dsn';
import { sentryErrorReporterEnv } from './sentry-error-reporter.env';
import { buildSentryEvent } from './sentry-event';

const SENTRY_CLIENT = 'heryjs-error-reporter-sentry/1.0.0';
const SENTRY_PROTOCOL_VERSION = 7;

@Injectable()
export class SentryErrorReporterDriver implements ErrorReporterDriver {
  private readonly inFlight = new Set<Promise<void>>();

  capture(error: Error, context: ErrorReportContext): Promise<void> {
    const delivery = this.deliver(error, context);
    const tracked = delivery
      .catch(() => undefined)
      .finally(() => this.inFlight.delete(tracked));

    this.inFlight.add(tracked);

    return delivery;
  }

  async flush(timeoutMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });

    await Promise.race([Promise.allSettled([...this.inFlight]), timeout]);
    clearTimeout(timer);
  }

  private async deliver(
    error: Error,
    context: ErrorReportContext,
  ): Promise<void> {
    const env = sentryErrorReporterEnv();
    const dsn = parseSentryDsn(env.SENTRY_DSN);
    const event = buildSentryEvent(error, context, {
      environment: env.SENTRY_ENVIRONMENT,
      release: env.SENTRY_RELEASE,
    });
    const body = [
      JSON.stringify({
        event_id: event.event_id,
        sent_at: new Date().toISOString(),
      }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
    ].join('\n');

    const response = await fetch(dsn.envelopeUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-sentry-envelope',
        'x-sentry-auth': `Sentry sentry_version=${SENTRY_PROTOCOL_VERSION}, sentry_key=${dsn.publicKey}, sentry_client=${SENTRY_CLIENT}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Sentry refused the event (${response.status}).`);
    }
  }
}
