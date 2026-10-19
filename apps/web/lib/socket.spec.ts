import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from './api';
import { openSocket } from './socket';

/** A fake `socket.io-client` socket: records handlers, lets tests fire them. */
const fake = vi.hoisted(() => {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    handlers,
    socket: {
      on: (event: string, fn: (...args: unknown[]) => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), fn]);
      },
      active: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
    fire: (event: string, ...args: unknown[]) => {
      for (const fn of handlers.get(event) ?? []) fn(...args);
    },
  };
});

vi.mock('socket.io-client', () => ({ io: vi.fn(() => fake.socket) }));

/** Mock of the shared `refreshSession`. */
const refresh = vi.hoisted(() => vi.fn<() => Promise<ApiResult<undefined>>>());
vi.mock('./api', () => ({
  refreshSession: refresh,
  STAFF_LOGIN_PAGE: '/kitchen/login',
}));

/** Flushes pending promise callbacks. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** `connect_error` as the server's middleware refusal. */
const refuse = () => fake.fire('connect_error', new Error('UNAUTHENTICATED'));

describe('openSocket', () => {
  const assign = vi.fn();

  beforeEach(() => {
    fake.handlers.clear();
    fake.socket.connect.mockClear();
    fake.socket.disconnect.mockClear();
    fake.socket.active = false;
    refresh.mockReset();
    assign.mockReset();
    vi.stubGlobal('window', { location: { assign } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('declares staff, wires events and runs onConnect on every connect', async () => {
    const { io } = await import('socket.io-client');
    const onConnect = vi.fn();
    const created = vi.fn();
    openSocket({ staff: true, onConnect, on: { 'order.created': created } });
    expect(io).toHaveBeenLastCalledWith({
      path: '/api/socket.io',
      auth: { staff: true },
    });
    fake.fire('connect');
    fake.fire('connect');
    expect(onConnect).toHaveBeenCalledTimes(2);
    fake.fire('order.created', { x: 1 });
    expect(created).toHaveBeenCalledWith({ x: 1 });
  });

  it('refreshes once on UNAUTHENTICATED and reconnects', async () => {
    refresh.mockResolvedValue({ ok: true, data: undefined });
    openSocket({ staff: true, onConnect: vi.fn(), on: {} });
    refuse();
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fake.socket.connect).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it('goes to the login page on a second refusal in a row', async () => {
    refresh.mockResolvedValue({ ok: true, data: undefined });
    openSocket({ staff: true, onConnect: vi.fn(), on: {} });
    refuse();
    await flush();
    refuse();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/kitchen/login');
  });

  it('refreshes again after a successful connect in between', async () => {
    refresh.mockResolvedValue({ ok: true, data: undefined });
    openSocket({ staff: true, onConnect: vi.fn(), on: {} });
    refuse();
    await flush();
    fake.fire('connect');
    refuse();
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(assign).not.toHaveBeenCalled();
  });

  it('goes to the login page when the refresh is rejected', async () => {
    refresh.mockResolvedValue({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'no' },
    });
    openSocket({ staff: true, onConnect: vi.fn(), on: {} });
    refuse();
    await flush();
    expect(assign).toHaveBeenCalledWith('/kitchen/login');
    expect(fake.socket.connect).not.toHaveBeenCalled();
  });

  it('retries later after a non-auth refresh failure, unless closed', async () => {
    vi.useFakeTimers();
    refresh.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: 'Network error' },
    });
    const close = openSocket({ staff: true, onConnect: vi.fn(), on: {} });
    refuse();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fake.socket.connect).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();

    refuse();
    await vi.advanceTimersByTimeAsync(0);
    close();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fake.socket.connect).toHaveBeenCalledTimes(1);
    expect(fake.socket.disconnect).toHaveBeenCalled();
  });

  it('goes to the login page on a server-side disconnect only', () => {
    openSocket({ staff: true, onConnect: vi.fn(), on: {} });
    fake.fire('disconnect', 'transport close');
    expect(assign).not.toHaveBeenCalled();
    fake.fire('disconnect', 'io server disconnect');
    expect(assign).toHaveBeenCalledWith('/kitchen/login');
  });

  it('leaves a guest socket alone on refusal and disconnect', async () => {
    openSocket({ onConnect: vi.fn(), on: {} });
    refuse();
    fake.fire('disconnect', 'io server disconnect');
    await flush();
    expect(refresh).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    ['staff', true],
    ['guest', false],
  ])(
    'reconnects a %s socket later after a non-auth refusal, unless closed',
    async (_, staff) => {
      vi.useFakeTimers();
      const close = openSocket({ staff, onConnect: vi.fn(), on: {} });
      fake.fire('connect_error', new Error('INTERNAL'));
      await vi.advanceTimersByTimeAsync(3_000);
      expect(fake.socket.connect).toHaveBeenCalledTimes(1);
      expect(refresh).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();

      fake.socket.active = true; // transport error: the client retries itself
      fake.fire('connect_error', new Error('xhr poll error'));
      fake.socket.active = false;
      fake.fire('connect_error', new Error('INTERNAL'));
      close();
      await vi.advanceTimersByTimeAsync(3_000);
      expect(fake.socket.connect).toHaveBeenCalledTimes(1);
    },
  );
});
