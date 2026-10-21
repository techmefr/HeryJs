import type { PrismaClient } from '@prisma/client';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

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
  await transaction.blogPost.updateMany({
    where: { ownerId: guestId },
    data: { ownerId: accountId },
  });
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
  await transaction.blogPost.deleteMany({ where: { ownerId: guestId } });
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
