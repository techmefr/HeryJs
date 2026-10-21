import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ScimException } from './scim.exception';
import { SCIM_CONTENT_TYPE } from './scim.types';
import type { ScimCaller } from './scim.types';
import { ScimTokenService } from './scim-token.service';

export interface ScimRequest extends Request {
  scim: ScimCaller;
}

@Injectable()
export class ScimTokenGuard implements CanActivate {
  constructor(private readonly tokens: ScimTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<ScimRequest>();

    http.getResponse<Response>().type(SCIM_CONTENT_TYPE);

    const caller = await this.tokens.authenticate(
      request.headers.authorization,
    );

    if (!caller) {
      throw ScimException.unauthorized();
    }

    request.scim = caller;

    return true;
  }
}
