import { fetchMenu } from '../lib/menu';
import { OrderMenu } from './order-menu';
import { LookupForm } from './lookup-form';

/** Render per request so the Menu is always fresh from the api. */
export const dynamic = 'force-dynamic';

/**
 * Public Menu page: categories in api order, each with its Menu Items, and
 * the basket that places an Order, and the lookup for an existing one.
 */
export default async function HomePage() {
  const menu = await fetchMenu();

  return (
    <main>
      <h1>Menu</h1>
      {menu === null ? (
        <section role="status">
          <p>Menu unavailable. Please try again in a moment.</p>
        </section>
      ) : menu.categories.length === 0 ? (
        <p>No dishes on the Menu yet.</p>
      ) : (
        <OrderMenu categories={menu.categories} />
      )}
      <LookupForm />
    </main>
  );
}
