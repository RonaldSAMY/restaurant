import { Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';
import { parseEnv } from './env';

/** Injection token of the shared, connected Redis client. */
export const REDIS = Symbol('REDIS');

/**
 * Creates the (not yet connected) client. The offline queue is disabled, so
 * commands fail fast (500) instead of hanging while Redis is down.
 */
function createRedisClient(url: string) {
  return createClient({ url, disableOfflineQueue: true });
}

/** Type of the node-redis client provided under {@link REDIS}. */
export type RedisClient = ReturnType<typeof createRedisClient>;

/**
 * Provides a connected node-redis client (factory provider) under
 * {@link REDIS} and closes it when the Nest app closes.
 */
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: async (): Promise<RedisClient> => {
        const logger = new Logger(RedisModule.name);
        const client = createRedisClient(parseEnv().REDIS_URL);
        client.on('error', (err: Error) => logger.error(err.message));
        await client.connect();
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  /** Receives the client so it can be closed on shutdown. */
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  /** Closes the Redis connection on shutdown, unless already closed. */
  async onModuleDestroy(): Promise<void> {
    if (this.redis.isOpen) await this.redis.close();
  }
}
