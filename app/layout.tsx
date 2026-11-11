import type {Metadata} from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans, JetBrains_Mono, Fraunces } from 'next/font/google';
import './globals.css';
import { siteDescription, siteTitle } from '@/lib/social-metadata';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-serif',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  metadataBase: process.env.BETTER_AUTH_URL && URL.canParse(process.env.BETTER_AUTH_URL)
    ? new URL(new URL(process.env.BETTER_AUTH_URL).origin)
    : undefined,
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jakarta.variable} ${fraunces.variable} ${jetbrains.variable}`}>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#FAF6F0] text-[#2A2623] antialiased selection:bg-[#F6D97A] selection:text-[#2A2623]"
        style={{ fontFamily: 'var(--font-sans), sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
