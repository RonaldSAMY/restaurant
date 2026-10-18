import type { ReactNode } from 'react';
import './globals.css';

/** Page metadata shared by every route. */
export const metadata = { title: 'Restaurant' };

/** Root HTML shell for every page. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
