# @heryjs/oauth

Social sign-in over a provider contract (Google, GitHub, Microsoft), with PKCE,
a state cookie bound to the browser, verified emails only, and a declared
policy for what happens when the provider email already belongs to a local
account.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/):

```bash
pnpm hery install oauth
pnpm hery migrate --name add_oauth_identity
```

## The one decision it makes you declare

`OAUTH_LINK_POLICY`, default `refuse`:

- `refuse`: an email already in use is refused, and nothing is linked.
- `link-authenticated`: still refused at sign-in; the signed-in owner can attach
  a provider with `POST /oauth/:provider/link`.
- `link-verified`: linked at sign-in only when both the provider email and the
  local account email are verified.

An unverified provider email never signs in, signs up or links, whatever the
policy. Returning users are matched by `(provider, provider user id)`, never by
email.

Read the [guide](https://techmefr.github.io/HeryJs/guides/oauth/) for the
routes, the callback checks and how to turn a login into a session with
`OAuthModule.forRoot({ loginHandler })`.
