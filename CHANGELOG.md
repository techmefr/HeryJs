# Changelog

Notable changes to HeryJs. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [semantic versioning](https://semver.org/spec/v2.0.0.html).

Because HeryJs generates code once and never re-syncs it, an entry says what
changes for a **new** project. A change to a generated file reaches an existing
project only when its developer applies it by hand, so anything in that
category is called out here explicitly.

## 0.1.0 — unreleased

First public release.

### The kernel is the @heryjs/core package

`src/technical` is now also the workspace package `@heryjs/core` (`packages/core`, built from `src/technical` by `tsc` into `packages/core/dist`), with one `exports` subpath per public entry (types and compiled JavaScript), `files`, `sideEffects` and the kernel's NestJS, Prisma, BullMQ, Better Auth… dependencies as peers. It stays `private` and nothing is published. The 30 module packages and the module example import `@heryjs/core/<entry>` instead of `#kernel/public/<entry>`, declare `@heryjs/core` as a `workspace:^` peer, and map `@heryjs/core/*` in their `tsconfig.json`; `hery module:new` scaffolds that mapping. The `package-manifests` check now also holds the package's exports, peers and side effects to `src/technical`, and `kernel-boundary` and `hery module:validate` refuse a `@heryjs/core/` subpath that is not an entry. A generated project still carries its own copy of the kernel: `hery install` lands `@heryjs/core/<entry>` as the project's `#technical/public/<entry>`, so an installed module keeps using the classes the app already holds. No behaviour changes. **Migration note:** a module package written against `#kernel/public/<entry>` keeps installing and validating; to move it, run `pnpm hery kernel:migrate [paths…]` (`packages/` by default, `--peer <range>` to declare the peer, `--check` to only list), which rewrites the imports, adds the `@heryjs/core/*` path next to `#kernel/*` and changes nothing on a second run. In this repository, `pnpm run codemod:kernel` replays it.

### The kernel has a public API

The 30 module packages imported 106 internal kernel files through `#kernel/*`, so any move inside `src/technical` could break a published module. The kernel now exposes 17 named entries under `src/technical/public` (`auth`, `capabilities`, `config`, `database`, `drivers`, `env`, `errors`, `http`, `i18n`, `jobs`, `notifications`, `observability`, `platform`, `privacy`, `realtime`, `tenancy`, `testing`), each re-exporting by name what modules use; everything else is internal. Modules import `#kernel/public/<entry>` only (a module may still reach a file it installs into a kernel folder itself). The new `kernel-boundary` convention check and `hery module:validate` refuse any other `#kernel/` path, a snapshot of every exported name (`cli/lib/kernel-public-api.spec.ts`) shows a removal or rename in the diff, and the new `package-manifests` check requires each module package to declare an `exports` map and exactly the peer dependencies its shipped code imports (NestJS, Prisma, zod, BullMQ…). No behaviour changes. **Upgrade note:** an existing project copies `src/technical/public/` by hand; a module installed before this release keeps working, since its internal imports still resolve.

### A listed demo keeps production security

Listing an environment in `devTools.environments` also relaxed the modules' security: under a listed `demo`, the sso and oauth state cookies lost `secure`, `SSO_ALLOW_PRIVATE_ISSUERS` and `WEBHOOK_ALLOW_PRIVATE_URLS` were accepted and the callbacks fell back to `http://localhost`. The list now opens only the dev tools (routes, seeders, development secrets); those relaxations follow the new `isLocalEnvironmentNow()` from `#kernel/config/module-env`, true for NODE_ENV `development` or `test` only. **Upgrade note:** copy `src/technical/config/module-env.ts` by hand; a project that installed `sso` copies `sso.env.ts`, `sso-redirect.ts` and `sso-state.service.ts`, one that installed `oauth` copies `oauth.module.ts`, one that installed `webhooks` copies `outbound-webhook.env.ts`.

### Modules honour devTools.environments

The `sso`, `oauth` and `webhooks` modules still compared NODE_ENV with `production` themselves, so an unset or unlisted NODE_ENV let `SSO_ALLOW_PRIVATE_ISSUERS` and `WEBHOOK_ALLOW_PRIVATE_URLS` through, fell back to a localhost callback and sent non-secure state cookies. They now ask `isDevEnvironmentNow()`, exported by `#kernel/config/module-env` next to `devOnlyDefault`, which answers from `devTools.environments`. **Upgrade note:** copy `src/technical/config/module-env.ts` by hand; a project that installed `sso` copies `sso.env.ts`, `sso-redirect.ts` and `sso-state.service.ts`, one that installed `oauth` copies `oauth.module.ts`, one that installed `webhooks` copies `outbound-webhook.env.ts`.

### Bull Board reserved to the platform operator

`/jobs` mounted Bull Board with no guard: any caller reaching a development environment could read the payloads of every tenant's jobs and retry, remove, clean or pause their queues. It now resolves the bearer token like the session guard and opens for the platform operator only (`PLATFORM_OPERATOR_IDS`); anyone else, a tenant admin included, gets a 404. It stays in place until the admin panel covers raw queues. **Upgrade note:** copy `src/technical/jobs/bull-board.ts` by hand, and open the dashboard with an operator's token in the `Authorization` header.

### Dev routes open only in declared environments

Any NODE_ENV other than `production` used to open the devtools routes (seeders included), the Bull Board and accept the development secrets, so an unset or misspelled NODE_ENV on a server behaved as development. `devTools.environments` in `hery.config.ts` now lists the NODE_ENV values that do, `['development', 'test']` by default; any other value, an unset NODE_ENV included, runs as production: the routes answer 404 and the development secrets, `SECRETS_KEYS` and the modules' `devOnlyDefault` values stop the boot. A shared environment such as `demo` may be listed: its routes open, but the seeders narrow to an admin or the platform operator (`canRunSeeders`) and the boot logs a warning. A value that is not a lowercase name, or `production`, stops the boot with the key named. **Upgrade note:** add `NODE_ENV=development` to your local `.env` (now in `.env.example`), or nothing in development boots with the default secrets; copy by hand `src/technical/config/dev-environments.ts`, `env.ts`, `env-schema.ts`, `module-env.ts`, `hery-config.ts`, `hery-config.types.ts`, `src/technical/dev-only/dev-only.guard.ts`, `dev-only.policy.ts`, `src/technical/seeders/seeders.controller.ts`, `src/technical/secrets/default-keyring.ts` and `src/main.ts`; `devTools` is optional in an existing `hery.config.ts`.

### A restore no longer brings erased people back

Restoring a dump taken before a privacy erasure resurrected the erased user and their rows. Every completed `erase-user` and `erase-tenant` request is now appended to a journal kept outside the database, `PRIVACY_ERASURE_JOURNAL` (default `privacy/erasures.jsonl`), holding ids only. `hery db:restore` and `POST /backups/:name/restore` replay the whole journal once the dump is back, and the new `hery privacy:replay` runs it by hand. `ErasureReplay` is exported by `PrivacyModule`. **Upgrade note:** an existing project copies `src/technical/privacy/erasure-journal.ts`, `erasure-replay.ts`, the changes to `privacy.processor.ts`, `privacy.module.ts`, `backup.service.ts`, `backup.module.ts` and `env-schema.ts`, and `cli/commands/privacy-replay.ts` with its registration in `cli/hery.ts` and its call in `cli/commands/db-backup.ts` by hand; keep the journal on a volume outside the dumps.

### Logs no longer carry personal data

Only the authorization and cookie headers and two query parameters were masked, so an address in a query string, an error message, a stack trace or a logged object reached stdout and every log sink. `LogPipeline` now redacts every line before any driver sees it (`log-redaction.ts`): known secret and personal keys at any depth, the `name` of a person-shaped object, the fields declared `personal` by the `*.personal-data.ts` declarations, and, in every string, e-mail addresses (url-encoded too), phone numbers, JWTs, `Bearer` tokens and labelled secrets. Better Auth logs through the Nest logger instead of the console. A new `no-raw-pii-log` convention check refuses a log call that hands over a `user`, a request `body` or a DTO without `redactForLog(...)`, and `LOG_LEVEL` overrides the level picked from `NODE_ENV`. **Upgrade note:** an existing project copies `src/technical/logging/log-redaction.ts` and the changes to `log.pipeline.ts`, `log.personal-data.ts`, `src/technical/auth/better-auth.instance.ts` and `src/app.module.ts` by hand.

### Row-level security on by default, with an application role

Postgres row-level security was opt-in (`RLS_ENABLED=false`) and the compose stack connected the app as the `heryjs` superuser, which bypasses every policy anyway: the second tenant boundary existed in the migrations and nowhere at runtime. It is now on by default. The app connects through `DATABASE_URL` as `heryjs_app`, a role with neither `SUPERUSER` nor `BYPASSRLS`, and Prisma migrations, `hery db:*` commands and backups use the schema owner through the new `DATABASE_MIGRATION_URL` (falling back to `DATABASE_URL` when unset). The compose stack creates the role on the first boot of an empty volume from `scripts/postgres/app-role.sql`, and CI runs that file on its service containers. `RLS_ENABLED` is gone: the only switch is `database: { rowLevelSecurity: false }` in `hery.config.ts`, and the app then logs a warning each time it builds its Prisma client. A read through a model outside the boundary that includes one inside it (a `User` with its `BlogPost`s) now carries the tenant setting, session resolution reads team memberships inside the user's tenant, and the agency seeder, the prune sweep, the seed script and `purgeTenant` set it too. A new spec proves that the app's role sees no row of another tenant through a raw query with no tenant set. **Upgrade note:** in an existing project, create the application role once as the schema owner, then point the two URLs at their roles:

```bash
psql "postgresql://heryjs:heryjs@localhost:5432/heryjs" -v ON_ERROR_STOP=1 -f scripts/postgres/app-role.sql
```

```dotenv
DATABASE_URL="postgresql://heryjs_app:heryjs_app@localhost:5432/heryjs"
DATABASE_MIGRATION_URL="postgresql://heryjs:heryjs@localhost:5432/heryjs"
```

In production, change the role's password (`ALTER ROLE heryjs_app PASSWORD '...'`) or create a role of your own with the same grants. Copy `scripts/postgres/app-role.sql`, the volume line of `docker-compose.yml`, `prisma.config.ts`, `src/technical/prisma/row-level-security.ts`, `prisma.client.ts`, `session-auth.provider.ts`, `env-schema.ts`, `hery-config.types.ts` and the `test/parallel-*.ts` helpers by hand, and drop `RLS_ENABLED` from your environment. A raw query the app runs on a tenant table outside the Prisma extension now returns nothing unless it sets `app.tenant_id` in its transaction (`inTenantTransaction`).

### Promise lint rules block the build

`@typescript-eslint/no-floating-promises` was only a warning and no lint step failed on warnings, so an unawaited promise could reach `main`. It is now an error in ESLint and oxlint, `no-misused-promises` is enabled explicitly, and `lint`, `lint:fast`, `lint:types` and the admin panel's `lint` fail on any warning (`--max-warnings 0`, `--deny-warnings`). The admin panel now runs both promise rules with type information; its async event handlers are wrapped explicitly, and a form whose `onSubmit` rejects now shows the failure and frees its buttons instead of leaving an unhandled rejection. A new project's `lint` script carries `--max-warnings 0` too; for an existing project, add it to `lint` and set both rules to `error` in `eslint.config.mjs` by hand. The endpoint examples of the docs are now captured under a fixed clock, so regenerating them no longer shifts timestamps by a second from one run to the next.

### Inbound webhooks recorded once, retried, and their secret sealed

`POST /webhooks/:endpointId` created a new `WebhookEvent` for every signed call, so a sender's redelivery or a replay inside the tolerance window ran the event twice, and its `queue.add` ran once with no retry, outside the write. An event is now keyed on the sender's `x-webhook-id`, or on a hash of the signed timestamp and body when there is none, under a unique `(tenantId, endpointId, deliveryId)`: a second arrival answers `202` with the event already recorded. The event and an `inbound-webhook.received` outbox message are written in one transaction; the job is queued right away through `JobsService.dispatchTo` with a retry policy (6 attempts, exponential backoff from 5 s) and the event id as job id, and the outbox relay queues it again if Redis was down. The processor skips an event whose `processedAt` is set. `WebhookEndpoint.secret` is now sealed with `SecretsService`, bound to its endpoint, like the outbound subscription secret; a plaintext secret from an earlier version is still read, and sealed in place at boot. `JobsService.dispatchTo` takes an optional `jobId`, and `SecretsService.isSealed` is new. **Upgrade note:** run the `20261024120000_inbound_webhook_delivery_id` migration; a project that installed `webhooks` copies `webhooks.service.ts`, `webhooks.processor.ts`, `webhooks.controller.ts`, `webhooks.module.ts`, `webhook-signature.guard.ts` and the new `inbound-webhook.constants.ts`, `inbound-webhook.relay.ts` and `webhook-endpoint-secret.service.ts` by hand, along with `src/technical/jobs/jobs.service.ts` and `src/technical/secrets/secrets.service.ts`.

### Erasure reaches the search indexes

A privacy erasure deleted or anonymised rows in the database but never touched Elasticsearch or Meilisearch, so an erased person's searchable fields stayed findable there. A personal-data declaration now names its `searchCollection`, the `search-elasticsearch` and `search-meilisearch` modules register their driver's `remove()` with the privacy registry (`registerSearchIndexRemover`), and the executor removes every erased row's document from each installed engine before touching the rows, for a user and for a whole tenant. Removal goes through the driver's tenant check, so another tenant's documents are never touched. An anonymised row is removed as well: `hery search:reindex` puts it back with its anonymised values. **Upgrade note:** copy `personal-data.types.ts`, `personal-data.registry.ts` and `privacy.executor.ts` by hand; add `searchCollection: '<kebab-name>'` to each generated `*.personal-data.ts`; a project that installed a search module copies its `*-search.module.ts` and the new `*-search.personal-data.ts`.

### Specs wait on conditions, not fixed delays

Specs that slept a fixed number of milliseconds before asserting now wait on what they expect to observe: a polled condition through the new `waitFor` helper (exported from `#devtools/test-support`), a promise resolved by the event itself, a sentinel message published behind the one under test, or an explicit gate for interleaving. The lock heartbeat spec uses a TTL wide enough to survive a loaded runner. A new `no-fixed-sleeps` check in `lint:conventions` refuses a `setTimeout` or `node:timers/promises` in any spec, with an allowlist of two privacy specs whose polling loops move once concurrent work on them lands. **Upgrade note:** the generated resource spec's privacy polling now uses `waitFor`; an existing project keeps its own loop until it is updated by hand.

### Graceful shutdown and session secrets kept out of the request logs

`main.ts` called `enableShutdownHooks()` only when OpenTelemetry was on, so by default a SIGTERM ran no `onModuleDestroy`: Prisma, the outbox runner, the lock heartbeat and the BullMQ queues were cut mid-flight. The app is now built by `createApp()` in the new `src/create-app.ts`, which always enables the hooks. The pino-http logger wrote every response header verbatim, so the Better Auth session cookie (`set-cookie`) and the bearer plugin's `set-auth-token` landed in plaintext on each sign-in log line and were shipped with it. The redaction now lives in `src/technical/logging/http-log-redaction.ts` and also censors both response headers. **Upgrade note:** copy `src/create-app.ts`, `src/main.ts`, `src/technical/logging/http-log-redaction.ts` and the `LoggerModule` options of `src/app.module.ts` by hand.

### Search indexing stays inside the tenant

The Elasticsearch and Meilisearch drivers indexed a document as an upsert by id alone, so a tenant holding another tenant's id overwrote that tenant's document, content and tenant stamp alike. `index()` now reads the tenant stored on an existing document first and drops the write silently when it belongs to another tenant, as `remove()` does; a tenant still creates new ids and updates its own documents. The check is a read before the write, not an atomic condition. **Upgrade note:** a project that installed `search-elasticsearch` or `search-meilisearch` copies `elasticsearch-search.driver.ts` or `meilisearch-search.driver.ts` by hand.

### Search removal stays inside the tenant

The Elasticsearch and Meilisearch drivers deleted a document by its id alone, so a tenant holding another tenant's id removed that tenant's document from the shared collection. `remove()` now reads the tenant stored on the document and deletes it only when it matches the caller's; a document owned by another tenant is left alone like a missing one. The Meilisearch driver also treats a missing index as a missing document. **Upgrade note:** a project that installed `search-elasticsearch` or `search-meilisearch` copies `elasticsearch-search.driver.ts` or `meilisearch-search.driver.ts` by hand.

### Configurable grantor erasure and studio access

Two behaviours are now a choice in `hery.config.ts`, with the previous behaviour as the default. `sharing.onGrantorErasure` says what an erasure does to the shares the erased user granted: `revoke` (default) deletes them, `keep` leaves them in place; shares granted to the user are deleted either way. `admin.studioAccess` says who opens the admin studio in production: `operator` (default) is the platform operator alone, `tenant-admin` also lets a tenant admin in, who only reads its own tenant's data and still cannot reach the operator-only sections. An unknown value for either stops the boot with the key named. **Upgrade note:** copy by hand `hery-config.ts`, `hery-config.types.ts`, `admin-settings.ts`, `admin-studio.policy.ts` and `sharing.personal-data.ts`; the two keys are optional in an existing `hery.config.ts`.

### Erasure only removes the tenant's own files

An erasure removed the stored object behind every key a `file` field held, whatever its prefix, so a user who wrote `B/x.png` into one of their fields and asked to be erased deleted tenant B's file. The executor now removes only keys under the erasing tenant's prefix (`isTenantFileKey` in the new `src/technical/tenancy/tenant-file-key.ts`, with the same `.`/`..`/empty segment refusal as the storage admin delete), and the storage module's file remover goes through `StorageService.removeOwn` instead of the raw driver. A generated `file` field now refuses on the way in any key outside the caller's tenant (`.refine(isCurrentTenantFileKey)` in the DTO, `400 validation.failed`), and the generated spec writes its sample keys under the tenant it runs in. `localeOfEmail` and `localeOfPhone` read only users of the caller's tenant once there is a session; before sign-in they still find the account by its address. `UNAUTHENTICATED_TENANT_ID` is exported from `tenant-context.ts`. **Upgrade note:** copy `src/technical/tenancy/tenant-file-key.ts`, `tenant-context.ts`, `tenant.middleware.ts`, `src/technical/privacy/privacy.executor.ts` and `src/technical/auth/recipient-locale.ts` by hand; a project that installed `storage` copies `storage.service.ts` and `storage.personal-data.ts`; add `.refine(isCurrentTenantFileKey)` to each existing `file` field of a generated DTO.

### Every module proves tenant isolation

`lint:conventions` has a new `tenant-isolation` check (`pnpm run lint:tenant-isolation`): every official module, in its package and in its installed copy, must ship a spec with a `describe('tenant isolation', ...)` block proving tenant A can neither read nor change tenant B's data. All 30 modules now have one, and the generated resource spec groups its cross-tenant tests under that block. The new specs found and this release fixes: `export` wrote every file to `exports/<name>` whatever the tenant, so two tenants exporting the same resource overwrote and read each other's file, now `<tenantId>/exports/<userId>/<name>` with the tenant carried in the job payload; `import` read any key it was given and wrote rows outside any tenant, now it refuses a key outside the job's tenant and writes in that tenant; `peer` rooms were named by the client alone, so two tenants picking the same name shared presence and signalling, now rooms are prefixed by the tenant and `relay()` refuses a target outside the sender's room; the storage upload `confirm` dropped another tenant's pending intent before checking the tenant; the SSE stream key is now built from encoded parts, so `a:x`/`y` and `a`/`x:y` no longer share a stream. **Upgrade note:** a project that installed `export`, `import`, `storage` or `sse` copies `export.processor.ts` and `export.service.ts`, `import.processor.ts` and `import.service.ts`, `storage-upload-intent.service.ts`, or `sse-stream.service.ts` by hand; export jobs already queued without a tenant are refused, re-queue them.

### Privacy requests cover every module table

An export or an erasure now reaches the tables a module owns, not only the resources that declare an `ownerId`: `MailLog` (by recipient address), `ScimIdentity`, `RecordShare` (granted to or by the user), `WebhookDelivery` and `WebhookEvent` (payloads naming the user's id or address), `SmsConsent` (by the account's number), `LogEntry`, `DevtoolsEntry`, `OauthIdentity` and `SsoIdentity`. Each module registers a `PersonalDataHook` with `PersonalDataRegistry.registerHook()`, so an uninstalled module simply has none. The storage module registers a file remover, so an erasure deletes the stored object behind every `file` field it clears, on the active driver. A coverage test fails when a Prisma model has a column that looks like personal data (an address, a number, a user id, a payload) and is neither declared, hooked nor exempted with a stated reason. An export nobody collected is cleared after `privacy.exportRetentionDays` (7 by default) in `hery.config.ts`. **Upgrade note:** `personal-data.types.ts`, `personal-data.registry.ts`, `personal-data.match.ts`, `privacy.executor.ts`, `privacy-retention.task.ts` and `privacy.module.ts` in `src/technical/privacy`, `sharing.personal-data.ts` and `sharing.module.ts`, `log.personal-data.ts` and `log-shipping.module.ts`, `dev-dashboard.personal-data.ts` and `dev-dashboard.module.ts`, and `hery-config.types.ts` changed: copy them by hand. A project that installed `mail`, `scim`, `sms`, `oauth`, `sso`, `storage` or `webhooks` copies that module's new `*.personal-data.ts` and its `*.module.ts`.

### Tenant isolation gaps in SCIM, storage and erasure history

SCIM now scopes every read and write of a user to the token's tenant: listing, filtering, reading, replacing, patching and deactivating a user of another tenant answers `404`, a group refuses another tenant's user as a member, and a provisioned user is created in the token's tenant instead of `default`. The storage admin delete refuses a key whose path has an empty, `.` or `..` segment, so `A/../B/x.png` can no longer reach another tenant's file. A user erasure deletes the row history (`RecordSnapshot`) of every row it erases or anonymises, and a tenant erasure deletes the whole tenant's history, so the history API shows nothing of the erased data and a revert cannot write it back; the outcome reports `snapshotsPurged`. **Upgrade note:** a project that installed `scim` or `storage` copies `prisma-scim-directory.store.ts` or `storage.service.ts` by hand, and every project copies `src/technical/privacy/privacy.executor.ts`.

### Platform operator role

A tenant admin (`role: admin`) could list, create, change and delete the feature flags of every tenant and the global ones, and trip or re-tune the shared HTTP circuits: one tenant could switch a feature off for all the others or shed a dependency they all rely on. There is now a **platform operator**, a user id listed in `PLATFORM_OPERATOR_IDS` (comma separated, read on every decision, unset means nobody), checked by `operatorAbility` in `src/technical/capabilities/ability.ts`. Feature flags: a tenant admin only lists and writes its own tenant's flags, the tenant comes from the session, and naming another tenant or the global flag answers `403 featureFlags.operatorOnly`; the operator keeps the cross-tenant view. Operator-only: the HTTP circuit routes, backups, `/metrics`, `/health`, `/deployment`, `GET /quotas/tenants`, quota overrides and resets, the studio overview, and the admin studio in production (`canUseAdminStudio` meant `role: admin`). The full list is in the [security guide](docs/src/content/docs/guides/security.md). **Upgrade note:** set `PLATFORM_OPERATOR_IDS` before deploying, or nobody reaches these routes (the studio in production included). In an existing project copy by hand `ability.ts`, `env-schema.ts`, `admin-studio.policy.ts`, `studio.policy.ts`, `backup.policy.ts`, `monitoring.policy.ts`, `quotas.policy.ts`, the `feature-flags` controller, policy, service and drivers (a custom driver's `listAll` takes an optional `tenantId`), and, if `http-client` is installed, its `http-resilience.policy.ts`.

