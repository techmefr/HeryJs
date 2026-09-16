---
title: Validation
description: A field's own shape comes from the blueprint; a rule spanning two fields lives in one generated hook you own.
---

A field's type, length and optionality come from the blueprint, and the
generator turns them into a Zod schema per verb. That covers most of what a
request needs checked, and none of what a request needs checked *together*.

Conditional and cross-field rules — "required only when status is published",
"endsAt must come after startsAt", "exactly one of these two" — have one home:
the `check<Resource>` function in the generated DTO.

```ts
function checkBlogPost(
  input: Partial<z.infer<typeof blogPostFields>>,
  ctx: z.RefinementCtx,
): void {
  if (input.status === 'published' && !input.publishedAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['publishedAt'],
      message: 'is required when status is published',
    });
  }
}
```

## Why a function and not a blueprint key

The blueprint declares what it can know: a field is a string, it is optional,
it is filterable. It cannot know that your publishing workflow requires a date
once a post leaves draft.

Encoding that in YAML means inventing a rule language — `requiredIf`, `after`,
`unless`, `sometimes` — and every real project immediately needs the one form
that language does not have. **A vocabulary of rules is a menu that never ends
and never quite fits.** A function has none of that problem: it is the same
TypeScript as the rest of your resource, it typechecks against your own fields,
and it is yours the moment the file is generated.

## Why in the DTO and not in the service

A rule broken in the service throws halfway through a write, after some of the
work has happened, and surfaces as whatever exception that code path produced.
A rule broken here is **a 400 shaped like every other validation error**,
naming the field a caller has to fix, before anything has been written.

That also means it composes with batching: each entry in a `data` array is
checked on its own, so one bad entry is reported against its own index.

## It runs on create and on update

The same function is applied to the create schema, the update schema, and the
update request body — which extends the unrefined field object to add an `id`
and a `relations` block, then re-applies the check.

**On update every field is optional**, so a rule reading two fields has to
tolerate either being absent:

```ts
if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) {
  ctx.addIssue({
    code: 'custom',
    path: ['endsAt'],
    message: 'must come after startsAt',
  });
}
```

A partial update that touches neither field is not the request that breaks the
rule. Writing `if (input.endsAt <= input.startsAt)` instead would reject every
update that happens to mention only one of them.

If a rule genuinely cannot be expressed on a partial — it needs the record's
current state to decide — it belongs in the service, against the loaded record,
not here: this function only ever sees the request body.

## Uploads are not validated here

Size and content-type on `POST /storage/upload` are enforced by the storage
module, at the upload endpoint, against `STORAGE_ALLOWED_CONTENT_TYPES` and
`STORAGE_MAX_UPLOAD_BYTES` — and the size cap is applied by multer while the
body is still arriving, not after it has been buffered.

A `file` blueprint field holds a storage key, a plain string, and that is all
this schema can see. Re-checking a file here would mean validating a key that
points at bytes this request never carried.
