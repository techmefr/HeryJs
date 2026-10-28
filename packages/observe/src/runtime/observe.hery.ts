import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { heryObserveModule } from './observe.module';

export default defineHeryModule({
  name: '@heryjs/observe',
  module: heryObserveModule,
  options: noOptions,
  extensionPoints: ['observability.apm'],
});
