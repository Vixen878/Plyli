import type { FormSchema } from '@/core/types';

export function reconcileSavedDraft(current: FormSchema | null, sent: FormSchema, saved: FormSchema) {
  if (!current || current.id !== sent.id) return current;
  if (current === sent) return saved;
  return {
    ...current,
    revision: saved.revision,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}
