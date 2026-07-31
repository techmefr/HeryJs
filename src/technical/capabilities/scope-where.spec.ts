import type {
  CapabilityRecord,
  CapabilitySubject,
  PermissionPreset,
} from './capabilities.types';
import { resolveCapability } from './resolve-capability';
import { scopeWhereFor } from './scope-where';
import type { ScopeWhere } from './scope-where';

type Row = CapabilityRecord & { id: string };

const PRESETS: PermissionPreset[] = ['none', 'own', 'team', 'all'];

const subject: CapabilitySubject = {
  id: 'user-1',
  teamIds: ['team-a', 'team-b'],
  currentTeamId: 'team-a',
  role: null,
};

const rows: Row[] = [
  { id: 'r1', ownerId: 'user-1', teamId: 'team-a' },
  { id: 'r2', ownerId: 'user-2', teamId: 'team-a' },
  { id: 'r3', ownerId: 'user-1', teamId: 'team-b' },
  { id: 'r4', ownerId: 'user-3', teamId: 'team-c' },
  { id: 'r5', ownerId: 'user-1' },
];

/** Just enough of Prisma's where semantics to evaluate what scopeWhereFor emits. */
function matches(where: ScopeWhere, row: Row): boolean {
  return Object.entries(where).every(([column, condition]) => {
    const value = row[column as keyof Row];

    if (
      condition !== null &&
      typeof condition === 'object' &&
      'in' in condition
    ) {
      return (
        value !== undefined &&
        (condition as { in: unknown[] }).in.includes(value)
      );
    }

    return value === condition;
  });
}

const listed = (
  preset: PermissionPreset,
  forSubject: CapabilitySubject,
): string[] =>
  rows
    .filter((row) => matches(scopeWhereFor(preset, forSubject), row))
    .map((row) => row.id);

describe('scopeWhereFor', () => {
  it('selects nothing under the none preset', () => {
    expect(scopeWhereFor('none', subject)).toEqual({ id: { in: [] } });
  });

  it('selects everything under the all preset', () => {
    expect(scopeWhereFor('all', subject)).toEqual({});
  });

  it('narrows to the owner under the own preset', () => {
    expect(scopeWhereFor('own', subject)).toEqual({ ownerId: 'user-1' });
  });

  it('narrows to every team the subject belongs to under the team preset', () => {
    expect(scopeWhereFor('team', subject)).toEqual({
      teamId: { in: ['team-a', 'team-b'] },
    });
  });

  it('hands a teamless subject an empty perimeter under the team preset', () => {
    const teamless: CapabilitySubject = {
      id: 'user-9',
      teamIds: [],
      currentTeamId: null,
      role: null,
    };

    expect(scopeWhereFor('team', teamless)).toEqual({ teamId: { in: [] } });
    expect(listed('team', teamless)).toEqual([]);
  });

  it.each(PRESETS)(
    'lists under %s exactly the rows the same preset allows one by one',
    (preset) => {
      const allowed = rows
        .filter((row) => resolveCapability(preset, subject, row).allowed)
        .map((row) => row.id);

      expect(listed(preset, subject)).toEqual(allowed);
    },
  );
});
