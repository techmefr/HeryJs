---
title: The hery CLI
description: Every hery command — generating resources, installing modules, and the tools around them.
---

The `hery` CLI is the only thing in this project that reads a blueprint. It is a build-time tool, not a runtime dependency of the generated application.

| Command | What it does |
|---|---|
| `new <name>` | Scaffolds a fresh HeryJs project in its own directory. |
| `create:blueprint <Name>` | Writes a blueprint from prompts or defaults. |
| `generate <Name>` | Writes a full resource from that blueprint. |
| `migrate --name <name>` | Runs `prisma migrate dev`. |
| `install [modules...]` | Installs optional modules. |
| `uninstall <module>` | Removes a module and reverses what installing it did. |
| `module:list` | Lists the modules available to install. |
| `module:monitoring` | Scaffolds Prometheus, Grafana and Loki. |
| `search:reindex <Name>` | Rebuilds a resource's search index from Postgres. |
| `up` | Checks that local dependencies are ready. |
| `doctor` | One command for environment, config and infra together. |
| `env pull` | Writes the resolved variables into `.env`. |
| `env run -- <command>` | Runs a command with the resolved variables injected. |
| `lint` | Scores the project against conventions eslint and the architecture linter do not reach. |
| `console` | Boots the app into a REPL. |
| `hosts` | Adds the local hostname to your hosts file. |
| `mcp:serve` | A read-only MCP server over stdio. |

## `hery new <name>`

Scaffolds a fresh HeryJs project in `./<name>`: the CLI, every module's authoring package, the kernel (`technical/`), the always-on DX tools (`devtools/`), the modules wired in by default, and a rewritten `package.json`. It then runs `git init` and commits the result, and prints the commands to take from there:

```bash
pnpm hery new my-app
cd my-app
cp .env.example .env
docker compose up -d
pnpm install
pnpm exec prisma migrate dev
pnpm start:dev
```

Examples and the doc site are deliberately not copied — this is the framework's own demo, not part of what ships.

## The order that matters

```bash
pnpm hery create:blueprint Task
# edit blueprints/task.yaml if needed
pnpm hery generate Task
pnpm hery migrate --name add_task
```

After this, `Task` is a normal NestJS module like any other. Nothing re-reads `blueprints/task.yaml` again — evolving the resource means editing the generated files directly, the same way you would for hand-written code.

## `hery create:blueprint <Name>`

Walks through interactive prompts (fields, permissions, whether to paginate and with which page sizes, sortable fields, filterable fields) and writes a YAML blueprint to `blueprints/<name>.yaml`. Pagination defaults to off — `--yes` writes a blueprint whose search route returns every match.

- `--yes` skips the prompts and takes sensible defaults — useful in scripts, or when trying the generator out.
- `--all-options` skips the prompts and writes a fully commented blueprint listing every field type, every permission preset and every other option the generator understands, mostly commented out. A quick way to see the whole menu before trimming it to what you need.

Every run also (re)writes `blueprints/schema.json` — a JSON Schema generated straight from the same zod schema `hery generate` parses a blueprint against, via zod's own `toJSONSchema` — and stamps the new file with a `# yaml-language-server: $schema=./schema.json` modeline. An editor with the [yaml-language-server](https://github.com/redhat-developer/yaml-language-server) extension picks that up on its own: autocompletion and inline validation for field types, permission presets and the rest, without opening a second file to check what is allowed.

## `hery generate <Name|path>`

Reads the blueprint and writes nine files into `src/functional/<name>/`. See [What gets generated](/guides/generated-files/) for what each one owns.

The argument is a name resolved under `blueprints/`, or a path to a YAML file if you would rather keep a blueprint next to whatever it produced:

```bash
pnpm hery generate Task
pnpm hery generate examples/blog-post.yaml
```

It also patches `prisma/schema.prisma` (the new model plus its inverse relation on `User`), `prisma.client.ts` (adding the model to the tenant-scoped set) and `audit-log.ts` (adding it to the audited set), then prints the two manual steps it deliberately does not take for you: importing the module into `src/app.module.ts`, and running the migration.

- `--force` overwrites an existing resource directory. Without it, `generate` refuses rather than clobbering code you own.
- `--graphql`, `--mcp`, `--live`, `--stream` each add one more file, wiring the resource into the corresponding module. They require that module to be installed; the flag does not check.

## `hery migrate --name <migration-name>`

A thin wrapper around `prisma migrate dev`, run after `generate` once the schema has been patched.

## `hery install [modules...]`

Installs optional modules à la carte or, with `--all`, the full package. `hery module:list` prints what is available. See [The module system](/guides/modules/).

```bash
pnpm hery install storage mail
pnpm hery install --all
```

## `hery uninstall <module>`

Removes the module's own npm dependencies (`pnpm remove`) and prints the rest of what to clean up by hand — the runtime files it copied in and the kernel files it patched. It only automates what is safe to automate outright: your own edits to those files since installing are exactly what "own your code" says the tool must never guess about and silently revert. Run `hery module:list` to see what's installed. See [The module system](/guides/modules/).

## `hery search:reindex <Name>`

Rebuilds a resource's search index from what is actually in Postgres — the source of truth stays the database, the index is a derived cache that can always be thrown away and rebuilt. Run it after installing a search engine module on a resource that already has data, or any time the index and the database might have drifted. See [Full-text search](/guides/search/).

## `hery module:monitoring`

Scaffolds Prometheus, Grafana and Loki as an opt-in local compose stack, wired to scrape the app's `/metrics`. It writes the compose file and a Prometheus config, then prints the command to start them — it does not start anything itself.

