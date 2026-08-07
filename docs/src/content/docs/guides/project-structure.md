---
title: Project structure
description: The four layers of a HeryJs project, the import rules between them, and the CI checks that keep them true.
---

```
src/
  app.module.ts          the only place the layers are composed
  functional/            business domains
    blog-post/
  technical/             the kernel — always present
    auth/  capabilities/  teams/  tenancy/  prisma/  errors/  http/
    audit/  config/  dev-only/  exposition/  feature-flags/
    introspection/  jobs/  logging/  monitoring/  notifications/
    prune/  scheduler/  search/  seeders/  signal/  tracing/
    validation/
  modules/               optional — installed by hery install, removable
    impersonation/  live/  mail/  storage/  stream/  webhooks/
  devtools/              never ships to production
    inspector/  pipeline/  testing/
cli/                     the generator
  hery.ts  commands/  lib/
admin/                   the Astro admin panel (its own workspace)
blueprints/              one-time generator input, created by hery create:blueprint
packages/                the authoring half of every module, copied into src/modules/
prisma/
  schema.prisma
```

Four layers under `src/`, split by **lifecycle rather than by theme**: whether a piece of code is always present, optional, business-specific, or dev-only. Each has one rule about who may import it, and the rules are not documentation — they are dependency-cruiser rules that fail CI.

## `functional/` — one folder per business domain

Every business resource gets its own folder, and every folder follows the same shape. Nothing inside `functional/` imports from another domain's folder: shared logic belongs in `technical/`, and a value one domain needs from another is passed in by the caller.

That constraint is what makes the layout predictable enough to generate into, and to navigate without an exploration tax — a reader who knows one domain knows all of them.

## `technical/` — the kernel

Everything a resource needs but does not own itself: the capabilities engine, teams, the tenant-scoped Prisma client, the domain exception hierarchy and its filter, the response envelope, the session guard, the search contract.

The kernel is **never optional**, and that is the property its rules protect. It must not depend on `functional/`, or it would stop being reusable. It must not depend on `modules/`, or it would stop being *removable* — uninstalling a module would break the kernel underneath it.

## `modules/` — the optional layer

Code that arrives through `hery install` and can be taken out again: `impersonation`, `live`, `mail`, `storage`, `stream`, `webhooks`. Two rules keep "optional" honest.

**No module imports another module.** Otherwise uninstalling one would break the other, and "optional" would only hold for whichever module happened to be last in the dependency order. Shared logic goes to `technical/`.

**Only `src/app.module.ts` composes the kernel and the modules.** Nothing under `technical/` reaches into `modules/`; the wiring lives in exactly one file. This is why every installer finishes by telling you to import its module class into `app.module.ts` yourself rather than patching it for you — the composition point is yours.

## `devtools/` — never ships to production

The request inspector and the test helpers. One rule, and it is absolute: nothing under `technical/`, `functional/` or `modules/` may import from `devtools/` — **except a spec file**, which is the entire reason a `testing/` folder lives in there.

This replaced a grep. "Must not reach production" used to be approximated by a script scanning controllers for a hand-rolled `NODE_ENV === 'production'` check. It is now a structural property: a production import path into a dev tool is a build failure, whatever the code looks like.

`app.module.ts` sits outside that rule's scope on purpose, since it is the file that composes everything.

## `cli/` — the generator

The `hery` CLI is a separate, self-contained tool that reads a blueprint and writes files into `src/functional/`. It is not part of the running application: it never ships to production, and nothing in `src/` depends on it.

## The checks that hold the line

Generated code belongs to you, which means the generator's guarantees expire the moment you edit it. Structural rules and standalone linters stand in for them.

`pnpm arch:check` runs dependency-cruiser over `src/`:

| Rule | What it forbids |
|---|---|
| `no-cross-domain-imports` | one `functional/` domain importing another |
| `no-infrastructure-to-functional` | `technical/`, `modules/` or `devtools/` importing a business domain |
| `no-kernel-to-module` | `technical/` importing `modules/` |
| `no-cross-module-imports` | one module importing another |
| `no-production-to-devtools` | anything but a spec reaching into `devtools/` |
| `no-circular` | circular dependencies anywhere |

Alongside them, each its own CI step:

- `pnpm test` includes `src/architecture.spec.ts`, which asserts that every folder in `functional/` carries the conventional files: `.module.ts`, `.controller.ts`, `.service.ts`, `.policy.ts`, `.dto.ts` and `.spec.ts`. A domain without a spec fails the suite.
- `pnpm lint:capabilities` — every route in every controller under `src/`, `examples/` and `packages/` carries a `@Capability(...)` or a `@PublicRoute('<why>')`, reads included. Kernel, module and devtools routes serve data exactly like a resource route does, so they are held to it too.
- `pnpm lint:scope-parity` — every `search()` in a `functional/` service goes through `scopeWhereFor(...)`, and every preset comes from the resource's single `<NAME>_PRESETS` declaration rather than a literal.
- `pnpm lint:rls` — every model the schema declares carries a `tenantId`, or is recorded in `TENANT_FREE_MODELS` with the reason it cannot; and every model that carries one is either covered by a Postgres row-level policy or recorded as enforced in code, never neither and never both.
- `pnpm lint:subject` — every capability subject comes from `subjectOf(user)`.
- `pnpm lint:pagination` — every collection route the framework writes itself (`technical/`, `devtools/`, `modules/`, the module packages) pages through `parsePageQuery`/`okPage`, or declares `@UnpaginatedRoute('<why>')`. A generated resource is out of scope: its blueprint decides.
- `pnpm lint:dev-guard` — no controller hand-rolls its own production check instead of using `DevOnlyGuard`.
- `pnpm lint:module-drift` — a module exists twice, authored under `packages/<name>/src/runtime` and installed where its own `module.ts` copies it to, and this repository keeps both. The check compares them file by file and fails when they stop saying the same thing, in either direction: a file edited on one side only, or one that exists here and would never reach a project installing the module. A module's own spec is the one exemption, named in the script.
- `pnpm lint:coverage` — a meta-check that every top-level directory is reached by *some* linter, so a newly added folder cannot quietly escape all of them. Two roots are allow-listed (`docs`, which ships its own toolchain, and `packages/admin-astro/src/runtime`, the admin template whose copy is only verified for real once `hery install` writes it into `admin/`), plus two file types read by the tools that own them (`.cjs`, `.mjs`) — the script describes that list as recorded debt rather than a licence.

All of this exists so the structure above is still true after months of hand-editing generated code, not just on day one.
