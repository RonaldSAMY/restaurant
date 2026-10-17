import type { ReactNode } from 'react';
import { APP_NAME } from '@restaurant/shared';

/** Page metadata shared by every route. */
export const metadata = { title: APP_NAME };

/** Root HTML shell for every page. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
