import { Logger } from '@nestjs/common';
import { parseEnv } from '../common/env';

/** Seed entry point. Validates env; Story 1.4 adds the Menu upserts. */
function seed(): void {
  parseEnv();
  new Logger('Seed').log('nothing to seed');
}
seed();
