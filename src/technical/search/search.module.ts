import { Module } from '@nestjs/common';
import { HeryConfigModule } from '#technical/config/hery-config.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { PrismaSearchDriver } from './prisma-search.driver';
import { SearchEngineRegistry } from './search-engine.registry';

@Module({
  imports: [PrismaModule, HeryConfigModule],
  providers: [PrismaSearchDriver, SearchEngineRegistry],
  exports: [SearchEngineRegistry],
})
export class SearchModule {}
