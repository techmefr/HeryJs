import { Injectable, OnModuleInit } from '@nestjs/common';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';

@Injectable()
export class SnippetPersonalData implements OnModuleInit {
  constructor(private readonly registry: PersonalDataRegistry) {}

  onModuleInit(): void {
    this.registry.register({
      model: 'Snippet',
      erase: 'delete',
      fields: [
        {
          name: 'title',
          type: 'string',
          optional: false,
          translatable: false,
          personal: false,
        },
      ],
    });
  }
}
