import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { authDestination } from '@/lib/auth-destination';
import { SignIn } from './sign-in';

export async function AuthPage({ signup, query }: { signup: boolean; query: { error?: unknown; next?: unknown } }) {
  const destination = authDestination(query.next);
  const configured = Boolean(process.env.BETTER_AUTH_URL && process.env.BETTER_AUTH_SECRET && process.env.DATABASE_URL);
  if (configured && await getAuth().api.getSession({ headers: await headers() })) redirect(destination);
  const providerEnabled = configured && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const alternate = signup ? '/login' : '/signup';
  return <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-5 py-12">
    <div className="grid items-center gap-8 md:grid-cols-[1fr_1.15fr] md:gap-16">
      <div>
        <Link href="/" className="font-display text-3xl font-extrabold focus-visible:outline-2">Plyli<span className="text-[#D4573B]">.</span></Link>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#6E655E]">A place to create, share, and review conversational forms.</p>
      </div>
      <section className="space-y-5 rounded-3xl border-2 border-[#2A2623] bg-[#FFFDF9] p-6 shadow-[4px_4px_0_#2A2623] sm:p-8" aria-labelledby="auth-heading">
        <div>
          <h1 id="auth-heading" className="font-display text-3xl font-extrabold">{signup ? 'Create your account' : 'Sign in to Plyli'}</h1>
          <p className="mt-2 text-sm text-[#6E655E]">{destination.startsWith('/f/') ? 'Continue to the form after signing in.' : signup ? 'Use your Google account to open a Plyli workspace.' : 'Continue to your workspace with Google.'}</p>
        </div>
        <SignIn enabled={providerEnabled} authFailed={query.error === 'sign_in_failed'} destination={destination} />
        <p className="border-t border-[#2A2623]/15 pt-4 text-sm text-[#6E655E]">
          {signup ? 'Already have an account? ' : 'New to Plyli? '}
          <Link href={destination === '/dashboard' ? alternate : `${alternate}?next=${encodeURIComponent(destination)}`} className="font-bold text-[#2A2623] underline underline-offset-4">{signup ? 'Sign in' : 'Create an account'}</Link>
        </p>
      </section>
    </div>
  </main>;
}
