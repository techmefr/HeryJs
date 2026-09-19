import { createHmac } from 'node:crypto';
import { PeerTurnCredentialsService } from './peer-turn-credentials.service';
import { peerEnv } from './peer.env';

describe('PeerTurnCredentialsService', () => {
  const service = new PeerTurnCredentialsService();

  it('mints a username of "<expiry>:<label>"', () => {
    const before = Math.floor(Date.now() / 1000);
    const credentials = service.mint('participant-1', 60);
    const [expiryPart, label] = credentials.username.split(':');

    expect(label).toBe('participant-1');
    expect(Number(expiryPart)).toBeGreaterThanOrEqual(before + 60);
    expect(credentials.ttlSeconds).toBe(60);
  });

  it('signs the username with an HMAC-SHA1 of the shared secret, coturn-style', () => {
    const credentials = service.mint('participant-1', 60);
    const expected = createHmac('sha1', peerEnv.PEER_TURN_SECRET)
      .update(credentials.username)
      .digest('base64');

    expect(credentials.credential).toBe(expected);
  });

  it('splits the configured TURN URIs into a list', () => {
    const credentials = service.mint('participant-1');

    expect(credentials.uris).toEqual(
      peerEnv.PEER_TURN_URIS.split(',').map((uri) => uri.trim()),
    );
  });

  it('cannot be forged: two labels never collide on the same credential', () => {
    const first = service.mint('participant-1', 60);
    const second = service.mint('participant-2', 60);

    expect(first.credential).not.toBe(second.credential);
  });

  it('verifies a credential it minted itself', () => {
    const credentials = service.mint('participant-1', 60);

    expect(service.verify(credentials.username, credentials.credential)).toBe(
      true,
    );
  });

  it('refuses a credential signed with the wrong secret', () => {
    const credentials = service.mint('participant-1', 60);
    const forged = createHmac('sha1', 'a-different-secret')
      .update(credentials.username)
      .digest('base64');

    expect(service.verify(credentials.username, forged)).toBe(false);
  });

  it('refuses a credential whose expiry has already passed', () => {
    const expiry = Math.floor(Date.now() / 1000) - 10;
    const username = `${expiry}:participant-1`;
    const credential = createHmac('sha1', peerEnv.PEER_TURN_SECRET)
      .update(username)
      .digest('base64');

    expect(service.verify(username, credential)).toBe(false);
  });

  it('refuses a username with no parseable expiry', () => {
    expect(service.verify('not-a-number:participant-1', 'anything')).toBe(
      false,
    );
  });
});
