---
title: Admin panel and introspection
description: GET /introspect reflects what is actually wired, and the Astro admin builds itself from the answer.
---

The admin panel has no configuration file listing your resources. It asks the running application what exists, and renders that. Add a module that ships a listable route and it appears in the sidebar without the admin knowing anything about it.

## `GET /introspect`

One route, behind `@AdminStudio()` (see [Running the studio in production](#running-the-studio-in-production)). It returns every controller and every route the DI container actually has:

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
      "name": "BlogPostController",
      "basePath": "/blog-posts",
      "routes": [
        {
          "method": "POST",
          "path": "/search",
          "handler": "search",
          "capability": "canViewAnyBlogPost"
        }
      ]
    }
  ],
  "messages": []
}
```

`capability` is the name of the policy function bound by `@Capability`, so the answer records not just that a route exists but which decision guards it. A route with no `@Capability` reports none — which for the kernel's own endpoints means they are gated at the controller level instead.

### It reflects the container, not the filesystem

`IntrospectionService` walks the controllers Nest has instantiated and reads their decorator metadata. It does not parse `*.controller.ts`, and it does not read the blueprint.

That choice buys two things. The runtime gains no dependency on the generator — `/introspect` works the same in a project where every generated file has since been rewritten by hand. And it describes **what is actually wired** rather than what happens to be on disk: a controller you wrote yourself appears, a controller you removed from a module's `controllers` array does not, and a route you added by hand is described as accurately as a generated one.

This is the same principle as `hery mcp:serve` reading real controllers rather than blueprints, one layer further in: the code is the source of truth, not the thing that produced the code.

One caveat, noted in the source: an aliased policy (`export const canViewX = canUpdateX`) reports the name of the first binding, which would claim a read route requires update rights. Give each policy its own function if you care about the introspected name.

## The admin panel

```bash
pnpm hery install admin-astro
pnpm install
pnpm --filter admin dev
```

Astro on port 4322, in its own pnpm workspace. Statically built on purpose: every page authenticates from the browser with the session token, so there is nothing to render on a server and no adapter to deploy — the pages are files.

Nine pages. An overview counting controllers, routes and how many sit behind a capability; a browse page rendering one plain route as a table; a resource page managing a generated resource; a login form; the [Pipeline](../guides/debugging/) page, one card per traced request with the blocked step outlined; a [Dev dashboard](../guides/dev-dashboard/) page, the persisted requests, slow queries, N+1 findings, jobs, messages and exceptions of your tenant, one tab per kind; a [Prune](../guides/prune/#the-admin-page) page, one row per configured model with a button that triggers a run; and a [Backups](../guides/backups/#from-the-admin-panel) page to create, download and restore dumps and edit their schedule. Sign in with any account of your API — it posts to the same `/auth/login` the rest of the world uses and keeps the token in the browser. A [Quotas](/guides/quotas/#managing-it-from-the-admin-panel) page shows every tenant's usage against its limit and edits limits and counters.

### Every argument-free GET, and every POST search route, becomes a section

The rule that turns introspection into a UI is a two-branch filter:

```ts
controller.routes.filter(
  (route) =>
    (route.method === 'GET' && !route.path.includes(':')) ||
    (route.method === 'POST' && route.path.endsWith('/search')),
);
```

A `GET` with no path parameter is something that can be listed without knowing anything else, so it becomes a sidebar entry, and its payload becomes a table. Routes taking an `:id` are skipped because there is no id to supply. A resource's search route is the one deliberate exception to "non-`GET` routes are skipped": the Lomkit-style search contract takes its query in a JSON body rather than the query string, so the panel calls it with `{}` as the body and renders the result exactly like a plain listing. A handful of paths that are not resource listings — the root, `/introspect` itself, `/health`, `/metrics` and the signal stream — are excluded by name.

Note that "argument-free" is a test on **path parameters only**. A GET route that requires a query parameter is still listed, and will render whatever it answers when called without one.

This is why the panel needs no per-resource work. `/blog-posts/search` appears because it was generated; `/teams`, `/notifications`, `/audit-logs`, `/feature-flags` appear because the kernel ships them; `/scheduler/tasks` and `/inspector/requests` appear because they are GET routes like any other. Install `mail` and `/mail` appears too.

### Columns come from the payload

There is no column configuration and no field metadata in `/introspect`. The table takes the union of the keys present in the returned rows:

```ts
const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
```

The consequence is a useful one: **a field the resource's view strips never reaches the table in the first place**. Hidden fields are hidden in the admin for the same reason and by the same mechanism as everywhere else, with no second list to maintain. Values are formatted by shape — booleans as pills, timestamps trimmed, objects as JSON, HTTP status codes coloured — and a route that answers with a single object rather than an array renders as a one-row table.

### Resources are managed, not just browsed

A controller that exposes `POST /search`, `GET /describe` and `POST /create` is a generated resource, and its sidebar entry opens the resource page (`/resource?base=/blog-posts`) instead of the flat table. Everything on that page is read from the contract the API publishes; there is no per-resource file.

- **Forms.** New and Edit are generated from `GET /describe`. The field list gives the kinds (text, whole number, checkbox, date, and slug, a text input that suggests the slug of its source field while you type and says whether it follows it), and `rules.create` / `rules.update`, the JSON Schema reflected off the Zod DTOs, give what is required and each field's length, bounds, pattern and enum. The form validates with those same rules before anything is sent, so the client and the server refuse the same values. The validation pipe answers a 400 with the flattened report older clients read plus an `issues` list carrying each issue's full path, so a server refusal, including a cross-field `check` in the DTO, is pinned to the field it names; an issue that names no field is shown at the top of the form. Edit sends only the fields that changed, and an update cannot empty a field, because an optional field in the DTO accepts a value or nothing, never `null`.
- **Table.** Search, filters, sorting and paging are driven by the search contract in `describe`: only the `sorts` and `filters` it declares are offered, the operators depend on the field type, values are converted to the type Prisma expects (a number is sent as a number, a date as an ISO timestamp), `search.q` is offered only when the resource has a text field, and `limits` fills the page size menu. A resource that does not paginate is never sent `page` or `limit`, which the API would refuse.
- **Bulk actions.** Tick rows to delete, delete permanently, or restore from the trash. Each action only sends the ids the API allowed, reports per record what was refused, and keeps the refused rows selected. A batch larger than `MAX_BATCH_ENTRIES` is split into several requests.
- **Relations.** Editing a record also shows its relations. A many-to-many relation lists who is attached (`POST /:id/tags/members`), detaches one at a time, and attaches through a picker that searches the related resource (`POST /:id/tags/options`), offering only what is not attached yet. Both routes are generated, gated by the view and the attach capability. An own-route child (`notes`) lists its rows through `POST /:id/notes/search`, and links to the child's own resource page when the child is itself a generated resource. A child declared `routed: false` is read-only here on purpose: it has no write route, no policy and no tenant or owner columns of its own, and writing it through its parent would mean inventing all three, so edit it by giving it a real blueprint.

### A disabled button is a refused request

The panel asks for the decisions it is going to draw, in the same request as the rows: `capabilities: ['update', 'delete', 'restore', 'attachTags', 'detachTags']` on the search body. Each row comes back with `{ allowed, scope }` per key, and `meta.capabilities` carries the collection-wide ones (`create`, and on a resource with soft deletes `hardDelete` and `listTrashed`). A button is enabled exactly when its decision is `allowed: true`; a missing decision counts as a refusal. The panel holds no permission logic of its own to drift from the policy file.

Three habits keep this true over time:

- Nothing is patched locally after a write. Every mutation reloads the page, so the decisions are the API's current answer, not the ones the page loaded with.
- Opening Edit re-fetches that one record by id first, so a permission withdrawn since the list loaded shows "not allowed" instead of a form the server would refuse.
- A bulk action is planned from the decisions of the selected rows, shows how many it will run and how many it skips, and a partial failure is reported per record rather than as one verdict.

Every value is written with `textContent` or an input's `value`, never as markup, so a hostile record cannot run script in the admin origin.

### Customising a resource without losing it

The panel is installed once and then belongs to you, which is the problem with changing it: edit a generated page and the change is gone, or conflicts, the next time the module updates. So the panel has a surface that is yours from the start, `admin/src/extensions.ts`. The installer never overwrites a file that already exists, so reinstalling or updating the module leaves it alone, and it is keyed by the resource's route and field names, not by generated code, so regenerating a resource on the API keeps working.

```ts
import { defineExtensions } from './lib/extensions';

