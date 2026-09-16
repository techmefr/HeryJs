import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Mailable } from '#technical/mail/mail-driver';

/**
 * Auth needs to send two emails and the mail module is uninstallable, so it
 * may not be imported here (`.dependency-cruiser.cjs`, `no-kernel-to-module`:
 * a kernel that imports a module breaks the day that module is removed).
 *
 * Same answer as everywhere else in the framework -- depend on a contract and
 * find its implementation by token at runtime, the way ExportProcessor reaches
 * storage. The token comes from the global symbol registry so that whoever
 * binds it and whoever looks it up never share an import.
 */
export const AUTH_MAILER = Symbol.for('heryjs:auth-mailer');

export interface AuthMailer {
  send(mailable: Mailable): Promise<void>;
}

const logger = new Logger('Auth');

let mailer: AuthMailer | null = null;

export function setAuthMailer(resolved: AuthMailer | null): void {
  mailer = resolved;
}

/**
 * Better Auth's callbacks run outside Nest's injector -- the instance is a
 * module-level singleton built by a dynamic import -- so the resolved mailer is
 * handed to this module rather than injected into the callback.
 *
 * With nothing bound, the email is dropped and the reason is logged once per
 * attempt instead of throwing: a password-reset request must not 500 because
 * the app chose not to install mail, and the operator needs the install
 * command, not a stack trace.
 */
export async function sendAuthMail(mailable: Mailable): Promise<void> {
  if (!mailer) {
    logger.warn(
      `Wanted to email ${mailable.to} but no mail module is installed to send it. Run "pnpm hery install mail" to have auth emails delivered.`,
    );
    return;
  }

  await mailer.send(mailable);
}

/**
 * Resolution runs in onModuleInit, never in the constructor: the provider that
 * binds AUTH_MAILER lives outside this module's import graph, so `strict:
 * false` only finds it once every provider is instantiated.
 */
@Injectable()
export class AuthMailerResolver implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    setAuthMailer(this.find());
  }

  private find(): AuthMailer | null {
    try {
      return this.moduleRef.get<AuthMailer>(AUTH_MAILER, { strict: false });
    } catch {
      return null;
    }
  }
}
