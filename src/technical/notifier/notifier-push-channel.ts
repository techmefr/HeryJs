import { Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { PushMessage } from '#technical/push/push-driver';

/**
 * The push half of how the notifier reaches a module it may not import -- see
 * `notifier-mail-channel.ts` for the full reasoning.
 */
export const NOTIFIER_PUSH_CHANNEL = Symbol.for('heryjs:notifier-push-channel');

export interface NotifierPushDelivery {
  sent: number;
  expired: number;
  failed: number;
}

export interface NotifierPushChannel {
  sendToUser(
    userId: string,
    message: PushMessage,
  ): Promise<NotifierPushDelivery>;
}

let channel: NotifierPushChannel | null = null;

export function setNotifierPushChannel(
  resolved: NotifierPushChannel | null,
): void {
  channel = resolved;
}

export function notifierPushChannel(): NotifierPushChannel | null {
  return channel;
}

/**
 * Resolution runs in onModuleInit, never in the constructor -- see
 * `notifier-mail-channel.ts`.
 */
@Injectable()
export class NotifierPushChannelResolver implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    try {
      setNotifierPushChannel(
        this.moduleRef.get<NotifierPushChannel>(NOTIFIER_PUSH_CHANNEL, {
          strict: false,
        }),
      );
    } catch {
      setNotifierPushChannel(null);
    }
  }
}
