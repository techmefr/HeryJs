import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { SmsMessage } from '#technical/sms/sms-driver';

/**
 * The sms twin of AUTH_MAILER: phone sign-in has to deliver a code, the sms
 * module is uninstallable, and the kernel may not import it. Same answer --
 * a contract here, a token from the global symbol registry, and the module
 * binds it.
 */
export const AUTH_SMS_SENDER = Symbol.for('heryjs:auth-sms-sender');

export interface AuthSmsSender {
  send(message: SmsMessage): Promise<void>;
}

const logger = new Logger('Auth');

let sender: AuthSmsSender | null = null;

export function setAuthSmsSender(resolved: AuthSmsSender | null): void {
  sender = resolved;
}

export async function sendAuthSms(message: SmsMessage): Promise<void> {
  if (!sender) {
    logger.warn(
      `Wanted to text ${message.to} but no sms module is installed to send it. Run "pnpm hery install sms" to have sign-in codes delivered.`,
    );
    return;
  }

  await sender.send(message);
}

@Injectable()
export class AuthSmsResolver implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    setAuthSmsSender(this.find());
  }

  private find(): AuthSmsSender | null {
    try {
      return this.moduleRef.get<AuthSmsSender>(AUTH_SMS_SENDER, {
        strict: false,
      });
    } catch {
      return null;
    }
  }
}
