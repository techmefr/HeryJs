---
title: Exposing an action to the mine
description: A decorator-based registry that turns a plain method into a form the admin panel can render and the CLI can call, without a route to write by hand.
---

Some operations are not a resource's CRUD — pruning a model, seeding test data, kicking off a one-off job. Writing a `POST` route and a DTO by hand for each of them means every one grows its own shape: its own body parsing, its own bounds checking, its own way of deciding who's allowed to call it. Exposition is the alternative: declare the method and its parameters once, and the mine, the generic HTTP route, and the CLI all read the same declaration.

## The two decorators

`@ExposeAction` marks a method as reachable through the mechanism. `@ExposeField` marks one of its parameters as a value the caller supplies.

```ts
@ExposeAction('prune.run', { capability: canManagePrune })
async run(
  @ExposeField('prune.run.model', {
    kind: 'enum',
    values: prunableModels(),
    default: prunableModels()[0] ?? '',
  })
  model: string,
  @ExposeField('prune.run.retentionDays', {
    kind: 'number',
    min: 1,
    max: 3650,
    default: DEFAULT_RETENTION_DAYS,
  })
  retentionDays: number,
): Promise<PruneRunResult> { ... }
```

`capability` is a `PolicyCheck`, the same function shape every other permission in the framework uses — see [Capabilities](/guides/capabilities). `environments` is optional and restricts the action to a subset of `'development' | 'test' | 'production'`; omit it and the action runs everywhere.

A field's `kind` is one of `number`, `boolean`, `string` or `enum`, each carrying its own bounds (`min`/`max`/`step`, `maxLength`, `values`) and a `default`. The default matters beyond documentation: a caller who omits a param gets it, so a form only needs to render the fields it wants to override.

## The naming convention

Every action and field name follows `provenance.thing` — `prune.run`, `prune.run.retentionDays`, `agency.seed.count`. The registry enforces at least one dot; there is no further structure beyond that, but the convention keeps the catalog readable once a dozen modules have all added their own actions.

## The registry

At boot, `ExpositionRegistrar` scans every provider in the application with Nest's `DiscoveryService` — the same mechanism `IntrospectionService` uses to find `@Capability`-annotated routes — reading `@ExposeAction`/`@ExposeField` metadata off each method and filling `ExpositionRegistry`, a map keyed by action name. Registering a name without a dot, or the same name twice, throws at boot rather than silently keeping the first one: a typo in a name is a mistake worth failing loudly on, not a mistake worth guessing about.

## One generic route

```
GET  /expose            -- the full catalog: name, capability name, environments, params and their specs
POST /expose/:action    -- run one action
```

`GET /expose` is what a form-rendering admin page reads: each entry already carries everything needed to draw a field — its kind, its bounds, its default. `POST /expose/:action` resolves the action, checks its environment filter, checks its capability against `subjectOf(user)`, then resolves each declared param: an input value if the caller sent one, its spec's `default` otherwise, validated either way against a Zod schema derived from the spec (`schemaFor`, in `exposition-validation.ts`) — so the bounds are declared once and checked the same way regardless of who calls it. One audit entry is written before the action runs, with `model: 'exposition'`, `operation: <actionName>`, and every resolved param by name.

`/expose` itself is added to the admin panel's `HIDDEN_PATHS` — it is the mine's own catalog route, not a section to auto-discover.

## Reaching the same action from the CLI

`hery expose:run <action> --param name=value` runs an action outside a request, useful for anything scriptable from a terminal rather than clicked through the mine:

```bash
hery expose:run agency.seed --param agency.seed.agency=Acme --param agency.seed.count=5
```

The CLI has no signed-in user to check a capability against, so `ExpositionRunner.runTrusted` skips that check — trust here comes from having a shell on the machine, the same reasoning `console`'s `--tenant` option already relies on. The environment filter and the audit write still apply; the audit entry's actor is simply `null`, the same way a scheduled job's is. `--param` values arrive as strings; `coerceCliValue` converts each one to its field's `kind` before validation, by hand rather than through Zod's `z.coerce` — `z.coerce.boolean()` treats the string `'false'` as truthy, since it's a non-empty string.

`hery expose:list` prints the catalog for a quick look without touching HTTP at all.

## Two worked examples

[Prune](/guides/prune/#exposed-to-the-mine-not-routed-by-hand) exposes `prune.status` and `prune.run`, gated by `canManagePrune`. Its `model` field is a closed `enum` built from `prunableModels()`, so the mine renders it as a menu rather than free text.

The agency seeder exposes `agency.seed`, gated by `canSeedAgency` and restricted to `development`/`test`. It declares exactly two params — which team to seed, how many users to add to it — and finds-or-creates the team before bulk-creating users as its members. It is deliberately not built on the older `Seeder` interface in `seeder.types.ts`: that interface is its own grammar, with its own route and its own bounds-checking, and exposition exists precisely so a second grammar doesn't need to exist next to it. Both examples prove the same thing from different angles: the mine's form, the generic route's validation, and (for the seeder) the CLI's `--param` flags all come from the one declaration on the method.
