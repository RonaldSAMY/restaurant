import type { MenuItem } from '../generated/prisma/client';

/** Demo Menu. Fixed UUIDs make the seed an idempotent upsert. */
export const MENU_SEED_ITEMS: MenuItem[] = [
  {
    id: '0b6f3c1e-5a2d-4c8e-9f10-000000000001',
    category: 'Starters',
    name: 'Tomato Bruschetta',
    description: 'Grilled sourdough, vine tomatoes, basil and garlic.',
    priceCents: 650,
  },
  {
    id: '0b6f3c1e-5a2d-4c8e-9f10-000000000002',
    category: 'Starters',
    name: 'Crispy Calamari',
    description: 'Lightly fried squid with lemon aioli.',
    priceCents: 850,
  },
  {
    id: '0b6f3c1e-5a2d-4c8e-9f10-000000000003',
    category: 'Starters',
    name: 'Soup of the Day',
    description: 'Ask your server; served with warm bread.',
    priceCents: 550,
  },
  {
    id: '0b6f3c1e-5a2d-4c8e-9f10-000000000004',
    category: 'Mains',
    name: 'Margherita Pizza',
    description: 'San Marzano tomato, mozzarella and fresh basil.',
    priceCents: 1200,
  },
  {
    id: '0b6f3c1e-5a2d-4c8e-9f10-000000000005',
    category: 'Mains',
    name: 'Classic Cheeseburger',
    description: 'Beef patty, cheddar, pickles and fries.',
    priceCents: 1450,
  },
  {
    id: '0b6f3c1e-5a2d-4c8e-9f10-000000000006',
    category: 'Mains',
    name: 'Mushroom Risotto',
    description: 'Arborio rice, wild mushrooms and parmesan.',
    priceCents: 1350,
  },
  {
    id: '0b6f3c1e-5a2d-4c8e-9f10-000000000007',
    category: 'Desserts',
    name: 'Tiramisu',
    description: 'Espresso-soaked ladyfingers and mascarpone.',
    priceCents: 700,
  },
  {
    id: '0b6f3c1e-5a2d-4c8e-9f10-000000000008',
    category: 'Desserts',
    name: 'Chocolate Lava Cake',
    description: 'Warm chocolate cake with vanilla ice cream.',
    priceCents: 750,
  },
];
