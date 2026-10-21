import { ChangeFeedRegistry } from './change-feed.registry';

function definition(model: string, channel: string) {
  return {
    model,
    channel,
    canViewAny: () => ({ allowed: true }),
    canView: () => ({ allowed: true }),
    load: () => Promise.resolve({ ownerId: 'owner-1', teamId: 'team-1' }),
    toView: () => ({ shown: true }),
  };
}

describe('ChangeFeedRegistry', () => {
  it('finds a resource by its model and by its channel', () => {
    const registry = new ChangeFeedRegistry();
    registry.register(definition('Post', 'posts'));

    expect(registry.forModel('Post')?.channel).toBe('posts');
    expect(registry.forChannel('posts')?.model).toBe('Post');
    expect(registry.forModel('Nope')).toBeNull();
    expect(registry.channels()).toEqual(['posts']);
  });

  it('refuses a model or a channel registered twice', () => {
    const registry = new ChangeFeedRegistry();
    registry.register(definition('Post', 'posts'));

    expect(() => registry.register(definition('Post', 'other'))).toThrow(
      'already registered',
    );
    expect(() => registry.register(definition('Other', 'posts'))).toThrow(
      'already registered',
    );
  });

  it('projects a loaded record into its view and its visibility keys, and null when it is gone', async () => {
    const registry = new ChangeFeedRegistry();
    registry.register(definition('Post', 'posts'));
    const resource = registry.forModel('Post');

    expect(await resource?.project('post-1')).toEqual({
      view: { shown: true },
      visibility: { ownerId: 'owner-1', teamId: 'team-1' },
    });

    registry.register({
      ...definition('Gone', 'gone'),
      load: () => Promise.resolve(null),
    });

    expect(await registry.forModel('Gone')?.project('x')).toBeNull();
  });
});
