---
title: The hery CLI
description: create:blueprint, generate, migrate — the three commands that make up the generator.
---

The `hery` CLI is the only thing in this project that reads a blueprint. It is a build-time tool, not a runtime dependency of the generated application.

## `hery create:blueprint <Name>`

Walks through a set of interactive prompts (fields, permissions, pagination limits, sortable fields, filterable fields) and writes a YAML blueprint to `blueprints/<name>.yaml`. Pass `--yes` to skip the prompts and take sensible defaults — useful in scripts or when trying the generator out.

## `hery generate <Name>`

Reads the blueprint and writes a full resource into `src/functional/<name>/`:

`<name>.dto.ts`, `<name>.policy.ts`, `<name>-record.loader.ts`, `<name>.service.ts`, `<name>.controller.ts`, `<name>.factory.ts`, `<name>.view.ts`, `<name>.spec.ts`

It also patches `prisma/schema.prisma` (adding the new model and its inverse relation on `User`) and `prisma.client.ts` (adding the model to the tenant-scoped set). Running it again on an existing resource without `--force` refuses to overwrite anything.

## `hery migrate --name <migration-name>`

A thin wrapper around `prisma migrate dev`, run after `generate` once the schema has been patched.

## The order that matters

```bash
pnpm hery create:blueprint Task
# edit blueprints/task.yaml if needed
pnpm hery generate Task
pnpm hery migrate --name add_task
```

After this, `Task` is a normal NestJS module like any other. Nothing re-reads `blueprints/task.yaml` again — editing the resource going forward means editing the generated files directly, the same way you would for hand-written code.
