import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Mailable } from '#technical/mail/mail-driver';

/**
 * How the notifier reaches mail without importing it. `notifier` may not
 * import `mail` directly (`.dependency-cruiser.cjs`, `no-cross-module-imports`
 * -- a module reaching another breaks the day only one of them is
 * uninstalled), so it depends on a contract here instead and finds its
 * implementation by token at runtime, the same answer the kernel's own
 * `AUTH_MAILER` gives to the identical problem one layer up.
 */
export const NOTIFIER_MAIL_CHANNEL = Symbol.for('heryjs:notifier-mail-channel');

export interface NotifierMailChannel {
  send(mailable: Mailable): Promise<void>;
}

let channel: NotifierMailChannel | null = null;

export function setNotifierMailChannel(
  resolved: NotifierMailChannel | null,
): void {
  channel = resolved;
}

/** `null` when mail is not installed -- the caller decides what that means. */
export function notifierMailChannel(): NotifierMailChannel | null {
  return channel;
}

/**
 * Resolution runs in onModuleInit, never in the constructor: the provider
 * that binds NOTIFIER_MAIL_CHANNEL lives outside this module's import graph,
 * so `strict: false` only finds it once every provider is instantiated.
 */
@Injectable()
export class NotifierMailChannelResolver implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    try {
      setNotifierMailChannel(
        this.moduleRef.get<NotifierMailChannel>(NOTIFIER_MAIL_CHANNEL, {
          strict: false,
        }),
      );
    } catch {
      setNotifierMailChannel(null);
    }
  }
}
