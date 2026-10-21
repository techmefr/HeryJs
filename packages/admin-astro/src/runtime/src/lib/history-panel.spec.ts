import { describe, expect, it } from 'vitest';
import { historyPath, renderValue } from './history-panel';
import { capabilityKeysOf } from './resource';
import { mockDescription } from './resource.fixture';

describe('history panel', () => {
  it('asks for the history and revert decisions only on a resource that keeps history', () => {
    expect(capabilityKeysOf(mockDescription)).not.toContain('history');
    expect(capabilityKeysOf({ ...mockDescription, history: true })).toEqual(
      expect.arrayContaining(['history', 'revert']),
    );
  });

  it('addresses a record by its encoded id', () => {
    expect(historyPath('/snippets', 'a/b', '/diff')).toBe(
      '/snippets/a%2Fb/history/diff',
    );
  });

  it('prints strings bare and everything else as JSON', () => {
    expect(renderValue('x')).toBe('x');
    expect(renderValue(2)).toBe('2');
    expect(renderValue(undefined)).toBe('null');
  });
});
