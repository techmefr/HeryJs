import { z } from 'zod';

const MAX_CODE_LENGTH = 32;
const MAX_ROLE_LENGTH = 64;

const codeField = z.string().trim().min(1).max(MAX_CODE_LENGTH);

export const codeSchema = z.object({ code: codeField });

export const verifySchema = z
  .object({
    code: codeField.optional(),
    recoveryCode: codeField.optional(),
  })
  .refine(
    (body) => (body.code === undefined) !== (body.recoveryCode === undefined),
    { message: 'Send exactly one of code or recoveryCode.' },
  );

export const roleParamSchema = z.object({
  role: z.string().trim().min(1).max(MAX_ROLE_LENGTH),
});

export type CodeInput = z.infer<typeof codeSchema>;
export type VerifyInput = z.infer<typeof verifySchema>;
