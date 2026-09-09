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

### Uploading

`POST /storage/upload` is a real multipart route, driver-agnostic: it calls `.put()` under the hood, so it works the same whether the object lands on disk or in S3/MinIO. Send a single part named `file`, behind a session:

```bash
curl -H "Authorization: Bearer $TOKEN" -F file=@avatar.png https://app.example/storage/upload
```

```ts
{ data: { key: 'tenant-a/6f1c…​9e2.png', url: '/storage/tenant-a%2F6f1c…9e2.png?exp=…&sig=…' }, messages: ['File uploaded.'] }
```

Four gates run before a byte is written, none of them optional:

- **Content-type allowlist.** Images and PDF by default (`image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf`); override with a comma-separated `STORAGE_ALLOWED_CONTENT_TYPES`.
- **Size cap.** 10 MB by default; override with `STORAGE_MAX_UPLOAD_BYTES`. This is checked before the local driver's own 25 MB `.put()` ceiling ever matters.
- **A key the caller never names.** The response key is `<tenantId>/<uuid>.<ext>`, where the extension comes from the validated content type — never from the client's filename. The filename is not read at all beyond the multipart part itself.
- **The tenant, read from the request, not from the caller.** `StorageService.upload()` reads `TenantContextStorage.getTenantId()` the same way `CacheService` does, so two tenants uploading on the same second never contend for a key.

`StorageService` is exported alongside `STORAGE_PROVIDER` for anything that wants the same gates from server-side code rather than through the route.

### Reaching for `.put()` directly

The upload route covers "a user attaches a file." Anything else — a scheduled export, a generated PDF, a backfill — still reaches for `STORAGE_PROVIDER.put()` directly, and none of the upload route's gates apply there: no size cap beyond the local driver's blanket 25 MB, no content-type check, and **no tenant prefix**. The key you pass is the key that is used, verbatim.

Put the tenant in the key yourself, at the one place you build it:

```ts
const key = `${TenantContextStorage.getTenantId()}/avatars/${record.id}.png`;
```

The same discipline applies to key _shape_: the local provider resolves every key against the storage root and throws `InvalidStorageKeyException` if the result escapes it, so `../`, `../../` and similar sequences are rejected rather than silently reaching the filesystem. Still derive keys from ids you control rather than from a supplied filename — the check exists so a client cannot walk outside your storage root, not so you can skip thinking about what a filename could contain.

### The `file` blueprint field

A resource owns its attachment the same way it owns any other scalar:

```yaml
fields:
  - name: avatar
    type: file
    optional: true
```

The generated column is a plain string — the storage key an upload already returned, nothing more. The two-step flow mirrors the two things that actually happen: upload first (`POST /storage/upload`), then create or update the resource with the key it gave back:

```ts
const { data } = await api.post('/storage/upload', form); // { key: 'tenant-a/6f1c….png', url: '…' }
await api.post('/users/update', { data: [{ id, avatar: data.key }] });
```

Reading the record back gives you the key, not a URL — resolve it through `GET /storage/:key` (or `StorageService.signedUrl(key)` server-side) the same way any other stored key is served. A `file` field is not a shortcut around the tenant boundary either: it is validated and stored exactly like any other field the generator writes, so the resource's own capability checks are what gate who can set it, same as `own`/`team`/`all`/`none` gate everything else.
