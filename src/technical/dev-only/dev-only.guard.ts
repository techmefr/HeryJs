import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import {
  devEnvironmentsOf,
  isDevEnvironment,
} from '#technical/config/dev-environments';
import { heryConfig } from '#technical/config/hery-config';

// A single source of truth for "this route must not exist in production" —
// routes hand-roll this check independently, they drift (one might use a
// different env var name, or forget the check entirely on a new endpoint).
// Closed by default: only a NODE_ENV listed in devTools.environments opens it.
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (
      !isDevEnvironment(process.env.NODE_ENV, devEnvironmentsOf(heryConfig))
    ) {
      throw new NotFoundException();
    }

    return true;
  }
}
