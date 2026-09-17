# @heryjs/sms

Send SMS behind one contract, with the per-country rules that decide whether a
message is legal before a provider silently accepts it.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/):

```bash
pnpm hery install sms
```

## What makes it more than a provider wrapper

A provider will accept a message that a carrier then drops, a regulator fines
you for, or a recipient receives at four in the morning. None of that comes
back as an API error, so the failure surfaces weeks later as a deliverability
problem nobody can trace.

So the rules sit in front of the driver, and a refusal is loud:

- **E.164 only.** A national number names no country, and every rule below is
  chosen by country.
- **Alphanumeric senders**, allowed in some countries and dropped by the
  carrier in others.
- **Sending windows** for marketing, in the recipient's local hours.
- **The opt-out mention**, required in the body where the law says so.
- **Consent per number**, recorded as a log rather than a flag: a revocation is
  a new row, because overwriting the grant erases the evidence a dispute turns
  on. Absence of a record is absence of consent.

Transactional messages are exempt from the last three. The caller states which
kind it is sending, because nothing else can tell and guessing permissively is
the expensive mistake.

The country table covers four countries and falls back to a **strict** default
for the rest: a table nobody maintains is worse than an explicit gap.

## Drivers

`log` ships with the module and writes to the logger, so a fresh app cannot
text a real phone by accident -- an SMS to a wrong number is not a mistake
anyone can take back.

A real provider is a driver package binding `smsDriverToken('<name>')`, exactly
like `mail-resend` does for mail.
