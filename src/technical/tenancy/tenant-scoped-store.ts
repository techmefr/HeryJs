import { Injectable } from '@nestjs/common';
import { TenantContextStorage } from './tenant-context';

export interface TenantScopedRecord {
  id: string;
}

@Injectable()
export class TenantScopedStore<T extends TenantScopedRecord> {
  private readonly records: Array<T & { tenantId: string }> = [];

  create(data: T): T & { tenantId: string } {
    const tenantId = TenantContextStorage.getTenantId();
    const record = { ...data, tenantId };
    this.records.push(record);
    return record;
  }

  findAll(): Array<T & { tenantId: string }> {
    const tenantId = TenantContextStorage.getTenantId();
    return this.records.filter((record) => record.tenantId === tenantId);
  }
}
