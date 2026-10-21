import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ok } from '#technical/http/envelope';
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
