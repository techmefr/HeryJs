import { Controller, Get, Header } from '@nestjs/common';
import { metricsRegistry } from './metrics.registry';

@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain')
  metrics() {
    return metricsRegistry.metrics();
  }
}
