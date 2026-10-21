import {
  generateRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  matchesRecoveryCode,
  normalizeRecoveryCode,
} from './recovery-code';
import { RECOVERY_CODE_COUNT } from './two-factor.constants';

describe('recovery codes', () => {
  it('generates grouped codes that do not repeat', () => {
    const codes = generateRecoveryCodes();

    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    expect(generateRecoveryCode()).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
  });

  it('stores a salted hash, never the code', async () => {
    const code = generateRecoveryCode();
    const first = await hashRecoveryCode(code);
    const second = await hashRecoveryCode(code);

    expect(first).not.toContain(code);
    expect(first).not.toContain(normalizeRecoveryCode(code));
    expect(first).not.toBe(second);
  });

  it('matches the code it was hashed from, however it is typed', async () => {
    const code = generateRecoveryCode();
    const stored = await hashRecoveryCode(code);

    expect(await matchesRecoveryCode(code, stored)).toBe(true);
    expect(await matchesRecoveryCode(code.toUpperCase(), stored)).toBe(true);
    expect(await matchesRecoveryCode(code.replaceAll('-', ' '), stored)).toBe(
      true,
    );
  });

  it('refuses another code and a malformed stored value', async () => {
    const stored = await hashRecoveryCode(generateRecoveryCode());

    expect(await matchesRecoveryCode(generateRecoveryCode(), stored)).toBe(
      false,
    );
    expect(await matchesRecoveryCode('abcd-abcd', 'plain-text')).toBe(false);
    expect(await matchesRecoveryCode('abcd-abcd', 'scrypt:x')).toBe(false);
  });
});