`/metrics` is caller-authenticated like every other route, so the scrape carries an admin API key: the config reads it from `monitoring/api-key`, which the command creates with a placeholder. Mint a key with `POST /api-keys`, put it in that file on its own line, and keep the file out of version control. Until then every scrape gets a 401.

Despite the name it is a plain command, not a registry module: it does not appear in `module:list` and `install --all` does not cover it.

## `hery up`

Checks that the things the app needs are actually reachable — Postgres, Valkey, and whether Prisma migrations are up to date — and exits non-zero if any of them is not, with a hint for each:

```
✔ PostgreSQL (localhost:32768)
✔ Valkey (localhost:32769)
✘ Prisma migrations — run "pnpm hery migrate --name <name>"
```

`--start` brings the compose services up first and then does something more interesting: it reads back the **ports Docker actually assigned** and writes them into `.env`. The compose files publish container ports without fixing a host port, so several projects can run side by side without colliding, and `hery up --start` is what reconciles that with your configuration. It resolves `DATABASE_URL` and `REDIS_URL`, plus `ELASTICSEARCH_URL` or `MEILISEARCH_URL` if the matching search module is installed.

## `hery doctor`

Everything `hery up` checks, plus the two config files a broken value in either would otherwise crash the whole CLI on: environment variables (parsed against the same zod schema `env.ts` builds at startup) and `hery.config.ts` (loaded for real, then checked for one thing loading it does not catch on its own — that `search.default` actually names a key in `search.engines`).

```
✔ Environment variables
✔ hery.config.ts
✔ PostgreSQL (localhost:32769)
✔ Valkey (localhost:32768)
✔ Prisma migrations
```

Both config checks go through `require()` inside a `try`/`catch` rather than a normal `import`, on purpose: `env.ts` and `hery-config.ts` both validate at import time and throw if the result is invalid, which is exactly the failure `doctor` exists to turn into a diagnosis instead of a crash.

## `hery env pull` and `hery env run`

The environment schema in `env.ts` is split into two halves. The server half (`env`) never leaves the process; the public half (`publicEnv`) is the short list of variables the admin dashboard's browser bundle is allowed to read, declared once so a typo in a name fails at startup instead of quietly shipping `http://localhost:3000` to production. `no-server-env-in-client` (part of `hery lint`) enforces the other direction: a client-side read of anything not in that list is a critical violation, because Astro inlines whatever it reads into the bundle it sends to the browser.

Where the values themselves come from is a separate question, handled by a small contract rather than by wiring a provider into the app:

```ts
interface EnvSource {
  name: string;
  load(): Promise<Record<string, string>>;
}
```

The only implementation shipped is `.env` itself. `env pull` resolves the configured source and writes the result into `.env`; `env run -- <command>` resolves it and runs a command with the values injected, without ever writing them to disk:

```bash
pnpm hery env pull
pnpm hery env run -- pnpm start:dev
```

This is deliberately a CLI-only concern. `env.ts` reads `process.env` once, synchronously, at import time, and the rest of `technical/` depends on that as a plain value — making it async to accommodate a remote secrets manager (Infisical, Doppler, Vault, or one a team builds itself) would contaminate every module that reads `env` for a need that exists only at startup. Implementing `EnvSource` against a real provider and pointing `dotEnvSource` at it instead is enough to swap one in; nothing downstream of `.env` changes.

## `hery lint`

Scores the project out of 100 against conventions eslint and the architecture linter do not reach — forbidden patterns (`any`, a controller importing Prisma directly) and the shape a generated resource is supposed to keep (every file `hery generate` writes, present). A fresh install is never going to start at 100 for a codebase that predates the rule, so a baseline file grandfathers what already exists:

```bash
pnpm hery lint --write-baseline          # snapshot today's violations as known debt
pnpm hery lint --min-score 100           # fail only on anything new
```

The baseline (`.hery/lint-baseline.json` by default, override with `--baseline <path>`) keys each grandfathered violation by the rule and a hash of the exact file content it was recorded against — never by path. Rename the file and the debt follows it; touch even one line and the file's violations count as new again. That is deliberate: a baseline immune to edits would let someone change a violating line for an unrelated reason and walk away having silently re-endorsed it.

`--format json` prints `{ score, grandfathered, violations }` instead of the text report, for a script or an agent to act on.

## `hery console`

Boots the real application into a REPL with the DI container and the tenant-scoped Prisma client. `--tenant <id>` picks the tenant the whole session runs inside. See [Developer tooling](/guides/devtools/).

## `hery hosts`

Adds `heryjs.local` (or whatever `HERYJS_DOMAIN` is set to) to your system hosts file, pointing at `127.0.0.1`, so the app is reachable by name instead of by port. It shows the exact line it will add and asks before touching anything, then elevates — sudo on Unix, an admin prompt on Windows. If the entry is already there it says so and does nothing.

## `hery mcp:serve`

Starts a read-only [MCP](https://modelcontextprotocol.io) server over stdio, for editors and agents that want to introspect what exists in the project. Two tools:

- `list_resources` — the resources actually generated under `src/functional/`.
- `describe_resource(name)` — that resource's routes (HTTP method, path, the capability guarding it) and its fields, read straight from the real `*.controller.ts` and `prisma/schema.prisma`.

It never reads a blueprint file. A blueprint is a one-time input to `generate`, not a live source of truth — the generated code is.

This is the read-only surface, needs no running app and no credentials. For an agent that should be able to *use* the application — with a real session and real capability checks — install the [MCP module](/guides/graphql-and-mcp/) instead.
