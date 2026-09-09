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
- Capabilities resolved server-side in memory and returned as decisions
  (`{ allowed, scope }`) — never as rules the frontend could reinterpret.
- Multi-tenancy resolved once per request and enforced underneath permissions,
  with row-level security available per model.
- Teams with the `own` / `team` / `all` / `none` presets.
- A tenant-namespaced cache on the same Valkey the kernel already depends on,
  exported globally with no module to install.
- A rate limit on by default across every kernel and module route, with
  `read` / `write` / `auth` buckets a project can retune but never remove.
- An architecture linter that fails CI on a domain missing a concern, plus
  fourteen convention checks covering capabilities, pagination, RLS, rate
  limiting, module drift and patched kernel files.

### The modules

`mail`, `storage`, `webhooks`, `live`, `stream`, `impersonation`, `graphql`,
`mcp`, `search-elasticsearch`, `search-meilisearch` and `admin-astro`, each
installable with `hery install` and removable with `hery uninstall`.

A module is its default export, closed with `satisfies ModuleDefinition` and
typed through an `import type` the compiler erases — so a published module has
no runtime dependency on HeryJs at all. Any dependency carrying
`heryjs.module: true` is discovered and installed the same way an official one
is, and the eleven official modules declare exactly what a third party's does.
