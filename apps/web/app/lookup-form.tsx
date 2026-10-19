'use client';

import { GuestOrderViewSchema } from '@restaurant/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/** The Order Reference format, from the shared Guest view schema. */
const ReferenceSchema = GuestOrderViewSchema.shape.reference;

/** Reference input that opens `/track/[reference]`. */
export function LookupForm() {
  const router = useRouter();
  const [reference, setReference] = useState('');
  const value = reference.trim().toUpperCase();
  const valid = ReferenceSchema.safeParse(value).success;

  /** Opens the normalized reference's tracking page. */
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) router.push(`/track/${value}`);
  }

  return (
    <form className="lookup" onSubmit={submit}>
      <label htmlFor="order-reference">Track an Order by reference</label>
      <div className="lookup-row">
        <input
          id="order-reference"
          name="reference"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
        <button type="submit" disabled={!valid}>
          Track
        </button>
      </div>
    </form>
  );
}
