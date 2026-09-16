/**
 * The contract sits in the kernel even though the mail module itself is
 * optional, and that placement is what makes drivers pluggable at all. A
 * driver ships as its own package; `.dependency-cruiser.cjs` forbids one
 * module importing another, so a driver package could never reach a contract
 * owned by `src/modules/mail`, and a sibling import only resolves once both
 * are installed -- which typechecks in a project and fails in the package.
 *
 * Types and a token factory only. Nothing here reaches back into the module,
 * so the kernel keeps its rule of never depending on something uninstallable,
 * and a project without the mail module carries two interfaces it never uses.
 */
import { driverToken } from '#technical/drivers/driver-token';

export const MAIL_MODULE = 'mail';

export function mailDriverToken(driverName: string): symbol {
  return driverToken(MAIL_MODULE, driverName);
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface MailDriver {
  send(message: MailMessage): Promise<void>;
}

/**
 * What `hery make:mail` generates: an object that knows its recipient and can
 * render itself, and knows nothing else. It never picks a driver, reads config
 * or touches a vendor SDK -- that is the registry's job, and keeping it out is
 * what lets the same WelcomeMail keep working when the transport changes
 * underneath it.
 *
 * An interface rather than an abstract base class, because it carries no
 * behaviour to inherit. The one abstract class in this codebase
 * (DomainException) earns it by carrying some.
 *
 * `build()` may be async so a mailable can load what it renders -- a template
 * from disk, a signed link from storage -- without its caller having to know
 * whether this particular one needs to.
 */
export interface Mailable {
  readonly to: string;
  build(): MailMessage | Promise<MailMessage>;
}
