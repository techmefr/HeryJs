import { buildCursorWhere, decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('round-trips a single-field sort plus the id tiebreaker', () => {
      const record = {
        id: 'row-2',
        createdAt: new Date('2024-01-02T00:00:00Z'),
      };
      const cursor = encodeCursor(record, [
        { field: 'createdAt', direction: 'desc' },
        { field: 'id', direction: 'desc' },
      ]);

      const decoded = decodeCursor(cursor);
      expect(decoded).toEqual({
        sorts: [
          {
            field: 'createdAt',
            direction: 'desc',
            value: '2024-01-02T00:00:00.000Z',
          },
          { field: 'id', direction: 'desc', value: 'row-2' },
        ],
      });
    });

    it('carries every declared sort key, not just one', () => {
      const record = { id: 'row-1', title: 'b', reps: 3 };
      const cursor = encodeCursor(record, [
        { field: 'title', direction: 'asc' },
        { field: 'reps', direction: 'desc' },
        { field: 'id', direction: 'asc' },
      ]);

      expect(decodeCursor(cursor).sorts).toEqual([
        { field: 'title', direction: 'asc', value: 'b' },
        { field: 'reps', direction: 'desc', value: 3 },
        { field: 'id', direction: 'asc', value: 'row-1' },
      ]);
    });

    it('rejects a cursor that is not valid base64url JSON', () => {
      expect(() => decodeCursor('not-a-cursor')).toThrow();
    });

    it('rejects a cursor whose payload is missing sorts', () => {
      const malformed = Buffer.from(JSON.stringify({}), 'utf8').toString(
        'base64url',
      );
      expect(() => decodeCursor(malformed)).toThrow();
    });
  });

  describe('buildCursorWhere', () => {
    it('builds a single-comparator predicate for one ascending sort step', () => {
      const where = buildCursorWhere({
        sorts: [{ field: 'id', direction: 'asc', value: 'row-2' }],
      });

      expect(where).toEqual({ AND: [{ id: { gt: 'row-2' } }] });
    });

    it('builds a single-comparator predicate for one descending sort step', () => {
      const where = buildCursorWhere({
        sorts: [{ field: 'id', direction: 'desc', value: 'row-2' }],
      });

      expect(where).toEqual({ AND: [{ id: { lt: 'row-2' } }] });
    });

    it('chains a compound sort into an OR of AND branches, each field in its own direction', () => {
      const where = buildCursorWhere({
        sorts: [
          { field: 'createdAt', direction: 'desc', value: 'day-2' },
          { field: 'id', direction: 'asc', value: 'row-2' },
        ],
      });

      expect(where).toEqual({
        OR: [
          { AND: [{ createdAt: { lt: 'day-2' } }] },
          {
            AND: [{ createdAt: { equals: 'day-2' } }, { id: { gt: 'row-2' } }],
          },
        ],
      });
    });
  });
});
