import { createHash } from 'node:crypto';
import { AuditService } from './audit.service';
import { auditEntryPayload, GENESIS_PREVIOUS_HASH } from './audit-log';
import { isRedactedAuditData, redactedAuditData } from './audit-redaction';
import { canonicalJson } from './canonical-json';

describe('redactedAuditData', () => {
  it('replaces a payload with a marker and its digest', () => {
    const redacted = redactedAuditData({ title: 'secret' });

    expect(redacted.redacted).toBe(true);
    expect(JSON.stringify(redacted)).not.toContain('secret');
    expect(isRedactedAuditData(redacted)).toBe(true);
  });

  it('does not take a lookalike for a redaction', () => {
    expect(isRedactedAuditData({ redacted: true })).toBe(false);
    expect(isRedactedAuditData({ redacted: true, digest: 'x' })).toBe(false);
    expect(isRedactedAuditData(null)).toBe(false);
  });
});

describe('AuditService.verifyChain with a redacted entry', () => {
  function entry(sequence: number, previousHash: string, data: unknown) {
    const base = {
      tenantId: 't',
      model: 'Note',
      operation: 'create',
      recordId: String(sequence),
      data,
      userId: null,
      impersonatedBy: null,
    };
    const hash = createHash('sha256')
      .update(previousHash)
      .update(canonicalJson(auditEntryPayload(base)))
      .digest('hex');

    return {
      ...base,
      sequence,
      previousHash,
      hash,
      redactedAt: null as Date | null,
    };
  }

  function serviceOver(entries: ReturnType<typeof entry>[]) {
    return new AuditService({
      auditLog: {
        findMany: ({ where }: { where: { sequence: { gt: number } } }) =>
          Promise.resolve(
            entries.filter(
              (candidate) => candidate.sequence > where.sequence.gt,
            ),
          ),
      },
    } as never);
  }

  function chain() {
    const first = entry(1, GENESIS_PREVIOUS_HASH, { title: 'secret' });
    const second = entry(2, first.hash, { title: 'other' });

    return { first, second };
  }

  it('still accepts the chain once an entry holds only its digest', async () => {
    const { first, second } = chain();
    const redacted = {
      ...first,
      data: redactedAuditData(first.data),
      redactedAt: new Date(),
    };

    expect(await serviceOver([redacted, second]).verifyChain('t')).toBe(true);
  });

  it('refuses a redacted entry whose neighbour no longer links to it', async () => {
    const { first, second } = chain();
    const redacted = {
      ...first,
      hash: 'f'.repeat(64),
      data: redactedAuditData(first.data),
      redactedAt: new Date(),
    };

    expect(await serviceOver([redacted, second]).verifyChain('t')).toBe(false);
  });

  it('refuses an entry marked redacted that still holds a payload', async () => {
    const { first, second } = chain();

    expect(
      await serviceOver([
        { ...first, redactedAt: new Date() },
        second,
      ]).verifyChain('t'),
    ).toBe(false);
  });

  it('still catches an edit to an entry that was not redacted', async () => {
    const { first, second } = chain();

    expect(
      await serviceOver([
        { ...first, data: { title: 'edited' } },
        second,
      ]).verifyChain('t'),
    ).toBe(false);
  });
});
