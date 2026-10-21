import { Prisma, type PrismaClient } from '@prisma/client';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

interface OwnedRowsDelegate {
  updateMany(args: {
    where: Record<string, string>;
    data: Record<string, string>;
  }): Promise<unknown>;
  deleteMany(args: { where: Record<string, string> }): Promise<unknown>;
}

interface UserReference {
  delegate: string;
  column: string;
}

/**
 * Every column that points at a user without cascading, read off Prisma's own
 * DMMF. A cascading reference goes with the guest on its own; one that does
 * not makes the guest's delete fail, so it is the set this upgrade has to
 * move or drop. Read rather than listed, so a generated resource with an
 * owner is covered the moment it exists, and a project without the demo does
 * not compile against a model it never had.
 */
export function userReferencesWithoutCascade(): UserReference[] {
  return Prisma.dmmf.datamodel.models.flatMap((model) =>
    model.fields
      .filter(
        (field) =>
          field.kind === 'object' &&
          field.type === 'User' &&
          field.relationOnDelete !== 'Cascade',
      )
      .flatMap((field) =>
        (field.relationFromFields ?? []).map((column) => ({
          delegate: model.name.charAt(0).toLowerCase() + model.name.slice(1),
          column,
        })),
      ),
  );
}

function delegateOf(
  transaction: Transaction,
  reference: UserReference,
): OwnedRowsDelegate {
  const delegate = (
    transaction as unknown as Record<string, OwnedRowsDelegate | undefined>
  )[reference.delegate];

  if (!delegate) {
    throw new Error(`The Prisma client has no ${reference.delegate} delegate.`);
  }

  return delegate;
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
  for (const reference of userReferencesWithoutCascade()) {
    await delegateOf(transaction, reference).updateMany({
      where: { [reference.column]: guestId },
      data: { [reference.column]: accountId },
    });
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
  for (const reference of userReferencesWithoutCascade()) {
    await delegateOf(transaction, reference).deleteMany({
      where: { [reference.column]: guestId },
    });
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
