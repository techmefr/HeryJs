import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { getAuthContext } from '@heryjs/core/auth';
import { ok } from '@heryjs/core/http';
import type { OAuthLoginResult } from './oauth.types';

export const OAUTH_LOGIN_HANDLER = Symbol('OAUTH_LOGIN_HANDLER');

export interface OAuthLoginHandler {
  handle(result: OAuthLoginResult, response: Response): Promise<void> | void;
}

@Injectable()
export class JsonOAuthLoginHandler implements OAuthLoginHandler {
  handle(result: OAuthLoginResult, response: Response): void {
    response.json(ok(result));
  }
}

@Injectable()
export class SessionOAuthLoginHandler implements OAuthLoginHandler {
  async handle(result: OAuthLoginResult, response: Response): Promise<void> {
    const { auth } = await getAuthContext();
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(result.userId);

    response.setHeader('cache-control', 'no-store');
    response.json(ok({ ...result, token: session.token }));
  }
}
