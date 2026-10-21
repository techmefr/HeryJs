import { sqlFingerprint } from './sql-fingerprint';

describe('sqlFingerprint', () => {
  it('ignores whitespace and placeholder numbering', () => {
    expect(
      sqlFingerprint('SELECT  *\n FROM "Tag"  WHERE "id" = $1 AND "x" = $2'),
    ).toBe(sqlFingerprint('SELECT * FROM "Tag" WHERE "id" = $7 AND "x" = $9'));
  });

  it('treats IN lists of any length as the same statement', () => {
    expect(sqlFingerprint('SELECT 1 WHERE "id" IN ($1,$2,$3)')).toBe(
      sqlFingerprint('SELECT 1 WHERE "id" IN ($1, $2, $3, $4, $5)'),
    );
  });

  it('keeps different statements apart', () => {
    expect(sqlFingerprint('SELECT 1 FROM "A" WHERE "id" = $1')).not.toBe(
      sqlFingerprint('SELECT 1 FROM "B" WHERE "id" = $1'),
    );
  });
});
