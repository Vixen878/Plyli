import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { db } from '@/server/db';
import { FormService } from '@/server/forms';
import { AccountWorkspace } from '@/components/account-workspace';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function DashboardPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const service = new FormService(db);
  const workspace = await service.provisionWorkspace(session.user.id);
  const forms = await service.list({ kind: 'session', userId: session.user.id }, workspace.id, 100);
  return <AccountWorkspace userName={session.user.name} userImage={session.user.image} workspaceId={workspace.id} initialForms={forms.data} initialCursor={forms.nextCursor} />;
}
