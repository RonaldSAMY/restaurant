'use client';

import type { KitchenOrder, OrderStatus } from '@restaurant/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { advanceOrder, listKitchenOrders, logout } from '../../lib/api';
import { STATUS_LABELS } from '../track/order-view';

/** The board's columns, left to right. */
const COLUMNS = ['RECEIVED', 'PREPARING', 'READY'] as const;

/** Button label for each forward step, keyed by the target status. */
const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  PREPARING: 'Take',
  READY: 'Mark Ready',
  COLLECTED: 'Mark Collected',
};

/** Fallback failure text for board loads and advances. */
const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * The one status the card's button asks for, or null. The server still
 * decides whether the transition is valid.
 */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  switch (status) {
    case 'RECEIVED':
      return 'PREPARING';
    case 'PREPARING':
      return 'READY';
    case 'READY':
      return 'COLLECTED';
    case 'COLLECTED':
      return null;
  }
}

/** The board after `updated` came back: swapped in place, or gone once COLLECTED. */
export function applyAdvanced(
  orders: readonly KitchenOrder[],
  updated: KitchenOrder,
): KitchenOrder[] {
  return orders.flatMap((o) =>
    o.id !== updated.id ? [o] : updated.status === 'COLLECTED' ? [] : [updated],
  );
}

/** Local `HH:MM` of an ISO timestamp. */
function formatTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Props shared by {@link Board} and {@link OrderCard}. */
interface ActionProps {
  /** Ids of Orders whose advance request is in flight. */
  pending: ReadonlySet<string>;
  /** Asks to move the Order to `to`. */
  onAdvance: (order: KitchenOrder, to: OrderStatus) => void;
}

/** One Order: reference, Guest name, lines, time placed and its action. */
export function OrderCard({
  order,
  pending,
  onAdvance,
}: ActionProps & { order: KitchenOrder }) {
  const to = nextStatus(order.status);
  return (
    <li className="card">
      <p className="item-row">
        <span className="order-reference">{order.reference}</span>
        <time dateTime={order.placedAt}>{formatTime(order.placedAt)}</time>
      </p>
      <p className="card-guest">{order.guestName}</p>
      <ul className="items">
        {order.items.map((item, index) => (
          <li key={index}>
            {item.quantity} × {item.name}
          </li>
        ))}
      </ul>
      {to && (
        <button
          type="button"
          disabled={pending.has(order.id)}
          aria-label={`${ACTION_LABELS[to]} ${order.reference}`}
          onClick={() => onAdvance(order, to)}
        >
          {ACTION_LABELS[to]}
        </button>
      )}
    </li>
  );
}

/** Received / Preparing / Ready columns, each in the given (api) order. */
export function Board({
  orders,
  ...actions
}: ActionProps & { orders: readonly KitchenOrder[] }) {
  return (
    <div className="board">
      {COLUMNS.map((status) => {
        const cards = orders.filter((order) => order.status === status);
        return (
          <section key={status} aria-labelledby={`column-${status}`}>
            <h2 id={`column-${status}`}>{STATUS_LABELS[status]}</h2>
            {cards.length === 0 ? (
              <p>No Orders</p>
            ) : (
              <ul className="cards">
                {cards.map((order) => (
                  <OrderCard key={order.id} order={order} {...actions} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Loads the open Orders and lets staff advance them and log out. */
export function KitchenBoard() {
  const router = useRouter();
  const [orders, setOrders] = useState<KitchenOrder[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    void listKitchenOrders().then((result) => {
      if (cancelled) return;
      if (result.ok) setOrders(result.data);
      // UNAUTHENTICATED: staffRequest is already navigating to the login page.
      else if (result.error.code !== 'UNAUTHENTICATED') setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Sends the advance and moves, removes or refreshes the card. The card stays
   * pending until any refetch settles. UNAUTHENTICATED means staffRequest is
   * already navigating to the login page, so no notice is shown.
   */
  async function advance(order: KitchenOrder, to: OrderStatus) {
    setPending((ids) => new Set(ids).add(order.id));
    setNotice('');
    const result = await advanceOrder(order.id, to);
    let message = '';
    if (result.ok) {
      const updated = result.data;
      setOrders((list) => applyAdvanced(list ?? [], updated));
    } else if (result.error.code === 'INVALID_TRANSITION') {
      const reloaded = await listKitchenOrders();
      if (reloaded.ok) {
        setOrders(reloaded.data);
        message = 'That Order already moved. Board refreshed.';
      } else if (reloaded.error.code !== 'UNAUTHENTICATED') {
        message = GENERIC_ERROR;
      }
    } else if (result.error.code !== 'UNAUTHENTICATED') {
      message = GENERIC_ERROR;
    }
    setPending((ids) => {
      const next = new Set(ids);
      next.delete(order.id);
      return next;
    });
    setNotice(message);
  }

  /** Ends the session and returns to the login page whatever the result. */
  async function signOut() {
    await logout();
    router.replace('/kitchen/login');
  }

  return (
    <>
      <header className="board-header">
        <h1>Kitchen Board</h1>
        {orders !== null && (
          <button type="button" onClick={() => void signOut()}>
            Log out
          </button>
        )}
      </header>
      <p role="status" className="notice">
        {notice}
      </p>
      {orders !== null ? (
        <Board
          orders={orders}
          pending={pending}
          onAdvance={(order, to) => void advance(order, to)}
        />
      ) : loadFailed ? (
        <p role="alert" className="error">
          {GENERIC_ERROR}
        </p>
      ) : (
        <p>Loading Orders…</p>
      )}
    </>
  );
}
