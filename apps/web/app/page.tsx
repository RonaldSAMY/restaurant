import { fetchMenu, formatPrice } from '../lib/menu';

/** Render per request so the Menu is always fresh from the api. */
export const dynamic = 'force-dynamic';

/** Public Menu page: categories in api order, each with its Menu Items. */
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
        menu.categories.map((category) => (
          <section key={category.name}>
            <h2>{category.name}</h2>
            <ul className="items">
              {category.items.map((item) => (
                <li key={item.id}>
                  <div className="item-row">
                    <span className="item-name">{item.name}</span>
                    <span className="item-price">
                      {formatPrice(item.priceCents)}
                    </span>
                  </div>
                  <p className="item-description">{item.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
