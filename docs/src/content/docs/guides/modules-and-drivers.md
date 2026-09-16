---
title: Modules and drivers
description: How a module puts one capability behind several interchangeable implementations, so swapping mail transports or export formats is a config change rather than a source edit.
---

A module exposes one capability. A driver is one way of performing it. That
pair is the only extension mechanism HeryJs has, and this page is its single
shape.

Every module follows it, including the ones that ship with exactly one
driver today. A module that hardcodes its only implementation has decided,
on your behalf, that there will never be a second one — and the day there is,
the change reaches every caller. A module that declares a contract from the
start absorbs that second implementation as an install and a config line,
with no diff anywhere else. The cost of the convention is one interface and
one registry; the cost of skipping it is paid later, by someone else.

Before this convention each module invented its own answer. Search grew a
token per driver and a registry that resolves at boot. Storage read an env
var at module-evaluation time and picked a class with a ternary. Mail
hardcoded its only provider and told you in the docs to edit the source.
Three shapes for one problem, so nothing learned about one module transferred
to the next.

The payoff of a single shape is that modules stop being special. Any module
can be grafted onto any other through the same contract-and-token mechanism,
a driver can live in this repository or in someone else's package without
either knowing, and reading one module teaches you all of them.

## The four pieces

A module following this convention owns exactly four kinds of file.

| File                        | Where it lives          | What it holds                                    |
| --------------------------- | ----------------------- | ------------------------------------------------ |
| `<name>-driver.ts`          | `src/technical/<name>/` | The driver contract, and the token factory       |
| `<name>-driver.registry.ts` | the module              | Resolution of the declared driver(s) from config |
| `<name>.service.ts`         | the module              | The facade every caller injects                  |
| the default driver          | the module              | The zero-config one: `log`, `csv`, `local`       |

The contract sits in the kernel and everything else in the module. That split
is not tidiness: a driver ships as its own package, and a package may not
import a module, so a contract owned by `src/modules/mail` would be
unreachable from the driver that has to implement it.

Nothing else may be imported by a caller. A resource that reaches past
`<name>Service` into a concrete driver has defeated the point of the module.

## The contract names what the module does, not who does it

The contract is an interface, not an abstract class. This codebase has one
abstract class in its whole tree (`DomainException`), and it earns it by
carrying behaviour. A driver contract carries none — it is a shape — so it
stays an interface, and drivers `implements` it rather than `extends`
anything.

```ts
export interface MailDriver {
  send(message: MailMessage): Promise<void>;
}
```

Keep the verb in the module's own vocabulary: `MailDriver.send`,
`ExportDriver.export`, `StorageDriver.put`. A contract method named after a
vendor's API (`sendRaw`, `putObject`) has leaked an implementation into the
one file whose job is to have none.

### One token per driver, never one shared token

```ts
export function mailDriverToken(driverName: string): symbol {
  return Symbol.for(`heryjs:mail-driver:${driverName}`);
}
```

`Symbol.for` reaches the global symbol registry, so the token a driver
package provides under a name and the token the registry looks up under the
same name are reference-equal without either file importing the other. That
matters because they _cannot_ import each other: a driver shipped as a
package installs outside the kernel's import graph.

A single shared `MAIL_DRIVER` symbol looks simpler and is the bug that
search already paid for. Two installed drivers both bind the same token,
whichever registers last silently wins, and every call resolves to it with
no error anywhere. Per-driver tokens make that collision impossible to
express.

## Config declares which driver, env declares its secrets

The two are separate axes and mixing them is the most common way to get this
wrong.

`hery.config.ts` is typed, committed, and never reads `process.env`. It says
_which_ driver is active:

```ts
mail: {
  default: 'log',
  drivers: {
    log: { driver: 'log' },
    smtp: { driver: 'smtp' },
  },
},
```

The driver's own `<name>.env.ts` says how to reach it, through
`parseModuleEnv` so that an uninstalled module never forces a variable on a
project that does not use it:

```ts
export const smtpMailEnv = parseModuleEnv('mail-smtp', {
  MAIL_SMTP_HOST: z.string(),
  MAIL_SMTP_PORT: z.coerce.number().default(587),
});
```

Add the module's slice to `HeryConfig` in
`src/technical/config/hery-config.types.ts` as a closed interface. An unknown
key or a missing `driver` then fails typecheck at the project's own
`satisfies HeryConfig`, which is the entire validation mechanism — there is
no runtime schema.

### Switching driver between environments

The `default` key accepts an env var so one variable flips the whole module
without touching application code:

```ts
mail: {
  default: process.env.MAIL_DRIVER ?? 'log',
  ...
}
```

This is the one place `process.env` is legitimate in `hery.config.ts`,
because it selects a name rather than carrying a secret. `MAIL_DRIVER=log` in
development, `MAIL_DRIVER=smtp` in production, and no diff between them.

## A misconfigured driver fails at boot

Resolution belongs in `onModuleInit`, not the constructor: a driver package
binds its provider globally but outside the registry's own import graph, so
the lookup needs `moduleRef.get(token, { strict: false })` and needs every
provider already instantiated.

