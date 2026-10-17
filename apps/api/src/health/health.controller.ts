import { Controller, Get } from '@nestjs/common';

/** Liveness endpoint used by the compose healthcheck. */
@Controller('health')
export class HealthController {
  /** Returns `{ ok: true }` while the process can serve requests. */
  @Get()
  check(): { ok: true } {
    return { ok: true };
  }
}
