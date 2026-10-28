import type { NestApplicationContextOptions } from '@nestjs/common/interfaces/nest-application-context-options.interface';

export type AppInstrument = NonNullable<
  NestApplicationContextOptions['instrument']
>;

let registered: AppInstrument | null = null;

export function registerAppInstrument(instrument: AppInstrument): void {
  registered = instrument;
}

export function registeredAppInstrument(): AppInstrument | null {
  return registered;
}

export function clearAppInstrument(): void {
  registered = null;
}
