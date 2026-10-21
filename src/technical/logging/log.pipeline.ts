import { reportLogDriverFailure } from './log-driver-failure';
import { parseLogLine } from './log-line';
import { shouldPrettyPrint, StdoutLogDriver } from './stdout-log.driver';
import type { LogDriver } from './log-driver';

/**
 * Where the logger's output goes. It is a module-level singleton because the
 * logger is configured when `app.module.ts` is evaluated, long before the
 * container exists to resolve a driver from, so the logger is handed a stream
 * that is already there and the registry attaches the real drivers to it once
 * they are.
 *
 * Until it does, and again after the app has shut down, lines go to stdout:
 * a boot failure or a shutdown message is exactly when the configured sinks are
 * least likely to be up, and it must still be readable somewhere.
 *
 * Each driver is called inside its own try, so one that throws -- or a bug in
 * one -- cannot stop a line reaching the others.
 */
export class LogPipeline {
  private drivers: LogDriver[];

  constructor(private readonly fallback: LogDriver) {
    this.drivers = [fallback];
  }

  write(line: string): void {
    const entry = parseLogLine(line);

    for (const driver of this.drivers) {
      try {
        driver.write(entry);
      } catch (error) {
        reportLogDriverFailure(driver.constructor.name, error);
      }
    }
  }

  attach(drivers: LogDriver[]): void {
    this.drivers = drivers.length > 0 ? drivers : [this.fallback];
  }

  async detach(): Promise<void> {
    const attached = this.drivers;
    this.drivers = [this.fallback];

    await Promise.all(
      attached.map(async (driver) => {
        try {
          await driver.close?.();
        } catch (error) {
          reportLogDriverFailure(driver.constructor.name, error);
        }
      }),
    );
  }
}

export const logPipeline = new LogPipeline(
  new StdoutLogDriver({ isPretty: shouldPrettyPrint(process.env.NODE_ENV) }),
);

export const logShippingStream = {
  write(line: string): void {
    logPipeline.write(line);
  },
};
