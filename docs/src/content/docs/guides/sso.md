---
title: Enterprise SSO
description: A tenant brings its own OpenID Connect or SAML 2.0 identity provider, proves the email domains it owns, and its staff sign in without a password you manage.
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

A connection speaks one of two protocols, chosen when it is created. The sign-in route, domain routing, provisioning and linking policy are the same for both; only the exchange with the identity provider differs.

## OpenID Connect

The flow is authorization code with PKCE (S256). The callback checks `iss`, `aud` (and `azp` for a multi-audience token), `exp` and the `nonce` bound to the cookie. The ID token comes straight from the token endpoint over TLS, which OpenID Connect Core allows in place of a signature check, so no JWKS is fetched. The default login handler mints a Better Auth session and returns its bearer token next to the login result; pass `SsoModule.forRoot({ loginHandler })` to deliver it differently.

## SAML 2.0

```
POST /sso/connections
{
  "protocol": "saml",
  "name": "Acme Entra ID",
  "issuer": "https://sts.windows.net/<tenant>/",
  "entryPoint": "https://login.microsoftonline.com/<tenant>/saml2",
  "certificate": "-----BEGIN CERTIFICATE-----...",
  "domains": ["acme.com"]
}
```

`issuer` is the provider's entity ID, `entryPoint` its single sign-on URL and `certificate` the certificate it signs assertions with: a PEM block, several of them while the provider rotates its key, or the bare base64 a metadata file carries. The response says what to register at the provider: `saml.acsUrl` (the assertion consumer service, `<origin>/sso/saml/acs`, the same for every tenant) and `saml.spEntityId` (the audience; it defaults to `<origin>/sso/saml/<connection id>` and can be set with `spEntityId`). The certificate itself is never returned, only its SHA-256 fingerprints. `entryPoint` has to be `https`, outside development.

Instead of typing `issuer`, `entryPoint` and `certificate`, give `metadataUrl` (fetched under the same URL rules as OpenID Connect discovery) or paste `metadataXml`: the entity ID, the HTTP-Redirect sign-on URL and the signing certificates are read from the provider's metadata, and anything typed explicitly wins over the document. The same two fields on `PATCH` re-import it, which is how a rotation is picked up. A document that declares a DTD is refused. `attributeMapping` (`{ email, name, givenName, surname }`) names the attributes a provider uses when it is not one of the usual ones; the configured name is tried first, then the usual ones.

A sign-in starts at the same `GET /sso/start`. The browser is redirected to the entry point with an AuthnRequest over the HTTP-Redirect binding (unsigned: the provider trusts the entry point it was configured with), and the provider posts the assertion back to `POST /sso/saml/acs`. As with OpenID Connect, the signed state cookie carries the connection, but it is sent `SameSite=None; Secure`, since a form post from the provider is a cross-site request that a `lax` cookie does not travel on.

What the callback accepts, and refuses with `400 sso.invalid-assertion` otherwise:

- the **assertion** is signed with a certificate of the connection (a signature on the response envelope alone is not enough, and one on both is not required, since providers differ);
- it answers **the request this browser started**: `InResponseTo` is mandatory and must be the id derived from the state cookie, so a provider-initiated assertion, or one meant for another login, is refused;
- the audience is this service provider, the issuer is the connection's, and the validity window holds, with a minute of clock skew;
- the address belongs to a domain the connection verified.

The address comes from the `email` or `mail` attribute (or the OID and claim URIs the common providers use), falling back to the NameID when that looks like an address. The subject an identity is matched on is the NameID, except for a transient NameID, which changes at every login and is replaced by the address. An assertion is not stored, so within the ten minutes of the state cookie a request that holds both the cookie and the assertion could replay it; the cookie is HttpOnly and scoped to `/sso`.

Single logout, encrypted assertions and signed AuthnRequests are not supported.

## From the admin panel

The [admin panel](../admin/) builds itself from `GET /introspect`, so the routes behind `canManageSso` are what an operator uses, with no page of their own:

- **Connections** (`GET /sso/connections`) lists every connection of the tenant: protocol, whether it is enabled, the verified domains, the SAML coordinates and the certificate fingerprints. `PATCH /sso/connections/:id` with `isEnabled` switches one on or off, and with `metadataUrl`, `certificate` or `attributeMapping` reconfigures it.
- **Checks** (`GET /sso/connections/checks`) is the test button: for every connection, whether it is on, whether a verified domain routes to it, and, for SAML, whether the signing certificate is still valid (with a warning inside thirty days) and the sign-on URL answers, or, for OpenID Connect, whether discovery still succeeds. `POST /sso/connections/:id/test` runs the same checks for one connection. Nothing signs anyone in.

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

The client secret of an OpenID Connect connection is sealed with AES-256-GCM (`SSO_SECRET_KEY`, 32 bytes as base64) with the connection id as authenticated data, so a ciphertext copied onto another connection does not open. It is never returned: responses carry `hasClientSecret`. The issuer of an OpenID Connect connection cannot be changed after creation, because stored identities are subjects inside *that* issuer: point a connection at a different IdP by creating a new one. A SAML connection can be re-pointed (`issuer`, `entryPoint`, `certificate`), which is how a certificate is rotated; fields of the other protocol are refused with `422 sso.protocol-mismatch`.

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
| `SSO_REDIRECT_BASE_URL` | public origin; register `<origin>/sso/callback` at each OpenID Connect IdP and `<origin>/sso/saml/acs` at each SAML one; required in production |
| `SSO_DNS_TXT_PREFIX` | label of the verification record, default `_hery-sso` |
| `SSO_ALLOW_PRIVATE_ISSUERS` | development only: allow `http` and private issuer addresses, and an `http` SAML entry point |

## Not covered

- **Directory sync.** Users are provisioned at sign-in. Deprovisioning when someone leaves the IdP is the [`scim`](../scim/) module. Disabling a connection stops new sign-ins, it does not end existing sessions.
- **Secret key rotation.** There is one `SSO_SECRET_KEY`; rotating it means re-saving each connection's secret.
