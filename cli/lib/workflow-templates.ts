import { sampleValueFor } from './field-types';
import { pascalCase } from './naming';
import { shareAccess } from './resource-context';
import type { ResourceContext } from './resource-context';

type Workflow = NonNullable<ResourceContext['workflow']>;

function transitionsOf(ctx: ResourceContext): Workflow['transitions'] {
  return ctx.workflow?.transitions ?? [];
}

function literalList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

/** `can<Transition><Resource>`: one capability per transition, never shared. */
export function transitionCheckName(
  ctx: ResourceContext,
  transition: string,
): string {
  return `can${pascalCase(transition)}${ctx.pascalName}`;
}

export function workflowPresetsBlock(ctx: ResourceContext): string {
  if (!ctx.workflow) {
    return '';
  }

  return `
/**
 * Who may fire each transition, resolved per record like the four presets
 * above. Kept apart from them because it is keyed by the blueprint's own
 * transition names rather than by verb.
 */
export const ${ctx.screamingSnakeName}_TRANSITION_PRESETS = {
${transitionsOf(ctx)
  .map((transition) => `  ${transition.name}: '${transition.permission}',`)
  .join('\n')}
} as const satisfies Record<string, PermissionPreset>;
`;
}

export function workflowDtoBlock(ctx: ResourceContext): string {
  if (!ctx.workflow) {
    return '';
  }

  return `
// A transition is asked for by name, never by writing the state column: the
// service moves the row only along an edge the blueprint declared.
export const ${ctx.screamingSnakeName}_TRANSITIONS = [${literalList(transitionsOf(ctx).map((transition) => transition.name))}] as const;

export const transition${ctx.pascalName}RequestSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      transition: z.enum(${ctx.screamingSnakeName}_TRANSITIONS),
    }),
  ).max(MAX_BATCH_ENTRIES),
  atomic: z.boolean().default(false),
});
export type Transition${ctx.pascalName}RequestBody = z.infer<
  typeof transition${ctx.pascalName}RequestSchema
>;
`;
}

export function workflowPolicyBlock(ctx: ResourceContext): string {
  if (!ctx.workflow) {
    return '';
  }

  return `
${transitionsOf(ctx)
  .map(
    (
      transition,
    ) => `// Its own capability: being allowed to edit a ${ctx.camelName} does not make
// "${transition.name}" yours to fire. The preset comes from the blueprint's
// transition, not from update.${ctx.sharing && transition.shareable ? ' A write share opens it, as it opens update.' : ''}
export const ${transitionCheckName(ctx, transition.name)}: PolicyCheck<${ctx.pascalName}RecordLike> = (
  subject,
  record,
) => (record ? resolveCapability(${ctx.screamingSnakeName}_TRANSITION_PRESETS.${transition.name}, subject, record${transition.shareable ? shareAccess(ctx, 'write') : ''}) : { allowed: false });
`,
  )
  .join('\n')}
// The outer gate on the transition route: there is no single record yet, so
// this is the broad pass a reader of the resource takes, before each entry is
// checked against its own transition's capability.
export const canTransitionAny${ctx.pascalName}: PolicyCheck = (subject) =>
  resolveCollectionCapability(${ctx.screamingSnakeName}_PRESETS.view, subject);
`;
}

export function workflowCapabilityKeys(ctx: ResourceContext): string[] {
  return transitionsOf(ctx).map((transition) => transition.name);
}

export function workflowCapabilityLines(ctx: ResourceContext): string[] {
  return transitionsOf(ctx).map(
    (transition) =>
      `      ${transition.name}: ${transitionCheckName(ctx, transition.name)}(subject, record),`,
  );
}

export function workflowPolicyImports(ctx: ResourceContext): string {
  return ctx.workflow
    ? `${transitionsOf(ctx)
        .map(
          (transition) => `\n  ${transitionCheckName(ctx, transition.name)},`,
        )
        .join('')}\n  canTransitionAny${ctx.pascalName},`
    : '';
}

export function workflowDescribe(ctx: ResourceContext): string {
  const workflow = ctx.workflow;

  if (!workflow) {
    return '';
  }

  return `
  // The machine as data: a client draws one button per transition, enables it
  // from the record's own capability for that transition and from its current
  // state, and never encodes the edges itself.
  workflow: {
    field: '${workflow.field}',
    initial: '${workflow.initial}',
    states: [${literalList(workflow.states)}],
    transitions: [
${workflow.transitions
  .map(
    (transition) =>
      `      { name: '${transition.name}', from: [${literalList(transition.from)}], to: '${transition.to}', requires: [${literalList(transition.requires)}] },`,
  )
  .join('\n')}
    ],
  },`;
}

export function workflowServiceImports(ctx: ResourceContext): string {
  if (!ctx.workflow) {
    return '';
  }

  return `import { IllegalTransitionException } from '@heryjs/core/errors';
${ctx.versioned ? '' : `import { isLostRaceError } from '@heryjs/core/http';\n`}import { assertTransitionAllowed, recordTransition } from '@heryjs/core/resources';
import type { TransitionRule } from '@heryjs/core/resources';
`;
}