export default defineExtensions({
  resources: {
    '/blog-posts': {
      label: 'Articles',
      columns: {
        id: { hidden: true },
        title: { label: 'Headline', format: (value) => String(value).toUpperCase() },
      },
      fields: {
        title: { help: 'Shown on the front page' },
        views: { readonly: true },
      },
      rowActions: [
        {
          id: 'feature',
          label: 'Feature',
          capability: 'feature',
          run: async (row, { reload }) => {
            await fetch(`/blog-posts/${row.id}/feature`, { method: 'POST' });
            await reload();
          },
        },
      ],
      disable: ['bulk'],
    },
  },
});
```

The surface can relabel, hide, lock, format and add, and it can switch a feature off (`create`, `update`, `delete`, `bulk`, `filters`, `search`, `relations`). It can never grant: a button is still enabled only by the API's decision, and a custom row action names the capability key it needs, which the panel adds to the keys it asks the API to resolve, and is disabled for a row where that decision is not `allowed`. Formatted values are plain text, never markup. Two mistakes are caught at load and reported in the browser console rather than failing quietly: an override naming a field the API no longer describes, and an override hiding or locking a required field (which stays editable, since the API would refuse a record without it).

Point it at another API with `PUBLIC_API_URL` if yours is not on `http://localhost:3000`.

