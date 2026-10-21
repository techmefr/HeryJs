---
title: Secrets and encrypted fields
description: A column the database never holds in the clear, and a key you can rotate without downtime.
---

A customer's API token, an OAuth refresh token, a webhook signing secret: a plain `string` field keeps all of them readable in the table, in every backup, and in every audit entry. An `encrypted` field does not.

```yaml
fields:
  - name: title
    type: string
  - name: privateNote
    type: encrypted
    optional: true
```

The service and the controller never see ciphertext: a write is sealed on its way into Prisma and a read is opened on its way out, for every query that goes through the tenant-scoped client.

## What it does to a field

- **AES-256-GCM** through `node:crypto`, a fresh random IV per value, stored as text in the shape `enc:<keyId>:<iv>:<tag>:<ciphertext>`.
- **Bound to its column.** `Model.column` is authenticated data, so a ciphertext copied into another column or table fails to decrypt instead of decrypting.
- **Hidden from responses by default.** An encrypted field is write-only: the generated view strips it like any `hidden` field. `reveal: true` returns it decrypted on reads, for the cases where the owner really does get the value back. `hidden: true` together with `reveal: true` is refused.
- **Not searchable.** Encrypted fields are left out of the search index and the `/describe` contract's filters and sorts. Naming one in `filters` or `sorts` fails when the blueprint loads, and a query that reaches the Prisma client with one in `where`, `orderBy`, `cursor`, `having` or `by` throws, because a comparison of ciphertext says nothing about the secret.
- **Not in the audit chain.** The audit entry for a write records `[encrypted]` where the value was.
- **Not in logs.** A value that cannot be decrypted is logged as the model, the column and the key id, never the value.

A nested write (`user.update({ data: { blogPosts: { create } } })`) into a model with encrypted columns is refused, since it would skip the sealing. Write the model directly.

The generated spec for such a resource checks that the stored column starts with `enc:`, does not contain the value, and that neither the create response nor the list response does either (the opposite for a revealed field).

## Keys

Keys come from the environment, as a comma-separated list of `<id>:<base64 key>`, each key 32 bytes:

```bash
pnpm hery secrets:key
# SECRETS_KEYS="1:<key>"
```

| Variable                | Meaning                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `SECRETS_KEYS`          | Every key a stored value might have been sealed with.                           |
| `SECRETS_ACTIVE_KEY_ID` | The key new values are sealed with. Defaults to the last one listed.            |

Left unset, a development key is used so a fresh project boots. When the project has an encrypted column and `NODE_ENV=production`, the app refuses to boot on that development key.

## Rotating a key

Every stored value names the key that sealed it, so a new key can become active while old values stay readable:

1. `pnpm hery secrets:key`, and append the result to `SECRETS_KEYS` as a new id (`1:...,2:...`). New writes now use key `2`.
2. `pnpm hery secrets:rotate` re-encrypts every encrypted column to the active key. It works in batches, can be interrupted and re-run, and a second run changes nothing.
3. Remove key `1` from `SECRETS_KEYS` once the command reports nothing left on it.

`--dry-run` counts without writing, `--tenant <id>` limits the run to one tenant, and `--adopt-plaintext` also encrypts values stored before the column became encrypted (without it they are counted and left alone, and reading them fails until they are adopted).

The command reads every tenant, so like `search:reindex` and prune it runs on a connection that is not subject to row-level security.

## `SecretsService`, for values that are not columns

```ts
constructor(private readonly secrets: SecretsService) {}

const sealed = this.secrets.encrypt(token, 'integration.apiToken');
const token = this.secrets.decrypt(sealed, 'integration.apiToken');
```

The second argument is the context the value is bound to: decrypting with a different one fails. `isCurrent` says whether a value is on the active key and `reencrypt` moves one there, which is what a job re-sealing values stored outside Prisma would call.

## What it does not do

Keys live in the process environment, so anything that can read it can read every secret. There is no per-tenant key and no KMS or HSM backend yet; the key lookup sits behind `SecretsService`, so a driver can be added without touching a blueprint.
