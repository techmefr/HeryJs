import type { PrismaClient } from '@prisma/client';
import {
  currentLocale,
  recipientLocale,
  supportedLocale,
} from '#technical/i18n/recipient-locale';
import {
  TenantContextStorage,
  UNAUTHENTICATED_TENANT_ID,
} from '#technical/tenancy/tenant-context';

type UserReader = Pick<PrismaClient, 'user'>;

/**
 * Someone with no account yet -- a sign-up code, a first magic link -- has no
 * stored locale, and the request asking for the message is theirs, so its
 * language is the best guess there is.
 */
export function signUpLocale(): string {
  return supportedLocale(currentLocale()) ?? recipientLocale(null);
}

/**
 * A signed-in caller only ever reads users of its own tenant. A caller with no
 * session yet -- a sign-in code, a password reset -- has no tenant to narrow
 * by, and the address it gave is the only thing naming the account.
 */
function tenantScope(): { tenantId?: string } {
  const tenantId = TenantContextStorage.findTenantId();

  return tenantId === null || tenantId === UNAUTHENTICATED_TENANT_ID
    ? {}
    : { tenantId };
}

export async function localeOfEmail(
  client: UserReader,
  email: string,
): Promise<string> {
  const user = await client.user.findFirst({
    where: { email, ...tenantScope() },
    select: { locale: true },
  });

  return user ? recipientLocale(user) : signUpLocale();
}

export async function localeOfPhone(
  client: UserReader,
  phoneNumber: string,
): Promise<string> {
  const user = await client.user.findFirst({
    where: { phoneNumber, ...tenantScope() },
    select: { locale: true },
  });

  return user ? recipientLocale(user) : signUpLocale();
}
