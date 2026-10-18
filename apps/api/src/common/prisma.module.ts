import { Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { parseEnv } from './env';

/**
 * Prisma client for the app, connected to `DATABASE_URL` through the
 * `pg` driver adapter. Disconnects when the Nest app closes.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  /** Builds the client on the `pg` adapter. */
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: parseEnv().DATABASE_URL }),
    });
  }

  /** Closes the connection pool on shutdown. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Provides and exports the single {@link PrismaService}. */
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
