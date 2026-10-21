---
title: Storage
description: File storage behind a driver registry, with a gated upload route, signed URLs, and a local driver that needs nothing to run.
---

Storage follows the same module-and-drivers shape as mail: `StorageService` is the facade you inject, `StorageDriver` is the contract, and which driver is active is a line in `hery.config.ts`.

```bash
pnpm hery install storage
```

No migration — storage owns no Prisma model. A stored file is a key, and where you keep that key is your resource's business.

## The contract

```ts
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  presignPut(key: string, contentType: string, sizeBytes: number): Promise<PresignedUpload>;
  stat(key: string): Promise<StoredObjectStat | null>;
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

`STORAGE_DRIVER` is read in two places, and they have to agree. In `storage.env.ts` it decides whether `StorageController` — the local serve route — is mounted at all; in `hery.config.ts` it names the active driver. Declaring a `storage` slice that does not read it, and then setting `STORAGE_DRIVER=s3`, unmounts the local serve route while leaving the local driver active, which is a working app that hands out signed URLs nobody can resolve. Read the variable in `default` as above, or do not set it.

## S3 is one variable away

`S3StorageDriver` is in the module, bound to `storageDriverToken('s3')` by `storage.module.ts` with no package to install: a full `StorageDriver` over `@aws-sdk/client-s3` with real presigned URLs, working against S3 or any S3-compatible endpoint. `STORAGE_DRIVER=s3` selects it, plus the `STORAGE_S3_*` variables:

| Variable                | Meaning                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `STORAGE_S3_BUCKET`     | Defaults to `heryjs`. The bucket has to exist already.                                        |
| `STORAGE_S3_REGION`     | Defaults to `us-east-1`.                                                                      |
| `STORAGE_S3_ENDPOINT`   | Unset for AWS. Set it for MinIO or any other S3-compatible server; it also turns on path-style addressing. |
| `STORAGE_S3_ACCESS_KEY` | Development default outside production, refused in production.                                |
| `STORAGE_S3_SECRET_KEY` | Same.                                                                                         |

Declare both drivers in `hery.config.ts` and the variable is the whole switch:

```ts
storage: {
  default: process.env.STORAGE_DRIVER ?? 'local',
  drivers: {
    local: { driver: 'local' },
    s3: { driver: 's3' },
  },
},
```

Leave the `storage` slice out and `STORAGE_DRIVER` alone picks between the two drivers the module carries, so `STORAGE_DRIVER=s3` is enough with no config edit. A slice you declared always wins over the variable.

The S3 client is built the first time the driver is used, not when the app boots. The module always provides the driver, so reading credentials in a constructor would refuse a production boot over S3 settings on every app that stores on local disk.

The bundled `docker-compose.storage.yml` runs MinIO for local work — note that **it does not create the bucket for you**, and that `hery up` does not cover it:

```bash
docker compose -f docker-compose.storage.yml up -d
```

The image is the Bitnami build of MinIO, pinned, because MinIO no longer publishes `minio/minio` images. The driver is exercised against a real MinIO in CI: put, get, list, remove, presigned GET, and the whole upload-intent flow, including a confirm that refuses an object uploaded with a content type other than the one authorised. That last check is deliberate. MinIO accepts a presigned PUT whatever `Content-Type` it carries, so the intent's confirm step, which re-reads the object with `stat()`, is what holds the line, not the signature.

## The admin panel can see and manage files

`storage-admin` is a small controller the [admin panel](../guides/admin/) picks up through introspection, behind `canManageFiles` (admin only). It is a controller of its own because `/storage` owns `GET :key`, which would swallow a `GET /storage/files`, and because it has to exist for every driver, not only the local one.

- `GET /storage-admin/status` answers the active driver, the others the config declares (names only, never a credential), the upload size cap and the content-type allowlist.
- `GET /storage-admin/files` lists the current tenant's objects, with a signed URL each, capped at 200.
- `POST /storage-admin/files/delete` removes one by key. A key outside the caller's tenant answers 404, because `remove()` itself takes any key and the HTTP route must not.

The admin's **Storage** page is built on those three and on `POST /storage/upload`: the driver and its limits, an upload field, and the file list with a delete button on each row. Listing is a new method on the `StorageDriver` contract (`list(prefix, limit)`), implemented by the local and S3 drivers and by the testing fake; a driver of your own has to add it.

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

## Direct-to-storage uploads, and the local driver's asymmetry

`POST /storage/upload` proxies every byte through this process: for anything bigger than a profile picture — a video, a dataset, a scan — that shape is wrong, even with the size cap bounding the damage. `POST /storage/upload-intent` is the other shape, the one every object store solves the same way:

1. **Ask for permission.** `POST /storage/upload-intent` with `{ contentType, size }`, gated by the same `canUploadFiles` capability as the proxying route. The server generates the key itself — never from client input, same discipline as `/storage/upload` — and returns `{ key, url, headers? }`: a presigned PUT and the key it chose.
2. **Upload straight to the store.** The client `PUT`s the file body to `url` (with `headers` set, when given) — S3, MinIO, wherever. This app never sees the bytes.
3. **Confirm.** `POST /storage/upload-intent/confirm` with `{ key }`. The app does **not** take the client's word: it re-derives the object's existence, size and content type from the driver's own `stat(key)` and refuses with `StorageUploadIntentMismatchException` the moment any of them disagree with what the intent authorised, or `StorageUploadIntentNotFoundException` if the key names no pending intent (expired or already confirmed). A key handed out is not a key used until this step says so.

The intent itself lives in `CacheService` — the same tenant-scoped Redis store the rate limiter and everything else already share — under `upload-intent:<key>`, with a TTL equal to the presigned URL's own expiry (5 minutes). It is written once and consumed atomically with a Redis `MULTI` get-and-delete on confirm, so concurrent or repeated confirms of one intent yield exactly one success; a confirm that fails verification still consumes the intent and the client asks for a new one.  that is what a cache is for, not a reason to add a Prisma model and a migration for a record nothing ever lists or joins against.

**Residual risk.** The presigned PUT stays valid until its 5 minute expiry even after confirm, so a holder of the URL could overwrite the object inside that window. Confirm checks the object as it is at that moment; if that matters, treat a key as final only once the window has passed or copy it server-side.

**The local driver has no presigned-PUT equivalent.** There is no object store in front of local disk to hand a client a direct URL for — only this process. Its `presignPut()` throws `StoragePresignUnsupportedException` naming the driver, rather than silently falling back to something that looks like it worked. This is a real asymmetry, not an oversight to work around: **the proxying `POST /storage/upload` route stays the local-development path**, and `upload-intent` is the production path once a real driver (S3-compatible) is bound. A project running on the local driver should keep using `/storage/upload` for uploads; pointing a client at `/storage/upload-intent` there fails loudly and immediately, with a message that says exactly that.

## What storage deliberately does not do

- **No database record per file.** There is no `StoredFile` model, no ownership row, no orphan collection. A key is a string on your resource, and deleting the resource does not delete the object — call `.remove()` where you mean it. Upload intents are the one exception, and they live in the cache, not a table — see above.
- **No image processing.** No resizing, no thumbnails, no transformation URLs.
- **No per-call driver selection.** Like mail and unlike export, storage is single-active: a caller says "store this", never "store this in S3".
