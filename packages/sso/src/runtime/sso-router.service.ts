import { Inject, Injectable } from '@nestjs/common';
import { SSO_CONNECTION_STORE } from './sso-connection.store';
import type { SsoConnectionStore } from './sso-connection.store';
import { domainOfEmail } from './sso-domain';
import { SsoRefusedException } from './sso-refused.exception';
import type { SsoConnectionRecord } from './sso.types';

@Injectable()
export class SsoRouterService {
  constructor(
    @Inject(SSO_CONNECTION_STORE) private readonly store: SsoConnectionStore,
  ) {}

  async connectionFor(email: string): Promise<SsoConnectionRecord> {
    const domain = domainOfEmail(email);

    if (!domain) {
      throw new SsoRefusedException('no-connection');
    }

    const connection = await this.store.findByVerifiedDomain(domain);

    if (!connection) {
      throw new SsoRefusedException('no-connection');
    }

    if (!connection.isEnabled) {
      throw new SsoRefusedException('connection-disabled');
    }

    return connection;
  }
}