export function workflowServiceConstants(ctx: ResourceContext): string {
  const workflow = ctx.workflow;

  if (!workflow) {
    return '';
  }

  return `
export const ${ctx.screamingSnakeName}_WORKFLOW_FIELD = '${workflow.field}';
// The edges, as the blueprint declared them. The only way the state column
// changes is transition() reading this table.
export const ${ctx.screamingSnakeName}_TRANSITION_RULES = {
${workflow.transitions
  .map(
    (transition) =>
      `  ${transition.name}: { from: [${literalList(transition.from)}], to: '${transition.to}', requires: [${literalList(transition.requires)}] },`,
  )
  .join('\n')}
} as const satisfies Record<string, TransitionRule>;
export type ${ctx.pascalName}Transition = keyof typeof ${ctx.screamingSnakeName}_TRANSITION_RULES;`;
}

export function workflowServiceMethods(ctx: ResourceContext): string {
  const workflow = ctx.workflow;

  if (!workflow) {
    return '';
  }

  const rules = `${ctx.screamingSnakeName}_TRANSITION_RULES`;

  return `
  // Moves the record along one declared edge. The legality is checked first
  // (current state, then the guard), and the write repeats the state it read
  // in its own where clause, so two callers firing from the same state cannot
  // both succeed. The audit entry and the outbox event are written in the same
  // transaction as the new state.
  async transition(record: ${ctx.modelPascalName}, name: ${ctx.pascalName}Transition) {
    const rule = ${rules}[name];
    const current = record.${workflow.field};

    assertTransitionAllowed('${ctx.kebabName}', name, rule, record, current);

    try {
      const updated = await this.prisma.$atomic(async () => {
        const written = await this.prisma.${ctx.modelCamelName}.update({
          where: { id: record.id, ${workflow.field}: current },
          data: { ${workflow.field}: rule.to${ctx.versioned ? ', version: { increment: 1 }' : ''} },
        });
        const ambient = AmbientTransactionStorage.current();

        if (!ambient) {
          throw new Error('$atomic runs its callback inside a transaction');
        }

        await recordTransition(ambient.tx, {
          tenantId: record.tenantId,
          model: '${ctx.pascalName}',
          recordId: record.id,
          transition: name,
          from: current,
          to: rule.to,
        });

        return written;
      });
      this.notify();
      await this.syncSearchIndex(updated);
      return updated;
    } catch (error) {
      if (isLostRaceError(error)) {
        throw new IllegalTransitionException('${ctx.kebabName}', name, current, rule.from);
      }

      throw error;
    }
  }
`;
}

export function workflowControllerImports(ctx: ResourceContext): string {
  return ctx.workflow ? `  transition${ctx.pascalName}RequestSchema,\n` : '';
}

export function workflowControllerTypeImports(ctx: ResourceContext): string {
  return ctx.workflow ? `  Transition${ctx.pascalName}RequestBody,\n` : '';
}

export function workflowRoute(ctx: ResourceContext): string {
  const workflow = ctx.workflow;

  if (!workflow) {
    return '';
  }

  const checks = workflow.transitions
    .map(
      (transition) =>
        `    ${transition.name}: ${transitionCheckName(ctx, transition.name)},`,
    )
    .join('\n');

  return `
  // The only way the ${workflow.field} column changes. Each entry names a
  // transition; the outer capability is the broad pass, and the entry's own
  // transition capability is checked per record, so one request can carry
  // entries the caller may fire and entries it may not.
  @Post('transition')
  @Capability(canTransitionAny${ctx.pascalName})
  async transition(
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(transition${ctx.pascalName}RequestSchema))
    body: Transition${ctx.pascalName}RequestBody,
  ) {
    const subject = subjectOf(req.user);
    const checks = {
${checks}
    } as const;
    const loaded = await this.loadAndAuthorize(
      body.data.map((item) => item.id),
      subject,
      () => ({ allowed: true }),
    );

    const entries = loaded.map((entry, index): BatchEntry<${ctx.pascalName}View> => {
      if (!entry.ok) {
        return { index, id: entry.id, failure: entry.error };
      }

      const { transition } = body.data[index]!;
      const decision = checks[transition](subject, entry.record);

      if (!decision.allowed) {
        return {
          index,
          id: entry.id,
          failure: resolveDomainError(new CapabilityForbiddenException(decision)),
        };
      }

      return {
        index,
        id: entry.id,
        run: async () => {
          return to${ctx.pascalName}View(await this.${ctx.camelName}s.transition(entry.record, transition));
        },
      };
    });

    const { results, meta } = await this.runBatch(entries, body.atomic);

    return ok(results, meta);
  }
`;
}

function createBodyWithGuards(
  ctx: ResourceContext,
  createBody: string,
): string {
  const required = new Set(
    ctx.fields.filter((field) => !field.optional).map((field) => field.name),
  );
  const extra = ctx.fields.filter(
    (field) =>
      !required.has(field.name) &&
      transitionsOf(ctx).some((transition) =>
        transition.requires.includes(field.name),
      ),
  );

  if (extra.length === 0) {
    return createBody;
  }

  const existing = createBody === '{}' ? '' : `${createBody.slice(2, -2)}, `;

  return `{ ${existing}${extra.map((field) => `${field.name}: ${sampleValueFor(field)}`).join(', ')} }`;
}

