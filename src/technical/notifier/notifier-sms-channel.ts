import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { SmsMessage } from '#technical/sms/sms-driver';

/**
 * The sms half of how the notifier reaches a module it may not import -- see
 * `notifier-mail-channel.ts` for the full reasoning, shared here rather than
 * repeated.
 *
 * Two contracts, not one: `NotifierSmsChannel` sends, `NotifierSmsConsent`
 * only reads. The notifier resolves consent itself before ever calling
 * `send`, since a notification is neither the sms guard's `transactional` nor
 * its `marketing` -- so consent has to stop being a concept only the sms
 * module's own guard enforces.
 */
export const NOTIFIER_SMS_CHANNEL = Symbol.for('heryjs:notifier-sms-channel');
export const NOTIFIER_SMS_CONSENT = Symbol.for('heryjs:notifier-sms-consent');

export interface NotifierSmsChannel {
  send(message: SmsMessage): Promise<void>;
}

export interface NotifierSmsConsentDecision {
  granted: boolean;
}

export interface NotifierSmsConsent {
  decisionFor(phone: string): Promise<NotifierSmsConsentDecision>;
}

let channel: NotifierSmsChannel | null = null;
let consent: NotifierSmsConsent | null = null;

export function setNotifierSmsChannel(
  resolved: NotifierSmsChannel | null,
): void {
  channel = resolved;
}

export function notifierSmsChannel(): NotifierSmsChannel | null {
  return channel;
}

export function setNotifierSmsConsent(
  resolved: NotifierSmsConsent | null,
): void {
  consent = resolved;
}

export function notifierSmsConsent(): NotifierSmsConsent | null {
  return consent;
}

/**
 * One resolver for both tokens: they are only ever meaningful together, since
 * a channel nothing can consult for consent is not one the notifier can use
 * safely on its own.
 */
@Injectable()
export class NotifierSmsChannelResolver implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    setNotifierSmsChannel(
      this.resolve<NotifierSmsChannel>(NOTIFIER_SMS_CHANNEL),
    );
    setNotifierSmsConsent(
      this.resolve<NotifierSmsConsent>(NOTIFIER_SMS_CONSENT),
    );
  }

  private resolve<T>(token: symbol): T | null {
    try {
      return this.moduleRef.get<T>(token, { strict: false });
    } catch {
      return null;
    }
  }
}
