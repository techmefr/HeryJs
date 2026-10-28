---
title: Error reporting
description: 'Hand every unexpected error to Sentry, Bugsnag or Rollbar behind one contract, with the request and the caller already attached.'
---

A 500 used to leave a stack in the log and an id on the response. That is
enough to debug one, and not enough to learn that it happened four hundred
times since the last deploy. Error trackers answer that question, and they all
ask the same thing of the application: "an unexpected error happened, here is
what it was doing". This is that one thing, behind the usual
[module-and-driver](/HeryJs/guides/modules-and-drivers) contract.

## What is reported

Only errors the framework did not expect: the ones that become a bare
`internal.error` 500. A `DomainException` (the 404, 403 and 422 the framework
raises on purpose) and any other `HttpException` are the application working,
and are never reported. The same `errorId` the response quotes and the log
line carries goes to the tracker, so a user quoting an id leads straight to the
event.

The driver receives, for each error:

| Field           | What it carries                                                         |
| --------------- | ----------------------------------------------------------------------- |
| `errorId`       | the id of the response and of the log line                              |
| `tenantId`      | the caller's tenant, `null` when unauthenticated                        |
| `user`          | the caller's id and who is impersonating them, never an email or a name |
| `request`       | method and path, with no query string, no headers and no body           |
| `tags`, `extra` | whatever application code attached                                      |

Nothing from the request is sent that could carry a credential or a person's
data. An error's own message can, though (a driver error quoting a connection
string, for one), and that is the driver's to scrub: the Sentry `beforeSend`
hook is the place.

## Off by default

With no `errorReporter` slice in `hery.config.ts` the built-in `noop` driver is
active and nothing leaves the process. Declare a driver to turn it on:

```ts
errorReporter: {
  default: process.env.ERROR_REPORTER ?? 'noop',
  drivers: {
    noop: { driver: 'noop' },
    sentry: { driver: 'sentry' },
  },
},
```

Sentry ships as an official driver package:

```bash
pnpm hery install error-reporter-sentry
```

It reads `SENTRY_DSN` (and optionally `SENTRY_ENVIRONMENT` and `SENTRY_RELEASE`) on the
first report, posts to the project's envelope endpoint with `fetch`, and has no SDK to
install. Any error message that quotes credentials in a URL is scrubbed before it leaves.

A declared driver that is not installed stops the boot, with the install
command in the message, rather than quietly reporting nowhere.

## Reporting an error you handled

An error caught on purpose is still worth knowing about: a payment provider
that timed out and was retried, a webhook that was dropped.

```ts
constructor(private readonly errors: ErrorReporterService) {}

try {
  await this.provider.charge(order);
} catch (error) {
  this.errors.capture(error as Error, {
    tags: { provider: 'stripe' },
    extra: { orderId: order.id },
  });
  throw new PaymentDeferredException();
}
```

`capture` returns immediately. Delivery is fire and forget, and a driver that
rejects is logged as a warning: an outage at the tracker must never
turn into an outage of the application, or change the response a caller gets.

## Writing a driver

```ts
import { errorReporterDriverToken } from '#technical/error-reporter/error-reporter-driver';
import type { ErrorReporterDriver } from '#technical/error-reporter/error-reporter-driver';

@Injectable()
export class SentryErrorReporterDriver implements ErrorReporterDriver {
  async capture(error: Error, context: ErrorReportContext): Promise<void> {
    Sentry.withScope((scope) => {
      scope.setTag('errorId', context.errorId);
      scope.setTag('tenantId', context.tenantId ?? 'none');
      scope.setUser(context.user === null ? null : { id: context.user.id });
      scope.setContext('request', context.request ?? {});
      Sentry.captureException(error);
    });
  }

  flush(timeoutMs: number): Promise<void> {
    return Sentry.flush(timeoutMs).then(() => undefined);
  }
}
```

Bind it under `errorReporterDriverToken('sentry')` in a `@Global()` module, as
every other driver package does. `flush` runs on shutdown, so the last errors
before a deploy are not lost in a buffer.
