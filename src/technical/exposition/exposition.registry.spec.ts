import { ExpositionRegistry } from './exposition.registry';
import type { RegisteredAction } from './exposition.types';

const allowEveryone: RegisteredAction['capability'] = () => ({
  allowed: true,
  scope: 'all',
});

function action(name: string): RegisteredAction {
  return {
    name,
    capability: allowEveryone,
    params: [],
    invoke: () => undefined,
  };
}

describe('ExpositionRegistry', () => {
  it('refuses a name with no provenance segment', () => {
    const registry = new ExpositionRegistry();

    expect(() => registry.register(action('run'))).toThrow(/provenance\.thing/);
  });

  it('refuses a duplicate name', () => {
    const registry = new ExpositionRegistry();
    registry.register(action('fixture.run'));

    expect(() => registry.register(action('fixture.run'))).toThrow(/duplicate/);
  });

  it('lists registered actions sorted by name', () => {
    const registry = new ExpositionRegistry();
    registry.register(action('fixture.zzz'));
    registry.register(action('fixture.aaa'));

    expect(registry.all().map((entry) => entry.name)).toEqual([
      'fixture.aaa',
      'fixture.zzz',
    ]);
  });
});
