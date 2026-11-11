import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankForm, createEventRsvpForm, createDefaultQuestion, createInitialSeedWorkspace } from '@/lib/form-engine';
import { formDefinitionSchema, publishableFormSchema, importBackupSchema, analyticsEventSchema } from '@/core/contracts';
import { validateQuestionAnswer, validateSubmission } from '@/core/validation';
import { processFormSubmission } from '@/core/submissions';
import { exportWorkspaceBackup } from '@/core/migrations';
import { readJson } from '@/server/http';
import { requireSameOrigin, generateApiKey, hashSecret } from '@/server/security';
import { validateBackupIntegrity } from '@/server/forms';
import { prepareFormDraft } from '@/lib/form-draft';

test('runtime form contracts accept all existing templates and seed data', () => {
  const seed = createInitialSeedWorkspace();
  for (const form of [...seed.forms, createBlankForm()]) assert.equal(formDefinitionSchema.safeParse(form).success, true);
  const backup = importBackupSchema.parse(JSON.parse(exportWorkspaceBackup(seed.forms, seed.responses, seed.revisions, [])));
  validateBackupIntegrity(backup);
});

test('pasted definitions create independent drafts with their original branching and appearance', () => {
  const source = createEventRsvpForm();
  const first = prepareFormDraft({ ...source, revision: 7 });
  const second = prepareFormDraft(source);
  assert.notEqual(first.id, source.id);
  assert.notEqual(second.id, first.id);
  assert.equal(first.revision, 1);
  assert.deepEqual(first.questions, source.questions);
  assert.deepEqual(first.appearance, source.appearance);
  assert.throws(() => prepareFormDraft({ ...source, questionOrder: [] }), /questionOrder/);
});

test('Plyli exports use the current brand and older backups remain importable', () => {
  const seed = createInitialSeedWorkspace();
  const exported: unknown = JSON.parse(exportWorkspaceBackup(seed.forms, seed.responses, seed.revisions, []));
  const current = importBackupSchema.parse(exported);
  assert.equal(current.app, 'plyli');
  const legacy = importBackupSchema.parse({ ...current, app: 'fieldnote-studio' });
  assert.equal(legacy.app, 'plyli');
  validateBackupIntegrity(legacy);
  assert.deepEqual(legacy.forms, current.forms);
  assert.deepEqual(legacy.responses, current.responses);
});

test('API rejects unknown fields, unsupported schema versions, duplicate IDs and unsafe colors', () => {
  const form = createBlankForm();
  assert.equal(formDefinitionSchema.safeParse({ ...form, workspaceId: 'other' }).success, false);
  assert.equal(formDefinitionSchema.safeParse({ ...form, schemaVersion: 99 }).success, false);
  assert.equal(formDefinitionSchema.safeParse({ ...form, questions: [form.questions[0], form.questions[0]], questionOrder: undefined }).success, false);
  assert.equal(formDefinitionSchema.safeParse({ ...form, appearance: { templateId: 'paper', overrides: { primaryColor: 'url(evil)' } } }).success, false);
});

test('publishing rejects broken branches and loops while drafts remain editable', () => {
  const form = createBlankForm();
  form.questions[0].defaultNextId = 'missing';
  assert.equal(formDefinitionSchema.safeParse(form).success, true);
  assert.equal(publishableFormSchema.safeParse(form).success, false);
  form.questions[0].defaultNextId = form.questions[0].id;
  assert.equal(publishableFormSchema.safeParse(form).success, false);
});

test('malicious scalar arrays and repeated choice aliases fail shared engine validation', () => {
  const form = createEventRsvpForm();
  const scalar = form.questions.find((q) => q.type === 'email');
  assert.ok(scalar);
  assert.equal(validateQuestionAnswer(scalar, ['person@example.com']).valid, false);
  const multi = createDefaultQuestion('multiple_choice');
  assert.ok(multi?.choices?.[0]);
  assert.equal(validateQuestionAnswer(multi, [multi.choices[0].id, multi.choices[0].label]).valid, false);
});

test('caller visited IDs cannot remove required answers or add skipped answers', () => {
  const form = createBlankForm();
  const first = form.questions[0]; first.required = true;
  form.questions = [first]; form.questionOrder = [first.id];
  assert.equal(processFormSubmission(form, {}, { visitedQuestionIds: ['other'] }).valid, false);
  const result = processFormSubmission(form, { [first.id]: 'Ada', invented: 'secret' }, { visitedQuestionIds: ['invented'] });
  assert.ok(result.record);
  assert.deepEqual(result.record.visitedQuestionIds, validateSubmission(form, { [first.id]: 'Ada' }).activeQuestionIds);
  assert.equal(result.record.answers.invented, undefined);
});

test('analytics event boundary rejects raw answer fields', () => {
  assert.equal(analyticsEventSchema.safeParse({ id: 'event_1', schemaVersion: 1, formId: 'form_1', formRevision: 1, sessionId: 'session_1', type: 'form_view', timestamp: new Date().toISOString(), sessionSource: 'public_live', answers: { email: 'private' } }).success, false);
});

test('bounded JSON parser rejects invalid JSON, wrong media, and oversized streams', async () => {
  await assert.rejects(readJson(new Request('http://localhost', { method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' } })), { code: 'INVALID_JSON' });
  await assert.rejects(readJson(new Request('http://localhost', { method: 'POST', body: '{}' })), { code: 'UNSUPPORTED_MEDIA_TYPE' });
  await assert.rejects(readJson(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ data: 'x'.repeat(100) }), headers: { 'Content-Type': 'application/json' } }), 20), { code: 'PAYLOAD_TOO_LARGE' });
});

test('cookie writes require exact origin and API keys are random hashed secrets', () => {
  assert.throws(() => requireSameOrigin(new Request('http://localhost', { headers: { Origin: 'https://evil.example' } }), 'http://localhost:3000'), { code: 'ORIGIN_REJECTED' });
  requireSameOrigin(new Request('http://localhost', { headers: { Origin: 'http://localhost:3000' } }), 'http://localhost:3000');
  const a = generateApiKey(); const b = generateApiKey();
  assert.notEqual(a.secret, b.secret); assert.equal(a.hash, hashSecret(a.secret)); assert.equal(a.hash.length, 64); assert.ok(!a.hash.includes(a.secret));
});
