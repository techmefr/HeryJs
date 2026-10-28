# @heryjs/error-reporter-sentry

Send the errors the framework did not expect to Sentry, with the tenant and the
caller already attached. A driver for the error reporter, over Sentry's
envelope API with `fetch`, so there is no SDK to install or audit.

```bash
pnpm hery install error-reporter-sentry
```

Set `SENTRY_DSN` (and optionally `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`), declare
the driver in `hery.config.ts`, then switch to it:

```ts
errorReporter: {
  default: process.env.ERROR_REPORTER ?? 'noop',
  drivers: { noop: { driver: 'noop' }, sentry: { driver: 'sentry' } },
},
```

What is sent: the error, its stack, the `errorId`, the tenant id, the caller's id,
and the request method and path. Never a query string, a header or a body.
