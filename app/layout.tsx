import type {Metadata} from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans, JetBrains_Mono, Fraunces } from 'next/font/google';
import './globals.css';

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
  title: 'Plyli — Make forms. Shape flows.',
  description: 'Build expressive forms, shape branching flows, and embed questions in your applications with Plyli’s headless engine and API.',
  openGraph: {
    title: 'Plyli — Make forms. Shape flows.',
    description: 'Forms with personality. A headless engine and API for your applications.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Plyli — Make forms. Shape flows.',
    description: 'Forms with personality. A headless engine and API for your applications.',
  },
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
