import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankForm } from '@/lib/form-engine';
import { mergeFormChanges } from '@/core/conflicts';
test('merge combines independent fields without changing the server revision', () => {
  const base = createBlankForm();
  const result = mergeFormChanges(base, { ...base, title: 'My title' }, { ...base, description: 'Their description', revision: 12 });
  assert.equal(result.conflicts.length, 0); assert.equal(result.merged.title, 'My title'); assert.equal(result.merged.description, 'Their description'); assert.equal(result.merged.revision, 12);
});
test('overlapping question edits require explicit selection and synchronize order', () => {
  const base = createBlankForm(); const local = { ...base, questions: [{ ...base.questions[0], title: 'Mine' }] }; const remote = { ...base, questions: [{ ...base.questions[0], title: 'Theirs' }] };
  const result = mergeFormChanges(base, local, remote, { questions: 'remote' });
  assert.equal(result.conflicts[0].field, 'questions'); assert.equal(result.merged.questions[0].title, 'Theirs'); assert.deepEqual(result.merged.questionOrder, remote.questions.map((q) => q.id));
});
