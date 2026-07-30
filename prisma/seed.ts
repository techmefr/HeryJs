import { PrismaPg } from '@prisma/adapter-pg';
import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/technical/config/env';
import { workoutFactory } from '../src/functional/workout/workout.factory';

const DEMO_TENANT_ID = 'demo-tenant';
const DEMO_EMAIL = 'demo@heryjs.local';
const DEMO_PASSWORD = 'correct-horse-battery-staple';

async function main() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const { betterAuth } = await import('better-auth');
  const { prismaAdapter } = await import('better-auth/adapters/prisma');

  const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: { enabled: true },
    advanced: { database: { generateId: false } },
  });

  const existing = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
  });

  const owner =
    existing ??
    (
      await auth.api.signUpEmail({
        body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Demo user' },
      })
    ).user;

  await prisma.user.update({
    where: { id: owner.id },
    data: { tenantId: DEMO_TENANT_ID },
  });

  await prisma.workout.createMany({
    data: workoutFactory(
      { ownerId: owner.id, tenantId: DEMO_TENANT_ID },
      { count: 3 },
    ) as unknown as Prisma.WorkoutCreateManyInput[],
  });

  console.log(
    `Seeded demo user ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}) with 3 workouts.`,
  );

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
