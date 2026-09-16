---
title: Storage
description: File storage behind a driver registry, with a gated upload route, signed URLs, and a local driver that needs nothing to run.
---

Storage follows the same module-and-drivers shape as mail: `StorageService` is the facade you inject, `StorageDriver` is the contract, and which driver is active is a line in `hery.config.ts`.

```bash
pnpm hery install storage
```

No migration — storage owns no Prisma model. A stored file is a key, and where you keep that key is your resource's business.

## The contract is three methods

```ts
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
```

That contract lives in the kernel, at `src/technical/storage/storage-driver.ts`, not in the module. It has to: the [export](../guides/export/) module writes its generated files through it, and a module may not import another module. Going through the token instead makes storage an **optional runtime dependency and an invisible compile-time one** — a queued export asks the resolver for a storage driver, gets one if the project installed it, and degrades honestly if it did not.

Callers go through `StorageService`, which adds the gates the raw driver has no request to apply.

## The local driver is the zero-config default

Files land under `<cwd>/storage/<key>`, nested directories created as needed. A "signed URL" is served back by this app: `GET /storage/:key?exp=…&sig=…`, carrying an HMAC over `key:exp` verified in constant time, with a default expiry of 15 minutes.

That route has no session guard on purpose — the URL itself is the credential, because a signed URL is handed to a browser as an `<img src>` or a download link and cannot carry one. Verification runs in `StorageSignatureGuard` rather than in the handler, so the pipeline trace records that the route was gated by something other than a capability. **A bad or expired signature answers 404, never 403**: a 403 would confirm that the key names a real object to a caller holding no valid signature for it.

Two things the local driver refuses, and both are there because this module's own instructions tell you to pass keys straight in. A key resolving outside the storage root throws `InvalidStorageKeyException`, so `../` never reaches the filesystem. And a key ending in `.meta.json` is refused too: the content type of each object lives in a sidecar named after it, and **overwriting another object's sidecar is how an uploaded file gets relabelled as `text/html`** and served same-origin. The serve route sets `X-Content-Type-Options: nosniff` for the same reason.

## Which driver is active is a config line, not an environment variable

```ts
storage: {
  default: process.env.STORAGE_DRIVER ?? 'local',
  drivers: {
    local: { driver: 'local' },
  },
},
```

`StorageDriverRegistry` resolves every declared driver in `onModuleInit` and throws, naming the install command, on one it cannot find. A `default` that is not in `drivers` fails the same way. Omit the `storage` slice entirely and you get a single `local` driver, which is what a project that has not chosen a backend yet should get.

There is a trap here worth stating plainly. `STORAGE_DRIVER` **also** exists as a module environment variable in `storage.env.ts`, and there it does something different and much smaller: it decides whether `StorageController` — the local serve route — is mounted at all. It does **not** select the active driver. Setting `STORAGE_DRIVER=s3` without also reading it in `hery.config.ts` unmounts the local serve route while leaving the local driver active, which is a working app that hands out signed URLs nobody can resolve. Wire the variable into `default` as above, or do not set it.

## The S3 driver ships, but nothing binds it yet

`S3StorageDriver` is in the module: a full `StorageDriver` over `@aws-sdk/client-s3` with real presigned URLs, working against S3 or any S3-compatible endpoint. `STORAGE_S3_ENDPOINT` both points at that endpoint and switches on path-style addressing, which is what self-hosted MinIO needs, and its credentials are read when the driver is constructed rather than when the module is imported, so an app on the local driver is never refused a boot over credentials it does not use.

What is missing is the binding. `storage.module.ts` provides `LocalStorageDriver` and binds it to `storageDriverToken('local')`; **nothing binds `S3StorageDriver` to `storageDriverToken('s3')`**, so declaring `s3: { driver: 's3' }` in `hery.config.ts` today stops the boot with the missing-driver message. Until a driver package exists for it, bind it yourself in your own copy of the module — the files are yours:

