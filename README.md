# HeryJs

**Generate once. Own your code. Structure everything.**

HeryJs is a convention framework built on top of [NestJS](https://nestjs.com). It generates a resource once, hands you the code, and gets out of the way. No platform, no re-sync, no runtime magic sitting between you and your codebase.

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
- **A structure a machine can also read.** Because every domain follows the same shape (`search`, `mutate`, `live`, `jobs`, `events`, `policies`), both a human and a coding agent know exactly where to look. No exploration tax.

This is a bet, not a certainty: that developers — and the agents increasingly writing code alongside them — prefer owning plain, predictable code over depending on a platform's lifecycle. Everything else follows from that bet.

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
- **Auth** — session-based login wired in from the start

The blueprint is never read again after generation. It becomes historical documentation, nothing more. From that point on, the code is yours: edit it by hand like any other NestJS module.

## What it deliberately does not do

HeryJs covers a common backend core — auth, permissions, multi-tenancy, CRUD, jobs, notifications, real-time, audit, monitoring. It does not try to be a solution for everything. File storage, full-text search, billing, i18n, exports — for those, you write ordinary NestJS code in a clean, conventional project. HeryJs never gets in the way, but it doesn't pretend to replace judgment either.

## Roadmap

The plan is to prove the hard parts early, in a thin vertical slice, before spreading out into more features.

- **Phase 1 — Vertical slice.** Scaffold, an in-memory capabilities engine, tenant isolation, and one fully generated resource — secured, tenant-aware, permission-aware, auth included. A conventions linter running in CI from day one, as the only real guard against structural drift once nothing re-syncs.
- **Phase 2 — Early external validation.** A handful of outside developers generate a resource and give feedback, before any further feature gets built.
- **Phase 3 — Widening, brick by brick.** Background jobs, real-time (SSE), a proper dev experience (`hery up`), then notifications, audit, feature flags, monitoring, and an admin surface — each proven end-to-end, not bolted on in isolation.
- **Phase 4 — Hardening.** Opt-in row-level security, an adversarial security pass on tenant isolation and permissions, a generator that's robust enough for someone else's production.
- **Phase 5 — Public release.** Documentation, read-only introspection for coding agents, and the story told once it's actually been validated — not before.
- **Phase 6 — Demand-driven.** Full-text search, file storage, billing, GraphQL, and anything else the community actually asks for.

Dates aren't fixed here on purpose — this ships at the pace of real progress, not a calendar.

## Status

Early. Phase 1 is in progress. Not ready for production use yet.

## License

MIT.
