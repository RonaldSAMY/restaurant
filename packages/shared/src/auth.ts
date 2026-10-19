import { z } from 'zod';

/** Body of `POST /api/v1/auth/login`. The email is trimmed and lower-cased. */
export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(1024),
});

/** Parsed login body (see {@link LoginRequestSchema}). */
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** The logged-in staff user, as returned by login and `GET auth/me`. */
export const StaffMeSchema = z.object({
  id: z.uuid(),
  email: z.string(),
});

/** Logged-in staff user (see {@link StaffMeSchema}). */
export type StaffMe = z.infer<typeof StaffMeSchema>;
