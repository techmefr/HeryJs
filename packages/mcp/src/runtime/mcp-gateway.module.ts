import { DynamicModule, Module, Type } from '@nestjs/common';
import { AuthModule } from '#kernel/auth/auth.module';
import { McpGatewayController } from './mcp-gateway.controller';
import { MCP_TOOL_REGISTRARS } from './mcp-tool-registrar';
import type { McpToolRegistrar } from './mcp-tool-registrar';

interface McpGatewayOptions {
  imports: DynamicModule['imports'];
  registrars: Type<McpToolRegistrar>[];
}

@Module({})
export class McpGatewayModule {
  static forRoot(options: McpGatewayOptions): DynamicModule {
    return {
      module: McpGatewayModule,
      imports: [AuthModule, ...(options.imports ?? [])],
      controllers: [McpGatewayController],
      providers: [
        {
          provide: MCP_TOOL_REGISTRARS,
          useFactory: (...instances: McpToolRegistrar[]) => instances,
          inject: options.registrars,
        },
      ],
    };
  }
}
