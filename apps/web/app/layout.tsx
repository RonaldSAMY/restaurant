import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

/** Page metadata shared by every route. */
export const metadata = { title: 'Restaurant' };

/** Site-wide navigation links, in display order. */
const NAV_LINKS = [
  { href: '/', label: 'Menu' },
  { href: '/track', label: 'My Order' },
  { href: '/kitchen', label: 'Kitchen' },
] as const;

/** Root HTML shell for every page: site navigation, then the page. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="site-nav" aria-label="Main">
          <ul>
            {NAV_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link href={href}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        {children}
      </body>
    </html>
  );
}
