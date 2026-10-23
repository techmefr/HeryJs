import type { Type } from '@nestjs/common';
import { z } from 'zod';
import { classOption, defineHeryModule } from '@heryjs/core/modules';
import { McpGatewayModule } from './mcp-gateway.module';
import type { McpToolRegistrar } from './mcp-tool-registrar';

export default defineHeryModule({
  name: '@heryjs/mcp',
  module: (options) => McpGatewayModule.forRoot(options),
  options: z
    .object({
      imports: z.array(z.custom<Type<unknown>>()),
      registrars: z.array(classOption<McpToolRegistrar>()),
    })
    .strict(),
  extensionPoints: ['mcp.tools'],
});
