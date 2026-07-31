# HeryJs

**Generate once. Own your code. Structure everything.**

HeryJs is a framework built on top of [NestJS](https://nestjs.com) — the way Nuxt sits on Vue, or Adonis on Express. NestJS gives you the runtime; HeryJs gives you the project: a CLI that scaffolds a new app, generates secured resources into it, and installs the pieces most backends end up building by hand anyway. Nothing re-syncs, nothing runs a schema at request time. What you get is a normal, readable, ownable NestJS codebase from the first commit.

---

## The problem

NestJS gives you an excellent foundation, but it stops at the plumbing. Auth, permissions, multi-tenancy, background jobs, real-time updates, audit trails — you assemble all of it yourself, project after project. Nest's first-party packages are great *adapters*, not *solutions*: they get you connected, then leave the rest to you.

Meanwhile, permission logic tends to drift. The backend enforces one set of rules, the frontend renders another, and the two slowly fall out of sync until someone finds a button that should have been disabled, or a request that should have been rejected.

Laravel developers know this feeling from the other side: strong conventions, a scaffold that gets you moving in minutes, an experience that lets you write business logic instead of glue code. That experience doesn't really exist yet on the NestJS side.

## The approach

HeryJs takes a deliberately different path from typical low-code or model-driven generators:

- **Generate once, then disappear.** Run `hery generate`, get real NestJS files — a module, a controller, a service, a policy, DTOs. Nothing is regenerated later, nothing recompiles a schema at runtime. What you get is a normal, readable, ownable codebase from the first commit.
- **No re-sync, no proxy layer.** Tools like Amplication or ZenStack keep a live connection between a schema and your running app. HeryJs doesn't. Once a resource exists, evolving it is just... writing NestJS code, the way you always have.
- **Resolved decisions, not raw rules.** The backend never ships its permission rules to the frontend. It resolves them once, server-side, into plain decisions (`{ allowed, scope }`) attached to the data. The frontend uses them for UX. The backend re-checks everything, every time, regardless of what the frontend thinks it's allowed to do.
- **Multi-tenancy as a foundation, not an afterthought.** Tenant isolation is resolved once per request and enforced underneath permissions — not bolted on when the app outgrows a single customer.
- **A structure a machine can also read.** Because every domain follows the same shape (`search`, `mutate`, `signal`, `jobs`, `events`, `policies`), both a human and a coding agent know exactly where to look. No exploration tax.

This is a bet, not a certainty: that developers — and the agents increasingly writing code alongside them — prefer owning plain, predictable code over depending on a platform's lifecycle. Everything else follows from that bet.

## Getting started

```bash
git clone https://github.com/techmefr/HeryJs.git
cd HeryJs
pnpm install
pnpm hery new my-app
cd my-app
cp .env.example .env
docker compose up -d
pnpm install
pnpm exec prisma migrate dev
pnpm start:dev
```

`hery new` scaffolds a fresh, standalone project: the kernel, the CLI, the default modules, none of HeryJs's own demo or docs. From there, generate your first resource:

```bash
pnpm hery create:blueprint Workout
pnpm hery generate blueprints/workout.yaml
```

## What it generates

A resource in HeryJs starts as a short blueprint describing intent — fields, relations, whether it's tenant-scoped, its permission presets. From that, `hery generate` produces:

```
functional/
  workout/
    workout.module.ts
    workout.controller.ts
    workout.service.ts
    workout.policy.ts
    workout.dto.ts
    workout.spec.ts
prisma/
  schema.prisma
```

Out of the box, that resource comes with:

- **`search`** — list, detail, filters, sorting, pagination, relations
- **`mutate`** — create, update, soft-delete, restore
- **Capabilities** — resolved permission decisions embedded via `?include=capabilities`, computed in memory, no per-row query
- **Multi-tenant isolation** — enforced automatically, underneath permissions
- **Auth** — session-based login wired in from the start, plus API keys for CI and scripts
- **A generated test suite** — scope parity, the trashed bin, resolved capabilities, tenant-header spoofing, proven for every resource, not just the example

The blueprint is never read again after generation. It becomes historical documentation, nothing more. From that point on, the code is yours: edit it by hand like any other NestJS module.

## What's included

Every project starts with a kernel that's always there — auth, capabilities, multi-tenancy, teams, audit, feature flags, request inspector, scheduler, an interactive console, health checks and metrics — plus a growing set of modules you install only when you need them:

```bash
pnpm hery module:list
pnpm hery install <module>
```

Search (Prisma, Elasticsearch, Meilisearch), GraphQL, MCP (read and write), real-time (`live`, WebSocket), streaming (LiveKit), mail, file storage, admin impersonation, and an admin dashboard (`admin-astro`) that every module contributes a section to automatically, with no registry to maintain.

## What it deliberately does not do

HeryJs covers a common backend core. It does not try to be a solution for everything. Billing, i18n — for those, you write ordinary NestJS code in a clean, conventional project. HeryJs never gets in the way, but it doesn't pretend to replace judgment either.

## Status

The vertical slice, the widening of features, and a hardening pass (opt-in row-level security, an adversarial security review, a more robust generator) are done. Since then: teams as a first-class permission scope, a module system with a growing catalog (search drivers, GraphQL, MCP, live, stream, mail, storage, impersonation), an admin dashboard every module plugs into automatically, a layered architecture enforced by an actual linter, and `hery new` — a real starting point for a project that isn't this repository. A pre-publication external audit has since closed out a round of fixes: tenant-safe search indexing, actor tracking on the audit trail, `hery.config.ts` as a real closed-config point, keyword-selected search engines, a bounded impersonation session with its own admin-on-admin test, and API keys for non-interactive callers. See the [commit history](https://github.com/techmefr/HeryJs/commits/main) for the detail.

## Contributing

HeryJs is a personal project, built in the open, and it's still small enough that one conversation with a maintainer can shape its direction. If you generate a resource and something feels off, or you have a use case the current conventions don't cover well, open an issue. Pull requests are welcome too, especially ones that come with the same "prove it end-to-end, then keep only what's proven" discipline the project holds itself to (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## License

MIT.
