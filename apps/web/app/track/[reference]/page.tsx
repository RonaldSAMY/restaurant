import { LookupForm } from '../../lookup-form';
import { TrackedOrder } from '../tracked-order';

/** Any Order by its reference, from any device, within 24 h of placement. */
export default async function TrackByReferencePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  return (
    <main>
      <h1>Your Order</h1>
      <TrackedOrder reference={reference} />
      <LookupForm />
    </main>
  );
}
