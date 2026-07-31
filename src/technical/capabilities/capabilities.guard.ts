import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CapabilityForbiddenException } from '#technical/errors/capability-forbidden.exception';
import { RecordNotFoundException } from '#technical/errors/record-not-found.exception';
import {
  CAPABILITY_CHECK,
  CAPABILITY_RECORD_LOADER,
} from './capability.decorator';
import type { PolicyCheck, RecordLoader } from './capability-check';
import { subjectOf } from './subject';
import type { AuthenticatedUser } from '#technical/auth/auth.types';

type RequestWithCapabilities = Request & {
  user: AuthenticatedUser;
  record?: unknown;
};

@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const check = this.reflector.get<PolicyCheck | undefined>(
      CAPABILITY_CHECK,
      context.getHandler(),
    );

    if (!check) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<RequestWithCapabilities>();
    const subject = subjectOf(request.user);

    const loaderToken = this.reflector.get<string | symbol | undefined>(
      CAPABILITY_RECORD_LOADER,
      context.getHandler(),
    );

    let record: unknown;

    if (loaderToken) {
      const loader = this.moduleRef.get<unknown, RecordLoader>(loaderToken, {
        strict: false,
      });
      const id = String(request.params.id);
      record = await loader.load(id);

      if (!record) {
        throw new RecordNotFoundException('record');
      }

      request.record = record;
    }

    const decision = check(subject, record);

    if (!decision.allowed) {
      throw new CapabilityForbiddenException(decision);
    }

    return true;
  }
}