### Stricter CI checks

`pnpm run lint` no longer passes `--fix`, so CI fails on code that is not formatted instead of rewriting it on the runner; `pnpm run lint:fix` is the local fixer, and the files that had reached `main` unformatted are reformatted. A new `pnpm run format:check` runs `prettier --check` over every file `lint` covers, and `format` writes the same set. `pnpm test` no longer writes `docs/src/data/endpoint-examples.generated.ts`: `pnpm run docs:examples` regenerates it and CI fails when the committed copy is stale (it was, since slug fields). CI runs the application, module and admin suites as separate steps so one failure no longer hides the others, and a new `randomized-order` job runs the application suite with `--randomize` and prints its seed; the specs that only passed in file order now set up their own data. The backup round trip is skipped locally, with the reason, when `pg_dump` is missing or older than the server, and always runs under CI. The MinIO integration spec waits for the server to stay ready and retries its bucket creation. `@types/node` is pinned to one 24.x version and `engines.node` is `>=24.20`, matching `.nvmrc`. In an existing project, the `lint`, `lint:fix` and `format:check` scripts and the `.prettierignore` are worth copying by hand.

### Messages in the recipient's language

`User` gains a nullable `locale` (migration `add_recipient_locale`, which also adds `OutboxMessage.locale`), set at sign-up from the request's negotiated locale and changed with `PATCH /auth/locale` (`GET /auth/locale` reads it). With none, the recipient gets `i18n.defaultLocale`. Auth mails (verification, reset, magic link, one-time codes), the phone OTP SMS, the `welcome` template, the notification digest (subject pluralised with `Intl.PluralRules`) and `mailLayout`'s `<html lang>` are catalogue keys rendered in the recipient's locale, and `NotifierService` runs every channel's `toMail`/`toSms`/`toPush` inside it (`NotificationRecipient.locale` overrides the stored one). `JobsService` stamps the request locale on every job (`heryLocale`), the event and export processors restore it, and outbox handlers run in the locale the message was staged in. Admin section and action labels translate through `admin.<id>.title`, `admin.<id>.column.<key>`, `admin.<id>.field.<name>`, `admin.<id>.confirm` and `admin.group.<group>` entries, or an `admin.*` key written as the label. An `Exportable` may declare `headers` (catalogue keys or text), and a translatable value is exported in the job's locale instead of `[object Object]`; the CSV, XLSX and PDF drivers all use `exportHeaders`/`exportCellText`. A new `translateMessage(key, details, locale)` renders text that has no English original of its own. **Upgrade note:** run the migration, and copy `src/technical/i18n`, `src/technical/auth`, `src/technical/jobs`, `src/technical/outbox`, `src/technical/export`, `src/technical/admin/admin-labels.ts`, the introspection service and the changed mail, notifier and export modules and drivers by hand.

