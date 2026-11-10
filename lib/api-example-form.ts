import { formDefinitionSchema } from '@/core/contracts';
import { createBlankForm } from './form-engine';

export function createExampleForm() {
  const form = createBlankForm();
  form.id = 'form_123';
  form.title = 'Registration questions';
  form.createdAt = form.updatedAt = '2026-11-04T10:00:00Z';
  form.questions = [{ ...form.questions[0], id: 'q_name', required: true }];
  form.questionOrder = ['q_name'];
  return formDefinitionSchema.parse(form);
}
