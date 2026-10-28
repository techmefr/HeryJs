import { DOMParser } from '@xmldom/xmldom';
import * as xpath from 'xpath';

const REDIRECT_BINDING = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect';

export interface SamlIdpMetadata {
  entityId: string;
  entryPoint: string;
  certificates: string[];
}

const NAMESPACES = {
  md: 'urn:oasis:names:tc:SAML:2.0:metadata',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
};

const select = xpath.useNamespaces(NAMESPACES);

function textOf(node: Node): string | null {
  const value = node.textContent;

  return value && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Reads what a connection needs out of an identity provider's metadata
 * document: its entity ID, the sign-on URL it takes a redirect on, and the
 * certificates it signs with. Nothing here is a trust decision -- an
 * administrator chose to import this document -- but a DTD is refused so a
 * pasted file cannot ask the parser to expand entities.
 */
export function parseIdpMetadata(xml: string): SamlIdpMetadata | null {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    return null;
  }

  try {
    const document = new DOMParser({
      onError: () => undefined,
    }).parseFromString(xml, 'text/xml') as unknown as Node;
    const entities = select(
      '//md:EntityDescriptor[md:IDPSSODescriptor]',
      document,
    ) as unknown as Element[];
    const entity = entities[0];

    if (!entity) {
      return null;
    }

    const entityId = entity.getAttribute('entityID');
    const redirects = select(
      `md:IDPSSODescriptor/md:SingleSignOnService[@Binding='${REDIRECT_BINDING}']/@Location`,
      entity,
    ) as Attr[];
    const entryPoint = redirects[0]?.value ?? null;
    const keys = select(
      "md:IDPSSODescriptor/md:KeyDescriptor[not(@use) or @use='signing']/ds:KeyInfo/ds:X509Data/ds:X509Certificate",
      entity,
    ) as Node[];
    const certificates = keys
      .map((key) => textOf(key))
      .filter((value): value is string => value !== null);

    if (!entityId || !entryPoint || certificates.length === 0) {
      return null;
    }

    return { entityId, entryPoint, certificates };
  } catch {
    return null;
  }
}
