/**
 * A model registry is a kernel `Set` of Prisma model names -- TENANT_SCOPED_MODELS,
 * AUDITED_MODELS -- read and rewritten by the generator, the scaffolder and the
 * convention checks alike. One shape, declared here once: three copies of the
 * marker meant annotating a Set silently blinded a check that had been reading
 * it by pattern.
 *
 * The element type is part of the shape. `hery new` strips the demo's models
 * out, and a registry that named only those comes out empty -- inferred, that
 * is a `Set<never>` no `.has(model)` compiles against.
 */
export function modelSetMarker(setName: string): string {
  return `const ${setName} = new Set<string>([`;
}

export function modelSetPattern(setName: string): RegExp {
  return new RegExp(`const ${setName} = new Set<string>\\(\\[([^\\]]*)\\]\\)`);
}

/**
 * Every registry, and whether `hery new` empties it of the demo's models.
 * Read by the check that holds them all to the shape above -- a registry
 * declared any other way is one the tooling stops seeing, without saying so.
 */
export const MODEL_REGISTRIES = [
  {
    file: 'src/technical/prisma/prisma.client.ts',
    set: 'TENANT_SCOPED_MODELS',
    stripped: true,
  },
  {
    file: 'src/technical/prisma/prisma.client.ts',
    set: 'TENANT_FREE_MODELS',
    stripped: false,
  },
  {
    file: 'src/technical/prisma/prisma.client.ts',
    set: 'APP_ENFORCED_TENANT_MODELS',
    stripped: false,
  },
  {
    file: 'src/technical/audit/audit-log.ts',
    set: 'AUDITED_MODELS',
    stripped: true,
  },
] as const;