### Every error message has a French entry

The error catalogue now covers every `DomainException`: the kernel's entries are split by area under `src/technical/i18n/messages/`, and each module ships its own `<module>.catalogue.ts`, registered with `registerCatalogue` when the module loads (oauth, sso, sms, two-factor, storage, webhooks, billing, embeddings). A spec reads every exception class and fails when one has no literal translation key or no entry in a supported locale, with the untranslated keys (`capability.forbidden`, free-text storage reasons) listed and justified. An entry may now carry an `en` template, used over the exception's own message. Errors that bypassed the catalogue are now keyed `DomainException`s: Zod validation answers `400 validation.failed` (it was `http.error`), each issue gaining its `code` and a message translated per Zod issue code while keeping its path, `formErrors` and `fieldErrors`; If-Match parsing (`record.ifMatchSingleEntry`, `record.ifMatchMalformed`), a missing feature flag (`featureFlag.notFound`), backups (`backup.notFound`, `backup.confirmationMismatch`), the admin second-factor gate (`admin.twoFactorRequired`) and inbound webhooks (`webhook.actionNotExposed`, `webhook.bodyInvalid`). `SmsRefusedException` takes a reason code instead of a sentence. Webhook, OAuth and SSO refusals keep their `key` and gain a stable translation key. **Upgrade note:** these are kernel and module files: copy `src/technical/i18n`, the new exception files, `zod-validation.pipe.ts` and the changed modules by hand.

