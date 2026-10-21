import type { ResourceContext } from './resource-context';

export function vectorServiceImports(ctx: ResourceContext): string {
  return ctx.vector
    ? `\nimport { VectorSearchService } from '#technical/vector/vector-search.service';\nimport type { VectorMetric, VectorTarget } from '#technical/vector/vector-target';`
    : '';
}

export function vectorServiceConstants(ctx: ResourceContext): string {
  if (!ctx.vector) {
    return '';
  }

  return `
const VECTOR_TARGET: VectorTarget = {
  table: '${ctx.modelPascalName}',
  column: '${ctx.vector.name}',
  sourceColumn: '${ctx.vector.source}',
  dimensions: ${ctx.vector.dimensions},
  softDeletes: ${ctx.softDeletes},
};
`;
}

export function vectorSearchOptions(ctx: ResourceContext): string {
  return ctx.vector
    ? `  similar?: boolean;
  similarMetric?: VectorMetric;
`
    : '';
}

export function vectorConstructorParameter(ctx: ResourceContext): string {
  return ctx.vector
    ? `
    private readonly vectors: VectorSearchService,`
    : '';
}

export function vectorConstructorBody(ctx: ResourceContext): string {
  return ctx.vector
    ? `
    this.vectors.track(VECTOR_TARGET);
  `
    : '';
}

export function vectorSearchDispatch(ctx: ResourceContext): string {
  return ctx.vector
    ? `    if (options.similar) {
      return this.searchSimilar(subject, options);
    }

`
    : '';
}

export function vectorTextResult(ctx: ResourceContext): string {
  return ctx.vector
    ? 'return { records, total, matches, similar: null };'
    : 'return { records, total, matches };';
}

export function vectorSimilarMethod(ctx: ResourceContext): string {
  if (!ctx.vector) {
    return '';
  }

  const trashedWhere = ctx.softDeletes
    ? `    const trashedWhere = options.onlyTrashed
      ? { deletedAt: { not: null } }
      : options.withTrashed
        ? {}
        : { deletedAt: null };
`
    : '';

  const trash = ctx.softDeletes
    ? `options.onlyTrashed ? 'only' : options.withTrashed ? 'include' : 'exclude'`
    : `'absent'`;

  return `
  // Nearest-neighbour search never runs out of matches, so the ranking is
  // taken inside the database with the tenant, the view scope and the trash
  // state already in the query: a cut made before them would fill its window
  // with rows the caller may not see. What the ranking returns is a bounded
  // list of ids, re-read through the same scoped client every other read uses.
  private async searchSimilar(
    subject: CapabilitySubject,
    options: ${ctx.pascalName}SearchOptions,
  ) {
    const scope = scopeWhereFor(${ctx.screamingSnakeName}_PRESETS.view, subject);
${trashedWhere}    const matches = await this.vectors.similar(VECTOR_TARGET, {
      text: options.search ?? '',
      scope,
      trash: ${trash},
      metric: options.similarMetric,
    });

    const where = {
      AND: [
        scope,${ctx.softDeletes ? '\n        trashedWhere,' : ''}
        ...(options.where ? [options.where] : []),
        { id: { in: matches.ids } },
      ],
    };

    const found = await this.prisma.${ctx.modelCamelName}.findMany({
      where,
      include: options.include as Prisma.${ctx.modelPascalName}Include | undefined,
    });

    const rank = new Map(matches.ids.map((id, index) => [id, index]));
    const ranked = found.sort(
      (left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0),
    );

    const page = options.page ?? 1;
    const limit = options.limit ?? undefined;
    const records = limit
      ? ranked.slice((page - 1) * limit, page * limit)
      : ranked;

    await resolveRelationInstructions(
      this.prisma as unknown as PrismaRelationClient,
      records,
      options.relationInstructions,
    );

    return {
      records,
      total: ranked.length,
      matches: { limit: matches.limit, truncated: matches.truncated },
      similar: { metric: matches.metric },
    };
  }
`;
}

export function vectorSpecImports(ctx: ResourceContext): string {
  return ctx.vector
    ? `\nimport { EMBEDDER } from '#technical/embeddings/embedding-driver';`
    : '';
}

export function vectorSpecFixtures(ctx: ResourceContext): string {
  if (!ctx.vector) {
    return '';
  }

  return `
const VECTOR_DIMENSIONS = ${ctx.vector.dimensions};

function randomVector(): number[] {
  return Array.from({ length: VECTOR_DIMENSIONS }, () => Math.random() - 0.5);
}

function vectorLiteral(vector: number[]): string {
  return \`[\${vector.join(',')}]\`;
}

let queryVector: number[] = randomVector();
const embedderStub = {
  dimensions: VECTOR_DIMENSIONS,
  embedOne: () => Promise.resolve(queryVector),
};
`;
}

export function vectorSpecOverride(ctx: ResourceContext): string {
  return ctx.vector
    ? `\n      .overrideProvider(EMBEDDER)\n      .useValue(embedderStub)`
    : '';
}

export function vectorSpecTests(
  ctx: ResourceContext,
  createBody: string,
): string {
  if (!ctx.vector || ctx.permissions.view === 'none') {
    return '';
  }

  const isScoped =
    ctx.permissions.view === 'own' || ctx.permissions.view === 'team';
  const ranking = isScoped
    ? `    expect(ids[0]).toBe(nearId);
    expect(ids).not.toContain(strangerId);`
    : `    expect(ids.slice(0, 2).sort()).toEqual([nearId, strangerId].sort());`;

  return `
  it('ranks records by similarity inside the scope the caller may view', async () => {
    const create = async (token: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/${ctx.pluralKebabName}/create')
        .set('Authorization', \`Bearer \${token}\`)
        .send({ data: [${createBody}] })
        .expect(201);

      return (
        response.body as { data: { status: string; data: { id: string } }[] }
      ).data[0]!.data.id;
    };
    const embed = (id: string, vector: number[]) =>
      prisma.$executeRaw\`UPDATE "${ctx.modelPascalName}" SET "${ctx.vector.name}" = \${vectorLiteral(vector)}::vector WHERE "id" = \${id}\`;

    const nearId = await create(ownerToken);
    const farId = await create(ownerToken);
    const strangerId = await create(strangerToken);
    queryVector = randomVector();
    await embed(nearId, queryVector);
    await embed(farId, queryVector.map((value) => -value));
    await embed(strangerId, queryVector);

    const response = await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ search: { q: 'anything', mode: 'similar' } })
      .expect(200);

    const body = response.body as {
      data: { id: string }[];
      meta: { search: { mode: string; metric: string } };
    };
    const ids = body.data.map((record) => record.id);

${ranking}
    expect(body.meta.search).toMatchObject({ mode: 'similar', metric: 'cosine' });
  });

  it('refuses a similarity search that also names a text engine', async () => {
    await request(app.getHttpServer())
      .post('/${ctx.pluralKebabName}/search')
      .set('Authorization', \`Bearer \${ownerToken}\`)
      .send({ search: { q: 'anything', mode: 'similar', engine: 'prisma' } })
      .expect(400);
  });
`;
}
