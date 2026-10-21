import type { ResolvedInclude } from './blueprint';
import type { ResourceContext } from './resource-context';
import {
  operationPrefixOf,
  ownRouteIncludes,
  pascalOf,
  typeNameOf,
} from './openapi-contract';
import {
  batchOutcomeSchema,
  childQuery,
  envelope,
  pageMeta,
  ref,
  updateOutcomeData,
} from './openapi-schemas';
import type { JsonSchema } from './openapi-schemas';

type PathItems = Record<string, JsonSchema>;

const JSON_CONTENT = 'application/json';

function body(schemaName: string): JsonSchema {
  return {
    required: true,
    content: { [JSON_CONTENT]: { schema: ref(schemaName) } },
  };
}

function response(description: string, schema: JsonSchema): JsonSchema {
  return { description, content: { [JSON_CONTENT]: { schema } } };
}

function errorResponses(): Record<string, JsonSchema> {
  const error = (description: string): JsonSchema =>
    response(description, ref('ErrorResponse'));

  return {
    '400': error(
      'The request body failed validation, or named a field the contract does not allow',
    ),
    '401': error('No valid bearer token'),
    '403': error('The caller lacks the capability this route is gated by'),
  };
}

function operation(
  ctx: ResourceContext,
  verb: string,
  summary: string,
  extra: JsonSchema,
): JsonSchema {
  return {
    tags: [typeNameOf(ctx)],
    operationId: `${operationPrefixOf(ctx)}${verb}`,
    summary,
    security: [{ bearerAuth: [] }],
    ...extra,
  };
}

function mutation(
  ctx: ResourceContext,
  verb: string,
  summary: string,
  requestName: string,
  data: JsonSchema,
  withId: boolean,
): JsonSchema {
  return {
    post: operation(ctx, verb, summary, {
      requestBody: body(requestName),
      responses: {
        '201': response(
          'One outcome per submitted entry, in the same order. A failed entry carries its own error and does not fail the others.',
          envelope(batchOutcomeSchema(data, withId)),
        ),
        ...errorResponses(),
      },
    }),
  };
}

function childPath(ctx: ResourceContext, include: ResolvedInclude): JsonSchema {
  const query = childQuery(ctx, include);

  return {
    post: operation(
      ctx,
      `Search${pascalOf(include.relation)}`,
      `Search a ${ctx.pascalName}'s ${include.relation}`,
      {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: body(`${query.name}SearchRequest`),
        responses: {
          '200': response(
            "A page of the relation's rows",
            envelope(
              { type: 'array', items: ref(`${query.name}Row`) },
              pageMeta(include.pagination, false),
            ),
          ),
          ...errorResponses(),
        },
      },
    ),
  };
}

export function pathsFor(ctx: ResourceContext): PathItems {
  const base = `/${ctx.routePath}`;
  const name = typeNameOf(ctx);
  const paths: PathItems = {
    [`${base}/search`]: {
      post: operation(ctx, 'Search', `Search ${ctx.pluralCamelName}`, {
        requestBody: body(`${name}SearchRequest`),
        responses: {
          '200': response(
            'The matching records',
            envelope(
              { type: 'array', items: ref(`${name}SearchHit`) },
              pageMeta(ctx.pagination, true),
            ),
          ),
          ...errorResponses(),
        },
      }),
    },
    [`${base}/create`]: mutation(
      ctx,
      'Create',
      `Create ${ctx.pluralCamelName}`,
      `${name}CreateRequest`,
      ref(name),
      false,
    ),
    [`${base}/update`]: mutation(
      ctx,
      'Update',
      `Update ${ctx.pluralCamelName}`,
      `${name}UpdateRequest`,
      updateOutcomeData(ctx),
      true,
    ),
    [`${base}/delete`]: mutation(
      ctx,
      'Delete',
      `Delete ${ctx.pluralCamelName}`,
      `${name}DeleteRequest`,
      ctx.softDeletes
        ? { oneOf: [ref(name), { type: 'null' }] }
        : { type: 'null' },
      true,
    ),
    [`${base}/describe`]: {
      get: operation(
        ctx,
        'Describe',
        `Describe the ${ctx.pascalName} contract`,
        {
          responses: {
            '200': response(
              'The contract this resource publishes',
              envelope(ref(`${name}Describe`)),
            ),
            '401': response('No valid bearer token', ref('ErrorResponse')),
            '403': response(
              'The caller lacks the capability this route is gated by',
              ref('ErrorResponse'),
            ),
          },
        },
      ),
    },
  };

  if (ctx.softDeletes) {
    paths[`${base}/restore`] = mutation(
      ctx,
      'Restore',
      `Restore soft-deleted ${ctx.pluralCamelName}`,
      `${name}RestoreRequest`,
      ref(name),
      true,
    );
  }

  for (const include of ownRouteIncludes(ctx)) {
    paths[`${base}/{id}/${include.relation}/search`] = childPath(ctx, include);
  }

  return paths;
}