### Per-record sharing across the whole contract

A share now holds wherever the record's permissions do, not only on REST and search. Granting, changing or revoking a share stages a `model.shared` outbox message naming the shared record, in the same transaction: the output cache drops the entries of that record's model, so a revoked reader is no longer served the record from a cached route, and the change feed re-decides who sees the record. The change feed projection now carries the record's shares, so a `read` share delivers live changes to its grantee and a revoked one stops them. `ModelChanged` listeners are not told about `model.shared` (the record was not written); a webhook subscribed to `model.*` receives it. History follows shares (`read` opens the history, `write` opens revert) and now snapshots the workflow state, read-only. A `write` share lets its holder fire workflow transitions, as it lets them update, unless the transition declares the new `shareable: false`. The OpenAPI describe schema publishes `sharing`, and the typed client gains `shares`, `grantShare` and `revokeShare` (`HeryRequest` now accepts `DELETE`). The admin no longer edits a rich text cell in place. The [cache guide](docs/src/content/docs/guides/cache.md) now says that a flag flip does not invalidate the output cache. **Upgrade note:** in an existing project copy `outbox-stage.ts`, `outbox.constants.ts`, `outbox-events.bridge.ts` (in `src/technical/outbox`) and `change-feed.registry.ts` by hand, add `'read'`/`'write'` to `canViewHistory<Resource>`/`canRevert<Resource>` and `'write'` to each transition check of a sharing resource, add the workflow column of a resource with history to `HISTORY_COLUMNS`, and copy the admin runtime `resource-view.ts`.

### A fresh project ships the kernel, not every module

`hery new` used to copy the seventeen modules installed in this repository, SCIM and SSO included, into every project. It now keeps only the three the kernel depends on: impersonation and two-factor, whose install patches kernel files, and push, whose table the guest upgrade writes. Each removed module takes its directory, its Prisma models and registry entries, its `AppModule` line, its compose file, and the root dependencies only it used. `hery install <name>` brings any of them back. Registries written one entry per line keep their layout when an entry is removed, so a module patch anchored on that layout stays in place (`lint:module-patches` used to fail in every fresh project). The README now says which modules a project starts with. The CI scaffold job checks the module list, boots the build without any SSO variable, and installs `scim`, `sso` and `storage` back.

### A fresh project boots its build in production

`node dist/src/main` crashed in every new project on `Cannot find module 'express'`: the kernel imported it without declaring it, and pnpm only links what a manifest declares. `express` is now a dependency, and so are `ts-node` and `typescript`, which the build requires at runtime to read `hery.config.ts` and `cors.config.ts`. A new `runtime-dependencies` convention check compares every runtime import of `src/` and of each module's runtime to the dependencies that will be installed, and `hery doctor` checks that every package the build requires resolves. The CI scaffold job now boots the build with `NODE_ENV=production` and calls `/health/live`. Other fixes on the same path: `CORS_ORIGINS` (comma-separated, validated at boot, `*` refused in production) replaces the origins of `cors.config.ts`; `SSO_REDIRECT_BASE_URL` is validated with the sso module's other variables and listed in `.env.example`; `hery up --start` warns instead of failing when no migration exists yet; the generated bin spec no longer asserts a stranger cannot see a trashed record under `view: all`, where they can open it; `hery uninstall` removes the module's import from `src/app.module.ts` and only says it removed dependencies when there were some; `create:blueprint` refuses to prompt without a terminal, and its `--all-options` template documents every field type, `personal`, `erasure`, `workflow` and the combinations refused with `translatable`; an invalid blueprint prints its problems without a stack trace; Valkey runs with `--maxmemory-policy noeviction`, since BullMQ jobs share it with the cache, and `hery doctor` checks the policy. **Upgrade note:** an existing project copies `src/technical/http/cors.ts`, `src/technical/config/env-schema.ts`, `src/main.ts` and the sso module's `sso.env.ts` by hand, adds `express` to its dependencies and changes the Valkey command in `docker-compose.yml`.

### Slug fields

A blueprint field `type: slug` with a `source` string field (and an optional `stable: true`) is generated on write: lowercase ASCII words, unique per tenant, numbered (`base-2`) when taken, retried with a random suffix when a concurrent write wins the race, and filterable so the read route can look a record up by it. The column carries `@@unique([tenantId, slug])` and a default that keeps writes past the service valid. A slug sent by the client is kept, or refused with `409 slug.taken`. OpenAPI, the typed client, `GET /describe`, the generated suite and the admin form (a slug input that suggests from its source) all know it. The new `src/technical/slug` module and `SlugTakenException` are kernel files: in an existing project copy them by hand, add the `slug.taken` entry to `src/technical/i18n/catalogue.ts`, and add the migration of the field by hand. The admin runtime changed too (`form.ts`, `form-schema.ts`, `query.ts`, `resource.ts` and the new `slug.ts`), copy those by hand. A slug made from a `personal` field is personal too (declaring it `personal: false` is refused), and an anonymising erasure rewrites it to `deleted-<id>`: `personal-data.types.ts`, `personal-data.registry.ts` and `privacy.executor.ts` in `src/technical/privacy` changed, copy them by hand.

