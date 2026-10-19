import { Controller, Get } from '@nestjs/common';
import { ApiRoutes } from '@restaurant/shared';
import { Public } from '../common/public.decorator';

/** Liveness endpoint used by the compose healthcheck. */
@Controller()
export class HealthController {
  /** Returns `{ ok: true }` while the process can serve requests. */
  @Public()
  @Get(ApiRoutes.health)
  check(): { ok: true } {
    return { ok: true };
  }
}
