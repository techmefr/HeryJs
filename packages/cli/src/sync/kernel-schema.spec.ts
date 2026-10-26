import { mergeKernelSchema, schemasDiffer } from './kernel-schema';

const PACKAGED = [
  'generator client {',
  '  provider = "prisma-client"',
  '}',
  '',
  'model User {',
  '  id    String @id',
  '  email String @unique',
  '  name  String?',
  '',
  '  sessions Session[]',
  '',
  '  @@index([email])',
  '}',
  '',
  'model Session {',
  '  id     String @id',
  '  userId String',
  '  user   User   @relation(fields: [userId], references: [id])',
  '}',
  '',
].join('\n');

const PROJECT = [
  'generator client {',
  '  provider = "prisma-client"',
  '}',
  '',
  'model User {',
  '  id    String @id',
  '  email String',
  '  sessions Session[]',
  '  posts    Post[]',
  '  pushTokens PushToken[]',
  '}',
  '',
  'model Session {',
  '  id     String @id',
  '  userId String',
  '  impersonatedBy String?',
  '  user   User   @relation(fields: [userId], references: [id])',
  '}',
  '',
  'model Retired {',
  '  id String @id',
  '}',
  '',
].join('\n');

describe('mergeKernelSchema', () => {
  const merged = mergeKernelSchema(PACKAGED, PROJECT);

  it("keeps the relations and fields the project hangs on the kernel's models", () => {
    expect(merged).toContain('  posts    Post[]');
    expect(merged).toContain('  pushTokens PushToken[]');
    expect(merged).toContain('  impersonatedBy String?');
  });

  it("takes the kernel's version of every field it ships, and its new ones", () => {
    expect(merged).toContain('  email String @unique');
    expect(merged).not.toMatch(/^ {2}email String$/m);
    expect(merged).toContain('  name  String?');
  });

  it('places the kept fields before the model attributes', () => {
    const user = merged.slice(
      merged.indexOf('model User {'),
      merged.indexOf('model Session {'),
    );

    expect(user.indexOf('pushTokens')).toBeLessThan(user.indexOf('@@index'));
    expect(user.indexOf('sessions')).toBeLessThan(user.indexOf('posts'));
  });

  it('drops a model the kernel no longer ships', () => {
    expect(merged).not.toContain('model Retired');
  });

  it('is stable once synced', () => {
    expect(mergeKernelSchema(PACKAGED, merged)).toBe(merged);
    expect(schemasDiffer(merged, mergeKernelSchema(PACKAGED, merged))).toBe(
      false,
    );
  });
});

describe('mergeKernelSchema with annotated project fields', () => {
  const annotated = [
    'model User {',
    '  id    String @id',
    '  email String',
    '  sessions Session[]',
    '  /// @hery.encrypted',
    '  taxNumber String?',
    '',
    '  @@index([taxNumber])',
    '}',
    '',
  ].join('\n');
  const merged = mergeKernelSchema(PACKAGED, annotated);

  it('keeps the annotation above a field the project hangs on a kernel model', () => {
    expect(merged).toContain('  /// @hery.encrypted\n  taxNumber String?');
  });

  it('keeps a model attribute the project adds to a kernel model', () => {
    expect(merged).toContain('  @@index([taxNumber])');
    expect(merged).toContain('  @@index([email])');
  });

  it('is stable once synced', () => {
    expect(mergeKernelSchema(PACKAGED, merged)).toBe(merged);
  });
});

describe('mergeKernelSchema against the kernel last synced', () => {
  const base = [
    'model User {',
    '  id     String @id',
    '  email  String @unique',
    '  legacy String?',
    '',
    '  @@index([legacy])',
    '}',
    '',
  ].join('\n');
  const packaged = [
    'model User {',
    '  id    String @id',
    '  email String @unique',
    '}',
    '',
  ].join('\n');
  const project = [
    'model User {',
    '  id     String @id',
    '  email  String @unique',
    '  legacy String?',
    '  posts  Post[]',
    '',
    '  @@index([legacy])',
    '  @@index([email, id])',
    '}',
    '',
  ].join('\n');
  const merged = mergeKernelSchema(packaged, project, base);

  it('drops a field the kernel removed since the last sync', () => {
    expect(merged).not.toContain('legacy');
  });

  it('keeps what the project added', () => {
    expect(merged).toContain('  posts  Post[]');
    expect(merged).toContain('  @@index([email, id])');
  });

  it('keeps every project field without a recorded base', () => {
    expect(mergeKernelSchema(packaged, project)).toContain('  legacy String?');
  });
});

describe('schemasDiffer', () => {
  it('ignores alignment and line order', () => {
    expect(
      schemasDiffer(
        'model A {\n  a String\n  b Int\n}',
        'model A {\n  b   Int\n  a String\n}',
      ),
    ).toBe(false);
  });

  it('sees a field that changed', () => {
    expect(
      schemasDiffer('model A {\n  a String\n}', 'model A {\n  a String?\n}'),
    ).toBe(true);
  });
});
