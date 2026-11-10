'use client';
import { PaperButton } from '@/components/paper-primitives';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="max-w-xl mx-auto px-6 py-24 space-y-6">
    <p className="font-display font-extrabold text-xl">Plyli.</p>
    <h1 className="font-display font-bold text-3xl">We couldn’t load this page</h1>
    <p className="text-[#6E655E]">Please try again. If the problem continues, come back in a few minutes.</p>
    <PaperButton onClick={reset}>Try again</PaperButton>
  </main>;
}
