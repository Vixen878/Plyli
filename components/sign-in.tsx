'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { PaperButton } from './paper-primitives';

export function SignIn({ enabled, authFailed = false }: { enabled: boolean; authFailed?: boolean }) {
  const [error, setError] = useState(authFailed ? 'Sign-in could not be completed. Please try again.' : '');
  return <div className="space-y-4">
    <PaperButton disabled={!enabled} onClick={async () => {
      setError('');
      try {
        const result = await authClient.signIn.social({ provider: 'google', callbackURL: '/dashboard' });
        if (result.error) setError('Unable to sign in. Please try again.');
      } catch { setError('Unable to contact the sign-in service.'); }
    }}>Continue with Google</PaperButton>
    {!enabled && <p>Sign-in is temporarily unavailable. Please try again later.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
