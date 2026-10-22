import type { PrismaClient } from '@prisma/client';
import {
  TenantContextStorage,
  UNAUTHENTICATED_TENANT_ID,
} from '#technical/tenancy/tenant-context';
import { localeOfEmail, localeOfPhone } from './recipient-locale';

interface StoredUser {
  email: string;
  phoneNumber: string;
  tenantId: string;
  locale: string;
}

const USERS: StoredUser[] = [
  {
    email: 'ada@example.com',
    phoneNumber: '+33611111111',
    tenantId: 'tenant-a',
    locale: 'fr',
  },
];

function readerOf(users: StoredUser[]): Pick<PrismaClient, 'user'> {
  const findFirst = ({ where }: { where: Partial<StoredUser> }) =>
    Promise.resolve(
      users.find((user) =>
        Object.entries(where).every(
          ([key, value]) => user[key as keyof StoredUser] === value,
        ),
      ) ?? null,
    );

  return { user: { findFirst } } as unknown as Pick<PrismaClient, 'user'>;
}

describe('recipient locale', () => {
  const client = readerOf(USERS);

  it("reads the locale of a user of the caller's tenant", async () => {
    await TenantContextStorage.run({ tenantId: 'tenant-a' }, async () => {
      expect(await localeOfEmail(client, 'ada@example.com')).toBe('fr');
      expect(await localeOfPhone(client, '+33611111111')).toBe('fr');
    });
  });

  it('never reads the locale of a user of another tenant', async () => {
    await TenantContextStorage.run({ tenantId: 'tenant-b' }, async () => {
      expect(await localeOfEmail(client, 'ada@example.com')).not.toBe('fr');
      expect(await localeOfPhone(client, '+33611111111')).not.toBe('fr');
    });
  });

  it('finds the account by its address when the caller has no session yet', async () => {
    await TenantContextStorage.run(
      { tenantId: UNAUTHENTICATED_TENANT_ID },
      async () => {
        expect(await localeOfEmail(client, 'ada@example.com')).toBe('fr');
        expect(await localeOfPhone(client, '+33611111111')).toBe('fr');
      },
    );
  });
});
