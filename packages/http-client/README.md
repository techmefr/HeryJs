# @heryjs/http-client

Call other people's APIs behind one contract: a retrying ofetch driver, and a fake driver that records every request and refuses to reach the network in tests.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/). It is
already installable from any HeryJs project, so there is nothing to add to your
`package.json`:

```bash
pnpm hery install http-client
```

The install copies this package's `src/runtime/` into `src/modules/http-client` and
prints what is left for you to wire up. From then on the code is yours: it is never
resynchronised, and updating this package does not touch what it wrote.

## What you get

`HttpClientService`, the only thing a caller injects:

```ts
const response = await this.http.get('https://api.example.com/users/42');
```

`get`, `post`, `put`, `patch` and `delete` all delegate to `request()`, which is the
single method a driver implements.

## The default driver is the fake one, on purpose

Every other module in the framework defaults to a driver that does nothing harmful —
`log` for mail, `local` for storage. The equivalent here is not "a client that makes
the call anyway"; it is a client that cannot reach the network at all. So the
built-in driver is `fake`, and a call it has no stub for throws
`UnstubbedHttpRequestException` naming the URL and listing what _is_ stubbed.

That is the whole point: a test that forgets to stub an endpoint fails loudly instead
of hitting a real third party from CI, and a freshly generated app cannot call a
vendor by accident before anyone configured it to.

Switch to the real driver per environment:

```ts
httpClient: {
  default: process.env.HTTP_CLIENT_DRIVER ?? 'fake',
  drivers: {
    fake: { driver: 'fake' },
    ofetch: { driver: 'ofetch' },
  },
},
```

## Stubbing in tests

```ts
fake.stub('https://api.example.com/users/*', { status: 200, body: { id: 42 } });

await service.doTheThing();

expect(fake.recorded).toHaveLength(1);
expect(fake.recorded[0].method).toBe('GET');
```

`*` matches any run of characters, so one stub can cover a whole endpoint family.
Later stubs win over earlier ones for the same pattern, which is what lets a test
override a stub set up in a shared `beforeEach`.

## Documentation

- [Modules and drivers](https://techmefr.github.io/HeryJs/guides/modules/) — the convention this module follows
- [Publishing a module](https://techmefr.github.io/HeryJs/guides/publishing-a-module/) — the same contract this package satisfies

Licensed MIT, like the framework.
