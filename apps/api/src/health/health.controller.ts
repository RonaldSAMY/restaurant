import { Controller, Get } from '@nestjs/common';
import { ApiRoutes } from '@restaurant/shared';
import { Public } from '../common/public.decorator';

/** Liveness endpoint used by the compose healthcheck. */
@Controller(ApiRoutes.health)
export class HealthController {
  /** Returns `{ ok: true }` while the process can serve requests. */
  @Public()
  @Get()
  check(): { ok: true } {
    return { ok: true };
  }
}
