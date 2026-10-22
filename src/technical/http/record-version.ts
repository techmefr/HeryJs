import { Prisma } from '@prisma/client';
import {
  IfMatchMalformedException,
  IfMatchSingleEntryException,
} from '#technical/errors/if-match.exception';
import { VersionConflictException } from '#technical/errors/version-conflict.exception';
import type { VersionSource } from '#technical/errors/version-conflict.exception';
import { VersionRequiredException } from '#technical/errors/version-required.exception';

export interface ExpectedVersion {
  value: number;
  source: VersionSource;
}

const IF_MATCH_VERSION = /^(?:W\/)?"(\d+)"$/;
const RECORD_NOT_FOUND_CODE = 'P2025';

export function ifMatchVersionOf(
  header: string | undefined,
  entryCount: number,
): number | null {
  if (header === undefined) {
    return null;
  }

  if (entryCount !== 1) {
    throw new IfMatchSingleEntryException(entryCount);
  }

  const match = IF_MATCH_VERSION.exec(header.trim());

  if (!match) {
    throw new IfMatchMalformedException(header);
  }

  return Number(match[1]);
}

export function resolveExpectedVersion(
  resource: string,
  bodyVersion: number | undefined,
  ifMatchVersion: number | null,
): ExpectedVersion {
  if (bodyVersion !== undefined) {
    return { value: bodyVersion, source: 'body' };
  }

  if (ifMatchVersion !== null) {
    return { value: ifMatchVersion, source: 'header' };
  }

  throw new VersionRequiredException(resource);
}

export function assertVersionIsCurrent(
  resource: string,
  expected: ExpectedVersion,
  current: number,
): void {
  if (expected.value !== current) {
    throw new VersionConflictException(
      resource,
      expected.value,
      current,
      expected.source,
    );
  }
}

export function isLostRaceError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === RECORD_NOT_FOUND_CODE
  );
}
