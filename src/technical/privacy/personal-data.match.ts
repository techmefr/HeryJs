import { Prisma } from '@prisma/client';
import type { PersonalDataSubject } from './personal-data.types';

/**
 * A free-form column -- a JSON payload, a log message -- names a user by id or
 * by address, never by a key a query can join on. This matches either inside
 * the column's text, the address without regard to case.
 */
export function mentionsSubject(
  column: string,
  subject: PersonalDataSubject,
): Prisma.Sql {
  const text = Prisma.raw(`"${column}"::text`);

  return Prisma.sql`(strpos(${text}, ${subject.userId}) > 0 OR strpos(lower(${text}), ${subject.email.toLowerCase()}) > 0)`;
}
