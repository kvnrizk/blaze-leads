import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

export const metadata: Metadata = {
  title: 'Blaze Lead Gen',
  description: 'AI-powered wedding lead generation system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="font-[family-name:var(--font-geist)] antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
