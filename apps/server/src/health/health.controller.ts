import { Controller, Get } from '@nestjs/common';
import type { HealthzResponse } from '@voxa/shared';

import { Public } from '../common/decorators/public.decorator';

@Controller()
export class HealthController {
  @Public()
  @Get('healthz')
  healthz(): HealthzResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
