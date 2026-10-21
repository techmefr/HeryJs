import { resolveTxt } from 'node:dns/promises';
import { Inject, Injectable } from '@nestjs/common';
import { ssoEnv } from './sso.env';

export type SsoTxtResolver = (name: string) => Promise<string[]>;

export const SSO_TXT_RESOLVER = Symbol('SSO_TXT_RESOLVER');

export const systemTxtResolver: SsoTxtResolver = async (name) => {
  const records = await resolveTxt(name);

  return records.map((chunks) => chunks.join(''));
};

export function verificationRecordName(domain: string): string {
  return `${ssoEnv.SSO_DNS_TXT_PREFIX}.${domain}`;
}

export function verificationRecordValue(token: string): string {
  return `hery-sso-verification=${token}`;
}

@Injectable()
export class SsoDomainVerifier {
  constructor(
    @Inject(SSO_TXT_RESOLVER) private readonly resolve: SsoTxtResolver,
  ) {}

  async isProven(domain: string, token: string): Promise<boolean> {
    try {
      const records = await this.resolve(verificationRecordName(domain));

      return records.includes(verificationRecordValue(token));
    } catch {
      return false;
    }
  }
}
