import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { SseModule } from './sse.module';

export default defineHeryModule({
  name: '@heryjs/sse',
  module: () => SseModule,
  options: noOptions,
  extensionPoints: ['realtime.stream'],
});
