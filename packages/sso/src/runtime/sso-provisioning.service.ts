import { Inject, Injectable } from '@nestjs/common';
import { SsoRefusedException } from './sso-refused.exception';
import { SSO_IDENTITY_STORE } from './sso-identity.store';
import type { SsoIdentityStore, SsoLocalUser } from './sso-identity.store';
import type {
  SsoConnectionRecord,
  SsoLoginResult,
  SsoOutcome,
  SsoProfile,
} from './sso.types';

@Injectable()
export class SsoProvisioningService {
  constructor(
    @Inject(SSO_IDENTITY_STORE) private readonly store: SsoIdentityStore,
  ) {}

  async resolve(
    connection: SsoConnectionRecord,
    profile: SsoProfile,
    returnTo: string | null,
  ): Promise<SsoLoginResult> {
    const known = await this.resolveKnownIdentity(connection, profile);

    if (known) {
      return this.result('signed-in', known, connection, returnTo);
    }

    const existing = await this.store.findUserByEmail(profile.email);

    if (existing) {
      return this.resolveCollision(connection, profile, existing, returnTo);
    }

    const created = await this.store.createUser({
      tenantId: connection.tenantId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });

    if (!created) {
      throw new SsoRefusedException('account-exists');
    }

    await this.link(connection, profile, created.id);

    return this.result('signed-up', created, connection, returnTo);
  }

  private async resolveKnownIdentity(
    connection: SsoConnectionRecord,
    profile: SsoProfile,
  ): Promise<SsoLocalUser | null> {
    const userId = await this.store.findLinkedUserId(
      connection.id,
      profile.subject,
    );

    if (!userId) {
      return null;
    }

    const user = await this.store.findUser(userId);

    if (!user) {
      await this.store.removeIdentity(connection.id, profile.subject);
      return null;
    }

    this.assertSignInAllowed(user, connection);

    return user;
  }

  private async resolveCollision(
    connection: SsoConnectionRecord,
    profile: SsoProfile,
    existing: SsoLocalUser,
    returnTo: string | null,
  ): Promise<SsoLoginResult> {
    this.assertSignInAllowed(existing, connection);

    const isLinkable =
      connection.linkPolicy === 'link-verified' && existing.isEmailVerified;

    if (!isLinkable) {
      throw new SsoRefusedException('account-exists');
    }

    await this.link(connection, profile, existing.id);

    return this.result('linked', existing, connection, returnTo);
  }

  private async link(
    connection: SsoConnectionRecord,
    profile: SsoProfile,
    userId: string,
  ): Promise<void> {
    const isLinked = await this.store.linkIdentity(
      connection.tenantId,
      connection.id,
      profile.subject,
      userId,
    );

    if (!isLinked) {
      throw new SsoRefusedException('identity-linked-elsewhere');
    }
  }

  private assertSignInAllowed(
    user: SsoLocalUser,
    connection: SsoConnectionRecord,
  ): void {
    if (user.tenantId !== connection.tenantId) {
      throw new SsoRefusedException('account-exists');
    }

    if (user.isBanned) {
      throw new SsoRefusedException('user-banned');
    }
  }

  private result(
    outcome: SsoOutcome,
    user: SsoLocalUser,
    connection: SsoConnectionRecord,
    returnTo: string | null,
  ): SsoLoginResult {
    return {
      outcome,
      userId: user.id,
      tenantId: connection.tenantId,
      connectionId: connection.id,
      returnTo,
    };
  }
}
