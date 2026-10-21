import {
  CanActivate,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DEV_DASHBOARD_SETTINGS } from './dev-dashboard.settings';
import type { DevDashboardSettings } from './dev-dashboard.settings';

/**
 * A dashboard that is not recording has nothing to show and no reason to
 * exist, so its routes 404 rather than answer with an empty page that suggests
 * it is merely quiet.
 */
@Injectable()
export class DevDashboardEnabledGuard implements CanActivate {
  constructor(
    @Inject(DEV_DASHBOARD_SETTINGS)
    private readonly settings: DevDashboardSettings,
  ) {}

  canActivate(): boolean {
    if (!this.settings.isEnabled) {
      throw new NotFoundException();
    }

    return true;
  }
}
