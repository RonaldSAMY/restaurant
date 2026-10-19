'use client';

import {
  type GuestOrderView,
  type GuestStatusChanged,
  GuestStatusChangedSchema,
  SocketEvents,
} from '@restaurant/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCurrentOrder, getOrderByReference } from '../../lib/api';
import { openSocket } from '../../lib/socket';
import { describeLookupError, OrderView, ranksLater } from './order-view';

/** What the tracking page shows: nothing yet, the Order, or an error. */
type State =
  | { kind: 'loading' }
  | { kind: 'order'; order: GuestOrderView }
  | { kind: 'error'; message: string };

/** The Order after a live status change: moved when it is this Order's and later. */
export function applyGuestEvent(
  order: GuestOrderView,
  event: GuestStatusChanged,
): GuestOrderView {
  return event.reference === order.reference &&
    ranksLater(event.status, order.status)
    ? { ...order, status: event.status }
    : order;
}

/**
 * Loads an Order in the browser, so the Guest cookie goes same-origin and
 * the lookup throttle counts per client. Without `reference` it loads the
 * Guest Session's Order and sends a 401 back to `/`. A socket keeps it live:
 * every (re)connect reloads it (and re-subscribes by reference), status
 * events move it forward.
 */
export function TrackedOrder({ reference }: { reference?: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // ponytail: an event landing while a reload is in flight is overwritten by
    // the older snapshot; merge the snapshot by rank if that ever shows.
    const load = () =>
      void (
        reference === undefined
          ? getCurrentOrder()
          : getOrderByReference(reference)
      ).then((result) => {
        if (cancelled) return;
        if (result.ok) setState({ kind: 'order', order: result.data });
        else if (
          reference === undefined &&
          result.error.code === 'UNAUTHENTICATED'
        )
          router.replace('/');
        else
          setState({
            kind: 'error',
            message: describeLookupError(result.error),
          });
      });
    load();
    const close = openSocket({
      onConnect: (socket) => {
        load();
        if (reference !== undefined)
          socket.emit(SocketEvents.orderSubscribe, { reference });
      },
      on: {
        [SocketEvents.orderStatusChanged]: (payload) => {
          const event = GuestStatusChangedSchema.safeParse(payload);
          if (!event.success) return;
          setState((s) =>
            s.kind === 'order'
              ? { kind: 'order', order: applyGuestEvent(s.order, event.data) }
              : s,
          );
        },
      },
    });
    return () => {
      cancelled = true;
      close();
    };
  }, [reference, router]);

  switch (state.kind) {
    case 'loading':
      return <p role="status">Loading your Order…</p>;
    case 'error':
      return (
        <p role="alert" className="error">
          {state.message} <Link href="/">Back to the Menu</Link>
        </p>
      );
    case 'order':
      return <OrderView order={state.order} />;
  }
}
