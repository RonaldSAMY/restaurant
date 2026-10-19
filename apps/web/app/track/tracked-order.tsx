'use client';

import type { GuestOrderView } from '@restaurant/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCurrentOrder, getOrderByReference } from '../../lib/api';
import { describeLookupError, OrderView } from './order-view';

/** What the tracking page shows: nothing yet, the Order, or an error. */
type State =
  | { kind: 'loading' }
  | { kind: 'order'; order: GuestOrderView }
  | { kind: 'error'; message: string };

/**
 * Loads an Order in the browser, so the Guest cookie goes same-origin and
 * the lookup throttle counts per client. Without `reference` it loads the
 * Guest Session's Order and sends a 401 back to `/`.
 */
export function TrackedOrder({ reference }: { reference?: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const load =
      reference === undefined
        ? getCurrentOrder()
        : getOrderByReference(reference);
    void load.then((result) => {
      if (cancelled) return;
      if (result.ok) setState({ kind: 'order', order: result.data });
      else if (
        reference === undefined &&
        result.error.code === 'UNAUTHENTICATED'
      )
        router.replace('/');
      else
        setState({ kind: 'error', message: describeLookupError(result.error) });
    });
    return () => {
      cancelled = true;
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
