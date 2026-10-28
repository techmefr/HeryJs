import type { DynamicModule } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { registerAppInstrument } from '@heryjs/core/observability';
import { observeSettings } from './observe-options';

export function heryObserveModule(): DynamicModule {
  const settings = observeSettings();
  const { ObserveModule, ObserveInstrument } = createObserveModule(
    settings.create,
  );

  if (settings.module.enabled && ObserveInstrument) {
    registerAppInstrument(ObserveInstrument);
  }

  return ObserveModule.forRoot(settings.module);
}
