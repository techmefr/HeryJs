import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { StreamModule } from './stream.module';

export default defineHeryModule({
  name: '@heryjs/stream',
  module: () => StreamModule,
  options: noOptions,
  extensionPoints: ['realtime.media'],
});
