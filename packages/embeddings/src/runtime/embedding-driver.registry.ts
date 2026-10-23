import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { HERY_CONFIG, type HeryConfig } from '#kernel/public/config';
import {
  DriverResolver,
  type EmbeddingDriver,
  EMBEDDINGS_MODULE,
  missingDriverMessage,
} from '#kernel/public/drivers';
import { FakeEmbeddingDriver } from './fake-embedding.driver';
import { OpenAiCompatibleEmbeddingDriver } from './openai-compatible-embedding.driver';

const FAKE_DRIVER = 'fake';
const OPENAI_COMPATIBLE_DRIVER = 'openai-compatible';

@Injectable()
export class EmbeddingDriverRegistry implements OnModuleInit {
  private readonly drivers = new Map<string, EmbeddingDriver>();

  constructor(
    @Inject(HERY_CONFIG) private readonly config: HeryConfig,
    private readonly fakeDriver: FakeEmbeddingDriver,
    private readonly resolver: DriverResolver,
  ) {}

  onModuleInit(): void {
    const declared = this.config.embeddings?.drivers ?? {
      [FAKE_DRIVER]: { driver: FAKE_DRIVER },
    };

    for (const [keyword, entry] of Object.entries(declared)) {
      this.drivers.set(keyword, this.driverFor(keyword, entry.driver));
    }

    const active = this.config.embeddings?.default ?? FAKE_DRIVER;

    if (!this.drivers.has(active)) {
      throw new Error(
        `hery.config.ts sets embeddings.default to "${active}", which is not declared in embeddings.drivers (${[...this.drivers.keys()].join(', ')}).`,
      );
    }
  }

  get active(): EmbeddingDriver {
    const keyword = this.config.embeddings?.default ?? FAKE_DRIVER;
    const driver = this.drivers.get(keyword);

    if (!driver) {
      throw new Error(`Embedding driver "${keyword}" was never resolved.`);
    }

    return driver;
  }

  private driverFor(keyword: string, driverName: string): EmbeddingDriver {
    if (driverName === FAKE_DRIVER) {
      return this.fakeDriver;
    }

    if (driverName === OPENAI_COMPATIBLE_DRIVER) {
      return new OpenAiCompatibleEmbeddingDriver();
    }

    const driver = this.resolver.find<EmbeddingDriver>(
      EMBEDDINGS_MODULE,
      driverName,
    );

    if (!driver) {
      throw new Error(
        missingDriverMessage(EMBEDDINGS_MODULE, keyword, driverName),
      );
    }

    return driver;
  }
}
