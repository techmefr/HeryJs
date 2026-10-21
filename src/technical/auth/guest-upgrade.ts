import type { PrismaClient } from '@prisma/client';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

interface UserReference {
  table: string;
  column: string;
}

/**
 * Every single-column foreign key that points at a user without cascading,
 * read off the database catalog. A cascading reference goes with the guest on
 * its own; one that does not makes the guest's delete fail, so it is the set
 * this upgrade has to move or drop. Read rather than listed, so a generated
 * resource with an owner is covered the moment its migration runs, and a
 * project without the demo never names a table it does not have. Prisma's
 * runtime DMMF carries neither the foreign key columns nor the delete rule,
 * so the catalog is the source. Both names come back already quoted.
 */
async function userReferencesWithoutCascade(
  transaction: Transaction,
): Promise<UserReference[]> {
  return transaction.$queryRaw<UserReference[]>`
    SELECT constraints.conrelid::regclass::text AS "table",
           quote_ident(columns.attname) AS "column"
    FROM pg_constraint AS constraints
    JOIN pg_attribute AS columns
      ON columns.attrelid = constraints.conrelid
     AND columns.attnum = constraints.conkey[1]
    WHERE constraints.contype = 'f'
      AND constraints.confrelid = '"User"'::regclass
      AND constraints.confdeltype <> 'c'
      AND cardinality(constraints.conkey) = 1`;
}

async function scopeToTenant(
  transaction: Transaction,
  tenantId: string,
): Promise<void> {
  await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
}

async function moveRows(
  transaction: Transaction,
  guestId: string,
  accountId: string,
): Promise<void> {
  for (const { table, column } of await userReferencesWithoutCascade(
    transaction,
  )) {
    await transaction.$executeRawUnsafe(
      `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
      accountId,
      guestId,
    );
  }
  await transaction.appNotification.updateMany({
    where: { userId: guestId },
    data: { userId: accountId },
  });
  await transaction.pushToken.updateMany({
    where: { userId: guestId },
    data: { userId: accountId },
  });

  const alreadyIn = await transaction.teamMember.findMany({
    where: { userId: accountId },
    select: { teamId: true },
  });

  await transaction.teamMember.updateMany({
    where: {
      userId: guestId,
      teamId: { notIn: alreadyIn.map((member) => member.teamId) },
    },
    data: { userId: accountId },
  });
}

async function dropRows(
  transaction: Transaction,
  guestId: string,
): Promise<void> {
  for (const { table, column } of await userReferencesWithoutCascade(
    transaction,
  )) {
    await transaction.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE ${column} = $1`,
      guestId,
    );
  }
}

/**
 * A guest who signs in for real is handed a second user by Better Auth, and
 * the guest row is deleted once its callback returns. Every row that cascades
 * from it goes too, and a row that does not cascade (a blog post's owner) makes
 * the delete itself fail -- so what the guest built is either moved or removed
 * here, never left behind.
 *
 * Moved only inside one tenant. A guest holds the tenant of the request that
 * created it, and signing in to an account of another tenant must not carry
 * the guest's rows across that boundary: they are dropped with the guest. The
 * transaction sets the tenant the way the scoped client does, so the writes
 * also pass row-level security.
 */
export async function moveGuestOwnership(
  client: PrismaClient,
  guestId: string,
  accountId: string,
): Promise<boolean> {
  const guest = await client.user.findUnique({
    where: { id: guestId },
    select: { tenantId: true },
  });

  if (!guest || guestId === accountId) {
    return false;
  }

  const account = await client.user.findUnique({
    where: { id: accountId },
    select: { tenantId: true },
  });
  const isSameTenant = account?.tenantId === guest.tenantId;

  await client.$transaction(async (transaction) => {
    await scopeToTenant(transaction, guest.tenantId);

    if (isSameTenant) {
      await moveRows(transaction, guestId, accountId);
      return;
    }

    await dropRows(transaction, guestId);
  });

  return isSameTenant;
}
