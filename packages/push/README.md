# @heryjs/push

Web and mobile push as a channel, with the device-token lifecycle that decides
whether a user is actually reachable.

An [official HeryJs module](https://techmefr.github.io/HeryJs/guides/modules/):

```bash
pnpm hery install push
```

## What makes it more than a provider wrapper

A device token is not a user attribute. One person has a laptop, a phone and a
tablet, and each carries its own. They also **die on their own** -- the app is
uninstalled, the browser clears its subscription, the OS rotates it -- and
nothing announces it. The provider only says so in answer to a send.

So the driver contract has three outcomes rather than a boolean, and the middle
one is why it exists:

- `sent`
- `expired` -- the provider says this token is dead, and the row is deleted on
  its word. This is the only moment anything learns the device is gone.
- `failed` -- the provider was unreachable or refused once. The device is still
  real, and deleting it would lose a user over a blip.

`sendToUser` therefore answers with counts, not a verdict: two phones reached
and a stale browser subscription refused is a success, and a caller handed
`void` could not tell that from nothing sent at all.

For the devices nobody sends to -- which no provider will ever report on --
`forgetUnseenSince(cutoff)` is the sweep, meant for a scheduled task.

## Drivers

`log` ships with the module and never reports a token expired: it has no way to
know, and inventing that answer would delete real devices from a project that
only wanted to see what it was sending.

A real provider is a driver package binding `pushDriverToken('<name>')`, the
way `mail-resend` does for mail.
