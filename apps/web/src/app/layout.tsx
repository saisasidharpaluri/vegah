import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VEGAH Queue Lab | Operations Dashboard',
  description: 'Follow a task through the VEGAH async queue, worker, and persistent result store.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
