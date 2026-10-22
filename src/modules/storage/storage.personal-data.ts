import { Injectable, OnModuleInit } from '@nestjs/common';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';
import { StorageService } from './storage.service';

/**
 * An erasure clears the key a `file` field holds; this removes the object the
 * key named, through the same tenant check an HTTP caller goes through, so a
 * key pointing at another tenant's object is refused rather than removed.
 */
@Injectable()
export class StoragePersonalData implements OnModuleInit {
  constructor(
    private readonly registry: PersonalDataRegistry,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    this.registry.registerFileRemover((key) => this.storage.removeOwn(key));
  }
}
