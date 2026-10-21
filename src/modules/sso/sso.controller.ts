import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PublicRoute } from '#technical/capabilities/public-route.decorator';
import { UnpaginatedRoute } from '#technical/http/unpaginated-route.decorator';
import { RateLimit } from '#technical/rate-limit/rate-limit.decorator';
import { ZodValidationPipe } from '#technical/validation/zod-validation.pipe';
import { SSO_LOGIN_HANDLER } from './sso-login.handler';
import type { SsoLoginHandler } from './sso-login.handler';
import { SsoLoginService } from './sso-login.service';
import { SsoRouterService } from './sso-router.service';
import { SSO_STATE_COOKIE, SsoStateService } from './sso-state.service';
import { startSignInQuerySchema } from './sso.dto';

@Controller('sso')
export class SsoController {
  constructor(
    @Inject(SSO_LOGIN_HANDLER) private readonly handler: SsoLoginHandler,
    private readonly router: SsoRouterService,
    private readonly login: SsoLoginService,
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
    const redirect = await this.login.begin(connection, query.returnTo);

    res.cookie(
      SSO_STATE_COOKIE,
      redirect.cookieValue,
      this.states.cookieOptions(),
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
}
