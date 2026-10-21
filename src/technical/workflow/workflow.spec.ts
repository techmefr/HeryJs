import { IllegalTransitionException } from '#technical/errors/illegal-transition.exception';
import { TransitionGuardException } from '#technical/errors/transition-guard.exception';
import { assertTransitionAllowed } from './workflow';
import type { TransitionRule } from './workflow';

const publish: TransitionRule = {
  from: ['draft'],
  to: 'published',
  requires: ['summary'],
};

describe('assertTransitionAllowed', () => {
  it('lets a transition run from a state it leaves from, with its guard met', () => {
    expect(() =>
      assertTransitionAllowed(
        'note',
        'publish',
        publish,
        { summary: 'ready' },
        'draft',
      ),
    ).not.toThrow();
  });

  it('refuses a transition from any other state with a 409 naming where it may run', () => {
    let caught: unknown;

    try {
      assertTransitionAllowed(
        'note',
        'publish',
        publish,
        { summary: 'ready' },
        'archived',
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(IllegalTransitionException);
    expect((caught as IllegalTransitionException).getStatus()).toBe(409);
    expect((caught as IllegalTransitionException).message).toContain('"draft"');
  });

  it.each([null, undefined, '', '   '])(
    'refuses a guard whose field holds %p, with a 422',
    (value) => {
      let caught: unknown;

      try {
        assertTransitionAllowed(
          'note',
          'publish',
          publish,
          { summary: value },
          'draft',
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(TransitionGuardException);
      expect((caught as TransitionGuardException).getStatus()).toBe(422);
    },
  );

  it('checks the state before the guard, so a wrong state is never reported as a missing field', () => {
    expect(() =>
      assertTransitionAllowed('note', 'publish', publish, {}, 'archived'),
    ).toThrow(IllegalTransitionException);
  });

  it('accepts a falsy value that is not blank, like 0 or false', () => {
    expect(() =>
      assertTransitionAllowed(
        'note',
        'go',
        { from: ['a'], to: 'b', requires: ['count', 'flag'] },
        { count: 0, flag: false },
        'a',
      ),
    ).not.toThrow();
  });
});
