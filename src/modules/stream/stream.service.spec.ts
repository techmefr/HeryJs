import { StreamService } from './stream.service';

interface VideoGrant {
  room?: string;
  roomJoin?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
}

function grantsIn(jwt: string): VideoGrant {
  const payload = jwt.split('.')[1];
  if (!payload) {
    throw new Error('the token carries no payload');
  }

  const claims = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as { video?: VideoGrant; sub?: string };

  if (!claims.video) {
    throw new Error('the token carries no video grant');
  }

  return claims.video;
}

function identityIn(jwt: string): string | undefined {
  const payload = jwt.split('.')[1];
  const claims = JSON.parse(
    Buffer.from(payload ?? '', 'base64url').toString('utf8'),
  ) as { sub?: string };

  return claims.sub;
}

// v1 is one-to-many by design: a single publisher per room and any number of
// subscribe-only viewers. That split lives entirely in the grants these two
// tokens carry, so a token that let a viewer publish would open the room to
// everyone with no error anywhere.
describe('stream tokens', () => {
  const service = new StreamService();

  it('gives a publisher the right to publish and nothing to subscribe with', async () => {
    const grants = grantsIn(await service.publishToken('room-1', 'author'));

    expect(grants.room).toBe('room-1');
    expect(grants.roomJoin).toBe(true);
    expect(grants.canPublish).toBe(true);
    expect(grants.canSubscribe).toBe(false);
  });

  it('gives a viewer the right to subscribe and no right to publish', async () => {
    const grants = grantsIn(await service.viewerToken('room-1', 'watcher'));

    expect(grants.room).toBe('room-1');
    expect(grants.roomJoin).toBe(true);
    expect(grants.canPublish).toBe(false);
    expect(grants.canSubscribe).toBe(true);
  });

  it('scopes each token to the room it was asked for', async () => {
    const grants = grantsIn(await service.viewerToken('other-room', 'watcher'));

    expect(grants.room).toBe('other-room');
  });

  it('carries the identity it was given', async () => {
    await expect(
      service.publishToken('room-1', 'author').then(identityIn),
    ).resolves.toBe('author');
  });
});
