import { Injectable, OnModuleInit } from '@nestjs/common';
import { PersonalDataRegistry } from '#technical/privacy/personal-data.registry';

@Injectable()
export class BlogPostPersonalData implements OnModuleInit {
  constructor(private readonly registry: PersonalDataRegistry) {}

  onModuleInit(): void {
    this.registry.register({
      model: 'BlogPost',
      erase: 'anonymise',
      searchCollection: 'blog-post',
      fields: [
        {
          name: 'title',
          type: 'string',
          optional: false,
          translatable: false,
          personal: true,
        },
        {
          name: 'slug',
          type: 'slug',
          optional: false,
          translatable: false,
          personal: true,
        },
        {
          name: 'summary',
          type: 'string',
          optional: true,
          translatable: true,
          personal: true,
        },
        {
          name: 'body',
          type: 'richtext',
          optional: true,
          translatable: false,
          personal: false,
        },
        {
          name: 'privateNote',
          type: 'encrypted',
          optional: true,
          translatable: false,
          personal: true,
        },
      ],
    });
  }
}
