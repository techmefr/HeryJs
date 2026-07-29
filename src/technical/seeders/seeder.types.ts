export interface SeederContext {
  tenantId: string;
  ownerId: string;
}

export interface Seeder {
  name: string;
  description: string;
  run(context: SeederContext): Promise<{ count: number }>;
}

export const SEEDERS = Symbol('SEEDERS');