```ts
const S3_DRIVER_TOKEN = storageDriverToken('s3');

providers: [
  S3StorageDriver,
  { provide: S3_DRIVER_TOKEN, useExisting: S3StorageDriver },
],
```

The bundled `docker-compose.storage.yml` runs MinIO for local work — note that **it does not create the bucket for you**, and that `hery up` does not cover it:

```bash
docker compose -f docker-compose.storage.yml up -d
```

None of this has been exercised against a live bucket in this repository.

## The upload route is where the gates are

`POST /storage/upload` is a real multipart route, driver-agnostic: it calls `.put()` underneath, so it behaves the same whether the object lands on disk or in an object store. Send a single part named `file`, behind a session:

```bash
curl -H "Authorization: Bearer $TOKEN" -F file=@avatar.png https://app.example/storage/upload
```

```ts
{ data: { key: 'tenant-a/6f1c…9e2.png', url: '/storage/tenant-a%2F6f1c…9e2.png?exp=…&sig=…' }, messages: ['File uploaded.'] }
```

Four gates run before a byte is written, none of them optional:

- **A content-type allowlist.** Images and PDF by default (`image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf`); override with a comma-separated `STORAGE_ALLOWED_CONTENT_TYPES`.
- **A size cap.** 10 MB by default, from `STORAGE_MAX_UPLOAD_BYTES`. It is checked before the local driver's own 25 MB `.put()` ceiling ever matters.
- **A key the caller never names.** The key is `<tenantId>/<uuid>.<ext>`, where the extension comes from the validated content type — **never from the client's filename**, which is read only to report an error.
- **The tenant, read from the request rather than from the caller.** `StorageService.upload()` reads `TenantContextStorage.getTenantId()` the same way `CacheService` does, so two tenants uploading in the same second never contend for a key.

The upload policy itself is a trivial "any authenticated caller": an upload has no record to own until whatever you do next attaches the returned key to one, so the tenant boundary and the gates above are what carry weight, not a scope.

## Reaching for `.put()` directly skips all of it

The upload route covers "a user attached a file". Anything else — a generated PDF, a backfill, a queued export — goes through the driver, and **none of the upload route's gates apply there**: no size cap beyond the local driver's blanket 25 MB, no content-type check, and no tenant prefix. The key you pass is the key that is used, verbatim.

Put the tenant in the key yourself, at the one place you build it:

```ts
const key = `${TenantContextStorage.getTenantId()}/avatars/${record.id}.png`;
```

The path check is not a substitute for that. It exists so a client cannot walk outside your storage root, not so you can stop thinking about what a supplied filename could contain — derive keys from ids you control.

## The `file` blueprint field is a string column

```yaml
fields:
  - name: avatar
    type: file
    optional: true
```

The generated column is the storage key an upload already returned, nothing more. The two-step flow mirrors the two things that actually happen:

```ts
const { data } = await api.post('/storage/upload', form); // { key: 'tenant-a/6f1c….png', url: '…' }
await api.post('/users/update', { data: [{ id, avatar: data.key }] });
```

Reading the record back gives you the key, not a URL — resolve it through `GET /storage/:key` or `StorageService.signedUrl(key)` server-side. A `file` field is not a shortcut around the tenant boundary either: it is validated and stored like any other field the generator writes, so the resource's own capability checks gate who may set it.

## What storage deliberately does not do

- **No database record per file.** There is no `StoredFile` model, no ownership row, no orphan collection. A key is a string on your resource, and deleting the resource does not delete the object — call `.remove()` where you mean it.
- **No image processing.** No resizing, no thumbnails, no transformation URLs.
- **No direct-to-bucket uploads.** Every upload proxies through this app, so the same four gates apply to every driver. That costs you the bytes crossing your own process, and buys you one place where the content type, the size and the tenant are decided.
- **No per-call driver selection.** Like mail and unlike export, storage is single-active: a caller says "store this", never "store this in S3".