export function workflowSpecBlock(
  ctx: ResourceContext,
  createBody: string,
): string {
  const workflow = ctx.workflow;

  if (!workflow) {
    return '';
  }

  const base = `/${ctx.routePath}`;
  const body = createBodyWithGuards(ctx, createBody);
  const first = workflow.transitions.find((transition) =>
    transition.from.includes(workflow.initial),
  );
  const versionPart = ctx.versioned ? ', version: 1' : '';
  const create = (
    payload: string,
  ): string => `      const created = await request(app.getHttpServer())
        .post('${base}/create')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ data: [${payload}] })
        .expect(201);

      const recordId = (
        created.body as { data: { status: string; data: { id: string; ${workflow.field}: string } }[] }
      ).data[0]!.data.id;
`;
  const fire = (
    transition: string,
    token: string,
    extra = '',
  ): string => `await request(app.getHttpServer())
        .post('${base}/transition')
        .set('Authorization', \`Bearer \${${token}}\`)
        .send({ data: [{ id: recordId, transition: '${transition}'${extra} }] })
        .expect(201)`;
  const outcome = `(response.body as { data: { status: string; data?: Record<string, unknown>; error?: { status: number; key: string } }[] }).data[0]!`;

  const blocks: string[] = [
    `    it('starts in the initial state and publishes the machine in describe', async () => {
${create(createBody)}
      expect(created.body).toMatchObject({ data: [{ data: { ${workflow.field}: '${workflow.initial}' } }] });

      const described = await request(app.getHttpServer())
        .get('${base}/describe')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .expect(200);

      expect(
        (described.body as { data: { workflow: { transitions: { name: string }[] } } }).data.workflow.transitions.map((item) => item.name),
      ).toEqual([${literalList(workflow.transitions.map((transition) => transition.name))}]);
      expect(recordId).toBeTruthy();
    });`,
    ...(ctx.permissions.update === 'none'
      ? []
      : [
          `    it('ignores a client that writes the state column directly', async () => {
${create(createBody)}
      const response = await request(app.getHttpServer())
        .post('${base}/update')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ data: [{ id: recordId${versionPart}, ${workflow.field}: '${workflow.states.at(-1)}' }] })
        .expect(201);

      expect(
        (response.body as { data: { data: Record<string, unknown> }[] }).data[0]!.data.${workflow.field},
      ).toBe('${workflow.initial}');
    });`,
        ]),
    `    it('refuses a transition nobody declared', async () => {
${create(createBody)}
      await request(app.getHttpServer())
        .post('${base}/transition')
        .set('Authorization', \`Bearer \${ownerToken}\`)
        .send({ data: [{ id: recordId, transition: 'not-a-transition' }] })
        .expect(400);
    });`,
  ];

  if (first) {
    const allowed = first.permission !== 'none';

    blocks.push(
      allowed
        ? `    it('moves along a declared edge and stores the new state', async () => {
${create(body)}
      const response = ${fire(first.name, 'ownerToken')};

      expect(${outcome}).toMatchObject({ status: 'ok', data: { ${workflow.field}: '${first.to}' } });
    });`
        : `    it('refuses a transition whose permission is none, even to the owner', async () => {
${create(body)}
      const response = ${fire(first.name, 'ownerToken')};

      expect(${outcome}).toMatchObject({ status: 'error', error: { status: 403 } });
    });`,
    );

    if (allowed && first.permission !== 'all') {
      blocks.push(`    it('refuses the transition to someone the capability does not cover', async () => {
${create(body)}
      const response = ${fire(first.name, 'strangerToken')};

      expect(${outcome}).toMatchObject({ status: 'error', error: { status: 403 } });
    });`);
    }

    if (allowed && !first.from.includes(first.to)) {
      blocks.push(`    it('refuses an illegal transition with a typed error', async () => {
${create(body)}
      ${fire(first.name, 'ownerToken')};
      const response = ${fire(first.name, 'ownerToken')};

      expect(${outcome}).toMatchObject({
        status: 'error',
        error: { status: 409, key: '${ctx.kebabName}.illegalTransition' },
      });
    });`);
    }
  }

  const guarded = workflow.transitions.find(
    (transition) =>
      transition.permission !== 'none' &&
      transition.from.includes(workflow.initial) &&
      transition.requires.some((name) =>
        ctx.fields.some((field) => field.name === name && field.optional),
      ),
  );

  if (guarded) {
    blocks.push(`    it('refuses a transition whose guard is not met', async () => {
${create(createBody)}
      const response = ${fire(guarded.name, 'ownerToken')};

      expect(${outcome}).toMatchObject({
        status: 'error',
        error: { status: 422, key: '${ctx.kebabName}.transitionGuard' },
      });
    });`);
  }

  return `  describe('workflow', () => {
${blocks.join('\n\n')}
  });
`;
}
