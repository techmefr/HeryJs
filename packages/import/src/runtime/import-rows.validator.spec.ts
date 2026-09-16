import { mergeOutcome, partitionRows } from './import-rows.validator';

const columns = ['id', 'name'] as const;

describe('partitionRows', () => {
  it('passes a row whose columns match', () => {
    const row = { id: '1', name: 'Ada' };

    expect(partitionRows([row], columns)).toEqual({
      valid: [row],
      errors: [],
    });
  });

  it('rejects a row missing a declared column', () => {
    const { valid, errors } = partitionRows([{ id: '1' }], columns);

    expect(valid).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 1, column: 'name' });
    expect(errors[0]?.message).toContain('absent');
  });

  /**
   * The expensive mistake: a renamed header still parses, so without this the
   * intended column arrives empty and the import quietly blanks a field across
   * every row.
   */
  it('rejects a row carrying a column the import never declared', () => {
    const { valid, errors } = partitionRows(
      [{ id: '1', name: 'Ada', nickname: 'A' }],
      columns,
    );

    expect(valid).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 1, column: 'nickname' });
    expect(errors[0]?.message).toContain('not declared');
  });

  it('numbers rows from one so they match what a spreadsheet shows', () => {
    const { errors } = partitionRows(
      [{ id: '1', name: 'Ada' }, { id: '2' }],
      columns,
    );

    expect(errors[0]?.row).toBe(2);
  });

  it('keeps the good rows of a partly broken file', () => {
    const good = { id: '1', name: 'Ada' };
    const { valid, errors } = partitionRows([good, { id: '2' }], columns);

    expect(valid).toEqual([good]);
    expect(errors).toHaveLength(1);
  });
});

describe('mergeOutcome', () => {
  /**
   * Rows rejected on shape never reached consume, so the caller can only trust
   * "accepted plus rejected equals what the file held" if the merge adds them
   * back.
   */
  it('adds the rows consume never saw to its own rejections', () => {
    const merged = mergeOutcome(
      {
        accepted: 3,
        rejected: 1,
        errors: [{ row: 4, column: 'id', message: 'duplicate' }],
      },
      [{ row: 5, column: 'name', message: 'absent' }],
      1,
    );

    expect(merged.accepted).toBe(3);
    expect(merged.rejected).toBe(2);
    expect(merged.errors).toHaveLength(2);
  });

  /**
   * Several complaints can land on one row, so the counts are carried rather
   * than derived from errors.length -- a "412 of 500" shown to a user must not
   * drift with the number of messages.
   */
  it('does not derive the counts from the number of errors', () => {
    const merged = mergeOutcome(
      {
        accepted: 1,
        rejected: 1,
        errors: [
          { row: 2, column: 'id', message: 'blank' },
          { row: 2, column: 'name', message: 'blank' },
        ],
      },
      [],
      0,
    );

    expect(merged.rejected).toBe(1);
  });
});
