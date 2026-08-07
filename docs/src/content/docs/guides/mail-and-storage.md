---
title: Mail and storage
description: Queued outgoing mail with an audit row per message, and file storage behind a two-driver provider.
---

Two modules for the two side effects almost every application eventually needs. Both ship with a driver that works with no configuration and no external account, so the wiring can be proven before the vendor is chosen.

```bash
pnpm hery install mail storage
```

## Mail

`mail` is queued by construction. `MailService.queue()` never sends — it renders, records, and dispatches a job:

```ts
queue(to: string, template: string, data: Record<string, string> = {}): Promise<void>
```

```ts
await this.mail.queue(user.email, 'welcome', { name: user.name, app: 'Acme' });
```

Three things happen, in this order: the template is rendered, a `MailLog` row is written with `status: 'queued'` and the current tenant, and a `mail.send` job goes onto the BullMQ queue. The worker sends, then flips the row to `sent` or to `failed` with the error message.

The `MailLog` row is the point. A queued mail that never arrived is otherwise invisible — the row makes "did we send it, and what happened" a query rather than a log-grep. `GET /mail?page=&limit=` returns the log for the current tenant, newest first, behind `SessionGuard`, `CapabilitiesGuard` and its own `canReadMailLog` — a module route is held to the same conventions as a kernel one.

Rendering is intentionally small: templates are a `Record` in `mail.templates.ts`, and interpolation is `{{key}}` substitution. No engine, no template files to locate at runtime, and one shipped example (`welcome`) to copy. An unknown template name throws rather than sending a blank message. Two properties to keep in mind when writing your own: a missing key becomes an empty string rather than an error, and **values are not HTML-escaped** — pass user-supplied content through your own escaping first.

### The default provider only logs

The shipped provider writes `to=… subject="…"` to the Nest logger and stops. Nothing leaves the process, which is what makes the module safe to install and exercise on day one.

Swapping it is a source edit rather than a setting — the binding is a plain `useClass` in `mail.module.ts`:

```ts
{ provide: MAIL_PROVIDER, useClass: ConsoleMailProvider }
```

Implement the provider interface against your transport of choice and change that line. There is no `MAIL_PROVIDER` environment variable, and a real transport is not shipped: choosing between SMTP and a vendor API is a decision with cost, deliverability and compliance consequences, and the framework does not have an opinion worth imposing.

### Retries are not configured

The job is dispatched with no options, so BullMQ's defaults apply: **one attempt, no retry, no backoff**. A failed send marks the row `failed` and the job stays in the failed set. If mail matters, set `attempts` and `backoff` on the dispatch before you go live.

The BullMQ dashboard is mounted at `/jobs` when `NODE_ENV` is not `production`. Two things to know about it: it is mounted at the Express level, so no Nest guard applies and **it is unauthenticated**, and it shows the whole queue across every tenant. It is a local development tool, not an admin surface.

Installing `mail` appends a `MailLog` model to the schema, so the install is followed by a migration:

```bash
pnpm hery migrate --name add_mail_log
```

## Storage

One interface, two drivers:

```ts
put(key: string, body: Buffer, contentType: string): Promise<void>;
remove(key: string): Promise<void>;
signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
```

Inject `STORAGE_PROVIDER` anywhere and call it. The driver is chosen by `STORAGE_DRIVER`, read once at module load: `s3` selects the S3-compatible provider, and **anything else — including a typo — falls back to local**. Signed URLs expire in 15 minutes unless you pass otherwise.

The local driver writes under `<cwd>/storage/<key>`, creating nested directories for keys containing `/`. Reads go through a route, `GET /storage/:key?exp=…&sig=…`, which has no session guard: the URL itself is the credential. It carries an HMAC over `key:exp` verified in constant time, and a bad or expired signature answers 404 rather than 403 — an unguessable URL should not confirm that a key exists.

The S3 driver uses the AWS SDK and real presigned URLs, and works against any S3-compatible endpoint. Setting `STORAGE_S3_ENDPOINT` both points at that endpoint and switches on path-style addressing, which is what self-hosted MinIO needs. The bundled compose file runs MinIO for exactly that purpose — note that it does not create the bucket for you.

### Two things the module does not do

**There is no upload endpoint.** No multipart handling, no file interceptor. The only storage route in the framework is the local read route above. Accepting an upload means writing your own controller that validates whatever your product should accept and calls `.put()`. `.put()` itself refuses a body over 25 MB with `StorageBodyTooLargeException`, but that is a blanket ceiling, not a MIME check — the framework declines to guess your content-type limits.

**Keys are not tenant-scoped.** Nothing in the module prefixes a key, and it does not read the tenant context at all. The key you pass is the key that is used, verbatim. This is the one place in HeryJs where a tenant boundary is *not* established for you, so it is worth stating bluntly: two tenants that both write `avatars/profile.png` write the same object.

Put the tenant in the key, at the one place you build keys:

```ts
const key = `${TenantContextStorage.getTenantId()}/avatars/${record.id}.png`;
```

The same discipline applies to key *shape*: the local provider resolves every key against the storage root and throws `InvalidStorageKeyException` if the result escapes it, so `../`, `../../` and similar sequences are rejected rather than silently reaching the filesystem. Still derive keys from ids you control rather than from a supplied filename — the check exists so a client cannot walk outside your storage root, not so you can skip thinking about what a filename could contain.
