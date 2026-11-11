import { AuthPage } from '@/components/auth-page';
export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; next?: string | string[] }> }) {
  return <AuthPage signup={false} query={await searchParams} />;
}
