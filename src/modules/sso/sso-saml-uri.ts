const CALLBACK_PATH = '/sso/callback';
const SAML_ACS_PATH = '/sso/saml/acs';

/**
 * Where a SAML identity provider posts its assertion: beside the OIDC
 * callback, under the same public origin.
 */
export function samlAcsUri(callbackUri: string): string {
  return callbackUri.endsWith(CALLBACK_PATH)
    ? `${callbackUri.slice(0, -CALLBACK_PATH.length)}${SAML_ACS_PATH}`
    : callbackUri;
}
