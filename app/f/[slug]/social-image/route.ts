import { publicForms, readPublicForm } from '@/server/public-form';
import { renderSocialImage } from '@/server/social-image';
import { resolveFormAppearance } from '@/themes/appearance-registry';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const published = await readPublicForm((await params).slug);
  if (!published) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return renderSocialImage({
    title: published.definition.title,
    description: published.definition.description,
    accent: resolveFormAppearance(published.definition.appearance, published.definition.accentTheme).primaryColor,
    responses: await publicForms.countResponses(published.form),
  });
}
