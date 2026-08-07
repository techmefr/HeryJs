import type { CorsConfig } from './src/technical/http/cors.types';

export default {
  // Any origin, so a front end on a different port works out of the box. This
  // exact value is refused under NODE_ENV=production: replace it there with the
  // domains that actually call this API, or empty the list to send no CORS
  // header at all -- which is what an API called only by a server, a mobile
  // client or its own same-origin front end wants.
  origins: ['*'],
  credentials: false,
} satisfies CorsConfig;
