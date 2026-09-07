import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Int,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { GraphqlModule } from '../src/runtime/graphql/graphql.module';

/**
 * This one boots the module for real instead of asserting on its metadata,
 * because what broke it was neither a type nor a shape: @nestjs/apollo loads
 * @as-integrations/express5 lazily, at the moment the driver attaches to
 * express. Dropping that dependency left every type checking, every lint
 * passing and the module dead on arrival -- the failure only exists once
 * something calls NestFactory.
 */
@ObjectType()
class ProbePost {
  @Field(() => ID)
  declare id: string;

  @Field()
  declare title: string;

  @Field(() => Int)
  declare views: number;
}

const POSTS: ProbePost[] = [
  { id: '1', title: 'alpha', views: 10 },
  { id: '2', title: 'beta', views: 20 },
];

@Resolver(() => ProbePost)
class ProbeResolver {
  @Query(() => [ProbePost])
  probePosts(@Args('search', { nullable: true }) search?: string): ProbePost[] {
    return search ? POSTS.filter((post) => post.title.includes(search)) : POSTS;
  }

  @Query(() => ProbePost, { nullable: true })
  probePost(@Args('id', { type: () => ID }) id: string): ProbePost | null {
    return POSTS.find((post) => post.id === id) ?? null;
  }
}

@Module({ imports: [GraphqlModule], providers: [ProbeResolver] })
class ProbeAppModule {}

interface GraphqlAnswer {
  status: number;
  body: {
    data?: Record<string, unknown>;
    errors?: { message: string }[];
  };
}

let app: INestApplication;
let url: string;

async function ask(
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphqlAnswer> {
  const response = await fetch(`${url}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  return {
    status: response.status,
    body: (await response.json()) as GraphqlAnswer['body'],
  };
}

beforeAll(async () => {
  app = await NestFactory.create(ProbeAppModule, { logger: false });
  // Port 0 so a developer running this next to a live app does not fight it
  // for a port, and so two of these can run at once on a CI runner.
  await app.listen(0);
  url = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

describe('the graphql module', () => {
  it('serves a query over http', async () => {
    const answer = await ask('{ probePosts { id title views } }');

    expect(answer.status).toBe(200);
    expect(answer.body.data).toEqual({
      probePosts: [
        { id: '1', title: 'alpha', views: 10 },
        { id: '2', title: 'beta', views: 20 },
      ],
    });
  });

  it('passes an inline argument to the resolver', async () => {
    const answer = await ask('{ probePosts(search: "alph") { id } }');

    expect(answer.body.data).toEqual({ probePosts: [{ id: '1' }] });
  });

  it('passes query variables to the resolver', async () => {
    const answer = await ask(
      'query ($id: ID!) { probePost(id: $id) { id title } }',
      { id: '2' },
    );

    expect(answer.body.data).toEqual({
      probePost: { id: '2', title: 'beta' },
    });
  });

  // autoSchemaFile: true means the schema is generated from the decorators at
  // boot rather than read from a file, so an empty or malformed schema is a
  // boot-time outcome worth asserting on.
  it('generates a schema from the resolvers it was given', async () => {
    const answer = await ask(
      '{ __schema { queryType { name } types { name } } }',
    );
    const schema = answer.body.data?.__schema as {
      queryType: { name: string };
      types: { name: string }[];
    };

    expect(schema.queryType.name).toBe('Query');
    expect(schema.types.map((type) => type.name)).toContain('ProbePost');
  });

  it('rejects a field the schema does not define', async () => {
    const answer = await ask('{ nope }');

    expect(answer.status).toBe(400);
    expect(answer.body.errors?.[0]?.message).toContain(
      'Cannot query field "nope"',
    );
  });
});
