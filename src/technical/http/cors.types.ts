/**
 * What `cors.config.ts` at the project root declares. One file for one subject,
 * the way Laravel keeps config/cors.php separate: which browsers may call this
 * API is a deployment decision, not something buried in a bootstrap script.
 */
export interface CorsConfig {
  /**
   * Exact origins allowed to call this API from a browser, scheme and port
   * included -- `https://app.example.com`, not `example.com`.
   *
   * An empty list turns CORS off: no header is sent, and a browser on another
   * domain cannot read the response. That is the right answer for an API called
   * only by its own server-rendered front end, by a mobile client, or by another
   * service -- none of those are subject to CORS at all.
   *
   * `'*'` allows any origin and is refused under NODE_ENV=production, for the
   * same reason a development secret is: it is the value that is convenient
   * everywhere and correct only locally.
   */
  origins: readonly string[];
  methods?: readonly string[];
  allowedHeaders?: readonly string[];
  exposedHeaders?: readonly string[];
  /**
   * Only needed if a browser has to send cookies. This framework authenticates
   * with a Bearer token, which is a header, so the default is off -- and `'*'`
   * with credentials is a combination browsers reject outright.
   */
  credentials?: boolean;
  /** How long a browser may cache the preflight answer. */
  maxAgeSeconds?: number;
}
