import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VersionConflictException } from '#technical/errors/version-conflict.exception';
import { VersionRequiredException } from '#technical/errors/version-required.exception';
import {
  assertVersionIsCurrent,
  ifMatchVersionOf,
  isLostRaceError,
  resolveExpectedVersion,
} from './record-version';

describe('record version', () => {
  describe('ifMatchVersionOf', () => {
    it('reads a quoted version, weak or strong', () => {
      expect(ifMatchVersionOf('"3"', 1)).toBe(3);
      expect(ifMatchVersionOf('W/"12"', 1)).toBe(12);
    });

    it('is null when the header is absent', () => {
      expect(ifMatchVersionOf(undefined, 1)).toBeNull();
      expect(ifMatchVersionOf(undefined, 5)).toBeNull();
    });

    it.each(['*', '3', '"abc"', '"3", "4"', ''])(
      'refuses %p as a version',
      (header) => {
        expect(() => ifMatchVersionOf(header, 1)).toThrow(BadRequestException);
      },
    );

    it('refuses a header on a request carrying several entries', () => {
      expect(() => ifMatchVersionOf('"3"', 2)).toThrow(BadRequestException);
      expect(() => ifMatchVersionOf('"3"', 0)).toThrow(BadRequestException);
    });
  });

  describe('resolveExpectedVersion', () => {
    it('prefers the version in the body and records where it came from', () => {
      expect(resolveExpectedVersion('note', 4, 2)).toEqual({
        value: 4,
        source: 'body',
      });
    });

    it('falls back to the header', () => {
      expect(resolveExpectedVersion('note', undefined, 2)).toEqual({
        value: 2,
        source: 'header',
      });
    });

    it('is required when neither is sent', () => {
      expect(() => resolveExpectedVersion('note', undefined, null)).toThrow(
        VersionRequiredException,
      );
    });
  });

  describe('assertVersionIsCurrent', () => {
    it('passes on a match', () => {
      expect(() =>
        assertVersionIsCurrent('note', { value: 2, source: 'body' }, 2),
      ).not.toThrow();
    });

    it('answers 409 for a stale body version and names the current one', () => {
      try {
        assertVersionIsCurrent('note', { value: 1, source: 'body' }, 3);
        throw new Error('expected a conflict');
      } catch (error) {
        expect(error).toBeInstanceOf(VersionConflictException);
        const conflict = error as VersionConflictException;
        expect(conflict.getStatus()).toBe(409);
        expect(conflict.key).toBe('record.versionConflict');
        expect(conflict.details).toEqual({
          resource: 'note',
          expected: 1,
          current: 3,
        });
      }
    });

    it('answers 412 when the stale version came from If-Match', () => {
      try {
        assertVersionIsCurrent('note', { value: 1, source: 'header' }, 3);
        throw new Error('expected a conflict');
      } catch (error) {
        const conflict = error as VersionConflictException;
        expect(conflict.getStatus()).toBe(412);
        expect(conflict.key).toBe('record.preconditionFailed');
      }
    });
  });

  describe('isLostRaceError', () => {
    it('recognises the record-not-found code Prisma raises for an unmatched where', () => {
      const error = new Prisma.PrismaClientKnownRequestError('gone', {
        code: 'P2025',
        clientVersion: 'test',
      });

      expect(isLostRaceError(error)).toBe(true);
    });

    it('leaves other failures alone', () => {
      const error = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      });

      expect(isLostRaceError(error)).toBe(false);
      expect(isLostRaceError(new Error('boom'))).toBe(false);
    });
  });
});
