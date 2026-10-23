import { defineHeryModule, noOptions } from '@heryjs/core/modules';
import { HttpClientModule } from './http-client.module';
import { OfetchHttpClientModule } from './ofetch-http-client.module';

export default defineHeryModule({
  name: '@heryjs/http-client',
  module: () => [HttpClientModule, OfetchHttpClientModule],
  options: noOptions,
  extensionPoints: ['httpClient.driver'],
});
