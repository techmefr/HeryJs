import { computeEtag, etagMatches } from './etag';

describe('etag', () => {
  describe('computeEtag', () => {
    it('is stable for the same body and caller', () => {
      const body = { data: [1, 2, 3], meta: { total: 3 } };
      expect(computeEtag(body, 'tenant-a:user-1:')).toBe(
        computeEtag(body, 'tenant-a:user-1:'),
      );
    });

    it('changes when the body changes', () => {
      const etagA = computeEtag({ total: 1 }, 'tenant-a:user-1:');
      const etagB = computeEtag({ total: 2 }, 'tenant-a:user-1:');
      expect(etagA).not.toBe(etagB);
    });

    it('changes when only the caller changes, even for the identical body', () => {
      const body = { data: [], meta: { total: 0 } };
      const forOwner = computeEtag(body, 'tenant-a:user-1:');
      const forStranger = computeEtag(body, 'tenant-a:user-2:');
      const forOtherTenant = computeEtag(body, 'tenant-b:user-1:');

      expect(forOwner).not.toBe(forStranger);
      expect(forOwner).not.toBe(forOtherTenant);
    });

    it('is a quoted strong validator', () => {
      const etag = computeEtag({ a: 1 }, 'tenant-a:user-1:');
      expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    });
  });

  describe('etagMatches', () => {
    it('matches an exact single value', () => {
      expect(etagMatches('"abc"', '"abc"')).toBe(true);
    });

    it('does not match a different value', () => {
      expect(etagMatches('"abc"', '"def"')).toBe(false);
    });

    it('matches one entry in a comma-separated list', () => {
      expect(etagMatches('"one", "abc", "two"', '"abc"')).toBe(true);
    });

    it('treats a weak validator prefix as equivalent to the strong one', () => {
      expect(etagMatches('W/"abc"', '"abc"')).toBe(true);
    });

    it('matches the wildcard', () => {
      expect(etagMatches('*', '"abc"')).toBe(true);
    });
  });
});
