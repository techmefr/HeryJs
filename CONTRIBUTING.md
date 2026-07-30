# Contributing to HeryJs

Thanks for considering it. This project is small enough that a good issue or a focused pull request can genuinely change its direction — nothing here is set in stone just because it's already written down.

## Reporting a bug or a rough edge

Open an issue with:

- what you ran (`hery create:blueprint`, `hery generate`, a specific route, ...)
- what you expected vs. what happened
- the smallest blueprint or resource that reproduces it

If it's a security issue affecting tenant isolation or capabilities, please don't open a public issue — email the maintainer instead so a fix can land before it's public.

## Proposing a feature

Open an issue describing the use case before writing code. HeryJs deliberately doesn't try to cover everything (see the README's "What it deliberately does not do") — a short discussion up front saves a rewritten pull request later.

## Sending a pull request

- Keep it scoped to one change. A bug fix doesn't need a refactor riding along.
- Prove it end-to-end. If you're touching the generator, generate a real (disposable) resource with your change, run its full generated test suite, and mention that in the PR description. This project holds itself to "prove it, then keep only what's proven" — the same standard applies to contributions.
- Run the full gate before opening the PR: `pnpm lint`, `pnpm run typecheck`, `pnpm run arch:check`, `pnpm run lint:conventions`, `pnpm test`, `pnpm run build`. CI runs the same checks, but catching it locally first is faster for everyone. `lint:conventions` runs every convention check in one pass; pass a name (`pnpm run lint:conventions capabilities`) to run just one.
- Match the existing conventions (`functional/`/`technical/` split, capability decorators on every mutating route, the response envelope) rather than introducing a parallel pattern.

## Code of conduct

Be direct, be kind, assume good faith. Disagreements about design are welcome; personal attacks are not.
