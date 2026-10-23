import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { TenantContextStorage } from '#technical/tenancy/tenant-context';
import { EncryptedFieldQueryException } from '../errors/encrypted-field-query.exception';
import { EncryptedNestedWriteException } from '../errors/encrypted-nested-write.exception';
import { SecretDecryptionException } from '../errors/secret-decryption.exception';
import {
  createTenantScopedPrismaClient,
  TenantScopedPrismaClient,
} from '../prisma/prisma.client';
import {
  declaredEncryptedColumns,
  encryptedModels,
  modelEncryption,
  REDACTED_VALUE,
} from './encrypted-columns';
import { DEV_SECRETS_KEYS } from '../config/env-schema';
import { defaultKeyring } from './default-keyring';
import { generateSecretKey, Keyring } from './keyring';
import { rotateSecrets } from './secrets-rotation';

type BlogPostInput = Omit<Prisma.BlogPostUncheckedCreateInput, 'tenantId'>;

describe('encrypted columns (real database)', () => {
  const adapter = new PrismaPg({
    connectionString:
      process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL,
  });
  const rawClient = new PrismaClient({ adapter });
  let scopedClient: TenantScopedPrismaClient;
  const tenantId = `tenant-secrets-${randomUUID()}`;
  let ownerId: string;

  const inTenant = <T>(callback: () => PromiseLike<T>): Promise<T> =>
    TenantContextStorage.run({ tenantId }, async () => callback());

  const createPost = (data: BlogPostInput) =>
    inTenant(() =>
      scopedClient.blogPost.create({
        data: data as Prisma.BlogPostUncheckedCreateInput,
      }),
    );

  const storedNote = async (id: string): Promise<string | null> =>
    (await rawClient.blogPost.findUniqueOrThrow({ where: { id } })).privateNote;

  beforeAll(async () => {
    await rawClient.$connect();
    scopedClient = createTenantScopedPrismaClient();
    await scopedClient.$connect();
    ownerId = (
      await rawClient.user.create({
        data: { email: `secrets-owner-${randomUUID()}@example.test` },
      })
    ).id;
  });

  afterAll(async () => {
    await rawClient.blogPost.deleteMany({ where: { ownerId } });
    await rawClient.auditLog.deleteMany({ where: { tenantId } });
    await rawClient.user.delete({ where: { id: ownerId } });
    await rawClient.$disconnect();
    await scopedClient.$disconnect();
  });

  it('declares only columns that exist as strings on their model', () => {
    for (const entry of declaredEncryptedColumns()) {
      const [model, column] = entry.split('.');

      expect(modelEncryption(model!)?.columns.has(column!)).toBe(true);
    }

    expect(encryptedModels()).toContain('BlogPost');
  });

  it('stores the value sealed and reads it back decrypted', async () => {
    const created = await createPost({
      title: 'sealed',
      ownerId,
      privateNote: 'the launch code',
    });

    expect(created.privateNote).toBe('the launch code');

    const stored = await storedNote(created.id);
    expect(stored).not.toContain('the launch code');
    expect(defaultKeyring().isEnvelope(stored as string)).toBe(true);

    const found = await inTenant(() =>
      scopedClient.blogPost.findUniqueOrThrow({ where: { id: created.id } }),
    );
    expect(found.privateNote).toBe('the launch code');
  });

  it('leaves a null value null', async () => {
    const created = await createPost({ title: 'empty', ownerId });

    expect(created.privateNote).toBeNull();
    expect(await storedNote(created.id)).toBeNull();
  });

  it('reseals on update, in both the plain and the set form', async () => {
    const created = await createPost({
      title: 'update',
      ownerId,
      privateNote: 'one',
    });

    const plain = await inTenant(() =>
      scopedClient.blogPost.update({
        where: { id: created.id },
        data: { privateNote: 'two' },
      }),
    );
    expect(plain.privateNote).toBe('two');
    expect(await storedNote(created.id)).not.toContain('two');

    const set = await inTenant(() =>
      scopedClient.blogPost.update({
        where: { id: created.id },
        data: { privateNote: { set: 'three' } },
      }),
    );
    expect(set.privateNote).toBe('three');
    expect(await storedNote(created.id)).not.toContain('three');

    const cleared = await inTenant(() =>
      scopedClient.blogPost.update({
        where: { id: created.id },
        data: { privateNote: null },
      }),
    );
    expect(cleared.privateNote).toBeNull();
    expect(await storedNote(created.id)).toBeNull();
  });

  it('seals every row of a createMany and decrypts a createManyAndReturn', async () => {
    const rows = await inTenant(() =>
      scopedClient.blogPost.createManyAndReturn({
        data: [
          { title: 'a', ownerId, privateNote: 'alpha' },
          { title: 'b', ownerId, privateNote: 'beta' },
        ] as Prisma.BlogPostCreateManyInput[],
      }),
    );

    expect(
      rows
        .map((row) => row.privateNote)
        .sort((a, b) => String(a).localeCompare(String(b))),
    ).toEqual(['alpha', 'beta']);

    for (const row of rows) {
      expect(await storedNote(row.id)).not.toMatch(/alpha|beta/);
    }
  });

  it('seals both branches of an upsert', async () => {
    const existing = await createPost({
      title: 'upsert',
      ownerId,
      privateNote: 'old',
    });

    const updated = await inTenant(() =>
      scopedClient.blogPost.upsert({
        where: { id: existing.id },
        update: { privateNote: 'updated' },
        create: {
          title: 'unused',
          ownerId,
          privateNote: 'unused',
        } as Prisma.BlogPostUncheckedCreateInput,
      }),
    );
    expect(updated.privateNote).toBe('updated');
    expect(await storedNote(existing.id)).not.toContain('updated');

    const created = await inTenant(() =>
      scopedClient.blogPost.upsert({
        where: { id: `missing-${randomUUID()}` },
        update: {},
        create: {
          title: 'created',
          ownerId,
          privateNote: 'fresh',
        } as Prisma.BlogPostUncheckedCreateInput,
      }),
    );
    expect(created.privateNote).toBe('fresh');
    expect(await storedNote(created.id)).not.toContain('fresh');
  });

  it('decrypts inside a list read', async () => {
    await createPost({ title: 'listed', ownerId, privateNote: 'in a list' });

    const posts = await inTenant(() =>
      scopedClient.blogPost.findMany({ where: { title: 'listed' } }),
    );

    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post.privateNote === 'in a list')).toBe(true);
  });

  it('decrypts through an included relation', async () => {
    await createPost({
      title: 'included',
      ownerId,
      privateNote: 'nested read',
    });

    const owner = await inTenant(() =>
      scopedClient.user.findUniqueOrThrow({
        where: { id: ownerId },
        include: { blogPosts: { where: { title: 'included' } } },
      }),
    );

    expect(owner.blogPosts.map((post) => post.privateNote)).toEqual([
      'nested read',
    ]);
  });

  it('keeps the plaintext out of the audit entry', async () => {
    const created = await createPost({
      title: 'audited',
      ownerId,
      privateNote: 'audit-me-not',
    });

    const entries = await rawClient.auditLog.findMany({
      where: { tenantId, recordId: created.id },
    });

    expect(entries.length).toBeGreaterThan(0);
    const serialised = JSON.stringify(entries.map((entry) => entry.data));
    expect(serialised).not.toContain('audit-me-not');
    expect(serialised).not.toContain('enc:');
    expect(serialised).toContain(REDACTED_VALUE);
  });

  it('refuses to filter or sort on an encrypted column', async () => {
    await expect(
      inTenant(() =>
        scopedClient.blogPost.findMany({ where: { privateNote: 'anything' } }),
      ),
    ).rejects.toBeInstanceOf(EncryptedFieldQueryException);

    await expect(
      inTenant(() =>
        scopedClient.blogPost.findMany({
          where: {
            AND: [{ OR: [{ NOT: { privateNote: { contains: 'x' } } }] }],
          },
        }),
      ),
    ).rejects.toBeInstanceOf(EncryptedFieldQueryException);

    await expect(
      inTenant(() =>
        scopedClient.blogPost.findMany({ orderBy: { privateNote: 'asc' } }),
      ),
    ).rejects.toBeInstanceOf(EncryptedFieldQueryException);

    await expect(
      inTenant(() =>
        scopedClient.blogPost.groupBy({ by: ['privateNote'], _count: true }),
      ),
    ).rejects.toBeInstanceOf(EncryptedFieldQueryException);
  });

  it('refuses a nested write into a model with encrypted columns', async () => {
    await expect(
      scopedClient.user.update({
        where: { id: ownerId },
        data: {
          blogPosts: {
            create: { tenantId, title: 'nested', privateNote: 'skipped' },
          },
        },
      }),
    ).rejects.toBeInstanceOf(EncryptedNestedWriteException);

    expect(
      await rawClient.blogPost.count({ where: { title: 'nested', ownerId } }),
    ).toBe(0);
  });

  it('fails loudly, naming the column, when a value cannot be opened', async () => {
    const created = await createPost({
      title: 'foreign',
      ownerId,
      privateNote: 'real',
    });
    const foreign = Keyring.fromEnv(`9:${generateSecretKey()}`).seal(
      'real',
      'BlogPost.privateNote',
    );
    await rawClient.blogPost.update({
      where: { id: created.id },
      data: { privateNote: foreign },
    });

    await expect(
      inTenant(() =>
        scopedClient.blogPost.findUniqueOrThrow({ where: { id: created.id } }),
      ),
    ).rejects.toBeInstanceOf(SecretDecryptionException);

    await rawClient.blogPost.delete({ where: { id: created.id } });
  });

  describe('rotation', () => {
    it('re-encrypts every value to the active key, idempotently', async () => {
      const oldKey = generateSecretKey();
      const rotating = Keyring.fromEnv(
        `${DEV_SECRETS_KEYS},old:${oldKey},new:${generateSecretKey()}`,
      );

      const post = await createPost({
        title: 'rotate',
        ownerId,
        privateNote: 'rotating',
      });
      const legacy = Keyring.fromEnv(`old:${oldKey}`).seal(
        'rotating',
        'BlogPost.privateNote',
      );
      await rawClient.blogPost.update({
        where: { id: post.id },
        data: { privateNote: legacy },
      });

      const dryRun = await rotateSecrets(rawClient, rotating, {
        dryRun: true,
        tenantId,
      });
      expect(
        dryRun.find((report) => report.model === 'BlogPost')?.rotated,
      ).toBeGreaterThan(0);
      expect(await storedNote(post.id)).toBe(legacy);

      await rotateSecrets(rawClient, rotating, { batchSize: 2, tenantId });

      const rotated = (await storedNote(post.id)) as string;
      expect(rotating.keyIdOf(rotated)).toBe('new');
      expect(rotating.open(rotated, 'BlogPost.privateNote')).toBe('rotating');

      const second = await rotateSecrets(rawClient, rotating, { tenantId });
      expect(second.every((report) => report.rotated === 0)).toBe(true);
    });

    it('skips plaintext unless told to adopt it', async () => {
      const isolatedTenant = `tenant-adopt-${randomUUID()}`;
      const post = await rawClient.blogPost.create({
        data: {
          tenantId: isolatedTenant,
          ownerId,
          title: 'legacy-plain',
          privateNote: 'was never encrypted',
        },
      });
      const keyring = defaultKeyring();

      const skipped = await rotateSecrets(rawClient, keyring, {
        tenantId: isolatedTenant,
      });
      expect(
        skipped.find((report) => report.model === 'BlogPost')?.plaintextSkipped,
      ).toBeGreaterThan(0);
      expect(await storedNote(post.id)).toBe('was never encrypted');

      await rotateSecrets(rawClient, keyring, {
        adoptPlaintext: true,
        tenantId: isolatedTenant,
      });
      const adopted = (await storedNote(post.id)) as string;
      expect(keyring.isEnvelope(adopted)).toBe(true);
      expect(keyring.open(adopted, 'BlogPost.privateNote')).toBe(
        'was never encrypted',
      );
    });
  });
});
