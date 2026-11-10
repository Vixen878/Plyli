import { SignIn } from '@/components/sign-in';
export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const authFailed = (await searchParams).error === 'sign_in_failed';
  return <main className="max-w-xl mx-auto px-6 py-24 space-y-7">
    <h1 className="font-display text-4xl font-bold">Your Plyli workspace</h1>
    <p>Sign in to save forms to your account and share published forms.</p>
    <SignIn authFailed={authFailed} enabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.BETTER_AUTH_SECRET)} />
  </main>;
}
