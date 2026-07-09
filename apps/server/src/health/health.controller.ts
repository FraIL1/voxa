import { Controller, Get } from '@nestjs/common';
import type { HealthzResponse } from '@voxa/shared';

@Controller()
export class HealthController {
  @Get('healthz')
  healthz(): HealthzResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
