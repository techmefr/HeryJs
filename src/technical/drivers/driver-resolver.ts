import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { driverToken } from './driver-token';

/**
 * The lookup half of the module-and-driver convention, shared so that every
 * module resolves its drivers the same way instead of each one re-deriving
 * the ModuleRef incantation. Search, mail, storage and export had three
 * different answers between them before this existed.
 *
 * `strict: false` is mandatory, not a loosening: a driver module is `@Global()`
 * but sits outside the importing module's own graph, so a strict lookup never
 * finds it. That also means resolution can only run once every provider is
 * instantiated -- call this from `onModuleInit`, never from a constructor.
 */
@Injectable()
export class DriverResolver {
  constructor(private readonly moduleRef: ModuleRef) {}

  find<T>(moduleName: string, driverName: string): T | undefined {
    try {
      return this.moduleRef.get<T>(driverToken(moduleName, driverName), {
        strict: false,
      });
    } catch {
      return undefined;
    }
  }
}

/**
 * A declared driver that cannot be resolved stops the boot. Falling back to
 * the module's default driver would be worse than crashing: an app that
 * quietly logs mail instead of sending it looks healthy until a user reports
 * an email that never arrived.
 *
 * The message names the install command because the fix is almost always an
 * uninstalled package rather than a typo, and a project hitting this at boot
 * should not have to open the docs to find that out.
 */
export function missingDriverMessage(
  moduleName: string,
  keyword: string,
  driverName: string,
): string {
  return `hery.config.ts declares ${moduleName} driver "${keyword}" with driver "${driverName}", but no module is installed to provide it. Run "pnpm hery install ${moduleName}-${driverName}" or remove "${keyword}" from hery.config.ts.`;
}
