import {
  REDACTED,
  addPersonalLogFields,
  maskPersonalText,
  redactForLog,
  redactLogLine,
} from './log-redaction';

describe('log redaction', () => {
  it('masks addresses, phone numbers, JWTs and bearer tokens in free text', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

    expect(
      maskPersonalText(
        `ada@example.org called +33 6 12 34 56 78 and 06.12.34.56.78 with ${jwt}, Bearer abc.def`,
      ),
    ).toBe(
      `${REDACTED} called ${REDACTED} and ${REDACTED} with ${REDACTED}, ${REDACTED}`,
    );
  });

  it('masks a url-encoded address and a labelled secret', () => {
    expect(maskPersonalText('/login?email=ada%40example.org')).toBe(
      `/login?email=${REDACTED}`,
    );
    expect(maskPersonalText('token: s3cr3t password=hunter2')).toBe(
      `token: ${REDACTED} password=${REDACTED}`,
    );
  });

  it('keeps ids, timestamps and durations readable', () => {
    const text =
      'request 57e8cba6-d62f-49ad-9b3d-c90a618ed1e2 took 1234 ms at 2026-10-23T08:44:46.910Z';

    expect(maskPersonalText(text)).toBe(text);
  });

  it('redacts sensitive keys, and the name of a person-shaped object only', () => {
    expect(
      redactForLog({
        job: { name: 'mail.send' },
        user: { id: 'u1', name: 'Ada', email: 'ada@example.org' },
        password: 'hunter2',
        headers: { Authorization: 'Bearer x' },
      }),
    ).toEqual({
      job: { name: 'mail.send' },
      user: { id: 'u1', name: REDACTED, email: REDACTED },
      password: REDACTED,
      headers: { Authorization: REDACTED },
    });
  });

  it('redacts a field a resource declared personal', () => {
    addPersonalLogFields(['nickname']);

    expect(redactForLog({ nickname: 'ada', title: 'kept' })).toEqual({
      nickname: REDACTED,
      title: 'kept',
    });
  });

  it('redacts a JSON line and masks a plain one', () => {
    expect(
      JSON.parse(redactLogLine('{"msg":"for ada@example.org","email":"a"}\n')),
    ).toEqual({ msg: `for ${REDACTED}`, email: REDACTED });
    expect(redactLogLine('plain ada@example.org\n')).toBe(
      `plain ${REDACTED}\n`,
    );
  });
});
