import { DynamicModule, Module, Type } from '@nestjs/common';
import { AuthModule } from '#technical/auth/auth.module';
import { PrismaModule } from '#technical/prisma/prisma.module';
import { AgencySeeder } from './agency.seeder';
import { SEEDERS, Seeder } from './seeder.types';
import { SeedersController } from './seeders.controller';

@Module({})
export class SeedersModule {
  static forRoot(seeders: Type<Seeder>[]): DynamicModule {
    return {
      module: SeedersModule,
      imports: [PrismaModule, AuthModule],
      controllers: [SeedersController],
      providers: [
        AgencySeeder,
        ...seeders,
        {
          provide: SEEDERS,
          useFactory: (...instances: Seeder[]) => instances,
          inject: seeders,
        },
      ],
    };
  }
}
