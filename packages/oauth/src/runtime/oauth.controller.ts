import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CapabilitiesGuard } from '#kernel/capabilities/capabilities.guard';
import { Capability } from '#kernel/capabilities/capability.decorator';
import { PublicRoute } from '#kernel/capabilities/public-route.decorator';
import { RateLimit } from '#kernel/rate-limit/rate-limit.decorator';
import { UnpaginatedRoute } from '#kernel/http/unpaginated-route.decorator';
import { SessionGuard } from '#kernel/auth/session.guard';
import type { RequestWithUser } from '#kernel/auth/session.guard';
import { ok } from '#kernel/http/envelope';
import { OAuthAccountService } from './oauth-account.service';
import { OAUTH_LOGIN_HANDLER } from './oauth-login.handler';
import type { OAuthLoginHandler } from './oauth-login.handler';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import { OAuthRefusedException } from './oauth-refused.exception';
import { sanitizeReturnTo } from './oauth-return-to';
import { OAUTH_REPLAY_GUARD } from './oauth-replay.guard';
import type { OAuthReplayGuard } from './oauth-replay.guard';
import {
  OAUTH_COOKIE_PATH,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  OAuthStateService,
} from './oauth-state.service';
import { canLinkOAuthIdentity } from './oauth.policy';
import { OAUTH_CONFIG } from './oauth.types';
import type { OAuthConfig, OAuthProvider } from './oauth.types';

@Controller('oauth')
export class OAuthController {
  constructor(
    @Inject(OAUTH_CONFIG) private readonly config: OAuthConfig,
    @Inject(OAUTH_LOGIN_HANDLER) private readonly handler: OAuthLoginHandler,
    @Inject(OAUTH_REPLAY_GUARD) private readonly replayGuard: OAuthReplayGuard,
    private readonly providers: OAuthProviderRegistry,
    private readonly states: OAuthStateService,
    private readonly accounts: OAuthAccountService,
  ) {}

  @UnpaginatedRoute('a redirect to the provider: it returns no collection')
  @RateLimit('auth')
  @Get(':provider/redirect')
  @PublicRoute(
    'Starts a sign-in: there is no caller yet, the signed state cookie is what the callback checks',
  )
  redirect(
    @Param('provider') providerName: string,
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: Response,
  ): void {
    const url = this.begin(providerName, null, returnTo, res);

    res.redirect(302, url);
  }

  @RateLimit('auth')
  @Post(':provider/link')
  @UseGuards(SessionGuard, CapabilitiesGuard)
  @Capability(canLinkOAuthIdentity)
  link(
    @Param('provider') providerName: string,
    @Query('returnTo') returnTo: string | undefined,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (this.config.linkPolicy === 'refuse') {
      throw new OAuthRefusedException('linking-disabled');
    }

    const url = this.begin(providerName, req.user.id, returnTo, res);

    return ok({ url });
  }

  @UnpaginatedRoute('the provider callback: it returns no collection')
  @RateLimit('auth')
  @Get(':provider/callback')
  @PublicRoute(
    'The provider redirects the browser here: the state cookie and the single-use code authenticate the request',
  )
  async callback(
    @Param('provider') providerName: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const cookieValue = this.states.cookieFrom(req.headers.cookie);

    this.clearStateCookie(res);

    if (providerError) {
      throw new OAuthRefusedException('access-denied');
    }

    const provider = this.providers.get(providerName);
    const payload = this.states.verify(
      cookieValue,
      providerName,
      state ?? null,
    );
    const isFresh = await this.replayGuard.consume(
      payload.state,
      OAUTH_STATE_TTL_SECONDS,
    );

    if (!isFresh || !code) {
      throw new OAuthRefusedException('invalid-state');
    }

    const profile = await provider.fetchProfile({
      code,
      codeVerifier: payload.codeVerifier,
      nonce: payload.nonce,
      redirectUri: this.redirectUri(providerName),
    });

    const result = await this.accounts.resolve({
      provider: providerName,
      profile,
      linkUserId: payload.linkUserId,
      returnTo: sanitizeReturnTo(payload.returnTo ?? undefined),
    });

    await this.handler.handle(result, res);
  }

  private begin(
    providerName: string,
    linkUserId: string | null,
    returnTo: string | undefined,
    res: Response,
  ): string {
    const provider: OAuthProvider = this.providers.get(providerName);
    const started = this.states.start({
      provider: providerName,
      returnTo: sanitizeReturnTo(returnTo),
      linkUserId,
    });

    res.cookie(OAUTH_STATE_COOKIE, started.cookieValue, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.isProduction,
      path: OAUTH_COOKIE_PATH,
      maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
    });

    return provider.authorizationUrl({
      state: started.state,
      nonce: started.nonce,
      codeChallenge: started.codeChallenge,
      redirectUri: this.redirectUri(providerName),
    });
  }

  private clearStateCookie(res: Response): void {
    res.clearCookie(OAUTH_STATE_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.isProduction,
      path: OAUTH_COOKIE_PATH,
    });
  }

  private redirectUri(providerName: string): string {
    const base = (this.config.redirectBaseUrl ?? '').replace(/\/+$/, '');

    return `${base}/oauth/${providerName}/callback`;
  }
}
