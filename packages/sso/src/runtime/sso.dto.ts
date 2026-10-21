import { z } from 'zod';
import { SSO_LINK_POLICIES } from './sso.types';

const MAX_DOMAINS_PER_CONNECTION = 20;
const MAX_TEXT_LENGTH = 255;
const MAX_URL_LENGTH = 2048;
const MAX_SECRET_LENGTH = 1024;

const linkPolicySchema = z.enum(SSO_LINK_POLICIES as [string, ...string[]]);

export const createConnectionSchema = z.object({
  name: z.string().min(1).max(MAX_TEXT_LENGTH),
  issuer: z.url().max(MAX_URL_LENGTH),
  clientId: z.string().min(1).max(MAX_TEXT_LENGTH),
  clientSecret: z.string().min(1).max(MAX_SECRET_LENGTH),
  linkPolicy: linkPolicySchema.default('refuse'),
  domains: z
    .array(z.string().min(1).max(MAX_TEXT_LENGTH))
    .min(1)
    .max(MAX_DOMAINS_PER_CONNECTION),
});

export const updateConnectionSchema = z
  .object({
    name: z.string().min(1).max(MAX_TEXT_LENGTH),
    clientId: z.string().min(1).max(MAX_TEXT_LENGTH),
    clientSecret: z.string().min(1).max(MAX_SECRET_LENGTH),
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

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
export type AddDomainInput = z.infer<typeof addDomainSchema>;
