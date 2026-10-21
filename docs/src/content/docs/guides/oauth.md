---
title: Social sign-in
description: Google, GitHub and Microsoft behind one provider contract, with a declared policy for what happens when the provider's email already belongs to a local account.
---

`hery install oauth` adds `/oauth/:provider/...` routes, a provider contract
and a table (`OauthIdentity`) that remembers which provider account belongs to
which local user.

```bash
pnpm hery install oauth
pnpm hery migrate --name add_oauth_identity
```

It sits next to the Better Auth integration rather than replacing it: nothing
here changes `/auth/login`, sessions or two-factor.

## The routes

| Route | Who | What |
| --- | --- | --- |
| `GET /oauth/:provider/redirect?returnTo=/path` | anyone | Sets a signed state cookie and redirects to the provider. |
| `GET /oauth/:provider/callback` | the provider's redirect | Validates the cookie, exchanges the code, resolves the account. |
| `POST /oauth/:provider/link` | a signed-in user | Returns `{ data: { url } }` to send the browser to, for attaching a provider to the current account. |

A provider is registered only when both its client id and secret are set:
`OAUTH_GOOGLE_*`, `OAUTH_GITHUB_*`, `OAUTH_MICROSOFT_*` (plus
`OAUTH_MICROSOFT_TENANT`, `common` by default). Register the callback
`<OAUTH_REDIRECT_BASE_URL>/oauth/<provider>/callback` at each provider; the
redirect URI is built from that setting, never from a request header.

## The policy: an email that already has an account

When the provider hands back an email that already belongs to a local account,
linking silently is a takeover primitive: anyone who can create an account at a
provider with your email address could walk into yours. Refusing everything is a
support ticket. `OAUTH_LINK_POLICY` makes the answer a declaration.

| Policy | A sign-in whose email matches a local account | Linking from a signed-in session |
| --- | --- | --- |
| `refuse` (default) | Refused with `oauth.account-exists`. Nothing is linked. | Refused. |
| `link-authenticated` | Refused with `oauth.account-exists`. | Allowed through `POST /oauth/:provider/link`: the owner proves the local side by being signed in. |
| `link-verified` | Linked only when the provider email is verified **and** the local account's email is verified. | Allowed. |

What does not depend on the policy:

- A provider email that is missing or not verified never creates, signs in or
  links anything (`oauth.email-missing`, `oauth.email-unverified`). GitHub is
  read from `/user/emails` (primary and verified), never the profile email.
  Microsoft's `email` claim is not proof of ownership, so it counts only with
  the `xms_edov` claim.
- A returning user is found by `(provider, provider user id)`, never by email.
  A changed or spoofed email on the provider side does not move an identity to
  another account.
- A provider identity already linked to someone else is never re-linked
  (`oauth.identity-linked-elsewhere`), and a banned user is refused.
- `OAUTH_ALLOW_SIGN_UP=false` turns off creating accounts: only existing,
  already linked users get in.

## What the callback checks

- **State** is a random value bound to the browser by an `HttpOnly`,
  `SameSite=Lax` cookie signed with `OAUTH_STATE_SECRET`, valid for ten
  minutes. A callback without that cookie, or with a different `state`, is
  refused before anything is exchanged: that is the login-CSRF case.
- **Single use**: the state is consumed in Valkey (`SET NX`), so a replayed
  callback is refused even before the provider rejects the used code.
- **PKCE** (`S256`) on every provider; the verifier lives only in the cookie.
- **OIDC** (Google, Microsoft): `aud`, `iss` and the per-flow `nonce` of the ID
  token are checked.
- **`returnTo`** must be a local path (`/...`): anything with a scheme, host,
  `//` or a backslash is dropped, so the callback never redirects off-site.
- Provider tokens are used once to read the profile and are never stored or
  logged; errors from a provider carry no response body.

## Turning a login into a session

The module resolves who signed in. How that becomes a session is yours, because
a session is the auth layer's decision. Pass a handler:

```ts
@Injectable()
class IssueSession implements OAuthLoginHandler {
  async handle(result: OAuthLoginResult, response: Response): Promise<void> {
    response.redirect(result.returnTo ?? '/');
  }
}

OAuthModule.forRoot({ loginHandler: IssueSession });
```

Without one, the callback returns the `OAuthLoginResult` as JSON, which is
enough to build on and not a login by itself.

## A provider of your own

Implement `OAuthProvider` (`authorizationUrl` and `fetchProfile`, which returns
`providerUserId`, `email`, `isEmailVerified`) and call
`OAuthProviderRegistry.register()`. `isEmailVerified` must be true only when the
provider vouches for the address.
