import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { PeerModule } from './peer.module';

export default defineHeryModule({
  name: '@heryjs/peer',
  module: () => PeerModule,
  options: noOptions,
  extensionPoints: ['auth.provider', 'websocket.gateway'],
});
