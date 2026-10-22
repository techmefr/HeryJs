import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { App } from 'supertest/types';
import { AppModule } from '#app.module';
import { SmsModule } from '#modules/sms/sms.module';
import { BlogPostModule } from '../../../examples/blog-post/blog-post.module';
import { SnippetModule } from '../../../examples/snippet/snippet.module';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';
import { userKeyedModels } from '#technical/privacy/privacy.executor';

const PERSONAL_COLUMN =
  /email|phone|^to$|^(user|owner|subject|grantee|grantedBy|providerUser)Id$|^requestedBy$|^(given|family)Name$|^externalId$|^ipAddress$|^userAgent$|^payload$|^message$|^fields$|^detail$|^identifier$/i;

const EXEMPTIONS: Record<string, string> = {
  'AuditLog.userId':
    'the tamper-evident chain keeps who acted; an erasure redacts the entries and tombstones the account, so the id names nobody',
  'RecordSnapshot.userId':
    'who wrote a revision; the snapshots of erased rows are purged, and the id of an erased author points at a tombstone',
  'PrivacyRequest.subjectId':
    'the record that a request was answered, which the regulation itself asks to keep; the export it carried expires',
  'PrivacyRequest.requestedBy':
    'the record that a request was answered, which the regulation itself asks to keep',
  'Verification.identifier':
    'a one-time verification token that expires within the hour',
  'OutboxMessage.payload':
    'a transient delivery queue, pruned once delivered or dead',
};

describe('personal data coverage', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SmsModule, SnippetModule, BlogPostModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('declares, hooks or exempts every column that looks like personal data', () => {
    const registry = app.get(PersonalDataRegistry, { strict: false });
    const covered = new Set([
      'User',
      ...userKeyedModels(),
      ...registry.all().map((declaration) => declaration.model),
      ...registry.hooks().flatMap((hook) => hook.models),
    ]);

    const undeclared = Prisma.dmmf.datamodel.models
      .filter((model) => !covered.has(model.name))
      .flatMap((model) =>
        model.fields
          .filter(
            (field) =>
              field.kind !== 'object' && PERSONAL_COLUMN.test(field.name),
          )
          .map((field) => `${model.name}.${field.name}`),
      )
      .filter((column) => !(column in EXEMPTIONS));

    expect(undeclared).toEqual([]);
  });

  it('keeps no exemption for a column that is gone or now covered', () => {
    const registry = app.get(PersonalDataRegistry, { strict: false });
    const hooked = new Set(registry.hooks().flatMap((hook) => hook.models));
    const columns = new Set(
      Prisma.dmmf.datamodel.models.flatMap((model) =>
        model.fields.map((field) => `${model.name}.${field.name}`),
      ),
    );

    expect(
      Object.keys(EXEMPTIONS).filter(
        (column) => !columns.has(column) || hooked.has(column.split('.')[0]!),
      ),
    ).toEqual([]);
  });
});
