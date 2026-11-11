import { renderSocialImage } from '@/server/social-image';

export const dynamic = 'force-static';

export function GET() {
  return renderSocialImage({
    title: 'Forms that feel effortless.',
    description: 'Build conversational forms with visual branching. Share a link and collect responses.',
  });
}
