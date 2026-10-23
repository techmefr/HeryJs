import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  annotatedModelsIn,
  modelRegistries,
  readGeneratedModels,
  registriesFrom,
  tenantBoundaryProblems,
  validatedRegistries,
} from './model-annotations';
import type { AnnotatedModel, ModelRegistries } from './model-annotations';

const SCHEMA = readFileSync(
  path.join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
  'utf8',
);

/**
 * The registries exactly as the kernel hard-coded them before they became
 * annotations (main at 94f598b). Moving them into the schema must not add or
 * drop a single model or column: a model that silently left the tenant-scoped
 * set would stop being filtered, and nothing else would notice.
 */
const LEGACY: Record<keyof ModelRegistries, string[]> = {
  tenantScoped: [
    'TwoFactorEnrolment',
    'TwoFactorRecoveryCode',
    'TwoFactorRoleRequirement',
    'TwoFactorVerifiedSession',
    'Team',
    'TeamMember',
    'ScimIdentity',
    'BlogPost',
    'BlogPostNote',
    'BlogPostTag',
    'Tag',
    'Comment',
    'AppNotification',
    'SmsConsent',
    'PushToken',
    'BillingSubscription',
    'Snippet',
    'NotificationPreference',
    'NotificationSetting',
    'PrivacyRequest',
    'QuotaOverride',
    'QuotaUsage',
    'RecordShare',
  ],
  tenantFree: [
    'Session',
    'Account',
    'ApiKey',
    'TwoFactor',
    'Passkey',
    'Verification',
    'OauthIdentity',
    'OutboxReceipt',
  ],
  appEnforcedTenant: [
    'User',
    'AuditLog',
    'AuditSink',
    'RecordSnapshot',
    'FeatureFlag',
    'MailLog',
    'WebhookEndpoint',
    'WebhookEvent',
    'WebhookSubscription',
    'WebhookDelivery',
    'IdempotencyKey',
    'OutboxMessage',
    'NotificationDigestEntry',
    'LogEntry',
    'DevtoolsEntry',
    'JobFlow',
    'SsoConnection',
    'SsoDomain',
    'SsoIdentity',
    'ScimToken',
  ],
  audited: ['BlogPost', 'RecordShare'],
  history: [
    'Snippet.title',
    'Snippet.summary',
    'Snippet.status',
    'Snippet.deletedAt',
    'Snippet.version',
  ],
  encrypted: ['BlogPost.privateNote'],
};

function sorted(registries: ModelRegistries): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(registries).map(([name, entries]) => [
      name,
      [...(entries as ReadonlySet<string>)].sort(),
    ]),
  );
}

function legacySorted(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(LEGACY).map(([name, entries]) => [
      name,
      [...entries].sort(),
    ]),
  );
}

function model(
  name: string,
  documentation: string | null,
  fields: string[] = ['id'],
): AnnotatedModel {
  return {
    name,
    documentation,
    fields: fields.map((field) => ({ name: field, documentation: null })),
  };
}

describe('model annotations', () => {
  it('declare exactly the registries the kernel used to hard-code', () => {
    expect(sorted(registriesFrom(annotatedModelsIn(SCHEMA)))).toEqual(
      legacySorted(),
    );
  });

  it('reach the kernel through the generated file with the same coverage', () => {
    expect(sorted(registriesFrom(readGeneratedModels()))).toEqual(
      legacySorted(),
    );
    expect(sorted(modelRegistries())).toEqual(legacySorted());
  });

  it('read the schema the way prisma generate does', () => {
    const fromSchema = annotatedModelsIn(SCHEMA).map((entry) => ({
      name: entry.name,
      documentation: entry.documentation,
      fields: entry.fields.map((field) => [field.name, field.documentation]),
    }));
    const generated = readGeneratedModels().map((entry) => ({
      name: entry.name,
      documentation: entry.documentation,
      fields: entry.fields.map((field) => [field.name, field.documentation]),
    }));

    expect(fromSchema).toEqual(generated);
  });

  it('leave no tenant boundary undeclared in the schema', () => {
    const models = annotatedModelsIn(SCHEMA);

    expect(tenantBoundaryProblems(models, registriesFrom(models))).toEqual([]);
  });

  describe('fail closed', () => {
    it('refuses to start when a model carries a tenantId and no annotation', () => {
      expect(() =>
        validatedRegistries([model('Invoice', null, ['id', 'tenantId'])]),
      ).toThrow(/Invoice carries a tenantId but is neither/);
    });

    it('accepts the same model once it says it is tenant-scoped', () => {
      expect(
        validatedRegistries([
          model('Invoice', '@hery.tenantScoped', ['id', 'tenantId']),
        ]).tenantScoped,
      ).toEqual(new Set(['Invoice']));
    });

    it('requires a reason for an explicit opt-out of the boundary', () => {
      expect(() =>
        validatedRegistries([
          model('Invoice', '@hery.appEnforcedTenant', ['id', 'tenantId']),
        ]),
      ).toThrow(/without a reason/);
      expect(() =>
        validatedRegistries([model('Ledger', '@hery.tenantFree')]),
      ).toThrow(/without a reason/);
    });

    it('accepts an opt-out that states why', () => {
      expect(
        validatedRegistries([
          model('Invoice', '@hery.appEnforcedTenant written by a worker', [
            'id',
            'tenantId',
          ]),
        ]).appEnforcedTenant,
      ).toEqual(new Set(['Invoice']));
    });

    it('rejects an annotation it does not know rather than ignoring it', () => {
      expect(() =>
        registriesFrom([model('Invoice', '@hery.tenantScopped')]),
      ).toThrow(/unknown annotation/);
    });

    it('rejects a model that is both scoped and enforced in code', () => {
      expect(() =>
        validatedRegistries([
          model('Invoice', '@hery.tenantScoped\n@hery.appEnforcedTenant why', [
            'id',
            'tenantId',
          ]),
        ]),
      ).toThrow(/can only be one/);
    });

    it('rejects a tenant annotation on a model with no tenantId', () => {
      expect(() =>
        validatedRegistries([model('Invoice', '@hery.tenantScoped')]),
      ).toThrow(/has no tenantId column/);
    });

    it('refuses to start without the generated annotations', () => {
      expect(() =>
        readGeneratedModels(path.join(__dirname, 'no-such-annotations.json')),
      ).toThrow(/refuses to start/);
    });
  });

  it('reads field annotations and keeps ordinary comments out of them', () => {
    const models = annotatedModelsIn(`
/// A ledger line.
/// @hery.tenantScoped
model Line {
  id       String @id
  tenantId String
  // not documentation
  /// @hery.history
  amount   Int
  /// @hery.encrypted
  memo     String?

  @@index([tenantId])
}
`);

    expect(models).toEqual([
      {
        name: 'Line',
        documentation: 'A ledger line.\n@hery.tenantScoped',
        fields: [
          { name: 'id', documentation: null },
          { name: 'tenantId', documentation: null },
          { name: 'amount', documentation: '@hery.history' },
          { name: 'memo', documentation: '@hery.encrypted' },
        ],
      },
    ]);
    expect(registriesFrom(models).history).toEqual(new Set(['Line.amount']));
    expect(registriesFrom(models).encrypted).toEqual(new Set(['Line.memo']));
  });
});
