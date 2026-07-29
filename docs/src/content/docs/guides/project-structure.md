---
title: Project structure
description: How a HeryJs project is laid out, and why.
---

```
src/
  functional/
    workout/
      workout.dto.ts
      workout.policy.ts
      workout-record.loader.ts
      workout.service.ts
      workout.controller.ts
      workout.factory.ts
      workout.view.ts
      workout.spec.ts
  technical/
    auth/
    capabilities/
    tenancy/
    errors/
    http/
    prisma/
    validation/
cli/
  hery.ts
  commands/
  lib/
blueprints/
  workout.yaml
prisma/
  schema.prisma
  seed.ts
```

## `functional/` — one folder per resource

Every business resource gets its own folder, and every folder follows the same shape. Nothing inside `functional/` imports from another resource's folder directly — cross-resource concerns go through `technical/` instead.

## `technical/` — shared infrastructure

Everything a resource needs but doesn't own itself: the capabilities engine, the tenant-scoped Prisma client, the domain exception hierarchy and its global filter, the response envelope, the auth guard.

`technical/` never imports from `functional/`. This is enforced in CI, not just documented — see the architecture linter below.

## `cli/` — the generator

The `hery` CLI is a separate, self-contained tool that reads a blueprint and writes files into `functional/`. It is not part of the running application; it never ships to production and nothing in `src/` depends on it.

## The architecture linter

Two checks run in CI on every push:

- **dependency-cruiser** rejects any import from `technical/` into `functional/`, and any cross-resource import inside `functional/`.
- A Jest test (`architecture.spec.ts`) checks that every resource folder contains the files the convention expects.

Both exist so the structure above stays true after months of hand-editing generated code, not just on day one.