```ts
onModuleInit(): void {
  for (const [name, entry] of Object.entries(this.declared)) {
    const driver = this.lookup(entry.driver);

    if (!driver) {
      throw new Error(
        `hery.config.ts declares mail driver "${name}" with driver "${entry.driver}", but no module is installed to provide it. Run "pnpm hery install mail-${entry.driver}" or remove "${name}" from hery.config.ts.`,
      );
    }

    this.drivers.set(name, driver);
  }
}
```

A declared driver that cannot be resolved is a startup failure. Never fall
back to the default driver: an app that silently logs mail instead of sending
it is worse than one that refuses to start, because nobody finds out until a
user reports a missing email.

An unknown name arriving at _request_ time is a different and much cheaper
mistake — same family as an unknown sort field — so that one is a 400 from
`resolve()`, not a crash.

## The default driver is a real driver that does nothing

Every module ships one driver that needs no credentials, no network and no
container: `log` for mail, `csv` for export, `local` for storage. It
implements the full contract honestly — it just writes to the logger or the
local disk instead of reaching a vendor.

This is what makes a freshly generated app runnable and safe: a project that
has not configured mail cannot accidentally email a real person, because the
driver it got by default has no way to.

The default driver lives in the module itself and is provided directly, not
looked up. It is the only driver guaranteed present, so the registry holds a
constructor-injected reference to it rather than resolving it by token.

## Two selection modes

Which one a module uses is a property of the capability, not a preference.

**One active driver, chosen by config.** The caller does not know or care
which. Mail and storage work this way: nothing in a resource should decide
that _this_ message goes over SMTP.

```ts
await this.mail.send(new WelcomeMail(user));
```

**Several active drivers, chosen per call.** The format is part of what the
caller is asking for, so it belongs in the call. Export works this way:

```ts
await this.exports.as('pdf').generate(new TaskListExport(tasks));
```

In per-call mode `default` in config is the fallback for `as()` being
omitted, not the only resolvable driver — every declared driver is resolved
at boot and kept.

## A driver package installs into the module it extends

A driver that carries a heavy dependency ships as its own package, so that
wanting CSV never installs a PDF engine. It declares the owning module's
folder as its destination:

```ts
export default {
  name: 'mail-smtp',
  description: 'Send mail over SMTP instead of logging it',
  meta: { compatibility: '>=0.0.1' },
  dest: 'src/modules/mail',
  dependencies: ['nodemailer'],
  install(context) {
    context.copyRuntime();
    context.nextSteps([
      'Import "SmtpMailModule" into src/app.module.ts',
      'Declare it in hery.config.ts under mail.drivers',
      'Set MAIL_SMTP_HOST and MAIL_SMTP_USER in .env',
    ]);
  },
} satisfies ModuleDefinition;
```

`dest` pointing at `src/modules/mail` is load-bearing, not cosmetic.
`.dependency-cruiser.cjs` forbids one module importing another, so a driver
living in `src/modules/mail-smtp` could not import the contract from
`src/modules/mail` — the rule exists so uninstalling one module cannot break
another. Landing the driver inside the folder it extends makes the import a
sibling one, which is allowed, and makes uninstalling the owning module take
its drivers with it.

The driver module itself is `@Global()` and binds its token by name:

```ts
@Global()
@Module({
  providers: [SmtpMailDriver, { provide: TOKEN, useExisting: SmtpMailDriver }],
  exports: [TOKEN],
})
export class SmtpMailModule {}
```

## Generating the objects that use a module

Where a module has a recurring per-use-case object, it gets a `make:`
command: `hery make:mail WelcomeMail`, `hery make:export TaskListExport`.
These generate a class implementing a small interface (`Mailable`,
`Exportable`) into `src/functional/<domain>/`, next to the code that uses it.

The generated object describes _what_ to send or export. It never picks a
driver, never reads config, and never talks to a vendor SDK — that is the
registry's job, and keeping it out is what lets the same `WelcomeMail` work
unchanged when the transport changes.

Commands register in `cli/hery.ts` by hand; there is no auto-discovery. Put
the file in `cli/commands/`, naming it after the command with `:` replaced by
`-`, and export the pure builder function separately from the
`register*Command` wrapper so tests can call it without going through
commander.

## Checklist

A module follows this convention when all of these are true.

- The contract is an interface, named `<Name>Driver`, in
  `src/technical/<name>/<name>-driver.ts`
- Tokens come from a `<name>DriverToken(name)` factory using `Symbol.for`
- A registry resolves declared drivers in `onModuleInit` and throws on a
  missing one, naming the install command in the message
- The facade is the only thing exported for callers to inject
- A zero-config default driver ships in the module itself
- The config slice is a closed interface on `HeryConfig`
- Secrets come from `parseModuleEnv`, never from `hery.config.ts`
- Heavy drivers ship as packages with `dest` set to the owning module
- No caller anywhere names a concrete driver class
