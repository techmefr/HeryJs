import { Controller, Get } from '@nestjs/common';
import { PublicRoute } from '#technical/capabilities/public-route.decorator';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @PublicRoute('service banner: names the framework and nothing about the data')
  getHello(): string {
    return this.appService.getHello();
  }
}
