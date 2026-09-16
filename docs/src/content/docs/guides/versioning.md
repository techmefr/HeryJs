---
title: API versioning
description: How a generated resource publishes a second contract without breaking the callers of its first.
---

The framework's pitch is that you generate a resource once and own it
afterwards. The uncomfortable half of that promise is that a contract you own
will eventually need to change in a way its callers cannot absorb — a field
renamed, a shape flattened, a required key added.

A version is how that change gets made without breaking anyone.

## Declared in the blueprint, visible in the path

```yaml
name: BlogPostV2
version: 2
model: BlogPost
```

`version: 2` mounts the routes under `/v2/blog-posts-v2`. `model: BlogPost`
points them at the table the first version already owns.

**Version 1 is unprefixed**, and stays that way. Prefixing it would rename
every route in every generated application to introduce a feature none of them
use yet; a v1 that was never versioned is indistinguishable from a v1 that was.

`GET /describe` publishes `version`, so a client can tell which contract it is
holding without inferring it from the path it happened to call.

## A version is a second resource, not a second mode

The v2 blueprint is its own file, and generating it produces its own folder,
controller, service, policy and DTO. The v1 folder is untouched and keeps
serving its callers exactly as before.

That is deliberate, and it is the whole reason this is not a flag. A resource
that served two contracts from one controller would carry a conditional at
every point where they differ, and each of those conditionals is a place where
fixing v2 breaks v1. Two folders cost duplication; one folder costs
correctness.

The price is real: **while both versions live, a bug fixed in one is a bug
still present in the other**. That is the trade the split makes explicit
instead of hiding.

## `model` is what makes them share a table

Without it, `BlogPostV2` would be a model name, and the generator would emit a
duplicate of a table that already exists.

With it, the v2 resource reads and writes `BlogPost`, and declares nothing in
`prisma/schema.prisma`, `TENANT_SCOPED_MODELS` or `AUDITED_MODELS` — the
version that owns the model already did, and saying it twice would not make it
truer.

That also means a **schema change belongs to the owning version**. Adding a
column for v2's sake means changing v1's blueprint and regenerating it, then
deciding what v1 does with a column it does not expose.

## Retiring a version

Delete its folder and its blueprint, and remove its module from
`src/app.module.ts`. Nothing else refers to it: the routes were its own, the
capabilities were its own, and the table was never its to begin with.

Do it on purpose rather than by attrition. A version nobody removed is a
version everyone keeps maintaining.
