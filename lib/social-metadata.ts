import type { Metadata } from 'next';

export const siteTitle = 'Plyli — Make forms. Shape flows.';
export const siteDescription = 'Build conversational forms with visual branching. Share a link, collect responses, and connect the results to your own tools.';
export const socialImageSize = { width: 1200, height: 630 };

export function socialMetadata(title: string, description: string, path: string, imagePath: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title, description, type: 'website', siteName: 'Plyli', url: path,
      images: [{ url: imagePath, alt: title, ...socialImageSize }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: imagePath, alt: title }] },
  };
}
