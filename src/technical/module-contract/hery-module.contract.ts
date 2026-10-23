import type { DynamicModule, ForwardReference, Type } from '@nestjs/common';
import { z } from 'zod';

export type HeryNestImport =
  Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference;

/**
 * What every module exports, beside the runtime it copies: the one object the
 * kernel reads to wire it. The module is declared by name in hery.config.ts,
 * with its options; `HeryModule.forRoot` finds this contract, validates the
 * options against its schema, checks that what it requires is declared too,
 * and imports what `module()` returns.
 */
export interface HeryModuleContract<Options = unknown> {
  /** The npm name the module is declared under in hery.config.ts. */
  name: string;

  /** The Nest module, or modules, to import, built from validated options. */
  module(options: Options): HeryNestImport | HeryNestImport[];

  /** Validates the options declared in hery.config.ts, `{}` when none are. */
  options: z.ZodType<Options>;

  /** Modules that must be declared alongside this one. */
  requires?: readonly string[];

  /** The Prisma models it adds, and the `/// @hery.*` annotations they carry. */
  prisma?: {
    models: readonly string[];
    annotations?: readonly string[];
  };

  /** The kernel extension points it plugs into. */
  extensionPoints?: readonly string[];
}

/**
 * Checks `module()` against the options schema where the module is written,
 * then erases the options type: the kernel only ever hands `module()` what
 * that same schema parsed, so a list of modules needs no common type for it.
 */
export function defineHeryModule<Options>(
  contract: HeryModuleContract<Options>,
): HeryModuleContract {
  return contract;
}

export const noOptions = z.object({}).strict();

export function classOption<T>(): z.ZodType<Type<T>> {
  return z.custom<Type<T>>((value) => typeof value === 'function', {
    message: 'expected a class',
  });
}

export function loginHandlerOptions<T>() {
  return z.object({ loginHandler: classOption<T>().optional() }).strict();
}
