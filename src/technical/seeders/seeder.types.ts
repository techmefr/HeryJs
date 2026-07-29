export interface SeederContext {
  tenantId: string;
  ownerId: string;
}

export interface SeederOptions {
  count?: number;
}

export interface Seeder {
  name: string;
  description: string;
  defaultCount: number;
  maxCount: number;
  run(
    context: SeederContext,
    options?: SeederOptions,
  ): Promise<{ count: number }>;
}

export const SEEDERS = Symbol('SEEDERS');
