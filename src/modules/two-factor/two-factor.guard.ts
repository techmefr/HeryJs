import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { MissingSessionException } from '#technical/public/errors';
import type { RequestWithUser } from '#technical/public/auth';
import { bearerToken } from './bearer-token';
import { TwoFactorService } from './two-factor.service';

@Injectable()
export class TwoFactorGuard implements CanActivate {
  constructor(private readonly twoFactor: TwoFactorService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new MissingSessionException();
    }

    if (request.credential === 'apiKey' || request.user.impersonatedBy) {
      return true;
    }

    await this.twoFactor.assertSatisfied(request.user, bearerToken(request));

    return true;
  }
}
