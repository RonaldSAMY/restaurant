import { Injectable, Module } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Socket.IO room names; only the server picks rooms, clients never name one. */
export const Rooms = {
  /** Every connected staff socket. */
  kitchen: 'kitchen',
  /** Sockets following the Order with `id` (Guest Session or `order.subscribe`). */
  order: (id: string) => `order:${id}`,
  /** Sockets of staff session `sid`, disconnected on logout. */
  staffSession: (sid: string) => `staff-session:${sid}`,
} as const;

/**
 * Holds the Socket.IO server once the realtime gateway has started, so
 * publishers and logout can reach sockets without importing the gateway.
 * `server` stays unset when no gateway runs; users must no-op then.
 */
@Injectable()
export class SocketServerRef {
  /** The gateway's server, set in its `afterInit`. */
  server?: Server;
}

/** Provides the single {@link SocketServerRef} to auth, orders and realtime. */
@Module({ providers: [SocketServerRef], exports: [SocketServerRef] })
export class SocketServerRefModule {}