## Contributing a section and an action

A feature contributes to the admin without a registry: it decorates the routes it already has, and introspection carries the declaration. `DescribedRoute` gains an `admin` field.

```ts
@Controller('mail')
@AdminStudio()
export class MailAdminController {
  @AdminSection({
    id: 'mail',
    title: 'Outbox',
    icon: 'mail',
    group: 'Messaging',
    columns: [{ key: 'subject', label: 'Subject' }, { key: 'sentAt', label: 'Sent', format: 'date' }],
  })
  @Get()
  @Capability(canReadMail)
  list() {}

  @AdminAction({ id: 'mail-resend', title: 'Resend', icon: 'mail', section: 'mail', scope: 'row' })
  @Post(':id/resend')
  @Capability(canResendMail)
  resend() {}
}
```

- `@AdminSection` goes on a list route (an argument-free GET or a POST `/search`). `group` is the sidebar heading, `order` sorts inside it, `columns` order, rename and format the columns the payload carries (a declared key the payload lacks is ignored, an undeclared one is kept).
- `@AdminAction` goes on a non-GET route. `scope` is `row` (needs `:id`; shown on each row, also on a generated resource page whose list route carries the section), `bulk` (sends `{ ids }`) or `global`. `fields` makes the admin collect a form (`text`, `textarea`, `number`, `boolean`, `select`, `password`) and send it as the JSON body; `confirm` or `danger` make it ask first. A dialog is only shown when one of those is present.
- Every `@AdminAction` call is audited before it runs (model `AdminAction`, operation = the action id, the names of the fields sent and never their values). A failed audit write stops the request.
- The route keeps its own `@Capability`; the admin never grants. The contract is checked by `pnpm run lint:conventions admin-contract`: ids are unique kebab-case literals, the icon is one of `ADMIN_ICONS`, titles are literal, an action names a declared section, and a contributing controller does not use `DevOnlyGuard` (it would vanish in production).

## Running the studio in production

`/introspect` and any controller decorated with `@AdminStudio()` use this chain: gate, session, second factor, capability.

| Variable | Effect |
| --- | --- |
| `ADMIN_STUDIO_ENABLED` | Must be exactly `true` in production; otherwise the routes answer 404, signed in or not. Ignored outside production, where the studio opens to any signed-in developer as before. |
| `ADMIN_STUDIO_ALLOWED_IPS` | Comma separated peer addresses; any other caller gets 404. It reads the address Express resolved, so set `trust proxy` deliberately behind a proxy. |
| `ADMIN_STUDIO_REQUIRE_2FA` | `true` makes a platform admin without an enrolled second factor get 403. |

The capability `canUseAdminStudio` is the platform admin role in production. No header, query parameter or client value can switch the checks off.
## Before you deploy any of this

`/introspect` is a map of your application, and the protections on it are worth understanding precisely.

**Unauthenticated callers get nothing** — `SessionGuard` runs first and returns 401 before anything is computed, which the spec asserts.

**Any authenticated session gets the whole map.** There is no capability check, no role, no admin flag and no tenant filter on `/introspect`. Combined with an unguarded `POST /auth/register`, that means in a non-production deployment anyone who can sign themselves up can enumerate every controller, route, handler name and capability name in the application — including routes they cannot call.

**Production protection is a `NODE_ENV` string comparison.** `DevOnlyGuard` 404s when `NODE_ENV === 'production'` and nothing else. A deployment that sets `NODE_ENV=prod`, or forgets it entirely, exposes `/introspect` for real. There is no separate flag to turn it off.

**Guard order leaks existence.** Because `SessionGuard` is declared before `DevOnlyGuard`, an unauthenticated production request to `/introspect` answers 401 rather than the 404 that would make the route look absent. The same ordering applies to `/inspector/requests`, `/scheduler/tasks` and `/seeders`.

The admin panel itself is a static bundle, so `PUBLIC_API_URL` is baked into shipped JavaScript, and the session token lives in browser storage readable by any script on the admin origin. Treat the panel as a development tool unless you have deliberately hardened both ends.
