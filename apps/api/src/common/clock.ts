/**
 * Clock port (ports-and-adapters): the only source of the current time, so
 * time-dependent code can be tested with {@link FakeClock}.
 */
export abstract class Clock {
  /** Returns the current instant. */
  abstract now(): Date;
}

/** Production adapter of {@link Clock}: reads the system time. */
export class SystemClock extends Clock {
  /** Returns the system's current time. */
  now(): Date {
    return new Date();
  }
}

/** Test adapter of {@link Clock}: time stands still until moved explicitly. */
export class FakeClock extends Clock {
  /** Current fake time in epoch milliseconds. */
  private current: number;

  /** Starts the clock at `start`. */
  constructor(start: Date) {
    super();
    this.current = start.getTime();
  }

  /** Returns a copy of the current fake time. */
  now(): Date {
    return new Date(this.current);
  }

  /** Moves the clock forward by `ms` milliseconds. */
  advance(ms: number): void {
    this.current += ms;
  }

  /** Jumps the clock to `date`. */
  set(date: Date): void {
    this.current = date.getTime();
  }
}
