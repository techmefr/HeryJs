import { StreamService } from './stream.service';

interface VideoGrant {
  room?: string;
  roomList?: boolean;
  roomAdmin?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
}

function claimsIn(jwt: string): { video?: VideoGrant; sub?: string } {
  return JSON.parse(
    Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as { video?: VideoGrant; sub?: string };
}

describe('tenant isolation', () => {
  const service = new StreamService();
  const roomOfA = 'stream-record-of-tenant-a';
  const roomOfB = 'stream-record-of-tenant-b';

  it('grants a viewer of tenant A the room of A only, never a list or admin right over the others', async () => {
    const { video } = claimsIn(await service.viewerToken(roomOfA, 'alice'));

    expect(video?.room).toBe(roomOfA);
    expect(video?.room).not.toBe(roomOfB);
    expect(video?.roomList).toBeFalsy();
    expect(video?.roomAdmin).toBeFalsy();
  });

  it('grants a publisher of tenant A no right on the room of tenant B', async () => {
    const { video, sub } = claimsIn(
      await service.publishToken(roomOfA, 'alice'),
    );

    expect(video?.room).toBe(roomOfA);
    expect(video?.roomList).toBeFalsy();
    expect(video?.roomAdmin).toBeFalsy();
    expect(sub).toBe('alice');
  });

  it('keeps two concurrent tokens of two tenants each on its own room and identity', async () => {
    const [fromA, fromB] = await Promise.all([
      service.viewerToken(roomOfA, 'alice'),
      service.viewerToken(roomOfB, 'bob'),
    ]);

    expect(claimsIn(fromA)).toMatchObject({
      sub: 'alice',
      video: { room: roomOfA },
    });
    expect(claimsIn(fromB)).toMatchObject({
      sub: 'bob',
      video: { room: roomOfB },
    });
  });
});