### SCIM provisioning

A new `scim` module adds a SCIM 2.0 server for users and groups, scoped to a tenant by a per-tenant bearer token (only its SHA-256 is stored, shown once, replaced to rotate). Users are tenant members and deactivating bans the account and ends its sessions; groups are teams. It supports `PATCH` (including the string booleans Entra ID sends), `eq` filters, paging and the discovery documents, answers in the SCIM error format, and appends every provisioning call to the tenant audit chain. `GET /scim/token`, `POST /scim/token`, `DELETE /scim/token` and `GET /scim/activity` sit behind an admin capability, so the admin panel shows token status and provisioning activity with no admin code. A new `ScimToken` and a tenant-scoped, row-level-secured `ScimIdentity` table are added by a migration. That makes thirty installable modules.

### Production Dockerfile

`hery new` writes a multi-stage `Dockerfile` (non-root, pnpm, Prisma client generated, a health check on `/health/live`) and a `.dockerignore`. Migrations are a separate one-shot target of the same file, `docker build --target migrate`, run once per release rather than on every container start. A new `GET /deployment` route, behind `canReadDeployment`, reports the version, which required environment variables are set (never their values), readiness and applied migrations, and the admin lists it. The [deployment guide](docs/src/content/docs/guides/deployment.md) holds the environment contract.

### Workflow for a resource's status

