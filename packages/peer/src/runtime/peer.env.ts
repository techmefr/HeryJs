import { devOnlyDefault, parseModuleEnv } from '#kernel/config/module-env';

// coturn's use-auth-secret mechanism: the server and the TURN daemon share
// one secret, never sent to a client. A production deployment must set both
// to the same value coturn was started with, or minted credentials will be
// rejected by a TURN server that signs with a different secret.
export const peerEnv = parseModuleEnv('peer', {
  PEER_TURN_SECRET: devOnlyDefault('PEER_TURN_SECRET', 'peer-turn-dev-secret'),
  PEER_TURN_URIS: devOnlyDefault(
    'PEER_TURN_URIS',
    'turn:localhost:3478?transport=udp',
  ),
});
