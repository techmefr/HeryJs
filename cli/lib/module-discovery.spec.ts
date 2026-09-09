import type { LoadedModule } from './module-definition';
import { shadowedNames } from './module-discovery';

function named(name: string, channel: LoadedModule['channel']): LoadedModule {
  return {
    name,
    description: 'a module',
    meta: { compatibility: '*' },
    dest: `src/modules/${name}`,
    channel,
    packageDir: `/nowhere/${name}`,
    install: () => undefined,
  };
}

/**
 * Every official module is also published as `@heryjs/<name>`, and a generated
 * project already carries the whole of `packages/`. So a developer adding one
 * from npm ends up with two modules answering to one name, and `hery install`
 * takes whichever the loader saw first with nothing said about it.
 */
describe('two modules under one name', () => {
  it('finds none when every name is its own', () => {
    expect(
      shadowedNames([named('mail', 'official'), named('storage', 'community')]),
    ).toEqual([]);
  });

  it('names the collision once, however many channels hold it', () => {
    expect(
      shadowedNames([named('mail', 'official'), named('mail', 'community')]),
    ).toEqual(['mail']);
  });

  it('reports each colliding name separately', () => {
    expect(
      shadowedNames([
        named('mail', 'official'),
        named('storage', 'official'),
        named('mail', 'community'),
        named('storage', 'community'),
      ]),
    ).toEqual(['mail', 'storage']);
  });
});
