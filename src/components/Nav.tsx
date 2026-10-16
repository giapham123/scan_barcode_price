'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Nav.module.css';

const LINKS = [
  { href: '/', label: 'Scanner' },
  { href: '/products', label: 'Products' },
  { href: '/barcodes', label: 'Test barcodes' },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Main">
      {LINKS.map(({ href, label }) => (
        <Link key={href} href={href} className={styles.link} aria-current={pathname === href ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
