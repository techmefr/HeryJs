import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { getAuthContext } from '@heryjs/core/auth';
import { ok } from '@heryjs/core/http';
import type { SsoLoginResult } from './sso.types';

export const SSO_LOGIN_HANDLER = Symbol('SSO_LOGIN_HANDLER');

export interface SsoLoginHandler {
  handle(result: SsoLoginResult, response: Response): Promise<void> | void;
}

@Injectable()
export class SessionSsoLoginHandler implements SsoLoginHandler {
  async handle(result: SsoLoginResult, response: Response): Promise<void> {
    const { auth } = await getAuthContext();
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(result.userId);

    response.setHeader('cache-control', 'no-store');
    response.json(ok({ ...result, token: session.token }));
  }
}
