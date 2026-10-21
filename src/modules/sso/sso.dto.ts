import { z } from 'zod';
import { SSO_LINK_POLICIES } from './sso.types';

const MAX_DOMAINS_PER_CONNECTION = 20;
const MAX_TEXT_LENGTH = 255;
const MAX_URL_LENGTH = 2048;
const MAX_SECRET_LENGTH = 1024;
const MAX_CERTIFICATE_LENGTH = 16_384;
const MAX_SAML_RESPONSE_LENGTH = 1_048_576;

const linkPolicySchema = z.enum(SSO_LINK_POLICIES as [string, ...string[]]);

const domainsSchema = z
  .array(z.string().min(1).max(MAX_TEXT_LENGTH))
  .min(1)
  .max(MAX_DOMAINS_PER_CONNECTION);

const createOidcConnectionSchema = z.object({
  protocol: z.literal('oidc').default('oidc'),
  name: z.string().min(1).max(MAX_TEXT_LENGTH),
  issuer: z.url().max(MAX_URL_LENGTH),
  clientId: z.string().min(1).max(MAX_TEXT_LENGTH),
  clientSecret: z.string().min(1).max(MAX_SECRET_LENGTH),
  linkPolicy: linkPolicySchema.default('refuse'),
  domains: domainsSchema,
});

// A SAML identity provider is named by its entity ID, which is a URI but not
// always a URL, so `issuer` is a plain string here; `spEntityId` is what this
// service provider calls itself in the request and what the assertion's
// audience has to match, and it defaults to a URL under this API.
const createSamlConnectionSchema = z.object({
  protocol: z.literal('saml'),
  name: z.string().min(1).max(MAX_TEXT_LENGTH),
  issuer: z.string().min(1).max(MAX_URL_LENGTH),
  entryPoint: z.url().max(MAX_URL_LENGTH),
  certificate: z.string().min(1).max(MAX_CERTIFICATE_LENGTH),
  spEntityId: z.string().min(1).max(MAX_URL_LENGTH).optional(),
  linkPolicy: linkPolicySchema.default('refuse'),
  domains: domainsSchema,
});

export const createConnectionSchema = z.union([
  createSamlConnectionSchema,
  createOidcConnectionSchema,
]);

export const updateConnectionSchema = z
  .object({
    name: z.string().min(1).max(MAX_TEXT_LENGTH),
    clientId: z.string().min(1).max(MAX_TEXT_LENGTH),
    clientSecret: z.string().min(1).max(MAX_SECRET_LENGTH),
    issuer: z.string().min(1).max(MAX_URL_LENGTH),
    entryPoint: z.url().max(MAX_URL_LENGTH),
    certificate: z.string().min(1).max(MAX_CERTIFICATE_LENGTH),
    linkPolicy: linkPolicySchema,
    isEnabled: z.boolean(),
  })
  .partial()
  .strict();

export const addDomainSchema = z.object({
  domain: z.string().min(1).max(MAX_TEXT_LENGTH),
});

export const startSignInQuerySchema = z.object({
  email: z.string().min(3).max(MAX_TEXT_LENGTH),
  returnTo: z.string().optional(),
});

export const samlResponseSchema = z.object({
  SAMLResponse: z.string().min(1).max(MAX_SAML_RESPONSE_LENGTH),
  RelayState: z.string().max(MAX_TEXT_LENGTH).optional(),
});

export type SamlResponseInput = z.infer<typeof samlResponseSchema>;
export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type CreateSamlConnectionInput = z.infer<
  typeof createSamlConnectionSchema
>;
export type CreateOidcConnectionInput = z.infer<
  typeof createOidcConnectionSchema
>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
export type AddDomainInput = z.infer<typeof addDomainSchema>;
