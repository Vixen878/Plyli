import 'server-only';
import { cache } from 'react';
import { resourceId } from '@/core/contracts';
import { db } from './db';
import { ApiError } from './errors';
import { FormService } from './forms';

export const publicForms = new FormService(db);

export const readPublicForm = cache(async (slug: string) => {
  if (!resourceId.safeParse(slug).success) return null;
  try {
    return await publicForms.getPublished(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});
