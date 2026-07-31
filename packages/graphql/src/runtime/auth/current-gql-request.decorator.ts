import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GqlRequestWithUser } from './gql-session.guard';

export const CurrentGqlRequest = createParamDecorator(
  (_: unknown, context: ExecutionContext): GqlRequestWithUser =>
    GqlExecutionContext.create(context).getContext<{
      req: GqlRequestWithUser;
    }>().req,
);
