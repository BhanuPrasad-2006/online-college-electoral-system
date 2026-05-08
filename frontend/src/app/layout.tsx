import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'College Election System — Secure Online Voting',
  description:
    'A secure, AI-powered online voting platform for college elections with real-time analytics, fraud detection, and transparent governance.',
  keywords: ['college', 'election', 'voting', 'online', 'secure', 'AI'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-surface-950 text-surface-50 antialiased">
        {children}
      </body>
    </html>
  );
}
