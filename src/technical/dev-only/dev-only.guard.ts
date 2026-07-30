import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

// A single source of truth for "this route must not exist in production" —
// routes hand-roll this check independently, they drift (one might use a
// different env var name, or forget the check entirely on a new endpoint).
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }

    return true;
  }
}
