import { devOnlyDefault, parseModuleEnv } from '#technical/config/module-env';

export const streamEnv = parseModuleEnv('stream', {
  LIVEKIT_URL: devOnlyDefault('LIVEKIT_URL', 'http://localhost:7880'),
  LIVEKIT_API_KEY: devOnlyDefault('LIVEKIT_API_KEY', 'devkey'),
  LIVEKIT_API_SECRET: devOnlyDefault('LIVEKIT_API_SECRET', 'secret'),
});
