import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AccountAvatar } from '@/components/account-avatar';
import { getAuth } from '@/server/auth';
import { db } from '@/server/db';
import { AccountSettings } from '@/components/account-settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account settings · Plyli' };

export default async function AccountPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login?next=/account');
  const { user } = session;
  const [providers, memberships, sessionCount] = await Promise.all([
    db.account.findMany({ where: { userId: user.id }, select: { providerId: true }, distinct: ['providerId'] }),
    db.membership.findMany({ where: { userId: user.id }, select: { role: true, workspace: { select: { id: true, name: true } } } }),
    db.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
  ]);
  return <main className="mx-auto max-w-5xl px-5 py-9 sm:py-14">
    <Link href="/dashboard" className="text-sm font-semibold underline underline-offset-4">Back to workspace</Link>
    <div className="my-6 flex items-center gap-4">
      <AccountAvatar name={user.name} image={user.image} size={56} />
      <div className="min-w-0"><h1 className="font-display text-3xl font-extrabold">Account settings</h1><p className="break-all text-sm text-[#6E655E]">{user.email}</p></div>
    </div>
    <div className="grid items-start gap-5 md:grid-cols-[1.3fr_1fr]">
      <section aria-label="Profile and security" className="rounded-2xl border-2 border-[#2A2623] bg-[#FFFDF9] p-5 shadow-[3px_3px_0px_#2A2623]">
        <AccountSettings displayName={user.name} sessionCount={sessionCount} />
      </section>
      <aside className="space-y-4 rounded-2xl border border-[#2A2623]/40 bg-[#FFFDF9] p-5">
        <section>
          <h2 className="font-display text-lg font-bold">Connected sign-in</h2>
          <p className="mt-1 text-sm text-[#6E655E]">{providers.map(({ providerId }) => providerId === 'google' ? 'Google' : providerId).join(', ') || 'No connected providers'}</p>
          <p className="mt-1 text-xs text-[#6E655E]">{user.emailVerified ? 'Email verified' : 'Email verification pending'}</p>
        </section>
        <section className="border-t border-[#2A2623]/15 pt-4">
          <h2 className="font-display text-lg font-bold">Workspaces</h2>
          {memberships.length ? <ul className="mt-2 space-y-2">{memberships.map(({ workspace, role }) => <li className="flex items-center justify-between gap-2 text-sm" key={workspace.id}><span>{workspace.name}</span><span className="rounded-md bg-[#C5DFC9]/45 px-2 py-1 text-xs capitalize">{role.toLowerCase()}</span></li>)}</ul> : <p className="mt-1 text-sm text-[#6E655E]">Open your workspace to get started.</p>}
        </section>
      </aside>
    </div>
  </main>;
}
