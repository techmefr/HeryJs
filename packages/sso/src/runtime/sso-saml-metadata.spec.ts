import { parseIdpMetadata } from './sso-saml-metadata';
import { generateSamlTestIdp, samlMetadataXml } from './sso-saml.fakes';

function bodyOf(pem: string): string {
  return pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
}

describe('parseIdpMetadata', () => {
  const { certificate } = generateSamlTestIdp();

  it('reads the entity id, the redirect sign-on URL and the signing certificate only', () => {
    expect(parseIdpMetadata(samlMetadataXml(certificate))).toEqual({
      entityId: 'https://idp.acme.test/metadata',
      entryPoint: 'https://idp.acme.test/redirect',
      certificates: [bodyOf(certificate)],
    });
  });

  it('refuses a document that is not an identity provider description', () => {
    expect(parseIdpMetadata('<nothing/>')).toBeNull();
    expect(parseIdpMetadata('not xml at all')).toBeNull();
    expect(
      parseIdpMetadata(
        samlMetadataXml(certificate).replace(
          'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
          'urn:other',
        ),
      ),
    ).toBeNull();
  });

  it('refuses a document that declares a DTD or entities', () => {
    expect(
      parseIdpMetadata(
        `<!DOCTYPE x [<!ENTITY a "b">]>${samlMetadataXml(certificate)}`,
      ),
    ).toBeNull();
  });
});
