import { Inject, Injectable } from '@nestjs/common';
import { SsoConnectionNotFoundException } from './sso-connection-not-found.exception';
import { SSO_CONNECTION_STORE } from './sso-connection.store';
import type { SsoConnectionStore } from './sso-connection.store';
import { SsoDiscoveryService } from './sso-discovery.service';
import { certificateExpiries } from './sso-saml-certificate';
import type { SsoConnectionRecord } from './sso.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 30;

export interface SsoCheck {
  name: string;
  isOk: boolean;
  detail: string;
}

export interface SsoConnectionTestView {
  id: string;
  name: string;
  protocol: string;
  isEnabled: boolean;
  isOk: boolean;
  checks: SsoCheck[];
}

/**
 * What an operator wants to know before telling a customer to sign in: is the
 * connection switched on, does a verified domain route to it, and can this
 * service still reach and trust the provider. Nothing here signs anyone in.
 */
@Injectable()
export class SsoConnectionTestService {
  constructor(
    @Inject(SSO_CONNECTION_STORE) private readonly store: SsoConnectionStore,
    private readonly discovery: SsoDiscoveryService,
  ) {}

  async test(tenantId: string, id: string): Promise<SsoConnectionTestView> {
    const record = await this.store.findInTenant(tenantId, id);

    if (!record) {
      throw new SsoConnectionNotFoundException();
    }

    return this.run(record);
  }

  async testAll(tenantId: string): Promise<SsoConnectionTestView[]> {
    const records = await this.store.listByTenant(tenantId);

    return Promise.all(records.map((record) => this.run(record)));
  }

  private async run(
    record: SsoConnectionRecord,
  ): Promise<SsoConnectionTestView> {
    const checks = [
      {
        name: 'enabled',
        isOk: record.isEnabled,
        detail: record.isEnabled ? 'Sign-in is on.' : 'The connection is off.',
      },
      this.domains(record),
      ...(record.protocol === 'saml'
        ? await this.saml(record)
        : [await this.oidc(record)]),
    ];

    return {
      id: record.id,
      name: record.name,
      protocol: record.protocol,
      isEnabled: record.isEnabled,
      isOk: checks.every((check) => check.isOk),
      checks,
    };
  }

  private domains(record: SsoConnectionRecord): SsoCheck {
    const verified = record.domains.filter((entry) => entry.verifiedAt);

    return {
      name: 'verified-domain',
      isOk: verified.length > 0,
      detail:
        verified.length > 0
          ? `Routes ${verified.map((entry) => entry.domain).join(', ')}.`
          : 'No domain is verified: nobody is routed to this connection.',
    };
  }

  private async oidc(record: SsoConnectionRecord): Promise<SsoCheck> {
    try {
      await this.discovery.discover(record.issuer);

      return {
        name: 'discovery',
        isOk: true,
        detail: 'The discovery document is reachable and trusted.',
      };
    } catch {
      return {
        name: 'discovery',
        isOk: false,
        detail: 'The discovery document could not be fetched or trusted.',
      };
    }
  }

  private async saml(record: SsoConnectionRecord): Promise<SsoCheck[]> {
    const expiries = record.samlCertificate
      ? certificateExpiries(record.samlCertificate)
      : [];
    const soonest = Math.min(...expiries.map((date) => date.getTime()));
    const days = Math.floor((soonest - Date.now()) / DAY_MS);
    const isCertificateOk = expiries.length > 0 && days >= 0;
    const isReachable = record.samlEntryPoint
      ? await this.discovery.isReachable(record.samlEntryPoint)
      : false;

    return [
      {
        name: 'certificate',
        isOk: isCertificateOk,
        detail: !isCertificateOk
          ? 'The signing certificate is missing or has expired.'
          : days < EXPIRY_WARNING_DAYS
            ? `The signing certificate expires in ${days} days: rotate it soon.`
            : `The signing certificate is valid for ${days} more days.`,
      },
      {
        name: 'entry-point',
        isOk: isReachable,
        detail: isReachable
          ? 'The sign-on URL answers.'
          : 'The sign-on URL did not answer, or is not an allowed address.',
      },
    ];
  }
}
