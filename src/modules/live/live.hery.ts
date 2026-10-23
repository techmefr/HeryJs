import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { LiveModule } from './live.module';

export default defineHeryModule({
  name: '@heryjs/live',
  module: () => LiveModule,
  options: noOptions,
  extensionPoints: ['auth.provider', 'websocket.gateway'],
});
