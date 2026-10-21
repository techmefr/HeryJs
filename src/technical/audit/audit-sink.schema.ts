import { z } from 'zod';
import { AUDIT_EXPORT_FORMATS } from './audit-format';
import { AUDIT_SINK_KINDS } from './audit-sink.constants';

const name = z.string().trim().min(1).max(100);
const url = z.string().trim().min(1).max(2000);
const authToken = z.string().min(1).max(2000);
const storageDriver = z
  .string()
  .regex(/^[a-z0-9-]{1,50}$/, 'a driver name such as "local" or "s3"');
// The prefix becomes the front of an object key the storage driver writes, so
// it is held to a conservative alphabet with no way to climb out of it.
const keyPrefix = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/, 'letters, digits, . _ - and /')
  .refine((value) => !value.includes('..'), 'no ".." segments');

export const createAuditSinkSchema = z
  .object({
    name,
    kind: z.enum(AUDIT_SINK_KINDS),
    url: url.optional(),
    authToken: authToken.optional(),
    storageDriver: storageDriver.optional(),
    keyPrefix: keyPrefix.optional(),
    active: z.boolean().optional(),
    // A new sink streams what happens from now on. Asking for the history too
    // is a deliberate choice: it can be a lot of entries.
    backfill: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === 'http' && !value.url) {
      context.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'an http sink needs a url',
      });
    }

    if (value.kind === 'storage' && (value.url || value.authToken)) {
      context.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'a storage sink has no url or token',
      });
    }
  });

export const updateAuditSinkSchema = z
  .object({
    name: name.optional(),
    url: url.optional(),
    authToken: authToken.nullable().optional(),
    storageDriver: storageDriver.optional(),
    keyPrefix: keyPrefix.optional(),
    active: z.boolean().optional(),
  })
  .strict();

export type CreateAuditSinkInput = z.infer<typeof createAuditSinkSchema>;
export type UpdateAuditSinkInput = z.infer<typeof updateAuditSinkSchema>;

export const exportQuerySchema = z.object({
  format: z.enum(AUDIT_EXPORT_FORMATS).default('csv'),
});
