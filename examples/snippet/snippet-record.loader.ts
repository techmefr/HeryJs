import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT } from '#technical/prisma/prisma.client';
import type { TenantScopedPrismaClient } from '#technical/prisma/prisma.client';
import type { RecordLoader } from '#technical/capabilities/capability-check';
import { SharingService } from '#technical/sharing/sharing.service';
import type { SnippetRecordLike } from './snippet.policy';

export const SNIPPET_RECORD_LOADER = Symbol('SNIPPET_RECORD_LOADER');
export const SNIPPET_VISIBLE_RECORD_LOADER = Symbol(
  'SNIPPET_VISIBLE_RECORD_LOADER',
);

// Update/delete/restore all need to find a record regardless of its
// soft-delete state (restore specifically targets trashed rows).
@Injectable()
export class SnippetRecordLoader implements RecordLoader<SnippetRecordLike> {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly sharing: SharingService,
  ) {}

  async load(id: string) {
    const record = await this.prisma.snippet.findUnique({ where: { id } });
    return record
      ? (await this.sharing.withShares('Snippet', [record]))[0]!
      : null;
  }
}

// Plain reads must not resurface a soft-deleted record as if it still existed.
@Injectable()
export class SnippetVisibleRecordLoader implements RecordLoader<SnippetRecordLike> {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: TenantScopedPrismaClient,
    private readonly sharing: SharingService,
  ) {}

  async load(id: string) {
    const record = await this.prisma.snippet.findUnique({ where: { id } });
    return record && !record.deletedAt
      ? (await this.sharing.withShares('Snippet', [record]))[0]!
      : null;
  }
}
