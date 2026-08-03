# Examples

`workout/` is a reference resource. It is not part of the application: `app.module.ts`
does not import it and `tsconfig.build.json` excludes it, so nothing here ships. It
exists to be read, and to be the thing the framework's own tests exercise when they
need a real resource with real routes.

It used to live in `src/functional/`, as the single business domain of a framework
that has no business domain. That made it three things at once — the only domain, the
showcase, and the target of every proof — and a folder with three jobs drifts from the
generator that was supposed to produce it.

It did, four times. The last one was found while moving it here: the committed copy
had no view layer, parsed no list query, published no signal, injected no search
driver, and answered collection capabilities from a hardcoded literal instead of the
preset. Read as a showcase, it advertised a weaker framework than the one that exists.

## It is generated, not maintained

`workout.yaml` is the blueprint, and everything except the two files named below is
regenerated from it:

```
pnpm hery generate examples/workout.yaml --force
```

`pnpm lint:example` then asserts that what is committed is byte-for-byte what the
generator produces, after prettier and after one rewrite: a generated resource sits
in `src/functional/`, one level below the kernel, while this one sits one level below
`src/`, so `'../../technical/x'` becomes `'../../src/technical/x'`. That single edit
is the price of keeping the example outside `src/`, and it is applied by the check
rather than by hand.

So there is nothing to keep in sync. Change a template and this check tells you the
example is stale; regenerate and commit.

## The one hand-owned file

`workout.seeder.ts` is not something `hery generate` produces at all. It lives here
rather than in `technical/` because a seeder for a domain is part of that domain, and
putting it in shared infrastructure would make infrastructure depend on a business
model — which the architecture linter refuses.

`workout.spec.ts` used to be hand-owned too: it started from the generated spec and
added four proofs the template didn't write — collection scope parity, the trashed
bin, resolved capabilities on a list, and tenant spoofing through a client-supplied
header. The generator now writes all four itself, so the spec is generated like
everything else and `pnpm lint:example` checks it byte-for-byte along with the rest.

## Conventions still apply

`examples/` is linted, type-checked and scanned by the convention checks exactly like
`src/`. An example that quietly stops following the conventions it demonstrates is
worse than no example.
