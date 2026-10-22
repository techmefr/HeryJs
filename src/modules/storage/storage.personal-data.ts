import { Injectable, OnModuleInit } from '@nestjs/common';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';
import { StorageDriverRegistry } from './storage-driver.registry';

/**
 * An erasure clears the key a `file` field holds; this removes the object the
 * key named, from whichever driver is active.
 */
@Injectable()
export class StoragePersonalData implements OnModuleInit {
  constructor(
    private readonly registry: PersonalDataRegistry,
    private readonly drivers: StorageDriverRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.registerFileRemover((key) => this.drivers.active.remove(key));
  }
}
