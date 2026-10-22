import type { PrismaClient } from '@prisma/client';
import {
  currentLocale,
  recipientLocale,
  supportedLocale,
} from '#technical/i18n/recipient-locale';

type UserReader = Pick<PrismaClient, 'user'>;

/**
 * Someone with no account yet -- a sign-up code, a first magic link -- has no
 * stored locale, and the request asking for the message is theirs, so its
 * language is the best guess there is.
 */
export function signUpLocale(): string {
  return supportedLocale(currentLocale()) ?? recipientLocale(null);
}

export async function localeOfEmail(
  client: UserReader,
  email: string,
): Promise<string> {
  const user = await client.user.findUnique({
    where: { email },
    select: { locale: true },
  });

  return user ? recipientLocale(user) : signUpLocale();
}

export async function localeOfPhone(
  client: UserReader,
  phoneNumber: string,
): Promise<string> {
  const user = await client.user.findUnique({
    where: { phoneNumber },
    select: { locale: true },
  });

  return user ? recipientLocale(user) : signUpLocale();
}
