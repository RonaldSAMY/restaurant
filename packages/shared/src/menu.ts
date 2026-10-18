import { z } from 'zod';

/** One orderable Menu Item as shown to guests. Price is integer cents. */
export const MenuItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  priceCents: z.number().int().nonnegative(),
});

/** One Menu Item (see {@link MenuItemSchema}). */
export type MenuItem = z.infer<typeof MenuItemSchema>;

/** A named category and the Menu Items in it. */
export const MenuCategorySchema = z.object({
  name: z.string(),
  items: z.array(MenuItemSchema),
});

/** One Menu category (see {@link MenuCategorySchema}). */
export type MenuCategory = z.infer<typeof MenuCategorySchema>;

/** Body of `GET /api/v1/menu`: the whole Menu grouped by category. */
export const MenuResponseSchema = z.object({
  categories: z.array(MenuCategorySchema),
});

/** Parsed Menu response (see {@link MenuResponseSchema}). */
export type MenuResponse = z.infer<typeof MenuResponseSchema>;
