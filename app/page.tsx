import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowRight, ArrowUpRight, Github } from 'lucide-react';
import { createEventRsvpForm } from '@/lib/form-engine';
import { LandingDemo } from '@/components/landing-demo';
import { getAuth } from '@/server/auth';
import { siteDescription, siteTitle, socialMetadata } from '@/lib/social-metadata';

export const metadata = socialMetadata(siteTitle, siteDescription, '/', '/social-image');

const repository = 'https://github.com/Vixen878/Plyli';
const primary = 'inline-flex items-center gap-2 rounded-xl border-2 border-[#2A2623] bg-[#E86D52] px-4 py-2.5 font-bold text-[#2A2623] shadow-[3px_3px_0_#2A2623] hover:bg-[#EE8069] focus-visible:outline-2 focus-visible:outline-offset-4';
const capabilities = [
  ['Ask one question at a time', 'Give people room to focus. Start with a template, then make the questions and appearance your own.'],
  ['Send people down the right path', 'Connect questions in the visual Flow editor. Skip what’s irrelevant and follow up on the answers that matter.'],
  ['Collect and use responses', 'Share a link or embed a form. Review individual submissions, export your results, or connect an application with the API.'],
];

export default async function HomePage() {
  const requestHeaders = await headers();
  const authConfigured = process.env.BETTER_AUTH_URL && process.env.BETTER_AUTH_SECRET && process.env.DATABASE_URL;
  const session = authConfigured && requestHeaders.has('cookie')
    ? await getAuth().api.getSession({ headers: requestHeaders })
    : null;
  return <main className="min-h-dvh">
    <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
      <Link href="/" className="font-display text-2xl font-extrabold focus-visible:outline-2">Plyli<span className="text-[#D4573B]">.</span></Link>
      <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-4 text-sm font-semibold">
        <Link href="/api-reference" className="hidden underline-offset-4 hover:underline sm:inline">API reference</Link>
        <a href={repository} className="inline-flex items-center gap-1.5 hover:underline underline-offset-4"><Github size={16} />GitHub</a>
        <Link href={session ? '/dashboard' : '/login'} className={primary}>{session ? 'Open workspace' : 'Sign in'}</Link>
      </nav>
    </header>
    <section className="mx-auto grid max-w-7xl items-center gap-9 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1fr_1.03fr] lg:gap-14 lg:pb-24 lg:pt-20">
      <div>
        <p className="mb-4 inline-block rounded-md border border-[#2A2623]/30 bg-[#F6D97A]/45 px-2.5 py-1 text-xs font-bold">Open-source form builder</p>
        <h1 className="font-display max-w-xl text-[clamp(2.8rem,7vw,5.1rem)] font-extrabold leading-[.97] tracking-[-.045em]">
          Forms that feel <span className="decoration-[#E86D52] underline decoration-[.08em] underline-offset-[.14em]">effortless.</span>
        </h1>
        <p className="mt-7 max-w-md text-base leading-relaxed text-[#6E655E] sm:text-lg">Build conversational forms with visual branching. Share a link, collect responses, and connect the results to your own tools.</p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link href="/dashboard" className={primary}>Create a form <ArrowRight size={17} /></Link>
          <a href={repository} className="inline-flex items-center gap-1.5 text-sm font-bold underline underline-offset-4">Explore the source <ArrowUpRight size={15} /></a>
        </div>
      </div>
      <LandingDemo form={createEventRsvpForm('plyli-rsvp-demo')} />
    </section>
    <section aria-labelledby="capabilities-heading" className="border-y border-[#2A2623]/20 bg-[#FFFDF9]/70">
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_2fr] lg:gap-14">
        <h2 id="capabilities-heading" className="font-display text-3xl font-extrabold tracking-tight">From first question to final response.</h2>
        <div className="divide-y divide-[#2A2623]/15">
          {capabilities.map(([title, description]) => <article key={title} className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[.9fr_1.1fr] sm:gap-5">
            <h3 className="font-display text-lg font-bold">{title}</h3>
            <p className="text-sm leading-relaxed text-[#6E655E]">{description}</p>
          </article>)}
        </div>
      </div>
    </section>
    <section aria-labelledby="open-source-heading" className="mx-auto grid max-w-7xl items-center gap-6 px-5 py-14 sm:px-8 md:grid-cols-[1fr_auto]">
      <div><h2 id="open-source-heading" className="font-display text-3xl font-extrabold tracking-tight">Run it your way.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6E655E]">Plyli is MIT licensed. Read the code, run your own instance, or contribute on GitHub. Export your forms and responses when you need them.</p>
        <a href={repository + '#setup'} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4">Self-hosting guide <ArrowUpRight size={14} /></a>
      </div>
      <Link href="/dashboard" className={primary}>Start building <ArrowRight size={17} /></Link>
    </section>
    <footer className="border-t border-[#2A2623]/20">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-sm sm:px-8">
        <Link href="/" className="font-display font-extrabold">Plyli<span className="text-[#D4573B]">.</span></Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-4 text-[#6E655E]">
          <Link href="/api-reference" className="hover:underline">API reference</Link>
          <a href={repository + '/blob/main/LICENSE'} className="hover:underline">License</a>
          <a href={repository + '/issues'} className="hover:underline">Feedback</a>
        </nav>
      </div>
    </footer>
  </main>;
}
