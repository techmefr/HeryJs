import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { peerEnv } from './peer.env';

export interface TurnCredentials {
  username: string;
  credential: string;
  ttlSeconds: number;
  uris: string[];
}

const DEFAULT_TTL_SECONDS = 300;

/**
 * Mints coturn "use-auth-secret" credentials: a username of `<expiry>:<label>`
 * and a credential that is the base64 HMAC-SHA1 of that username, keyed by a
 * secret only this server and the TURN daemon hold. coturn verifies the same
 * way on connect, so a client that never sees the secret cannot forge one --
 * it can only present what was minted for it, and only until the expiry
 * baked into its own username runs out.
 *
 * SHA1 is coturn's own convention for use-auth-secret, not a weaker choice
 * made here: https://github.com/coturn/coturn/blob/master/README.turnserver
 */
@Injectable()
export class PeerTurnCredentialsService {
  mint(label: string, ttlSeconds = DEFAULT_TTL_SECONDS): TurnCredentials {
    const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiry}:${label}`;
    const credential = createHmac('sha1', peerEnv.PEER_TURN_SECRET)
      .update(username)
      .digest('base64');

    return {
      username,
      credential,
      ttlSeconds,
      uris: peerEnv.PEER_TURN_URIS.split(',').map((uri) => uri.trim()),
    };
  }

  /**
   * Never called by the signalling path -- coturn is the one party that has
   * to accept these credentials, and it verifies them itself. This exists so
   * a test (or an operator) can prove a minted credential is exactly what
   * coturn would recompute, without standing up a TURN server to find out.
   */
  verify(username: string, credential: string): boolean {
    const [expiryPart] = username.split(':');
    const expiry = Number(expiryPart);

    if (!expiryPart || Number.isNaN(expiry)) {
      return false;
    }

    if (expiry < Math.floor(Date.now() / 1000)) {
      return false;
    }

    const expected = Buffer.from(
      createHmac('sha1', peerEnv.PEER_TURN_SECRET)
        .update(username)
        .digest('base64'),
    );
    const provided = Buffer.from(credential);

    return (
      expected.length === provided.length && timingSafeEqual(expected, provided)
    );
  }
}
