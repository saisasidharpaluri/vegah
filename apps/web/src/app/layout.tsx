import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VEGAH Queue Lab',
  description: 'A practical cloud deployment and asynchronous job processing demo.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
