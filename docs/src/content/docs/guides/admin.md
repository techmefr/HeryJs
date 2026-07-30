---
title: Admin panel and introspection
description: GET /describe reflects what is actually wired, and the Astro admin builds itself from the answer.
---

The admin panel has no configuration file listing your resources. It asks the running application what exists, and renders that. Add a module that ships a listable route and it appears in the sidebar without the admin knowing anything about it.

## `GET /describe`

One route, guarded by `SessionGuard` and `DevOnlyGuard`. It returns every controller and every route the DI container actually has:

```ts
export interface DescribedRoute {
  method: string;
  path: string;
  handler: string;
  capability?: string;
}

export interface DescribedController {
  name: string;
  basePath: string;
  routes: DescribedRoute[];
}
```

```json
{
  "data": [
    {
      "name": "WorkoutController",
      "basePath": "/workouts",
      "routes": [
        { "method": "GET", "path": "/", "handler": "search", "capability": "canViewAnyWorkout" }
      ]
    }
  ],
  "messages": []
}
```

`capability` is the name of the policy function bound by `@Capability`, so the answer records not just that a route exists but which decision guards it. A route with no `@Capability` reports none — which for the kernel's own endpoints means they are gated at the controller level instead.

### It reflects the container, not the filesystem

`DescribeService` walks the controllers Nest has instantiated and reads their decorator metadata. It does not parse `*.controller.ts`, and it does not read the blueprint.

That choice buys two things. The runtime gains no dependency on the generator — `/describe` works the same in a project where every generated file has since been rewritten by hand. And it describes **what is actually wired** rather than what happens to be on disk: a controller you wrote yourself appears, a controller you removed from a module's `controllers` array does not, and a route you added by hand is described as accurately as a generated one.

This is the same principle as `hery mcp:serve` reading real controllers rather than blueprints, one layer further in: the code is the source of truth, not the thing that produced the code.

One caveat, noted in the source: an aliased policy (`export const canViewX = canUpdateX`) reports the name of the first binding, which would claim a read route requires update rights. Give each policy its own function if you care about the introspected name.

## The admin panel

```bash
pnpm hery install admin-astro
pnpm install
pnpm --filter admin dev
```

Astro on port 4322, in its own pnpm workspace. Statically built on purpose: every page authenticates from the browser with the session token, so there is nothing to render on a server and no adapter to deploy — the pages are files.

Three pages. An overview counting controllers, routes and how many sit behind a capability; a browse page rendering one route as a table; and a login form. Sign in with any account of your API — it posts to the same `/auth/login` the rest of the world uses and keeps the token in the browser.

### Every argument-free GET becomes a section

The rule that turns introspection into a UI is four lines:

```ts
controller.routes
  .filter((route) => route.method === 'GET' && !route.path.includes(':'))
```

A `GET` with no path parameter is something that can be listed without knowing anything else, so it becomes a sidebar entry, and its payload becomes a table. Routes taking an `:id` are skipped because there is no id to supply; non-`GET` routes are skipped because the panel does not mutate. A handful of paths that are not resource listings — the root, `/describe` itself, `/health`, `/metrics` and the signal stream — are excluded by name.

Note that "argument-free" is a test on **path parameters only**. A GET route that requires a query parameter is still listed, and will render whatever it answers when called without one.

This is why the panel needs no per-resource work. `/workouts` appears because it was generated; `/teams`, `/notifications`, `/audit-logs`, `/feature-flags` appear because the kernel ships them; `/scheduler/tasks` and `/inspector/requests` appear because they are GET routes like any other. Install `mail` and `/mail` appears too.

### Columns come from the payload

There is no column configuration and no field metadata in `/describe`. The table takes the union of the keys present in the returned rows:

```ts
const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
```

The consequence is a useful one: **a field the resource's view strips never reaches the table in the first place**. Hidden fields are hidden in the admin for the same reason and by the same mechanism as everywhere else, with no second list to maintain. Values are formatted by shape — booleans as pills, timestamps trimmed, objects as JSON, HTTP status codes coloured — and a route that answers with a single object rather than an array renders as a one-row table.

### It is read-only

The only request the panel makes that is not a `GET` is the login. There are no forms, no edit views and no delete buttons. A 403 is surfaced as a state card explaining that the API refused for the signed-in account, rather than being hidden client-side — the panel shows you what the backend decided, which is the same contract the frontend gets everywhere else in HeryJs.

Point it at another API with `PUBLIC_API_URL` if yours is not on `http://localhost:3000`.

## Before you deploy any of this

`/describe` is a map of your application, and the protections on it are worth understanding precisely.

**Unauthenticated callers get nothing** — `SessionGuard` runs first and returns 401 before anything is computed, which the spec asserts.

**Any authenticated session gets the whole map.** There is no capability check, no role, no admin flag and no tenant filter on `/describe`. Combined with an unguarded `POST /auth/register`, that means in a non-production deployment anyone who can sign themselves up can enumerate every controller, route, handler name and capability name in the application — including routes they cannot call.

**Production protection is a `NODE_ENV` string comparison.** `DevOnlyGuard` 404s when `NODE_ENV === 'production'` and nothing else. A deployment that sets `NODE_ENV=prod`, or forgets it entirely, exposes `/describe` for real. There is no separate flag to turn it off.

**Guard order leaks existence.** Because `SessionGuard` is declared before `DevOnlyGuard`, an unauthenticated production request to `/describe` answers 401 rather than the 404 that would make the route look absent. The same ordering applies to `/inspector/requests`, `/scheduler/tasks` and `/seeders`.

The admin panel itself is a static bundle, so `PUBLIC_API_URL` is baked into shipped JavaScript, and the session token lives in browser storage readable by any script on the admin origin. Treat the panel as a development tool unless you have deliberately hardened both ends.
