---
title: GraphQL and MCP
description: Two alternate protocols over the same resources, and the one rule they both have to obey.
---

REST is the surface `hery generate` writes by default. Two modules add others: GraphQL for clients that want to shape their own queries, and MCP for agents that want to call the application as a set of tools.

Both raise the same question, and it is the only one that really matters: **a second protocol must not become a second permission model.** A capability that holds over REST and not over GraphQL is worse than no GraphQL at all, because the gap is invisible from the side that looks correct.

## Why the guard cannot simply be reused

`CapabilitiesGuard` is HTTP-only. It reaches for the request through `context.switchToHttp()`, which is meaningless for a GraphQL resolver invoked through a different execution context, and for an MCP tool call that is not a route at all.

So neither module reuses the guard. Both reuse the **policy functions** instead — the same exported `canViewWorkout`, `canUpdateWorkout`, `canDeleteWorkout` that the REST controller declares. That is precisely why those are plain exported functions rather than methods on an injected class: a plain function can be called from a guard, a resolver, a socket handler or a tool registrar without any of them needing to be a route.

The generated resource remains the single source of truth for its rules. What changes between protocols is only *who calls them*.

## MCP — the write gateway

```bash
pnpm hery install mcp
pnpm hery generate Workout --mcp
```

Mounted at `/mcp` behind `SessionGuard`, over Streamable HTTP in stateless mode. Each generated resource contributes five tools:

| Tool | Input | Effect |
|---|---|---|
| `search_workout` | — | reads, scoped to the caller |
| `get_workout` | `{ id }` | reads one |
| `create_workout` | the resource's create schema | creates |
| `update_workout` | `{ id, …update schema }` | updates |
| `remove_workout` | `{ id }` | soft-deletes |

`remove_*` is a soft delete. There is no hard-delete tool, which means an agent cannot destroy a row — the worst it can do is move it to the bin that `?onlyTrashed=true` and the restore route already know how to reach.

### The subject is captured, not passed

The security design is one detail worth quoting. The subject is built once per HTTP request, from the session the guard already validated, and closed over when the tools are registered:

```ts
const subject = subjectOf(req.user);
const server = new McpServer({ name: 'heryjs', version: '0.0.1' });
for (const registrar of this.registrars) {
  registrar.register(server, subject);
}
```

There is no subject parameter on any tool. An agent cannot ask to act as someone else, because the identity is not part of the tool's input surface at all — it is baked into the closure before the model ever sees a tool list.

Every tool then re-checks the same policy as REST:

```ts
const decision = canDeleteWorkout(subject, record);
if (!decision.allowed) {
  return deniedResult();
}
```

Input is validated by the resource's own Zod schemas, and results pass through the resource's view function, so a field marked `hidden` in the blueprint stays hidden from an agent exactly as it does from a browser. Read tools load through the visible-record loader, so a soft-deleted row is not resurfaced as if it still existed.

One behavioural note for client authors: a denial comes back as tool *content* (`{ error: 'capability denied' }`), not as a protocol error or an HTTP 403. An agent sees a refusal it can reason about rather than a transport failure.

### Why `/mcp` sits behind a session, not native MCP auth

MCP's own [authorization spec](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) describes a full OAuth 2.1 resource-server flow a server may expose — Protected Resource Metadata, authorization-server discovery, `iss` validation, PKCE, scope step-up. `/mcp` does not implement any of it; it sits behind the same `SessionGuard` as everything else. Three reasons this stays a session route rather than growing its own OAuth surface:

1. That whole flow is explicitly **OPTIONAL** in the spec itself — skipping it is not a compliance gap, it is a choice the protocol hands the server.
2. Becoming a real OAuth 2.1 resource server is an infrastructure project on its own, out of proportion with a kernel whose whole premise is to expose what it generates rather than take on a protocol's full surface — the same "the framework exposes, it does not reason" boundary applied to auth this time.
3. The two cases the MCP OAuth flow exists to cover — a human behind an interactive client, a script or agent with no human present — are already covered through the same door as REST: a session for the first, an [API key](/guides/authentication/) for the second.

This is a considered decision, not an oversight, and it is not permanent: the trigger for revisiting it is concrete — a real MCP client that refuses to connect at all without native OAuth discovery (Protected Resource Metadata and the rest), not a hypothetical future client that might want it.

### Two MCP surfaces, different jobs

`hery mcp:serve` and the `mcp` module are easy to confuse. They share almost nothing.

| | `hery mcp:serve` | `hery install mcp` |
|---|---|---|
| Runs as | a standalone CLI process over stdio | a route inside your app |
| Auth | none | session, `SessionGuard` |
| Reads | source files on disk | the live database |
| Tools | `list_resources`, `describe_resource` | `search_*` … `remove_*` |
| Mutates | nothing | yes |

`mcp:serve` is for an editor or agent that wants to know **what exists** in the codebase — it parses controllers and the Prisma schema, needs no running app and no credentials, and can only read. The module is for an agent that wants to **use** the application, with a real session and real capability checks. Install the module when you want the second thing; you do not need it for the first.

## GraphQL

```bash
pnpm hery install graphql
```

Installs an Apollo-driven endpoint and a session guard mirroring the REST auth flow, then asks you to import `GraphqlModule` into `src/app.module.ts`. The schema is code-first with `autoSchemaFile`, built in memory from decorated classes — no schema file to keep in sync, and nothing reads the blueprint at runtime.

Authentication is `GqlSessionGuard`, which reads the same `Authorization: Bearer …` header and produces the same `MissingSessionException` / `InvalidSessionException` as REST. Tenancy needs no GraphQL-specific code: a GraphQL request is an HTTP POST, so the tenant middleware has already resolved the boundary before any resolver runs.

Per-resource resolvers are generated with `hery generate <Name> --graphql`, producing a query per read, a mutation per write, and — critically — the same policy call in each resolver body that the REST controller makes in its guard:

```ts
const subject = subjectOf(req.user);
const decision = canUpdateWorkout(subject, record);
if (!decision.allowed) {
  throw new CapabilityForbiddenException();
}
```

Two smaller differences from REST worth knowing: a denial throws `CapabilityForbiddenException` without the decision attached, so the response does not report the scope the way a REST 403 does; and the session is validated twice per request — once by the tenant middleware, once by the resolver guard.

The endpoint path is whatever `@nestjs/graphql` defaults to; HeryJs does not set it, so treat it as the library's default rather than a framework guarantee.
