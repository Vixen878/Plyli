import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { FormService } from '@/server/forms';
import { ApiError } from '@/server/errors';
import { PublicForm } from '@/components/public-form';
import { resourceId } from '@/core/contracts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!resourceId.safeParse(slug).success) notFound();
  try {
    const { definition } = await new FormService(db).getPublished(slug);
    return <PublicForm form={definition} slug={slug} />;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}
