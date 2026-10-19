import { LookupForm } from '../lookup-form';
import { TrackedOrder } from './tracked-order';

/** The Guest Session's Order; without a session the page returns to `/`. */
export default function TrackPage() {
  return (
    <main>
      <h1>Your Order</h1>
      <TrackedOrder />
      <LookupForm />
    </main>
  );
}
