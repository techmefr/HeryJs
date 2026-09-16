/**
 * The SMS half of the module-and-driver convention. Contract and token in the
 * kernel, drivers as packages, registry in the module -- the same shape mail
 * and storage take, for the same reason: a driver package cannot import a
 * module.
 */
import { driverToken } from '#technical/drivers/driver-token';

export const SMS_MODULE = 'sms';

export function smsDriverToken(driverName: string): symbol {
  return driverToken(SMS_MODULE, driverName);
}

/**
 * `to` is E.164 and nothing else: a number stored in a national format is one
 * whose country nobody can tell, and every rule below is chosen by country.
 * Normalising at the edge would mean guessing which country a bare `06…`
 * belongs to, which is how a French number becomes an Italian one.
 */
export interface SmsMessage {
  to: string;
  body: string;
  /**
   * A short alphanumeric name in place of a number. Legal in some countries,
   * refused outright in others, and in a few it silently strips the ability to
   * reply -- which is why the rules table decides, not the caller.
   */
  sender?: string;
}

export interface SmsDriver {
  send(message: SmsMessage): Promise<void>;
}

/**
 * What `hery make:sms` would generate: an object that knows its recipient and
 * renders its own body, and picks no driver. Same contract as Mailable, kept
 * separate because an SMS body is plain text with a hard length limit and a
 * mandatory opt-out mention in several countries -- constraints a mail body
 * does not have.
 */
export interface Sendable {
  readonly to: string;
  build(): SmsMessage | Promise<SmsMessage>;
}
