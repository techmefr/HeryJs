<div align="center">

# HeryJs

**The batteries-included framework for NestJS.**<br>
Generate secured, multi-tenant resources from a blueprint. Then own every line.

[Documentation](https://techmefr.github.io/HeryJs/) · [Getting started](#getting-started) · [What's included](#whats-included) · [Security](#security) · [Contributing](#contributing)

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node >=22.12](https://img.shields.io/badge/node-%3E%3D22.12-339933.svg)
![NestJS](https://img.shields.io/badge/built%20on-NestJS-E0234E.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-RLS-4169E1.svg)

</div>

---

NestJS gives you an excellent runtime and then stops at the plumbing. Auth, permissions, tenancy, jobs, real-time, audit, search: every project assembles them again, slightly differently, and the rules drift between the backend and the frontend.

HeryJs is the missing layer — the way Nuxt sits on Vue, or Laravel gives PHP a home. A CLI scaffolds a project, generates fully wired resources into it, and installs the pieces most backends end up building by hand. Nothing re-syncs, nothing compiles a schema at request time. What you get is a plain, readable NestJS codebase from the first commit, and it is yours.

```bash
pnpm dlx heryjs new my-app
```

## Why HeryJs

- **Generate once, then disappear.** `hery generate` writes real NestJS files — module, controller, service, policy, DTOs, view, factory, spec. The blueprint is never read again. There is no runtime magic to outlive, and no platform whose lifecycle you depend on.
- **Secure by construction, and proven.** Every route carries a capability decision or a stated reason it cannot, and a rate-limit bucket. A route with neither fails CI. Every generated resource ships a test suite that boots the real app against a real database and proves the 403, the tenant boundary and the scope parity.
- **Tenancy is the foundation.** The tenant is resolved once per request and enforced twice: in the Prisma client and by a Postgres row-level policy that fails closed.
- **Decisions, not rules, reach the client.** Permissions resolve server-side into plain `{ allowed, scope }` decisions attached to the data. The frontend renders them; the backend re-checks everything, every time.
- **Built to be read by machines too.** Every domain has the same files, named after the resource, and an architecture linter fails CI on a folder that breaks the shape. A person or a coding agent knows exactly where to look.

## Getting started

```bash
pnpm dlx heryjs new my-app
cd my-app
cp .env.example .env
pnpm install
pnpm hery up --start      # compose services, ports written back to .env
pnpm hery migrate --name init
pnpm start:dev
```

Then generate your first resource:

```bash
pnpm hery create:blueprint BlogPost
pnpm hery generate blueprints/blog-post.yaml
```

`heryjs new` scaffolds a standalone project: the kernel, the CLI and the modules, none of HeryJs's own demo or docs. The CLI travels into the project, so every later command is `pnpm hery` from inside it. There is nothing global to install and nothing to keep in step with a release.

## What a blueprint gives you

A blueprint is a short description of intent: fields, relations, permission presets.

```yaml
name: BlogPost
fields:
  - name: title
    type: string
    translatable: true
  - name: body
    type: string
  - name: embedding
    type: vector
    dimensions: 1536
    source: body
```

One `hery generate` later you have ten files in `functional/blog-post/` and a Prisma model, and the resource already comes with:

| | |
|---|---|
| **`search`** | One route for listing and reading, with filters, sorting, relations, cursor pagination, ETag and similarity search |
| **`mutate`** | Create, update, soft-delete and restore, each taking an array, with an atomic mode and a per-entry report |
| **Capabilities** | Permission decisions returned with the data, computed in memory, no per-row query |
| **Isolation** | Tenant scoping underneath permissions, enforced by Prisma and by Postgres RLS |
| **Concurrency** | Optional optimistic versioning, and `Idempotency-Key` on every mutating route |
| **Real time** | A change feed over SSE and WebSocket, filtered per subscriber by its own permissions |
| **Contract** | An OpenAPI 3.1 document and a typed client generated from the blueprint |
| **Tests** | A generated suite proven for every resource, not only the example |

## What's included

A kernel that is always there, and modules you install only when you need them (`pnpm hery module:list`, `pnpm hery install <name>`).

**In the kernel**

- **Identity** — sessions, API keys, passwordless sign-in (magic link, email and phone OTP, passkeys), guest sessions, login lockout and session management
- **Access** — capabilities and scopes, teams, tenancy with Postgres row-level security, admin impersonation with a bounded session
- **Reliability** — BullMQ jobs with a retry policy and a dashboard, a scheduler, a transactional outbox, distributed locks, idempotency, rate limiting on by default
- **Data** — migrations, seeders, factories, database branches, encrypted fields with key rotation, retention and pruning, translatable content fields
- **Operations** — health probes, Prometheus metrics, OpenTelemetry traces, metrics and logs, an error-reporter contract, maintenance mode, structured log shipping, a request inspector and a persisted dev dashboard
- **Delivery** — OpenAPI and a typed client, feature flags, an audit trail with a canonical hash chain, `hery doctor`, and an architecture linter

**As modules**

- **Auth** — two-factor (TOTP), social sign-in (OAuth), enterprise single sign-on (OIDC)
- **Communication** — mail, SMS, push, and a notifier that composes them with per-user preferences, quiet hours and digests
- **Real time** — WebSocket, server-sent events, WebRTC signalling, LiveKit streaming
- **Search** — Prisma, Elasticsearch and Meilisearch drivers, plus vector search on pgvector with an embeddings module
- **APIs** — GraphQL, an MCP gateway for agents, inbound and outbound webhooks (HMAC-signed, retried, dead-lettered), an outbound HTTP client with a fake driver for tests
- **Data in and out** — file storage with presigned uploads, CSV, XLSX and PDF export, import
- **Money** — billing that mirrors a provider's subscription state and guards a quota (Stripe driver)
- **Admin** — a dashboard that every module contributes a section to, with no registry to maintain

Every module follows one convention: a module exposes one capability, a driver is one way of performing it, and swapping a transport is a line in `hery.config.ts` rather than a source edit. All of them are published as `@heryjs/<name>` and versioned with the kernel. See [Modules and drivers](https://techmefr.github.io/HeryJs/guides/modules-and-drivers/) and [Publishing a module](https://techmefr.github.io/HeryJs/guides/publishing-a-module/).

## Where it stops

HeryJs covers a common backend core and says plainly what it does not.

- **Storage** ships a local-disk driver. The S3 driver is in the tree but is not bound to a driver token yet, so using it takes one line of wiring you write.
- **Metering** ships per-tenant limits and usage counts, in the database, readable in the admin. Pricing that usage, meaning usage-based billing, is not shipped.
- **Not shipped yet:** SCIM, workflow engines and state machines, a circuit breaker on the HTTP client.
- **API only.** There is no server-rendered view layer; the admin dashboard is the one UI.

For anything outside that core, you write ordinary NestJS in a clean, conventional project. HeryJs never gets in the way, and it does not pretend to replace judgment.

## Security

Every request goes through the same four steps — who is calling, which tenant, what they may do, what they sent — and the tenant boundary is enforced in the Prisma client and again by a Postgres policy. The security model, and what it deliberately leaves to you, is written out in [the security guide](https://techmefr.github.io/HeryJs/guides/security/). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Working on the framework

A clone of this repository is the framework itself — the demo resource, the docs site and the module workspaces — not a starting point for an application:

```bash
git clone https://github.com/techmefr/HeryJs.git
cd HeryJs
pnpm install
pnpm run db:generate
pnpm hery up --start
```

## Contributing

HeryJs is built in the open and is still small enough that one conversation with a maintainer can shape its direction. If you generate a resource and something feels off, or you have a use case the current conventions do not cover, open an issue. Pull requests are welcome, especially ones that follow the project's own discipline: prove it end to end, then keep only what is proven. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [changelog](CHANGELOG.md).

## License

[MIT](LICENSE)
