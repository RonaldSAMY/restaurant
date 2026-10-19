import { SOCKET_PATH } from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
import { refreshSession, STAFF_LOGIN_PAGE } from './api';

/** Pause before reconnecting after a refresh that failed for a non-auth reason. */
const RETRY_MS = 3_000;

/** Options of {@link openSocket}. */
export interface OpenSocketOptions {
  /**
   * Declares a staff client: the server then requires a valid access cookie
   * and joins the kitchen rooms. Without it the cookies' Guest Session decides.
   */
  staff?: boolean;
  /** Runs on every connect, first and re-: refetch the snapshot here. */
  onConnect: (socket: Socket) => void;
  /** Server event handlers by event name; payloads are unparsed. */
  on: Record<string, (payload: unknown) => void>;
}

/**
 * The only `io()` caller: opens the same-origin Socket.IO connection (rooms
 * come from the cookies; JS never sees a token) and returns its close
 * function. A staff socket refused with `UNAUTHENTICATED` runs the shared
 * refresh and reconnects; a second refusal in a row, a rejected refresh, or a
 * server-side disconnect (logout) sends the tab to the login page. Any other
 * refusal (e.g. `INTERNAL`) reconnects after {@link RETRY_MS}.
 */
export function openSocket({
  staff = false,
  onConnect,
  on,
}: OpenSocketOptions): () => void {
  const socket = io({ path: SOCKET_PATH, auth: staff ? { staff: true } : {} });
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  /** Whether the current connect attempt was already refused once. */
  let refused = false;
  const toLogin = () => window.location.assign(STAFF_LOGIN_PAGE);

  for (const [event, handler] of Object.entries(on)) socket.on(event, handler);
  socket.on('connect', () => {
    refused = false;
    onConnect(socket);
  });
  /** Reconnects after {@link RETRY_MS}, unless closed first. */
  const retryLater = () => {
    retry = setTimeout(() => {
      refused = false;
      socket.connect();
    }, RETRY_MS);
  };
  socket.on('connect_error', (error) => {
    if (staff && error.message === 'UNAUTHENTICATED') return;
    // A middleware refusal is final for socket.io-client (`active` false);
    // transport errors keep `active` and reconnect on their own.
    if (!socket.active) retryLater();
  });
  if (staff) {
    socket.on('connect_error', (error) => {
      if (error.message !== 'UNAUTHENTICATED') return;
      if (refused) return toLogin();
      refused = true;
      void refreshSession().then((result) => {
        if (closed) return;
        if (result.ok) socket.connect();
        else if (result.error.code === 'UNAUTHENTICATED') toLogin();
        else retryLater();
      });
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') toLogin();
    });
  }

  return () => {
    closed = true;
    clearTimeout(retry);
    socket.disconnect();
  };
}
