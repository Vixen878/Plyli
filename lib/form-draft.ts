import { formDefinitionSchema } from '@/core/contracts';

export function prepareFormDraft(input: unknown) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Paste a JSON object that describes one Plyli form.');
  }

  const now = new Date().toISOString();
  const result = formDefinitionSchema.safeParse({
    schemaVersion: 2,
    ...input,
    id: crypto.randomUUID(),
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  if (!result.success) {
    throw new Error(result.error.issues.slice(0, 3).map(({ path, message }) =>
      path.length ? `${path.join('.')} — ${message}` : message
    ).join('\n'));
  }
  return result.data;
}
