'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { PaperButton } from './paper-primitives';

export function SignIn({ enabled, authFailed = false, destination }: { enabled: boolean; authFailed?: boolean; destination: string }) {
  const [error, setError] = useState(authFailed ? 'Sign-in could not be completed. Please try again.' : '');
  const [pending, setPending] = useState(false);
  return <div className="space-y-4">
    <PaperButton variant="yellow" disabled={!enabled || pending} className="w-full justify-center" onClick={async () => {
      setError('');
      setPending(true);
      try {
        const result = await authClient.signIn.social({ provider: 'google', callbackURL: destination, errorCallbackURL: `/login/error?next=${encodeURIComponent(destination)}` });
        if (result.error) { setError('Unable to sign in. Please try again.'); setPending(false); }
      } catch { setError('Unable to contact the sign-in service.'); setPending(false); }
    }}>{pending ? 'Connecting to Google…' : 'Continue with Google'}</PaperButton>
    {!enabled && <p role="status" className="text-sm">Sign-in is temporarily unavailable. Please try again later.</p>}
    {error && <p role="alert" className="rounded-xl bg-[#FDECE8] p-3 text-sm">{error}</p>}
  </div>;
}
