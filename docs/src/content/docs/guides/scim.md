---
title: SCIM provisioning
description: A tenant connects its identity provider to the application's directory, which then creates, updates and deactivates members and teams by itself.
---

```bash
pnpm hery install scim
pnpm hery migrate --name add_scim
```

[Enterprise SSO](../sso/) answers who may sign in. SCIM answers who should *exist*: when someone joins the company's directory the account appears, when they leave it is switched off, without an admin doing either by hand. It is a SCIM 2.0 (RFC 7643 and 7644) server scoped to one tenant per token.

## Connecting a directory

A tenant admin issues the token, and gives the identity provider two values:

```
Base URL   https://<your-origin>/scim/v2
Token      scim_...   (sent as "Authorization: Bearer")
```

```
POST /scim/token
```

returns the token **once**: only its SHA-256 is stored. Calling it again rotates it, and the previous token stops working at that moment. `DELETE /scim/token` revokes it.

## What it maps onto

| SCIM | Application | Notes |
| --- | --- | --- |
| `User` | a tenant member | `userName` is the email address, lower-cased. A member who signed in before the directory was connected is matched by it. |
| `User.active` | `banned` | Deactivating bans the account and ends its sessions. Nothing is deleted. |
| `Group` | a team | `members` are team members, and only the tenant's own users are accepted. |

Reactivating lifts only the ban the directory itself placed: an account an administrator banned for their own reasons stays banned. `DELETE /Users/:id` deactivates, so a person who returns keeps their history; `DELETE /Groups/:id` deletes the team.

Supported: `GET`, `POST`, `PUT`, `PATCH` (add, replace and remove, including `members[value eq "..."]` and the `"True"`/`"False"` strings Entra ID sends), `DELETE`, `filter` with `eq` on `userName`, `externalId` (and `displayName` for groups), paging with `startIndex` and `count` (at most 100), and `/ServiceProviderConfig`, `/Schemas` and `/ResourceTypes`. Bulk, sort, ETags and other filter operators are refused or reported as unsupported. Errors use the SCIM error format, and bodies are `application/scim+json`.

## Authentication and audit

Every SCIM route is a [`@PublicRoute`](../capabilities/) that is authenticated by the bearer token instead of a session, and is rate limited. The token names the tenant, so a call can never read or write another one: the directory runs inside the tenant's row-level security like any other request. The token's `lastUsedAt` is kept (refreshed at most once a minute) so an unused token is visible.

Each provisioning call is appended to the tenant's audit hash chain: `ScimUser` entries are `created`, `updated`, `deactivated` or `reactivated`, `ScimGroup` entries are `created`, `updated` or `deleted`, and `ScimToken` entries are `issued`, `rotated` or `revoked`. A failure to record never fails the call, because a directory that got a 500 would retry a write that already happened.

## In the admin panel

The routes declare themselves to the [admin](../admin/) with `@AdminSection` and `@AdminAction`, so two sections ("SCIM token" and "SCIM activity", under Identity) and the issue, rotate and revoke buttons appear without any admin code, behind `canManageScim` (an admin):

```
GET    /scim/token       whether a token is set, its prefix, when it was rotated and last used
POST   /scim/token       issue or rotate the token (shown once)
DELETE /scim/token       revoke it
GET    /scim/activity    what the directory created, updated and deactivated, newest first
```

## Not covered

- **Bulk, sort and ETags**, and filters other than `eq`.
- **Enterprise user extension** and attributes beyond name, email, `externalId` and `active`.
- **Per-group permissions.** A group is a team; what a team may do is decided by the application's own capabilities.
- Interoperability was checked against the RFC and the behaviour Entra ID and Okta document, not against a live tenant of either.
