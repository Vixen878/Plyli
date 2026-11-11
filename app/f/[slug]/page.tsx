import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getSessionCookie } from 'better-auth/cookies';
import { PublicForm } from '@/components/public-form';
import { FormUnavailable } from '@/components/form-unavailable';
import { defaultClosedMessage, defaultSubmittedMessage, isResponseCollectionClosed } from '@/lib/form-sharing';
import { getAuth } from '@/server/auth';
import { publicForms, readPublicForm } from '@/server/public-form';
import { socialMetadata } from '@/lib/social-metadata';
import { UTM_PARAMETER_KEYS } from '@/core/attribution';
import { authDestination } from '@/lib/auth-destination';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type FormPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: FormPageProps): Promise<Metadata> {
  const published = await readPublicForm((await params).slug);
  if (!published) return { title: 'Form unavailable · Plyli', robots: { index: false, follow: false } };
  const { definition, form } = published;
  const path = `/f/${encodeURIComponent(form.shareSlug ?? form.publicSlug)}`;
  const description = definition.description.trim() || 'Open this form on Plyli.';
  return socialMetadata(definition.title, description, path, path + '/social-image');
}

export default async function PublicFormPage({ params, searchParams }: FormPageProps) {
  const published = await readPublicForm((await params).slug);
  if (!published) notFound();
  const { definition, form } = published;
  const canonicalSlug = form.shareSlug ?? form.publicSlug;
  const submittedMessage = form.submittedMessage ?? defaultSubmittedMessage;
  if (isResponseCollectionClosed(form)) return <FormUnavailable title={definition.title} kind="closed" message={form.closedMessage ?? defaultClosedMessage} />;

  const requestHeaders = await headers();
  const session = form.submissionPolicy !== 'multiple' && getSessionCookie(requestHeaders)
    ? await getAuth().api.getSession({ headers: requestHeaders, query: { disableRefresh: true } })
    : null;
  if (session && await publicForms.hasResponded(form, `account:${session.user.id}`)) {
    return <FormUnavailable title={definition.title} kind="submitted" message={submittedMessage} />;
  }
  if (form.submissionPolicy === 'verified' && !session) {
      const campaign = new URLSearchParams();
      for (const [key, value] of Object.entries(await searchParams)) {
        if (typeof value === 'string' && UTM_PARAMETER_KEYS.some((field) => field === key.toLowerCase())) campaign.set(key, value);
      }
      const next = authDestination(`/f/${canonicalSlug}${campaign.size ? `?${campaign}` : ''}`);
      return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12">
        <section className="space-y-4 rounded-2xl border-2 border-[#2A2623] bg-[#FFFDF9] p-7 shadow-[4px_4px_0_#2A2623]">
          <h1 className="font-display text-3xl font-bold">{definition.title}</h1>
          <p className="text-sm text-[#6E655E]">Sign in to respond. This form accepts one response per account.</p>
          <Link className="inline-flex rounded-xl border-2 border-[#2A2623] bg-[#F6D97A] px-4 py-2 text-sm font-bold shadow-[2px_2px_0_#2A2623]" href={`/login?next=${encodeURIComponent(next)}`}>Sign in to respond</Link>
        </section>
      </main>;
  }
  return <PublicForm form={definition} slug={canonicalSlug} submittedMessage={submittedMessage}
    rememberOnDevice={!session && form.submissionPolicy === 'one'} allowRepeat={form.submissionPolicy === 'multiple'} />;
}
