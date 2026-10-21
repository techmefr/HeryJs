---
title: Enterprise SSO
description: A tenant brings its own OpenID Connect identity provider, proves the email domains it owns, and its staff sign in without a password you manage.
---

```bash
pnpm hery install sso
pnpm hery migrate --name add_sso
```

Social sign-in answers "this person has a Google account". Enterprise SSO answers a different question: "this person works for a company that told us who its identity provider is". The identity provider belongs to a **tenant**, not to the application, so everything here is stored per tenant and every route that reads it is scoped to one.

## How a sign-in is routed

```
GET /sso/start?email=jane@acme.com&returnTo=/dashboard
```

The email domain picks the connection. If `acme.com` is a **verified** domain of an enabled connection, the browser is redirected to that tenant's identity provider; otherwise the answer is a `404`. `GET /sso/callback` is the single redirect URI for every tenant: which connection a callback belongs to travels in a signed, HttpOnly, ten-minute state cookie, never in the URL.

The flow is authorization code with PKCE (S256). The callback checks `iss`, `aud` (and `azp` for a multi-audience token), `exp` and the `nonce` bound to the cookie. The ID token comes straight from the token endpoint over TLS, which OpenID Connect Core allows in place of a signature check, so no JWKS is fetched. The default login handler mints a Better Auth session and returns its bearer token next to the login result; pass `SsoModule.forRoot({ loginHandler })` to deliver it differently.

## Proving a domain

A tenant admin claims domains when creating a connection. A claimed domain routes **nothing** until it is proven, otherwise any tenant could claim `gmail.com` and capture its users. The response lists the DNS record to publish:

```
TXT  _hery-sso.acme.com  =  hery-sso-verification=<token>
```

```
POST /sso/connections/:id/domains/:domain/verify
```

verifies it. A domain can be verified by one connection at a time: a second tenant trying to verify the same domain gets a `409`, enforced by a partial unique index on `SsoDomain` where `verifiedAt` is set. The record prefix is `SSO_DNS_TXT_PREFIX`.

The email the identity provider asserts must belong to a domain the connection has verified. An IdP vouching for `victim@other-company.com` is refused with a `403`, which is what stops a tenant's IdP from signing in as someone else's user.

## What the admin routes do

All behind `canManageSso`, scoped to the caller's own tenant, and capped at ten connections per tenant:

```ts
GET    /sso/connections
POST   /sso/connections
GET    /sso/connections/:id
PATCH  /sso/connections/:id
DELETE /sso/connections/:id
POST   /sso/connections/:id/domains
POST   /sso/connections/:id/domains/:domain/verify
DELETE /sso/connections/:id/domains/:domain
```

The client secret is sealed with AES-256-GCM (`SSO_SECRET_KEY`, 32 bytes as base64) with the connection id as authenticated data, so a ciphertext copied onto another connection does not open. It is never returned: responses carry `hasClientSecret: true`. The issuer cannot be changed after creation, because stored identities are subjects inside *that* issuer: point a connection at a different IdP by creating a new one.

The issuer, authorization and token endpoints are supplied by the tenant, which makes discovery an SSRF surface. Every URL must be `https`, carry no credentials, and resolve only to public addresses (loopback, private, link-local and carrier-grade ranges are refused, IPv4-mapped IPv6 included), and the HTTP client follows no redirect. Set `SSO_ALLOW_PRIVATE_ISSUERS=true` only in development, to point at a local IdP.

## Just-in-time provisioning

The first sign-in creates the user **inside the tenant that owns the connection**, with a verified email. A returning identity is matched on `(connection, subject)`, never on email, so a changed address does not create a second account and a recycled address does not inherit one.

## The linking policy

What happens when the asserted email already belongs to a local account is declared per connection, with the same vocabulary and default as the [`oauth`](../oauth/) module:

| Policy | An existing account with that email |
| --- | --- |
| `refuse` (default) | `409 sso.account-exists`, nothing is linked |
| `link-verified` | linked, but only if that account's email is verified |

Two rules hold whatever the policy says. An account in **another tenant** is never linked and never moved: it is refused as an existing account. A banned user is refused. The oauth module's `link-authenticated` has no counterpart because there is no signed-in "link this identity" route here: the tenant admin is the one who decides how identities join the tenant.

## Configuration

| Variable | Purpose |
| --- | --- |
| `SSO_STATE_SECRET` | signs the state cookie; the development default is refused in production |
| `SSO_SECRET_KEY` | AES-256-GCM key for client secrets, `openssl rand -base64 32`; refused in production while it is the development default |
| `SSO_REDIRECT_BASE_URL` | public origin; register `<origin>/sso/callback` at each IdP; required in production |
| `SSO_DNS_TXT_PREFIX` | label of the verification record, default `_hery-sso` |
| `SSO_ALLOW_PRIVATE_ISSUERS` | development only: allow `http` and private issuer addresses |

## Not covered

- **SAML.** Better Auth's SSO plugin (`@better-auth/sso`) is a separate package this framework does not depend on, and hand-rolling XML signature verification is not something to ship. SAML-only identity providers are out of scope for now.
- **SCIM.** Users are provisioned at sign-in; there is no directory sync and no deprovisioning when someone leaves the IdP. Disabling a connection stops new sign-ins, it does not end existing sessions.
- **Secret key rotation.** There is one `SSO_SECRET_KEY`; rotating it means re-saving each connection's secret.