A blueprint can declare a `workflow`: an initial state, the transitions between states, a permission preset per transition and `requires` guards naming fields that must hold a value. The resource gains a state column (`status` by default, added with a default of the initial state) that clients cannot write, and a `POST /<resource>/transition` route, a batch route like the others, that moves a record along a declared edge. Each transition is its own capability, resolved per record and reported in `capabilities`. An illegal move is refused with a typed `409` (`<resource>.illegalTransition`), an unmet guard with a `422` (`<resource>.transitionGuard`); the write repeats the state it read in its own `where`, so two concurrent callers cannot both fire from the same state. Every transition writes one audit entry (operation `transition`) and stages one `workflow.transitioned` outbox message in the same transaction as the new state. `GET /describe` publishes the machine, the OpenAPI document and the typed client carry the route and the transition names, the generated suite proves transitions, refusals and permissions, and the admin shows a button per available transition. The `Snippet` example now declares one. Existing projects need a migration adding the column; `hery generate` patches the schema. See [Workflow](https://github.com/techmefr/HeryJs/blob/main/docs/src/content/docs/guides/workflow.md).

### Circuit breaker and bulkhead on the HTTP client

`HttpClientService` now keeps a circuit per host: consecutive timeouts, transport errors, 429s and 5xx answers open it, calls then fail fast with a typed `HttpCircuitOpenException` (503), and after a cooldown a probe call decides whether it closes. A per-host concurrency limit refuses the excess with `HttpBulkheadFullException`. Thresholds come from `httpClient.resilience` in `hery.config.ts`, and the fake driver is held to the same rules. State shows in the readiness probe (`http-circuits`) and in metrics (`http_client_circuit_state`, `http_client_in_flight`, `http_client_rejected_calls`). Admin-only routes under `/http-client/circuits` list circuits and open, close or re-tune one, and an **HTTP circuits** admin page drives them. **Upgrade note:** a project that installed `http-client` copies the new runtime files and the `HttpResilienceController` registration by hand, and an open circuit now fails the readiness probe unless `resilience.healthCheck` is `false`.

### Audit export and streaming

The audit trail can be exported (CSV or JSON lines, filtered by date range, model, operation, record and user), its hash chain verified on demand with the first broken entry named, and new entries streamed to a sink (HTTP or object storage) through the outbox, with retry and dead letters. The admin gets an Audit page for all of it. Adds the `AuditSink` table (migration `add_audit_sink`) and `AUDIT_STREAM_ENABLED`, `AUDIT_STREAM_INTERVAL_SECONDS`, `AUDIT_SINK_ALLOW_PRIVATE_HOSTS`. `GET /audit-logs/verify` now answers `{ valid, checked, brokenAtSequence, headHash }`; `valid` is unchanged.

### Outbound webhooks

The `webhooks` module also delivers to your tenants. An admin subscribes an https URL to named events (`webhook.*` names you stage with the outbox, and the `model.*` change messages), each delivery is signed with HMAC-SHA256 (`v1=<hex>` per valid secret), retried ten times with doubling backoff on its own queue, and lands in a visible `dead` state you can replay. Rotating a secret keeps the old one valid for a grace window and signs with both, so no event is dropped. Subscription URLs must be public https addresses. New tables `WebhookSubscription` and `WebhookDelivery` (migration `add_outbound_webhooks`), a `heryjs-webhook-deliveries` queue in the kernel, routes under `/webhook-subscriptions` and `/webhook-deliveries`, and a Webhooks page in the admin panel. A project that already installed the module applies the kernel queue constants and the new runtime files by hand, and sets `SECRETS_KEYS` in production because secrets are sealed with it.

### Job chains and batches with resume

`JobFlowsService` runs a chain (step B after step A) or a batch (a set of jobs with a progress count and a completion callback) on BullMQ flows. A flow survives a worker restart, and a failed step is retried on its own: the steps that finished are not run again. Steps run on the new `heryjs-flows` queue through handlers registered with `JobFlowHandlers`, or on any existing queue, so exports and imports chain onto their own processors. Operators get capability-gated routes under `/job-flows` (list, detail, start a defined flow, retry, cancel) and a **Job flows** admin page. New `JobFlow` table (migration included). **Upgrade note:** an existing admin copies the page, the nav link and the icon by hand.

### Parallel test isolation

Each jest worker now runs against a Postgres database and a Redis keyspace of its own. The migrations are applied once into a template database named after their hash, every worker's database is a `CREATE DATABASE ... TEMPLATE` copy of it, recreated on each run and dropped afterwards, so one worker's failure cannot corrupt another's data. The suite runs on four workers. `pnpm test:serial` (or `JEST_SHARED_DB=true`) is the way back to a single shared database. Test infrastructure only: nothing changes for a generated project.

### Rich text fields

A blueprint field `type: richtext` (with an optional `maxLength` and an `allow` list of tags, attributes per tag and link schemes) stores HTML that the service sanitises on every write and the view sanitises again on every read, using `sanitize-html`. Script, style, embedding and form tags, event-handler and style attributes and code-carrying schemes can never be allowed, and a blueprint that names one is refused. The field cannot be filtered, sorted or translated. OpenAPI and the typed client expose a `string` with `format: html`, `GET /describe` publishes the limit and the resolved allow-list, the generated suite proves eighteen XSS payloads stripped, and the admin form shows a textarea with a safe live preview. The new `src/technical/richtext` module and the `sanitize-html` dependency are kernel additions: in an existing project copy the module, add the dependency, and copy the admin runtime files `form.ts`, `form-schema.ts`, `query.ts`, `resource.ts` and `safe-html.ts` by hand.

### Row history, with diff and restore

`history: true` in a blueprint stores a snapshot of the record after every create, update, soft delete and restore, in the new `RecordSnapshot` table (a migration ships with it). The generated resource gains `POST /:id/history`, `POST /:id/history/diff` and `POST /:id/history/restore`, each behind its own capability (`history` and `revert` are also resolved per record on search). A restore writes the old fields back through the normal update path, so the update policy, the version check and the audit entry apply, and it becomes the newest entry. Hidden and encrypted fields are never snapshotted. Retention is bounded by prune: `RecordSnapshot` is listed on the prune page and ages out per record while always keeping the newest snapshot. The admin resource page shows a History button that lists entries, diffs and restores. A hard delete, purge or prune of a row removes its history. Bulk writes (`updateMany`, `deleteMany`) are not snapshotted. `history` is refused on a translatable resource for now. **Existing projects:** apply the migration and copy `src/technical/history/`; the registry `HISTORY_COLUMNS` is filled by `hery generate`.

### Admin table editor: inline edit

A generated resource's table edits a plain cell in place (text, number, checkbox, enum): an Edit button on the cell, Enter to save through the resource's `update` route with the form's validation and version check, Escape to cancel, and the server's refusal shown in the cell. It follows the row's `update` capability and is switched off by `disable: ['update']`.

### Feature flag rollout and targeting

A flag now carries a rollout percentage (0-100, bucketed per user or per tenant with a hash of the flag key and the subject, so the same user always gets the same answer and raising the percentage only adds people) and an ordered list of targeting rules on tenant, user, plan or any custom attribute. The evaluation order is written once, in `feature-flag-evaluation.ts`: no flag is off, `enabled: false` is a kill switch, the first matching rule decides, then the percentage. `FeatureFlagsService.isEnabled` still takes a tenant id and now also a context (`userId`, `plan`, `attributes`); `evaluate` returns the decision with its reason. `PATCH /feature-flags/:key` takes the new fields, `POST /feature-flags/evaluate` previews a user or tenant and `DELETE /feature-flags/:key` removes a flag, all admin-only. The admin panel gets a Feature flags page to create a flag, set the percentage, edit the rules and preview an evaluation. A migration adds the three columns with defaults that keep every existing flag on for everyone. A `FeatureFlagDriver` provider now implements `evaluate` and `remove`, and `set` takes a patch object rather than a boolean.

### GDPR export and erasure

A blueprint declares how its rows answer a privacy request: `erasure: delete` removes every row a user owns, `erasure: anonymise` keeps the rows and rewrites the fields marked `personal: true`. A resource that declares nothing is left alone. The kernel runs the work itself, on the new `heryjs-privacy` queue: `POST /privacy/exports`, `POST /privacy/erasures/user` and `POST /privacy/erasures/tenant` answer 202 with a request, `GET /privacy/requests` lists the history and `GET /privacy/requests/:id` reads one (an export's bundle is handed over once). Erasure also tombstones the identity record and deletes the user's sessions, accounts and keys, and redacts the audit entries that described the erased rows: the entry keeps its place in the hash chain, its payload becomes a digest, and `GET /audit-logs/verify` still passes. The request itself is audited without the erased data. The admin panel gains a Privacy page and a Privacy section. **Upgrade note:** two migrations add `PrivacyRequest` and `AuditLog.redactedAt`; a generated resource that declares an erasure also gets a `<name>.personal-data.ts` file and imports `PrivacyModule`.

### A fresh project installs, migrates and builds

`hery new` produced a project whose first `pnpm install` failed: every module package depended on `heryjs@workspace:*`, and the scaffold renames the root package. That dependency only carried the `ModuleDefinition` type, already mapped by path in each package's tsconfig, so `hery new` now drops it from the copied manifests. The project then failed `nest build` because the guest upgrade named the demo's `blogPost`; it now reads every non-cascading foreign key to a user off the PostgreSQL catalog, which also covers `Snippet` and any generated resource with an owner. Its first `hery migrate` failed too: the row-level policy migration was named after every table it covers, past the filesystem's limit on a directory name, and is now named by a count once the names would not fit. A new `scaffold` CI job runs `hery new`, install, `hery migrate`, typecheck and build on every push.

### Admin studio contract and production access

A kernel feature or module contributes to the admin by decorating its own routes: `@AdminSection({ id, title, icon, group, columns })` on a list route and `@AdminAction({ id, title, icon, section, scope, confirm, danger, fields })` on a mutating one. Introspection reports them (`admin` on each route), the sidebar groups by `group`, tables take their columns, and row, bulk and global actions get a button and a generated confirmation or form. `@AdminAction` audits every call itself (field names, never values) and `lint:conventions admin-contract` fails a contribution with no `@Capability`, an unknown icon, a duplicate id, a GET action, a row action without `:id` or an unknown section. `/introspect` now sits behind `@AdminStudio()` instead of `DevOnlyGuard`: development is unchanged, production is a 404 until `ADMIN_STUDIO_ENABLED=true`, then reachable by a platform admin (`canUseAdminStudio`), optionally restricted by `ADMIN_STUDIO_ALLOWED_IPS` and `ADMIN_STUDIO_REQUIRE_2FA`. Nothing a request carries can bypass it.

### Users, sessions and operations in the admin studio

The studio now ships two kernel groups, declared through the admin contract on `AdminStudioModule`. "Users and access" lists the tenant's users with their role, 2FA and ban state, every active session and every API key, with row actions to sign a user out everywhere, revoke a session and revoke a key. "Operations" shows each registered health check, the last run of each scheduled task, and an environment overview with no secret in it. Every route sits behind `@AdminStudio()` and an admin-only capability, every action is audited, and since users, sessions and keys are not row-level-secured models each query is filtered by the caller's tenant, so another tenant's row answers 404. **Upgrade note:** an existing project adds `AdminStudioModule` to its `AppModule` by hand.

### Declarative output cache for read routes

`@CacheOutput({ ttlSeconds, models })` on a GET route caches its response in Valkey. The key is namespaced by tenant and hashes the caller's capability subject (user, role, current team, teams, impersonation), the URL with its query and `Accept-Language`, so no entry is ever served across tenants or scopes; guards still run on every hit. A new `output-cache` outbox handler drops a tenant's entries when a `model.*` message names one of their models, so invalidation follows committed writes only. Hits and misses are exported as `http_output_cache_requests_total` and listed in an "Output cache" admin section with a "Flush output cache" action. Responses carry `X-Output-Cache: HIT|MISS`. **Upgrade note:** an existing project has to add `OutputCacheModule` to its `AppModule` by hand.

### Per-tenant quotas and usage metering

`quotas` in `hery.config.ts` declares a named limit with a default and a period (`month`, `day` or `total`), and `QuotasService` gives resources `check`, `consume` and `usage`. A tenant's limit can be overridden in the database (`PUT /quotas/:name/override`, admin only), and `GET /quotas` lists each quota's limit and use behind a capability, so the admin panel shows it as a section with no wiring. The count is kept in Postgres in one conditional `UPDATE`, so racing requests cannot overshoot, and the two new tables (`QuotaOverride`, `QuotaUsage`) are tenant scoped under row-level security. A rate-limit bucket can also be retuned for one tenant with an override named `rate-limit:<bucket>`; per plan is not covered. It is independent of `billingQuotas`, and usage-based billing is the next step. **Upgrade note:** a project that already exists needs the two new migrations, and has to add `QuotasModule` to its `AppModule` by hand.

### Mail in the admin

The admin panel gains a Messaging group for the mail module: the declared drivers with the active one marked, the tenant's recent sends with their status and error, and a "Send test mail" action that queues a real message to an address you type. They are declared through the admin contract on a new `MailAdminController`, behind the studio gate and admin-only capabilities. In a project that already has the mail module, copy the new controller files and register `MailAdminController` in `MailModule` by hand.

### SMTP mail driver

A new `mail-smtp` package adds an SMTP driver beside the log and Resend ones. `hery install mail-smtp` lands it in `src/modules/mail`; import `SmtpMailModule`, declare `smtp: { driver: 'smtp' }` under `mail.drivers` in `hery.config.ts`, and set `MAIL_SMTP_HOST` and `MAIL_SMTP_FROM` (plus `MAIL_SMTP_PORT`, `MAIL_SMTP_TLS`, `MAIL_SMTP_USER` and `MAIL_SMTP_PASSWORD` as the server needs). `MAIL_DRIVER=smtp` switches to it. The driver sends through nodemailer, refuses a half-written credential and a refused recipient rather than recording the mail as sent, and its spec delivers over a real socket to an in-process SMTP server. That makes twenty-nine installable modules.

### S3 storage selected by `STORAGE_DRIVER`

`STORAGE_DRIVER=s3` now stores in S3 or any S3-compatible server with no wiring: the driver is bound by the storage module, the registry falls back to the variable when `hery.config.ts` declares no `storage` slice, and the S3 client is built on first use, so an app on local disk in production is no longer refused a boot over S3 credentials. Upload intents are tested against a real MinIO in CI. The bundled `docker-compose.storage.yml` now pins the Bitnami MinIO image, because `minio/minio` no longer pulls. The admin panel gains a Storage page, backed by `storage-admin` routes that report the driver and list, upload and delete the tenant's files. **Upgrade note:** `StorageDriver` has a new `list(prefix, limit)` method; a driver you wrote yourself has to implement it. In a project that already has the storage module, copy the new files by hand.

### Object-level sharing

A routed resource can declare `sharing: true` in its blueprint and let its owner grant a user or a team read or write access to one record. A new `RecordShare` table (tenant-scoped, with row-level security and in the audit chain) holds the grants; the generated controller gains `POST /<resource>/:id/shares`, `POST /<resource>/:id/shares/search` and `DELETE /<resource>/:id/shares/:shareId`, gated by a new `share` capability, and `describe` reports `sharing: true`. The decision stays in memory: `scopeWhereFor` takes the ids shared with the caller, fetched once per search, and `resolveCapability` takes an access (`read` or `write`) and reads the shares carried on the loaded record, so there is no query per row. A write share can update, never delete or share onward; a `none` preset stays closed. The admin resource page gets a Share dialog. The `snippet` example turns it on and its generated suite proves a share, a revoke, a team share and tenant isolation. **For an existing project**, sharing is opt-in and nothing changes until a blueprint declares it; to adopt it on a resource generated before, regenerate or apply the policy, loader, service, controller and module changes by hand and run the new migrations.

### Vector fields and similarity search

A blueprint field `type: vector` (with `dimensions` and a `source` string field) becomes a pgvector column, filled through the outbox whenever the source changes, and the search route accepts `search: { q, mode: 'similar' }`. The new `embeddings` module holds the driver contract (a deterministic `fake` driver and an `openai-compatible` one over the built-in `fetch`). Tenant, capability scope and soft-delete are part of the ranking query, which runs under the tenant's row-level security. The docker-compose and CI Postgres images are now `pgvector/pgvector:pg17` and a migration enables the extension: **upgrade note:** a project created before this must switch its Postgres image to `pgvector/pgvector:pg17` (compose and CI) before migrating, because the new migration runs `CREATE EXTENSION vector`. `hery embeddings:backfill <name>` embeds rows that existed before the field; `hery create:blueprint` can now declare a vector field. `hery generate` no longer corrupts `TENANT_SCOPED_MODELS` when the list ends with a trailing comma.

### More scaffolding, and a route table

`make:policy`, `make:seeder`, `make:driver`, `make:notification` and
`make:webhook-handler` join the existing `make:*` commands, and `hery routes`
prints every route with its capability and rate-limit bucket. A webhook source
can now have its own handler: a kernel `WebhookHandler` contract that the
webhook processor calls per event, inside the event's tenant. In a project
that already has the webhooks module, copy
`src/technical/webhooks/webhook-handler.ts` and the processor change by hand.

### Database backup and restore

`hery db:backup` writes a timestamped `pg_dump` (custom format) into `backups/` and keeps the newest `BACKUP_KEEP` (7), `hery db:backups` lists them, and `hery db:restore <file|latest>` restores one with `pg_restore`, refusing a target that already holds rows unless `--force` is passed. A `database-backup` scheduled task runs the same dump daily at 03:00 when `BACKUP_ENABLED="true"`, and uploads it through the storage driver named by `BACKUP_STORAGE_DRIVER`. It needs `pg_dump` and `pg_restore` (same major version as the server) on the machine; CI installs the 17 clients and restores a dump against a real Postgres. Point-in-time recovery is WAL archiving on your Postgres, which the new backups guide describes but does not provide. The admin panel gets a Backups page over capability-gated `/backups` routes (list, create, download, restore behind a typed confirmation, edit schedule and retention; the schedule is editable at runtime and saved next to the dumps). A new `/backups/` line in `.gitignore` keeps dumps out of the repository.

### Database workflow

`migrate:status`, `migrate:fresh`, `db:seed [--fresh]`, `db:diff` and
`db:branch create|drop|list` sit beside `migrate` and `migrate:down`. The two
that wipe a database refuse in production, and `db:branch` copies a database
with `CREATE DATABASE ... TEMPLATE`. `migrate:down` was also broken on Prisma
7, which dropped `--from-schema-datasource` and `--shadow-database-url`: it now
reads the shadow database from `SHADOW_DATABASE_URL` through `prisma.config.ts`.
An existing project adds `shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL`
to the datasource in its own `prisma.config.ts` by hand.

### OpenAPI and a typed client

`hery openapi` emits an OpenAPI 3.1 document and `hery openapi:client` a typed
TypeScript client, both read from the blueprints. What `/describe` does not
publish (the resolved-capability block, capability-dependent shapes, morph
targets, included-row types) is stated as absent, not guessed. Nothing in a
generated file changes.

### Triggers for exposed actions

`@ExposeAction` accepts `triggers`: `http: false` to leave the generic route, `cron` to run on a schedule (cluster-locked, in an explicit tenant), and `webhook` to let a signed webhook endpoint with `source: "expose:<action>"` run it. Adds a `cron` dependency. The webhooks module's service, controller, processor and module change; a project that installed it applies them by hand. Arbitrary user-defined code is not supported.

### Optimistic concurrency

A blueprint can declare `versioned: true`. The model gets an integer `version`
column that every update, soft delete and restore increments, the record view
and `/describe` expose it, and the update route refuses an entry that does not
say which version it read (`428`) or that read a stale one (`409`, or `412`
when it came in as `If-Match`). The check is part of the write itself, so two
concurrent saves at the same version cannot both succeed. Off by default:
nothing changes for a resource that does not opt in.

### Bulk mutations

Create, update, delete and restore already took an array and answered one
result per entry. They now also answer `meta: { total, succeeded, failed }`,
and accept `atomic: true`: every entry is authorised first, the writes run in
one transaction, and the first failure rolls the whole batch back and answers
`422 batch.atomicFailed` with a result for every entry. The signal and
search-index side effects of a generated service wait for the commit. A
generated service gains an `atomically` method the controller calls to open
that transaction, which only reaches an existing project if its developer
applies it by hand.

### Installing it

Twelve packages, versioned together:

- `heryjs` carries the `heryjs new` command and the module contract's types.
  A project is created with `pnpm dlx heryjs new my-app`, and the CLI travels
  into the project it writes — there is nothing global to install and nothing
  to keep in step with a release.
- `@heryjs/<name>` for each of the eleven modules, so one can be added to a
  project that was not scaffolded with it, and updated on its own.

### The CLI

- `hery new` scaffolds a standalone project: the kernel, the CLI, the default
  modules, none of this repository's own demo or documentation.
- `hery create:blueprint` and `hery generate` turn a resource description into
  real NestJS files — a module, a controller, a service, a policy, DTOs — with
  the tenant boundary and the capability checks already wired.
- `hery install`, `hery uninstall`, `hery module:list`, `hery module:new` and
  `hery module:validate` for the module system.
- `hery up`, `hery migrate`, `hery env`, `hery doctor`, `hery console`,
  `hery lint`, `hery hosts`, `hery expose` for day-to-day work.
- `hery mcp:serve` exposes the project's read tools to an MCP client.

### The kernel

- Translatable content fields: a blueprint string field with `translatable: true`
  is stored as JSON per locale, read through the request locale and the
  `i18n.fallbacks` chain, written as one string or several locales, and
  filtered, sorted and searched on the resolved value. `/describe` publishes
  the locales, and a cacheable route now varies on `Accept-Language`. A resource
  with no translatable field generates exactly what it did before.

- Authentication, API keys and sessions on better-auth.
- Session management: list devices, revoke one, sign out everywhere, a password
  change that revokes the other sessions, and per-account lockout after
  repeated failed sign-ins.
- Passwordless sign-in on better-auth, each method off until its env flag
  turns it on: magic link and email OTP delivered through the mail module,
  phone OTP through the sms module, passkeys (WebAuthn), and guest sessions
  whose work moves to the account they later sign in to. Sends are capped per recipient on top of
  the per-caller `auth` bucket. Two migrations add `phoneNumber`,
  `phoneNumberVerified` and `isAnonymous` to `User` and a `Passkey` table; an
  existing project applies them with `hery migrate`.
- Capabilities resolved server-side in memory and returned as decisions
  (`{ allowed, scope }`) — never as rules the frontend could reinterpret.
- Multi-tenancy resolved once per request and enforced underneath permissions,
  with row-level security available per model.
- Teams with the `own` / `team` / `all` / `none` presets.
- A tenant-namespaced cache on the same Valkey the kernel already depends on,
  exported globally with no module to install.
- A test-support entry point, `#devtools/test-support`: recording fakes for
  mail, sms, push, the notifier, jobs, storage, events, locks and the clock;
  `bootTestApp()`; `actingAs()` for a user, role, tenant or API key; and tenant
  isolation per suite. The generated spec now moves its outsider into another
  tenant through `actingAs` and no longer opens a `PrismaClient` of its own,
  which only changes new projects.
- `Idempotency-Key` on every mutating route: the first request's response is
  stored per tenant and replayed on a retry, the same key with a different
  body or route is a `422`, and records expire after 24 hours through the
  existing prune sweep.
- Logging behind the driver contract: `stdout` (the default, unchanged),
  size-rotated `file`, a Loki-style `http` sink over `fetch`, and a `database`
  store, every declared driver receiving every line and a failing one never
  blocking the others. Lines carry their tenant, and an admin-only `GET /logs`
  reads the store back for the caller's tenant, bounded by a retention window
  and a per-tenant cap. Adds the `LogEntry` table.
- A persisted dev dashboard, on in development only: requests, slow queries,
  N+1 findings, job history, mail / SMS / push sent and exceptions, bounded
  by a retention window and a per-tenant cap, tenant-scoped on every read,
  and shown as a page of the admin. Production needs `devDashboard.enabled`
  and then an admin capability. Adds the `DevtoolsEntry` table.
- A rate limit on by default across every kernel and module route, with
  `read` / `write` / `auth` buckets a project can retune but never remove.
- A `hasMany` include may itself carry a further `includes` — a relation of a
  relation, capped at two levels total, the same fixed-constant idiom
  `MAX_FILTER_DEPTH` already uses. `morphMany` never nests: it has no Prisma
  relation to attach a nested `include` to.
- A `hasMany` include declaring `ownRoute: true` gets its own collection
  route scoped to the parent by id — `POST /<parent>/:id/<relation>/search`
  — gated by the parent's own record-level view capability, since the
  included resource is `routed: false` and has none of its own.
- `message` on the error envelope translates per request from `Accept-Language`
  when `hery.config.ts` declares more than one locale; `key` never changes.
  `capability.forbidden` is excluded on purpose, and a `key` with no catalogue
  entry for the caller's locale falls back to its hardcoded English message.
- A transactional outbox: every create, update and delete of a tenant-scoped
  model stages a `model.created` / `model.updated` / `model.deleted` message in
  the same transaction as the write, and a relay on the `heryjs-outbox` queue
  delivers it at-least-once to the events bus (as `ModelChanged`) and to any
  registered handler, with per-handler receipts, exponential backoff, a
  dead-letter state and a daily prune. New `OutboxMessage` and `OutboxReceipt`
  tables, and `OUTBOX_RELAY_ENABLED` / `OUTBOX_RELAY_INTERVAL_MS`.
- An `encrypted` blueprint field type: AES-256-GCM at rest, decrypted
  transparently by the tenant-scoped Prisma client, hidden from responses
  unless `reveal: true`, redacted in the audit chain and refused in filters and
  sorts. Keys are versioned in `SECRETS_KEYS`; `SecretsService` seals values
  that are not columns and `hery secrets:rotate` re-encrypts to the active key.
- A realtime change feed: the outbox's model messages are published, row and
  all, to a channel per resource, filtered per subscriber by its own
  capability and tenant, with hidden fields never in the payload. The `sse`
  module serves it at `GET /sse/changes` (token from `POST /sse/changes/token`)
  and the `live` module on a Socket.IO `/changes` namespace, which also carries
  presence and capability-gated client broadcast. A generated resource now
  includes `<name>.change-feed.ts` and its module imports `ChangeFeedModule`;
  an existing project adds that file and the two lines by hand. The model
  outbox message also carries `ownerId` and `teamId` now.
- `/health` is now fed by a registry any module registers a check on, and
  `/health/live` and `/health/ready` give an orchestrator the two probes
  separately, public and carrying only ok or error. The report no longer names
  a `redis` check: it reports `cache` and `queue`.
- `hery down` puts every instance in maintenance mode, answering 503 with a
  `Retry-After` unless the request carries the bypass secret, and
  `hery up --lift` ends it. The health probes stay reachable throughout.
- An error reporter contract (`errorReporter` in `hery.config.ts`) hands every
  unexpected 500, with its `errorId`, tenant, caller and request path, to a
  Sentry-style driver. The built-in `noop` driver is the default; a domain
  exception or any other `HttpException` is never reported.
- OpenTelemetry export of traces, metrics and logs over OTLP, configured by the
  standard `OTEL_*` variables and off until `OTEL_EXPORTER_OTLP_ENDPOINT` is
  set. Spans carry the request inspector's pipeline steps, `/metrics` is
  unchanged, and every log line carries `trace_id` and `span_id`. New
  dependencies: `@opentelemetry/api`, `@opentelemetry/api-logs` and
  `@opentelemetry/sdk-node`.
- An architecture linter that fails CI on a domain missing a concern, plus
  fourteen convention checks covering capabilities, pagination, RLS, rate
  limiting, module drift and patched kernel files.

### The modules

`mail`, `storage`, `webhooks`, `live`, `stream`, `impersonation`, `graphql`,
`mcp`, `search-elasticsearch`, `search-meilisearch` and `admin-astro`, each
installable with `hery install` and removable with `hery uninstall`.

- `two-factor` (`@heryjs/two-factor`) adds TOTP enrolment that only counts once a
  first code is verified, a `TwoFactorGuard` that holds a session until it has
  passed its second factor, hashed single-use recovery codes, and a per-role
  requirement an admin sets. Its verification routes sit in the `auth`
  rate-limit bucket and lock after repeated wrong codes.
- `storage` gained `POST /storage/upload`: a driver-agnostic multipart route
  behind a session, gating on a content-type allowlist and a size cap before
  handing back a tenant-prefixed key the caller never names. A blueprint
  field can now declare `type: file` to own that key like any other column.
- `sso` adds enterprise single sign-on over OpenID Connect, configured per
  tenant: the tenant owns its identity provider (client secret sealed with
  AES-256-GCM), proves the email domains it claims with a DNS TXT record, and
  its users are provisioned just in time into that tenant. Linking an existing
  local account is a declared per-connection policy, `refuse` by default.
  A connection speaks OpenID Connect or SAML 2.0 (`protocol: 'saml'`): the
  assertion must be signed, answer the request this browser started, and name
  an address on a domain the tenant proved. SAML adds three columns to
  `SsoConnection` and makes `clientSecret` nullable; `@node-saml/node-saml`
  does the XML signature checking. The provider can be configured from its
  metadata (a URL or pasted XML) with an attribute mapping, and
  `GET /sso/connections/checks` tests every connection (certificate expiry,
  reachability, verified domain, discovery) so the admin panel, which builds
  itself from introspection, gets a section for it.

- `oauth` adds social sign-in (Google, GitHub, Microsoft) behind a provider
  contract, with PKCE, a signed single-use state cookie and verified emails
  only. What happens when a provider email already belongs to a local account
  is the declared `OAUTH_LINK_POLICY`: `refuse` by default, so nothing links
  silently.

- `notifier` honours per-user notification preferences: opt in or out per
  channel (mail, sms, push, in-app) and per notification type, quiet hours in
  the user's timezone, mail digests flushed by a scheduled job, and
  `isMandatory` notifications that no preference can suppress. Users manage
  their own rules under `/notification-preferences`. In-app is now a notifier
  channel over `AppNotification`. Installing it adds three tables, so run the
  migration it prints.

A module is its default export, closed with `satisfies ModuleDefinition` and
typed through an `import type` the compiler erases — so a published module has
no runtime dependency on HeryJs at all. Any dependency carrying
`heryjs.module: true` is discovered and installed the same way an official one
is, and the eleven official modules declare exactly what a third party's does.
