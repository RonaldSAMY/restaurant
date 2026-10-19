import { describe, expect, it } from 'vitest';
import { OrderStatusMachine } from './order-status-machine';

describe('OrderStatusMachine', () => {
  it.each([
    ['RECEIVED', null],
    ['PREPARING', 'RECEIVED'],
    ['READY', 'PREPARING'],
    ['COLLECTED', 'READY'],
  ] as const)('requires %s to come from %s', (to, from) => {
    expect(OrderStatusMachine.predecessorOf(to)).toBe(from);
  });
});
