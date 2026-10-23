import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PublicRoute } from '#kernel/public/capabilities';
import {
  RateLimit,
  UnpaginatedRoute,
  ZodValidationPipe,
} from '#kernel/public/http';
import { SSO_LOGIN_HANDLER } from './sso-login.handler';
import type { SsoLoginHandler } from './sso-login.handler';
import { SsoLoginService } from './sso-login.service';
import { SsoRouterService } from './sso-router.service';
import { SsoSamlService } from './sso-saml.service';
import { SSO_STATE_COOKIE, SsoStateService } from './sso-state.service';
import { samlResponseSchema, startSignInQuerySchema } from './sso.dto';
import type { SamlResponseInput } from './sso.dto';

@Controller('sso')
export class SsoController {
  constructor(
    @Inject(SSO_LOGIN_HANDLER) private readonly handler: SsoLoginHandler,
    private readonly router: SsoRouterService,
    private readonly login: SsoLoginService,
    private readonly saml: SsoSamlService,
    private readonly states: SsoStateService,
  ) {}

  @UnpaginatedRoute(
    'a redirect to the tenant identity provider: it returns no collection',
  )
  @RateLimit('auth')
  @Get('start')
  @PublicRoute(
    'Starts a sign-in: there is no caller yet, the signed state cookie is what the callback checks',
  )
  async start(
    @Query(new ZodValidationPipe(startSignInQuerySchema))
    query: { email: string; returnTo?: string },
    @Res() res: Response,
  ): Promise<void> {
    const connection = await this.router.connectionFor(query.email);
    const isSaml = connection.protocol === 'saml';
    const redirect = isSaml
      ? await this.saml.begin(connection, query.returnTo)
      : await this.login.begin(connection, query.returnTo);

    res.cookie(
      SSO_STATE_COOKIE,
      redirect.cookieValue,
      this.states.cookieOptions(isSaml),
    );
    res.redirect(302, redirect.url);
  }

  @UnpaginatedRoute('the identity provider callback: it returns no collection')
  @RateLimit('auth')
  @Get('callback')
  @PublicRoute(
    'The identity provider redirects the browser here: the state cookie and the single-use code authenticate the request',
  )
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const cookieValue = this.states.cookieFrom(req.headers.cookie);

    res.clearCookie(SSO_STATE_COOKIE, this.states.cookieOptions());

    const result = await this.login.complete({
      code,
      state,
      providerError,
      cookieValue,
    });

    await this.handler.handle(result, res);
  }

  @RateLimit('auth')
  @Post('saml/acs')
  @PublicRoute(
    'The identity provider posts its assertion here: the signature, the state cookie and the id of the request it answers authenticate it',
  )
  async samlAcs(
    @Body(new ZodValidationPipe(samlResponseSchema)) body: SamlResponseInput,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const cookieValue = this.states.cookieFrom(req.headers.cookie);

    res.clearCookie(SSO_STATE_COOKIE, this.states.cookieOptions(true));

    const result = await this.saml.complete({
      samlResponse: body.SAMLResponse,
      relayState: body.RelayState,
      cookieValue,
    });

    await this.handler.handle(result, res);
  }
}
