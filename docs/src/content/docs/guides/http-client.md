---
title: The HTTP client
description: Calling other people's APIs behind one contract, with timeouts and retries decided once, and a fake driver that cannot reach the network.
---

Every outbound call has the same four things to get wrong: no timeout, no retry policy, an error that leaks the bearer token into a log, and a test suite that quietly hits a real third party from CI. The `http-client` module decides all four once.

```bash
pnpm hery install http-client
```

Selection is single-active, like mail: a resource says "GET this URL", never "GET this URL over ofetch". Which driver answers is a line in `hery.config.ts`, and that is exactly what lets the whole test suite run against the fake one.

## `HttpClientService` is the only thing you inject

```ts
const response = await this.http.get('https://api.example.com/users/42');
const created = await this.http.post('https://api.example.com/users', {
  email,
});
```

`get`, `post`, `put`, `patch` and `delete` are conveniences over a single `request()`, each only filling in the method — so **a driver stays one method to implement**, not six. A resource reaching past the facade into a concrete driver has defeated the point: swapping ofetch for the fake in tests works precisely because nothing downstream ever named a driver.

Options are per request rather than driver-wide:

```ts
await this.http.get(url, {
  query: { page: 2 },
  headers: { authorization: `Bearer ${token}` },
  timeoutMs: 2_000,
  retries: 0,
});
```

`query` is separate from `url` on purpose. **Hand-built query strings are where unencoded values turn into requests nobody meant to send** — and a recorded request can only be matched on its parameters if they arrived as data. `timeoutMs` and `retries` are per request because a health ping and a report download do not want the same patience, and a driver-level default would force the slower of the two on both.

The response is a plain record — `status`, `ok`, `headers`, `body` — and `body` is `unknown`. The driver knows what the remote sent, not what you expect; typing it as anything looser would hand every call site a value it can dereference without checking.

## The default driver is the fake one, and that is the safety property

Every other module ships a default that does the harmless version of its job: mail logs, storage writes to local disk. The harmless version of an outbound HTTP call is not "make the call anyway against a sandbox" — it is **not making it**. So the built-in driver has no network path at all.

A call it has no stub for does not return a bland `{ status: 200, body: {} }`. It rejects with `UnstubbedHttpRequestException`, naming the method and URL and listing every pattern that _is_ stubbed. A driver that answered blandly would let a test pass while asserting nothing, and let a misconfigured production app look healthy while every integration silently no-opped.

It rejects rather than throwing synchronously, so a missing stub surfaces the same way a real network failure would — a caller with a `try`/`catch` around its `await` catches it without a second guard.

## Stubbing is the `Http::fake()` of this framework

`HttpClientModule` exports `FakeHttpClientDriver` alongside the service. That is the one documented exception to "the facade is the only thing callers inject": a test has to reach the fake to stub an endpoint, and going through the registry to get there would mean every test learning how driver resolution works.

```ts
fake.stub('https://api.example.com/users/*', { status: 200, body: { id: 42 } });

await service.doTheThing();

expect(fake.recorded).toHaveLength(1);
expect(fake.recorded[0].method).toBe('GET');
```

Four behaviours worth knowing:

- **`*` is the only wildcard.** Accepting raw regular expressions would make a stub match far more than its author read it as — a bare `.` silently matching any character is how a stub for one vendor starts answering for another.
- **The most recently registered matching pattern wins**, not the most specific one. "Most specific" has no obvious definition once patterns overlap in two directions, and registration order is something you can see in your own file. It is also what lets a test override a stub set up in a shared `beforeEach`.
- **Recording happens before matching.** A test that fails on a missing stub can still inspect what was attempted, which is usually the fastest way to find out the URL was built wrong rather than merely unstubbed.
- **`reset()` clears both stubs and recordings.** Call it between tests; nothing does it for you.

## The real driver decides timeouts and retries once

```bash
# declared as a dependency of the module, installed by hery install
ofetch
```

`OfetchHttpClientDriver` defaults to a **10 second timeout and 2 retries** — three attempts — with exponential backoff from 100ms. Exponential rather than fixed: a remote answering 503 is usually overloaded, and a fixed delay from every instance turns the retry into a second wave of the traffic that caused it.

What is retried is narrower than it looks. A 5xx, a 429, a timeout and a transport failure (DNS, refused connection, reset socket) are retried. **A 4xx other than 429 is not**: it is this side's mistake and will be wrong again in 200ms, so retrying only delays the error it already earned.

ofetch's own error-throwing and retry are both switched off. Its throw-on-non-2xx would turn every remote error into an ofetch-shaped exception leaking into the kernel contract, and leaving its retry on would multiply with the policy above into nine attempts.

Three exceptions come out of it, and they are distinct on purpose:

| Exception                       | Status | When                                                     |
| ------------------------------- | ------ | -------------------------------------------------------- |
| `HttpRequestFailedException`    | 502    | the remote answered non-2xx, or the transport failed     |
| `HttpRequestTimeoutException`   | 504    | no answer within `timeoutMs`                             |
| `UnstubbedHttpRequestException` | 500    | the fake driver was asked for an endpoint nobody stubbed |

A remote's status is **not forwarded as your own** — a 404 from a payment provider does not mean your route is missing. A timeout is separate from a failed response because the two say different things about whether the remote acted, which is what a caller deciding whether it is safe to retry a payment needs. And `details` carries the method, URL, remote status and body, and **deliberately not the request headers**: headers are where the authorization bearer lives, and `details` is serialised into the error response and the log line, which is precisely how an API key ends up in a log aggregator.

## Declaring the drivers

```ts
httpClient: {
  default: process.env.HTTP_CLIENT_DRIVER ?? 'fake',
  drivers: {
    fake: { driver: 'fake' },
    ofetch: { driver: 'ofetch' },
  },
},
```

Import `HttpClientModule` into `src/app.module.ts`, and `OfetchHttpClientModule` as well so the real driver has a provider to resolve. It is provided through a factory rather than plain class registration, because the driver takes its fetcher and sleeper as constructor parameters with defaults — that is what lets the retry and timeout policy be tested without a network or a real clock — and Nest would otherwise try to resolve them as providers.

Every declared driver is resolved at boot, not just the active one, so a project running on `fake` locally finds out the ofetch package is missing on its own machine rather than the first time production starts with `HTTP_CLIENT_DRIVER=ofetch`. A `default` that is not declared fails the same way.

**`ofetch` is not installed in this repository**, so the real driver's `import { ofetch }` does not resolve here and the driver has never made a live call from this tree. Its retry, timeout and error-mapping logic is exercised against an injected fetcher, not against a network. Treat your first real integration as the thing that proves it.

## What the HTTP client deliberately does not do

- **No base URL, no client instances.** There is no `http.for('stripe')`. Every call names its full URL, and a wrapper per vendor is ordinary code you write in `functional/`.
- **No authentication handling.** No token refresh, no OAuth dance, no credential store. Headers are yours to set per call.
- **No response validation.** `body` is `unknown` and stays that way. Parse it with the same zod schemas you would use on an inbound payload.
- **No circuit breaker, no rate limiting, no caching.** Retry and timeout are the whole policy.
- **No per-call driver selection.** Unlike [export](/guides/export/), there is no `as()`. A call site choosing to bypass the fake would be a call site that reaches a real vendor from CI.
