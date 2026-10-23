import { Controller, Get } from '@nestjs/common';
import { PublicRoute } from '@heryjs/core/capabilities';
import { AppService } from './app.service';
import { UnpaginatedRoute } from '@heryjs/core/http';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @UnpaginatedRoute('one object, not a collection')
  @Get()
  @PublicRoute('service banner: names the framework and nothing about the data')
  getHello(): string {
    return this.appService.getHello();
  }
}
