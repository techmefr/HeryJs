import { Inject, Injectable } from '@nestjs/common';
import { OAUTH_IDENTITY_STORE } from './oauth-identity.store';
import type {
  OAuthIdentityStore,
  OAuthLocalUser,
} from './oauth-identity.store';
import { OAuthRefusedException } from './oauth-refused.exception';
import { OAUTH_CONFIG } from './oauth.types';
import type {
  OAuthConfig,
  OAuthLoginResult,
  OAuthOutcome,
  OAuthProfile,
} from './oauth.types';

export interface OAuthResolveRequest {
  provider: string;
  profile: OAuthProfile;
  linkUserId: string | null;
  returnTo: string | null;
}

@Injectable()
export class OAuthAccountService {
  constructor(
    @Inject(OAUTH_CONFIG) private readonly config: OAuthConfig,
    @Inject(OAUTH_IDENTITY_STORE) private readonly store: OAuthIdentityStore,
  ) {}

  async resolve(request: OAuthResolveRequest): Promise<OAuthLoginResult> {
    const known = await this.resolveKnownIdentity(request);

    if (known) {
      return known;
    }

    if (request.linkUserId) {
      return this.linkToSignedInUser(request, request.linkUserId);
    }

    return this.resolveByEmail(request);
  }

  private async resolveKnownIdentity(
    request: OAuthResolveRequest,
  ): Promise<OAuthLoginResult | null> {
    const { provider, profile, linkUserId } = request;
    const userId = await this.store.findLinkedUserId(
      provider,
      profile.providerUserId,
    );

    if (!userId) {
      return null;
    }

    const user = await this.store.findUser(userId);

    if (!user) {
      await this.store.removeIdentity(provider, profile.providerUserId);
      return null;
    }

    if (linkUserId && linkUserId !== user.id) {
      throw new OAuthRefusedException('identity-linked-elsewhere');
    }

    this.assertNotBanned(user);

    return this.result(linkUserId ? 'linked' : 'signed-in', user.id, request);
  }

  private async linkToSignedInUser(
    request: OAuthResolveRequest,
    linkUserId: string,
  ): Promise<OAuthLoginResult> {
    if (this.config.linkPolicy === 'refuse') {
      throw new OAuthRefusedException('linking-disabled');
    }

    const user = await this.store.findUser(linkUserId);

    if (!user) {
      throw new OAuthRefusedException('invalid-state');
    }

    this.assertNotBanned(user);
    await this.link(request, user.id);

    return this.result('linked', user.id, request);
  }

  private async resolveByEmail(
    request: OAuthResolveRequest,
  ): Promise<OAuthLoginResult> {
    const { profile } = request;

    if (!profile.email) {
      throw new OAuthRefusedException('email-missing');
    }

    if (!profile.isEmailVerified) {
      throw new OAuthRefusedException('email-unverified');
    }

    const existing = await this.store.findUserByEmail(profile.email);

    if (existing) {
      return this.resolveCollision(request, existing);
    }

    if (!this.config.isSignUpAllowed) {
      throw new OAuthRefusedException('sign-up-disabled');
    }

    const created = await this.store.createUser({
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });

    if (!created) {
      throw new OAuthRefusedException('account-exists');
    }

    await this.link(request, created.id);

    return this.result('signed-up', created.id, request);
  }

  private async resolveCollision(
    request: OAuthResolveRequest,
    existing: OAuthLocalUser,
  ): Promise<OAuthLoginResult> {
    this.assertNotBanned(existing);

    const isAutoLinkable =
      this.config.linkPolicy === 'link-verified' && existing.isEmailVerified;

    if (!isAutoLinkable) {
      throw new OAuthRefusedException('account-exists');
    }

    await this.link(request, existing.id);

    return this.result('linked', existing.id, request);
  }

  private async link(
    request: OAuthResolveRequest,
    userId: string,
  ): Promise<void> {
    const { provider, profile } = request;
    const isLinked = await this.store.linkIdentity(
      provider,
      profile.providerUserId,
      userId,
      profile.email,
    );

    if (!isLinked) {
      throw new OAuthRefusedException('identity-linked-elsewhere');
    }
  }

  private assertNotBanned(user: OAuthLocalUser): void {
    if (user.isBanned) {
      throw new OAuthRefusedException('user-banned');
    }
  }

  private result(
    outcome: OAuthOutcome,
    userId: string,
    request: OAuthResolveRequest,
  ): OAuthLoginResult {
    return {
      outcome,
      userId,
      provider: request.provider,
      returnTo: request.returnTo,
    };
  }
}
