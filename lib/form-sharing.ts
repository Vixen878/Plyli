import { z } from 'zod';

const legacyId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const shareSlugSchema = z.string().trim().min(3).max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens.')
  .refine((value) => !legacyId.test(value), 'Choose a slug that is different from a form identifier.');
export const submissionPolicySchema = z.enum(['one', 'multiple', 'verified']);
export const defaultClosedMessage = 'This form is no longer accepting responses.';
export const defaultSubmittedMessage = 'Thanks for responding. We’ve received your response and will be in touch if needed.';

export const responseAvailabilitySchema = z.object({
  responsesClosed: z.boolean(),
  responsesEndAt: z.iso.datetime().nullable(),
  closedMessage: z.string().trim().min(1).max(500).nullable(),
  submittedMessage: z.string().trim().min(1).max(500).nullable(),
});
export const sharingUpdateSchema = z.strictObject({
  slug: shareSlugSchema.optional(),
  submissionPolicy: submissionPolicySchema.optional(),
  ...responseAvailabilitySchema.partial().shape,
}).refine((data) => Object.keys(data).length > 0);

export const sharingSchema = z.object({
  slug: z.string(),
  customSlug: z.string().nullable(),
  published: z.boolean(),
  publicAccess: z.boolean(),
  submissionPolicy: submissionPolicySchema,
  ...responseAvailabilitySchema.shape,
});
export type SharingSettings = z.infer<typeof sharingSchema>;

export function isResponseCollectionClosed(settings: { responsesClosed: boolean; responsesEndAt: Date | null }, now = new Date()) {
  return settings.responsesClosed || (settings.responsesEndAt !== null && settings.responsesEndAt <= now);
}

export function suggestShareSlug(title: string) {
  const slug = title.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64).replace(/-$/, '');
  return shareSlugSchema.safeParse(slug).success ? slug : 'my-form';
}
