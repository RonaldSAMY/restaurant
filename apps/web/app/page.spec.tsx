import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMenu } from '../lib/menu';
import HomePage from './page';

vi.mock('../lib/menu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/menu')>()),
  fetchMenu: vi.fn(),
}));

/** Renders the page with `fetchMenu` resolving to the given value. */
async function render(menu: Awaited<ReturnType<typeof fetchMenu>>) {
  vi.mocked(fetchMenu).mockResolvedValue(menu);
  return renderToStaticMarkup(await HomePage());
}

describe('HomePage', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('shows the unavailable state when the Menu cannot be fetched', async () => {
    expect(await render(null)).toContain('Menu unavailable');
  });

  it('shows the empty message when the Menu has no categories', async () => {
    expect(await render({ categories: [] })).toContain(
      'No dishes on the Menu yet',
    );
  });

  it('renders categories in api order with items', async () => {
    const html = await render({
      categories: [
        {
          name: 'Starters',
          items: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              name: 'Soup',
              description: 'Tomato and basil',
              priceCents: 650,
            },
          ],
        },
        {
          name: 'Mains',
          items: [
            {
              id: '00000000-0000-4000-8000-000000000002',
              name: 'Burger',
              description: 'Beef with cheddar',
              priceCents: 1450,
            },
          ],
        },
      ],
    });
    const headings = [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual(['Starters', 'Mains']);
    for (const text of [
      'Soup',
      '€6.50',
      'Tomato and basil',
      'Burger',
      '€14.50',
      'Beef with cheddar',
    ]) {
      expect(html).toContain(text);
    }
  });
});
