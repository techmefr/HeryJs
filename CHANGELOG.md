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

### More scaffolding, and a route table

`make:policy`, `make:seeder`, `make:driver`, `make:notification` and
`make:webhook-handler` join the existing `make:*` commands, and `hery routes`
prints every route with its capability and rate-limit bucket. A webhook source
can now have its own handler: a kernel `WebhookHandler` contract that the
webhook processor calls per event, inside the event's tenant. In a project
that already has the webhooks module, copy
`src/technical/webhooks/webhook-handler.ts` and the processor change by hand.

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
  SAML is not covered.

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
