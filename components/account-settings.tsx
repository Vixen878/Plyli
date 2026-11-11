'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { PaperButton } from './paper-primitives';

export function AccountSettings({ displayName, sessionCount }: { displayName: string; sessionCount: number }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [confirmSessions, setConfirmSessions] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function run(action: () => Promise<{ error: unknown }>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await action();
      if (result.error) throw new Error();
      setNotice(success);
      router.refresh();
    } catch { setError('The account change could not be saved. Try again.'); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      if (name.trim()) void run(() => authClient.updateUser({ name: name.trim() }), 'Display name saved.');
    }}>
      <label htmlFor="account-name" className="block text-sm font-semibold">Display name</label>
      <div className="flex flex-wrap gap-2">
        <input id="account-name" autoComplete="name" className="min-w-48 flex-1 rounded-xl border border-[#2A2623] bg-[#FAF6F0] px-3 py-2 text-sm" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} required />
        <PaperButton type="submit" size="sm" variant="yellow" disabled={busy || !name.trim() || name.trim() === displayName}>Save name</PaperButton>
      </div>
    </form>
    <div className="space-y-3 border-t border-[#2A2623]/15 pt-4">
      <h2 className="font-display text-lg font-bold">Sessions</h2>
      <p className="text-sm text-[#6E655E]">{sessionCount} active {sessionCount === 1 ? 'session' : 'sessions'} including this one.</p>
      <div className="flex flex-wrap gap-2">
        <PaperButton size="sm" disabled={busy} onClick={() => void run(async () => {
          const result = await authClient.signOut();
          if (!result.error) router.replace('/login');
          return result;
        }, 'Signed out.')}>Sign out</PaperButton>
        {sessionCount > 1 && <PaperButton size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmSessions(true)}>Sign out other sessions</PaperButton>}
      </div>
      {confirmSessions && <div className="space-y-2 rounded-lg bg-[#FDF7E2] p-3">
        <p className="text-sm">Sign out on your other devices?</p>
        <div className="flex gap-2"><PaperButton size="sm" variant="coral" disabled={busy} onClick={() => {
          setConfirmSessions(false);
          void run(() => authClient.revokeOtherSessions(), 'Other sessions signed out.');
        }}>Confirm</PaperButton><PaperButton size="sm" variant="ghost" onClick={() => setConfirmSessions(false)}>Cancel</PaperButton></div>
      </div>}
    </div>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {error && <p role="alert" className="rounded-lg bg-[#FDECE8] p-2 text-sm">{error}</p>}
  </div>;
}
