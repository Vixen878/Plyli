import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateQuestionAnswer,
  validateSubmission,
  evaluateRuleCondition,
  resolveNextNodeId,
  computeActiveQuestionSequence,
  inspectFormWorkflow,
  removeQuestionAndCleanReferences,
  updateQuestionChoicesAndSyncRules,
  reorderQuestions,
  reorderQuestionChoices,
  reorderFormsList,
  deriveFlowGraph,
  validateFlowConnection,
  applyFlowConnection,
  disconnectFlowEdge,
  updateFlowNodePosition,
  applyAutoLayoutToForm,
  createAndConnectQuestionOnCanvas,
  FormHistoryManager,
  processFormSubmission,
  resolveHistoricalSubmissionItems,
  computeQuestionSummaries,
  parseWorkspaceBackup,
  migrateFormSchema,
  hasFormContentChanged,
  sanitizeUntrustedJson,
  sanitizeAppearanceOverrides,
  isSafeHexColor,
  createEventRsvpForm,
  createProductFeedbackForm,
  createWorkshopRegistrationForm,
  createDefaultQuestion,
  parseUtmParameters,
  normalizeAttributionValue,
  extractSafeReferrerOrigin,
  captureSessionAttribution,
  classifyViewportWidth,
  buildCampaignUrl,
  FormAnalyticsSessionTracker,
  sanitizeAnalyticsEvent,
  hasNoRawAnswerFields,
  deduplicateAnalyticsEvents,
  appendAnalyticsEventsWithRetention,
  computeFormAnalyticsReport,
  exportSubmissionsToCsv,
  exportSubmissionsToJson,
  escapeCsvCell,
} from './form-engine';
import {
  InMemoryStorageAdapter,
  BrowserLocalStorageAdapter,
  applyFormUpdateWithRevisionIntegrity,
  type WorkspaceState,
} from '../storage/storage-adapter';
import {
  APPEARANCE_TEMPLATE_LIST,
  ESSENTIAL_TEMPLATE_LIST,
  CREATORS_COLLECTION_TEMPLATE_LIST,
  resolveFormAppearance,
  getContrastingTextColor,
} from '../themes/appearance-registry';
import { shareSlugSchema, suggestShareSlug } from './form-sharing';
import { authDestination } from './auth-destination';
import { reconcileSavedDraft } from './draft-save';

test('a draft save preserves edits made in flight and ignores another open form', () => {
  const sent = createEventRsvpForm('sent-form');
  const saved = { ...sent, revision: sent.revision + 1, updatedAt: '2026-11-10T00:00:00.000Z' };
  const inFlightEdit = { ...sent, title: 'An edit made while saving' };
  assert.equal(reconcileSavedDraft(sent, sent, saved), saved);
  assert.deepEqual(reconcileSavedDraft(inFlightEdit, sent, saved), { ...saved, title: inFlightEdit.title });
  const differentForm = createEventRsvpForm('another-form');
  assert.equal(reconcileSavedDraft(differentForm, sent, saved), differentForm);
});

test('conditional skips and the simulated path do not produce structural reachability warnings', () => {
  const form = createEventRsvpForm();
  const active = deriveFlowGraph(form, { q_rsvp_attending: 'No' });
  assert.deepEqual(active.diagnostics.unreachableQuestionIds, []);
  assert.ok(!active.activePathQuestionIds.includes('q_rsvp_guests'));
  assert.ok(active.activePathQuestionIds.includes('q_rsvp_note'));
  assert.ok(deriveFlowGraph(form, { q_rsvp_attending: 'Yes' }).activePathQuestionIds.includes('q_rsvp_guests'));
});

test('sharing slugs and auth destinations reject reserved or unsafe URL values', () => {
  assert.equal(suggestShareSlug(' Café + Studio Night! '), 'cafe-studio-night');
  assert.equal(suggestShareSlug('🎟'), 'my-form');
  for (const slug of ['a/b', 'A--B', '7ae7f753-333e-453f-82cb-ddc13ff74713']) assert.equal(shareSlugSchema.safeParse(slug).success, false);
  assert.equal(authDestination('/f/cafe-studio-night'), '/f/cafe-studio-night');
  assert.equal(authDestination('/f/cafe-studio-night?UTM_SOURCE=newsletter&utm_medium=email'), '/f/cafe-studio-night?utm_source=newsletter&utm_medium=email');
  assert.equal(authDestination('/f/cafe-studio-night?utm_source=ok&redirect=//example.invalid'), '/dashboard');
  for (const next of ['//example.com', '/f/../account', '/f/foo?token=secret', '/f/%2F%2Fexternal']) assert.equal(authDestination(next), '/dashboard');
});

test('1. Validation: short_text and long_text enforce required, whitespace trimming, minLength, and maxLength', () => {
  const shortQ = createDefaultQuestion('short_text');
  shortQ.required = true;
  shortQ.minLength = 3;
  shortQ.maxLength = 10;

  assert.equal(validateQuestionAnswer(shortQ, '').valid, false);
  assert.equal(validateQuestionAnswer(shortQ, '   ').valid, false);
  assert.equal(validateQuestionAnswer(shortQ, 'Hi').valid, false);
  assert.equal(validateQuestionAnswer(shortQ, 'Hello there friend').valid, false);
  assert.equal(validateQuestionAnswer(shortQ, 'Clara').valid, true);

  const longQ = createDefaultQuestion('long_text');
  longQ.required = false;
  longQ.minLength = 5;
  // Optional empty answer passes even when minLength is set
  assert.equal(validateQuestionAnswer(longQ, '').valid, true);
  assert.equal(validateQuestionAnswer(longQ, 'Too').valid, false);
  assert.equal(validateQuestionAnswer(longQ, 'Detailed studio note').valid, true);
});

test('2. Validation: email enforces valid address format and rejects malformed inputs', () => {
  const emailQ = createDefaultQuestion('email');
  emailQ.required = true;

  assert.equal(validateQuestionAnswer(emailQ, '').valid, false);
  assert.equal(validateQuestionAnswer(emailQ, 'not-an-email').valid, false);
  assert.equal(validateQuestionAnswer(emailQ, 'missing-domain@').valid, false);
  assert.equal(validateQuestionAnswer(emailQ, '@missing-local.com').valid, false);
  assert.equal(validateQuestionAnswer(emailQ, 'spaces in@email.com').valid, false);
  assert.equal(validateQuestionAnswer(emailQ, 'maker@paper.studio').valid, true);
});

test('3. Validation: number enforces finite values, minNumber, maxNumber, and rejects NaN/Infinity/booleans', () => {
  const numQ = createDefaultQuestion('number');
  numQ.required = true;
  numQ.minNumber = 1;
  numQ.maxNumber = 5;

  assert.equal(validateQuestionAnswer(numQ, '').valid, false);
  assert.equal(validateQuestionAnswer(numQ, 0).valid, false);
  assert.equal(validateQuestionAnswer(numQ, 6).valid, false);
  assert.equal(validateQuestionAnswer(numQ, 3).valid, true);
  assert.equal(validateQuestionAnswer(numQ, '4').valid, true);
  assert.equal(validateQuestionAnswer(numQ, Number.NaN).valid, false);
  assert.equal(validateQuestionAnswer(numQ, Number.POSITIVE_INFINITY).valid, false);
  assert.equal(validateQuestionAnswer(numQ, Number.NEGATIVE_INFINITY).valid, false);
  // @ts-expect-error Deliberately test runtime rejection of an invalid scalar.
  assert.equal(validateQuestionAnswer(numQ, true).valid, false);
  assert.equal(validateQuestionAnswer(numQ, 'not-a-number').valid, false);
});

test('4. Validation: rating enforces integer values within 1..maxRating (5 or 10)', () => {
  const rating5 = createDefaultQuestion('rating');
  rating5.required = true;
  rating5.maxRating = 5;

  assert.equal(validateQuestionAnswer(rating5, 0).valid, false);
  assert.equal(validateQuestionAnswer(rating5, 6).valid, false);
  assert.equal(validateQuestionAnswer(rating5, 3.5).valid, false);
  assert.equal(validateQuestionAnswer(rating5, 5).valid, true);

  const rating10 = createDefaultQuestion('rating');
  rating10.maxRating = 10;
  assert.equal(validateQuestionAnswer(rating10, 10).valid, true);
  assert.equal(validateQuestionAnswer(rating10, 11).valid, false);
});

test('5. Validation: date validates real calendar dates and leap years while rejecting impossible dates', () => {
  const dateQ = createDefaultQuestion('date');
  dateQ.required = true;

  assert.equal(validateQuestionAnswer(dateQ, '2026-11-14').valid, true);
  assert.equal(validateQuestionAnswer(dateQ, '2024-02-29').valid, true); // 2024 is a leap year
  assert.equal(validateQuestionAnswer(dateQ, '2026-02-29').valid, false); // 2026 is not a leap year
  assert.equal(validateQuestionAnswer(dateQ, '2026-02-31').valid, false);
  assert.equal(validateQuestionAnswer(dateQ, '2026-13-01').valid, false);
  assert.equal(validateQuestionAnswer(dateQ, '2026-00-10').valid, false);
  assert.equal(validateQuestionAnswer(dateQ, '14/11/2026').valid, false);
});

test('6. Validation: single_choice, dropdown, yes_no, and multiple_choice enforce allowed options and selection counts', () => {
  const choiceQ = createDefaultQuestion('single_choice');
  choiceQ.choices = [
    { id: 'opt_design', label: 'Design & Creative' },
    { id: 'opt_eng', label: 'Engineering' },
  ];
  assert.equal(validateQuestionAnswer(choiceQ, 'opt_design').valid, true);
  assert.equal(validateQuestionAnswer(choiceQ, 'Engineering').valid, true);
  assert.equal(validateQuestionAnswer(choiceQ, 'Nonexistent').valid, false);

  const multiQ = createDefaultQuestion('multiple_choice');
  multiQ.required = true;
  multiQ.minChoices = 2;
  multiQ.maxChoices = 3;
  multiQ.choices = [
    { id: 'c1', label: 'Alpha' },
    { id: 'c2', label: 'Beta' },
    { id: 'c3', label: 'Gamma' },
    { id: 'c4', label: 'Delta' },
  ];
  assert.equal(validateQuestionAnswer(multiQ, ['Alpha']).valid, false);
  assert.equal(validateQuestionAnswer(multiQ, ['Alpha', 'Beta']).valid, true);
  assert.equal(
    validateQuestionAnswer(multiQ, ['Alpha', 'Beta', 'Gamma', 'Delta']).valid,
    false
  );
  assert.equal(
    validateQuestionAnswer(multiQ, ['Alpha', 'InvalidChoice']).valid,
    false
  );

  // yes_no works even if choices array is omitted on legacy/custom question object
  const yesNoQ = createDefaultQuestion('yes_no');
  delete yesNoQ.choices;
  assert.equal(validateQuestionAnswer(yesNoQ, 'Yes').valid, true);
  assert.equal(validateQuestionAnswer(yesNoQ, 'No').valid, true);
  assert.equal(validateQuestionAnswer(yesNoQ, 'Maybe').valid, false);
});

test('7. Branching: evaluateRuleCondition and resolveNextNodeId support all 6 operators and match both IDs and labels', () => {
  const q = createDefaultQuestion('single_choice');
  q.choices = [
    { id: 'track_adv', label: 'Advanced Lab' },
    { id: 'track_beg', label: 'Beginner' },
  ];

  const ruleEq = {
    id: 'r1',
    operator: 'equals' as const,
    value: 'Advanced Lab',
    targetId: 'q_target',
  };
  assert.equal(evaluateRuleCondition(ruleEq, 'Advanced Lab', q), true);
  assert.equal(evaluateRuleCondition(ruleEq, 'track_adv', q), true);
  assert.equal(evaluateRuleCondition(ruleEq, 'Beginner', q), false);

  assert.equal(
    evaluateRuleCondition(
      { id: 'r2', operator: 'not_equals', value: 'Yes', targetId: 'q2' },
      'No'
    ),
    true
  );
  assert.equal(
    evaluateRuleCondition(
      { id: 'r3', operator: 'contains', value: 'riso', targetId: 'q2' },
      ['Botanical Riso', 'Letterpress']
    ),
    true
  );
  assert.equal(
    evaluateRuleCondition(
      { id: 'r4', operator: 'greater_than', value: '3', targetId: 'q2' },
      5
    ),
    true
  );
  assert.equal(
    evaluateRuleCondition(
      { id: 'r5', operator: 'less_than', value: '4', targetId: 'q2' },
      2
    ),
    true
  );
  assert.equal(
    evaluateRuleCondition(
      { id: 'r6', operator: 'is_answered', value: '', targetId: 'q2' },
      'Any text'
    ),
    true
  );
  assert.equal(
    evaluateRuleCondition(
      { id: 'r6', operator: 'is_answered', value: '', targetId: 'q2' },
      '   '
    ),
    false
  );
});

test('8. Branching: validateSubmission respects conditional jumps and skips unreachable required questions', () => {
  const rsvpForm = createEventRsvpForm('test_rsvp_branch');

  const resultWhenNo = validateSubmission(rsvpForm, {
    q_rsvp_name: 'Alex Rivera',
    q_rsvp_attending: 'No',
    q_rsvp_note: 'Cannot make it this time!',
  });

  assert.equal(resultWhenNo.valid, true);
  assert.deepEqual(resultWhenNo.activeQuestionIds, [
    'q_rsvp_name',
    'q_rsvp_attending',
    'q_rsvp_note',
  ]);
  assert.ok(resultWhenNo.skippedQuestionIds.includes('q_rsvp_guests'));

  const resultWhenYesIncomplete = validateSubmission(rsvpForm, {
    q_rsvp_name: 'Alex Rivera',
    q_rsvp_attending: 'Yes',
  });
  assert.equal(resultWhenYesIncomplete.valid, false);
  assert.ok(resultWhenYesIncomplete.errors.q_rsvp_guests);
  assert.ok(resultWhenYesIncomplete.errors.q_rsvp_email);
});

test('9. Branching Integrity: question deletion and choice edits automatically clean or sync branching rules', () => {
  const rsvpForm = createEventRsvpForm('test_ref_cleanup');
  // In Event RSVP, q_rsvp_attending has a rule jumping to q_rsvp_note and defaultNextId = q_rsvp_guests
  const afterDeleteNote = removeQuestionAndCleanReferences(rsvpForm, 'q_rsvp_note');
  const attendingAfter = afterDeleteNote.questions.find(
    (q) => q.id === 'q_rsvp_attending'
  )!;
  assert.equal(
    attendingAfter.logicRules.some((r) => r.targetId === 'q_rsvp_note'),
    false
  );

  const afterDeleteGuests = removeQuestionAndCleanReferences(
    afterDeleteNote,
    'q_rsvp_guests'
  );
  const attendingAfter2 = afterDeleteGuests.questions.find(
    (q) => q.id === 'q_rsvp_attending'
  )!;
  assert.equal(attendingAfter2.defaultNextId, 'next');

  // Test choice rename and deletion synchronization
  const wsForm = createWorkshopRegistrationForm('test_choice_sync');
  const trackQ = wsForm.questions.find((q) => q.id === 'q_ws_track')!;
  assert.equal(trackQ.logicRules[0].value, 'Advanced Lab: 3-Color Zine Edition');

  // Rename choice t2
  const renamedChoices = trackQ.choices!.map((c) =>
    c.id === 't2' ? { ...c, label: 'Masterclass: 4-Color Riso' } : c
  );
  const syncedAfterRename = updateQuestionChoicesAndSyncRules(
    trackQ,
    renamedChoices
  );
  assert.equal(
    syncedAfterRename.logicRules[0].value,
    'Masterclass: 4-Color Riso'
  );

  // Delete choice t2
  const remainingChoices = syncedAfterRename.choices!.filter(
    (c) => c.id !== 't2'
  );
  const syncedAfterDelete = updateQuestionChoicesAndSyncRules(
    syncedAfterRename,
    remainingChoices
  );
  assert.equal(syncedAfterDelete.logicRules.length, 0);
});

test('10. Workflow Diagnostics & Cycle Guard: inspectFormWorkflow flags invalid targets, unreachable nodes, and cycles', () => {
  const form = createEventRsvpForm('test_cycles');
  form.questions[1].logicRules = [
    {
      id: 'rule_bad_target',
      operator: 'equals',
      value: 'Maybe',
      targetId: 'non_existent_question_id',
    },
    {
      id: 'rule_cycle',
      operator: 'equals',
      value: 'Yes',
      targetId: form.questions[0].id,
    },
  ];
  // Make Q1 jump straight to Q6 so Q3, Q4, Q5 become unreachable if Q2 also jumps to Q1/Q6
  form.questions[1].defaultNextId = 'q_rsvp_note';

  const diag = inspectFormWorkflow(form);
  assert.equal(diag.circularPathsDetected, true);
  assert.equal(diag.invalidRuleIds.length, 1);
  assert.equal(diag.invalidRuleIds[0].ruleId, 'rule_bad_target');
  assert.ok(diag.unreachableQuestionIds.includes('q_rsvp_guests'));

  // computeActiveQuestionSequence terminates deterministically without infinite loop
  const seq = computeActiveQuestionSequence(form, {
    [form.questions[0].id]: 'Alex',
    [form.questions[1].id]: 'Yes',
  });
  assert.deepEqual(seq, [form.questions[0].id, form.questions[1].id]);

  // Invalid target falls back to sequential next question
  const fallbackNext = resolveNextNodeId(form, form.questions[1].id, {
    [form.questions[1].id]: 'Maybe',
  });
  assert.equal(fallbackNext, 'q_rsvp_note');
});

test('11. Revision Integrity: content edits increment revision and preserve historical answers, while appearance edits do not increment revision', () => {
  let state: WorkspaceState = {
    forms: [createEventRsvpForm('form_rev_test')],
    responses: [],
    revisions: [],
  };

  const initialForm = state.forms[0];
  assert.equal(initialForm.revision, 1);

  const subResult = processFormSubmission(
    initialForm,
    {
      q_rsvp_name: 'Linnea',
      q_rsvp_attending: 'Yes',
      q_rsvp_guests: 2,
      q_rsvp_dietary: 'Vegetarian',
      q_rsvp_email: 'linnea@studio.se',
    },
    { externalContext: { eventId: 'evt_autumn_2026', attendeeId: 'usr_99' } }
  );

  assert.equal(subResult.valid, true);
  assert.ok(subResult.record);
  assert.equal(subResult.record.formRevision, 1);

  state = {
    ...state,
    responses: [subResult.record],
    revisions: subResult.revisionSnapshot ? [subResult.revisionSnapshot] : [],
  };

  // Appearance-only change should NOT increment revision
  const appearanceChangedForm = {
    ...initialForm,
    appearance: {
      schemaVersion: 1,
      templateId: 'gaming' as const,
      overrides: { primaryColor: '#00F5D4' },
    },
  };
  state = applyFormUpdateWithRevisionIntegrity(state, appearanceChangedForm);
  assert.equal(state.forms[0].revision, 1);

  // Content edit (renaming question, changing option label, deleting a question) MUST increment revision to 2
  const modifiedForm = JSON.parse(JSON.stringify(state.forms[0]));
  modifiedForm.questions[0].title = 'Updated Prompt: What is your preferred handle?';
  const dietaryQ = modifiedForm.questions.find(
    (q: { id: string }) => q.id === 'q_rsvp_dietary'
  );
  dietaryQ.choices[1].label = '100% Plant-Forward';
  modifiedForm.questions = modifiedForm.questions.filter(
    (q: { id: string }) => q.id !== 'q_rsvp_guests'
  );

  state = applyFormUpdateWithRevisionIntegrity(state, modifiedForm);
  const updatedForm = state.forms[0];
  assert.equal(updatedForm.revision, 2);

  const resolvedItems = resolveHistoricalSubmissionItems(
    updatedForm,
    state.responses[0],
    state.revisions
  );

  const q1Item = resolvedItems.find((i) => i.questionId === 'q_rsvp_name');
  assert.equal(q1Item?.questionTitle, 'First things first — what is your full name?');
  assert.equal(q1Item?.displayAnswer, 'Linnea');

  const deletedGuestsItem = resolvedItems.find(
    (i) => i.questionId === 'q_rsvp_guests'
  );
  assert.ok(deletedGuestsItem);
  assert.equal(deletedGuestsItem.displayAnswer, '2');
  assert.equal(deletedGuestsItem.isDeletedInCurrentForm, true);
});

test('12. Analytics: computeQuestionSummaries calculates choice distributions, averages, and skipped counts', () => {
  const form = createProductFeedbackForm('fb_summary_test');
  const sub1 = processFormSubmission(form, {
    q_fb_rating: 5,
    q_fb_favorite: ['Lay-flat stitched spine', 'Warm ivory 120gsm paper'],
    q_fb_usecase: 'Daily planning & task lists',
    q_fb_recommend: 'Yes',
  });
  const sub2 = processFormSubmission(form, {
    q_fb_rating: 3,
    q_fb_improve: 'Add page numbers',
    q_fb_usecase: 'Daily planning & task lists',
    q_fb_recommend: 'No',
  });

  const summaries = computeQuestionSummaries(form, [sub1.record!, sub2.record!]);
  const ratingStat = summaries.find((s) => s.questionId === 'q_fb_rating')!;
  assert.equal(ratingStat.answeredCount, 2);
  assert.equal(ratingStat.averageNumber, 4);

  const improveStat = summaries.find((s) => s.questionId === 'q_fb_improve')!;
  assert.equal(improveStat.answeredCount, 1);
  assert.equal(improveStat.skippedCount, 1);
  assert.deepEqual(improveStat.recentTextAnswers, ['Add page numbers']);
});

test('13. Appearance Registry: all 16 templates (11 Essentials + 5 Creator Collection) resolve distinct tokens, support overrides, and reset cleanly', () => {
  assert.equal(APPEARANCE_TEMPLATE_LIST.length, 16);
  assert.equal(ESSENTIAL_TEMPLATE_LIST.length, 11);
  assert.equal(CREATORS_COLLECTION_TEMPLATE_LIST.length, 5);

  const ids = APPEARANCE_TEMPLATE_LIST.map((t) => t.id);
  assert.deepEqual(ids, [
    'paper',
    'canvas',
    'editorial',
    'pop',
    'after-dark',
    'bloom',
    'breeze',
    'corporate',
    'gaming',
    'blueprint',
    'terracotta',
    'vamori',
    'veritas',
    'tiny-et',
    'akarii',
    'riff',
  ]);

  // Verify the 4 Essentials expansion templates resolve their distinct design tokens
  const corporate = resolveFormAppearance({ templateId: 'corporate', overrides: {} });
  assert.equal(corporate.cardVariant, 'corporate-structured');
  assert.equal(corporate.primaryColor, '#0F3D75');
  assert.equal(corporate.isDark, false);

  const gaming = resolveFormAppearance({ templateId: 'gaming', overrides: {} });
  assert.equal(gaming.cardVariant, 'gaming-hud');
  assert.equal(gaming.inputVariant, 'hud-console');
  assert.equal(gaming.primaryColor, '#00F5D4');
  assert.equal(gaming.isDark, true);
  assert.equal(gaming.primaryTextColor, '#18181B');

  const blueprint = resolveFormAppearance({ templateId: 'blueprint', overrides: {} });
  assert.equal(blueprint.cardVariant, 'blueprint-cad');
  assert.equal(blueprint.inputVariant, 'cad-spec');
  assert.equal(blueprint.fontFamily, 'mono');
  assert.equal(blueprint.isDark, true);

  const terracotta = resolveFormAppearance({ templateId: 'terracotta', overrides: {} });
  assert.equal(terracotta.cardVariant, 'terracotta-warm');
  assert.equal(terracotta.fontFamily, 'serif');
  assert.equal(terracotta.primaryColor, '#C84B31');

  // Contrast helper supports both 3-digit and 6-digit hex codes
  assert.equal(getContrastingTextColor('#FFF'), '#18181B');
  assert.equal(getContrastingTextColor('#000'), '#FFFFFF');

  // Overrides layer on top of template defaults and reset cleanly
  const gamingCustom = resolveFormAppearance({
    templateId: 'gaming',
    overrides: { primaryColor: '#FF3B6B', buttonShape: 'pill' },
  });
  assert.equal(gamingCustom.primaryColor, '#FF3B6B');
  assert.equal(gamingCustom.buttonShape, 'pill');
  assert.equal(gamingCustom.cardVariant, 'gaming-hud');
});

test('14. Security & Sanitization: untrusted JSON imports strip prototype pollution keys, block CSS injection in color overrides, and recover from invalid enums', () => {
  // 1. Prototype pollution protection
  const maliciousRaw =
    '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"schemaVersion":2,"forms":[{"id":"sec_1","title":"Safe Form","questions":[{"id":"q1","type":"invalid_evil_type","title":"Hello","logicRules":[{"id":"r1","operator":"evil_op","value":"x","targetId":"completion"}]}],"appearance":{"templateId":"corporate","overrides":{"primaryColor":"red; background:url(javascript:alert(1))","fontFamily":"invalid_font"}}}]}';

  const parsed = parseWorkspaceBackup(maliciousRaw);
  assert.equal(parsed.valid, true);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);

  const migratedForm = parsed.forms![0];
  // Invalid question type falls back safely to short_text
  assert.equal(migratedForm.questions[0].type, 'short_text');
  // Invalid logic operator falls back safely to equals
  assert.equal(migratedForm.questions[0].logicRules[0].operator, 'equals');
  // Malicious non-hex color string is stripped from overrides
  assert.equal(migratedForm.appearance?.overrides.primaryColor, undefined);
  assert.equal(migratedForm.appearance?.overrides.fontFamily, undefined);

  // Resolve appearance falls back to corporate template default #0F3D75
  const resolved = resolveFormAppearance(migratedForm.appearance);
  assert.equal(resolved.primaryColor, '#0F3D75');

  assert.equal(isSafeHexColor('#0F3D75'), true);
  assert.equal(isSafeHexColor('#fff'), true);
  assert.equal(isSafeHexColor('javascript:alert(1)'), false);

  const sanitizedObj = sanitizeUntrustedJson(
    JSON.parse('{"a":1,"__proto__":{"evil":true}}')
  ) as Record<string, unknown>;
  assert.equal(sanitizedObj.a, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitizedObj, '__proto__'), false);

  const cleanOverrides = sanitizeAppearanceOverrides({
    primaryColor: '#00F5D4',
    backgroundColor: 'expression(alert(1))',
  });
  assert.equal(cleanOverrides.primaryColor, '#00F5D4');
  assert.equal(cleanOverrides.backgroundColor, undefined);
});

test('15. Storage Adapter: InMemoryStorageAdapter and BrowserLocalStorageAdapter handle migrations, single-form exports, and quota errors gracefully', () => {
  const adapter = new InMemoryStorageAdapter();
  const form1 = createProductFeedbackForm('fb_storage_1');
  const form2 = createEventRsvpForm('rsvp_storage_2');
  adapter.saveForm(form1);
  adapter.saveForm(form2);
  assert.equal(adapter.listForms().length, 2);

  // Single-form export only exports the requested form
  const singleJson = adapter.exportData('fb_storage_1');
  const parsedSingle = parseWorkspaceBackup(singleJson);
  assert.equal(parsedSingle.valid, true);
  assert.equal(parsedSingle.forms?.length, 1);
  assert.equal(parsedSingle.forms?.[0].id, 'fb_storage_1');

  // Simulate BrowserLocalStorageAdapter hitting QuotaExceededError
  const originalWindow = (globalThis as Record<string, unknown>).window;
  try {
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    };
    const browserAdapter = new BrowserLocalStorageAdapter('test_quota_key');
    const saveRes = browserAdapter.saveWorkspace({
      forms: [form1],
      responses: [],
      revisions: [],
    });
    assert.equal(saveRes.ok, false);
    assert.ok(saveRes.error?.includes('storage is full'));
    // In-memory cache remains intact despite localStorage quota failure
    assert.equal(browserAdapter.listForms().length, 1);
  } finally {
    (globalThis as Record<string, unknown>).window = originalWindow;
  }
});

test('unreadable device data survives autosave and an explicit restore retains its original bytes', () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;
  const unreadable = '{"forms":';
  const values = new Map([['recovery_fixture', unreadable]]);
  try {
    (globalThis as Record<string, unknown>).window = { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } };
    const adapter = new BrowserLocalStorageAdapter('recovery_fixture');
    const state = adapter.loadWorkspace(() => ({ forms: [], responses: [], revisions: [] }));
    assert.equal(adapter.saveWorkspace(state).ok, false);
    assert.equal(values.get('recovery_fixture'), unreadable);
    assert.equal(adapter.exportData(), unreadable);
    const backup = new InMemoryStorageAdapter();
    backup.saveForm(createEventRsvpForm('restored_fixture'));
    assert.equal(adapter.importData(backup.exportData()).valid, true);
    assert.ok([...values.entries()].some(([key, value]) => key.startsWith('recovery_fixture_recovery_') && value === unreadable));
    assert.equal(parseWorkspaceBackup(values.get('recovery_fixture') ?? '').forms?.[0].id, 'restored_fixture');
  } finally { (globalThis as Record<string, unknown>).window = originalWindow; }
});

test('restore refuses to overwrite unreadable device data if a recovery copy cannot be saved', () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;
  const raw = '{"forms":'; let original = raw;
  try {
    (globalThis as Record<string, unknown>).window = { localStorage: {
      getItem: (key: string) => key === 'blocked_fixture' ? original : null,
      setItem: (key: string, value: string) => { if (key !== 'blocked_fixture') throw new Error('QuotaExceededError'); original = value; },
    } };
    const adapter = new BrowserLocalStorageAdapter('blocked_fixture');
    adapter.loadWorkspace(() => ({ forms: [], responses: [], revisions: [] }));
    const backup = new InMemoryStorageAdapter(); backup.saveForm(createEventRsvpForm('restore_fixture'));
    assert.equal(adapter.importData(backup.exportData()).valid, false);
    assert.equal(original, raw);
    assert.equal(adapter.exportData(), raw);
  } finally { (globalThis as Record<string, unknown>).window = originalWindow; }
});

test('device recovery tolerates browsers that deny access to localStorage', () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;
  try {
    (globalThis as Record<string, unknown>).window = Object.defineProperty({}, 'localStorage', { get() { throw new Error('SecurityError'); } });
    const adapter = new BrowserLocalStorageAdapter();
    assert.doesNotThrow(() => adapter.loadWorkspace(() => ({ forms: [], responses: [], revisions: [] })));
    assert.equal(adapter.saveWorkspace({ forms: [], responses: [], revisions: [] }).ok, false);
  } finally { (globalThis as Record<string, unknown>).window = originalWindow; }
});

test('16. Headless Engine Isolation: /core/* modules have zero dependencies on React, Next.js, DOM APIs, or browser storage', () => {
  const coreDir = path.resolve(process.cwd(), 'core');
  const coreFiles = fs
    .readdirSync(coreDir)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

  assert.ok(coreFiles.length >= 5);

  const forbiddenPatterns = [
    /from\s+['"]react['"]/,
    /from\s+['"]next/,
    /\bwindow\./,
    /\bdocument\./,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
  ];

  for (const file of coreFiles) {
    const content = fs.readFileSync(path.join(coreDir, file), 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.equal(
        pattern.test(content),
        false,
        `Forbidden browser/UI dependency ${pattern} found in core/${file}`
      );
    }
  }
});

test("17. Creator's Collection: Vamori, Veritas, tiny.et, Akarii, and Riff resolve authentic product palettes, preserve bespoke structural traits under overrides, and migrate cleanly", () => {
  // 1. Vamori — Underground
  const vamori = resolveFormAppearance({ templateId: 'vamori', overrides: {} });
  assert.equal(vamori.templateName, 'Vamori');
  assert.equal(vamori.templateSubtitle, 'Underground');
  assert.equal(vamori.category, 'creators-collection');
  assert.equal(vamori.primaryColor, '#D6FF00');
  assert.equal(vamori.canvasBackground, '#0B0B0B');
  assert.equal(vamori.cardBackground, '#1A1A1A');
  assert.equal(vamori.cardVariant, 'vamori-underground');
  assert.equal(vamori.inputVariant, 'vamori-industrial');
  assert.equal(vamori.isDark, true);
  assert.ok(vamori.attribution?.includes('Vamori'));

  // Customizing Vamori's acid lime accent keeps its underground layout
  const vamoriCustom = resolveFormAppearance({
    templateId: 'vamori',
    overrides: { primaryColor: '#FF3B6B' },
  });
  assert.equal(vamoriCustom.primaryColor, '#FF3B6B');
  assert.equal(vamoriCustom.cardVariant, 'vamori-underground');
  assert.equal(vamoriCustom.inputVariant, 'vamori-industrial');

  // 2. Veritas — Midnight
  const veritas = resolveFormAppearance({ templateId: 'veritas', overrides: {} });
  assert.equal(veritas.templateName, 'Veritas');
  assert.equal(veritas.templateSubtitle, 'Midnight');
  assert.equal(veritas.primaryColor, '#6366F1');
  assert.equal(veritas.canvasBackground, '#030303');
  assert.equal(veritas.cardVariant, 'veritas-midnight');
  assert.equal(veritas.inputVariant, 'veritas-glass');
  assert.equal(veritas.isDark, true);
  assert.ok(veritas.attribution?.includes('Veritas'));

  // 3. tiny.et — Lilac
  const tinyEt = resolveFormAppearance({ templateId: 'tiny-et', overrides: {} });
  assert.equal(tinyEt.templateName, 'tiny.et');
  assert.equal(tinyEt.templateSubtitle, 'Lilac');
  assert.equal(tinyEt.primaryColor, '#8673A1');
  assert.equal(tinyEt.canvasBackground, '#F8F6FB');
  assert.equal(tinyEt.cardBackground, '#FFFFFF');
  assert.equal(tinyEt.buttonShape, 'pill');
  assert.equal(tinyEt.cardVariant, 'tiny-lilac-card');
  assert.equal(tinyEt.inputVariant, 'tiny-lilac');
  assert.equal(tinyEt.isDark, false);
  assert.ok(tinyEt.attribution?.includes('tiny.et'));

  // 4. Akarii — Prism
  const akarii = resolveFormAppearance({ templateId: 'akarii', overrides: {} });
  assert.equal(akarii.templateName, 'Akarii');
  assert.equal(akarii.templateSubtitle, 'Prism');
  assert.equal(akarii.primaryColor, '#10B981');
  assert.equal(akarii.selectedOptionBorder, '#34D399');
  assert.equal(akarii.canvasBackground, '#121212');
  assert.equal(akarii.cardBackground, '#18181A');
  assert.equal(akarii.cardVariant, 'akarii-prism');
  assert.equal(akarii.inputVariant, 'akarii-studio');
  assert.equal(akarii.isDark, true);
  assert.ok(akarii.attribution?.includes('Akarii'));

  // 5. Riff — Studio
  const riff = resolveFormAppearance({ templateId: 'riff', overrides: {} });
  assert.equal(riff.templateName, 'Riff');
  assert.equal(riff.templateSubtitle, 'Studio');
  assert.equal(riff.primaryColor, '#A74728');
  assert.equal(riff.selectedOptionBorder, '#8A9B76');
  assert.equal(riff.canvasBackground, '#F1F0E9');
  assert.equal(riff.cardBackground, '#FFFEFA');
  assert.equal(riff.inputBackground, '#FAF9F6');
  assert.equal(riff.textColor, '#282824');
  assert.equal(riff.borderColor, '#DEDFD6');
  assert.equal(riff.cardVariant, 'riff-studio');
  assert.equal(riff.inputVariant, 'riff-editorial');
  assert.equal(riff.isDark, false);
  assert.ok(riff.attribution?.includes('Riff'));

  // Customizing Riff's terracotta accent preserves its signature muted olive selection border and editorial studio framing
  const riffCustom = resolveFormAppearance({
    templateId: 'riff',
    overrides: { primaryColor: '#282824' },
  });
  assert.equal(riffCustom.primaryColor, '#282824');
  assert.equal(riffCustom.selectedOptionBorder, '#8A9B76');
  assert.equal(riffCustom.cardVariant, 'riff-studio');

  // Verify schema migration accepts all 5 Creator's Collection template IDs
  for (const tplId of ['vamori', 'veritas', 'tiny-et', 'akarii', 'riff'] as const) {
    const migrated = migrateFormSchema({
      id: `f_${tplId}`,
      title: 'Test',
      questions: [{ id: 'q1', type: 'short_text', title: 'Prompt' }],
      appearance: { schemaVersion: 1, templateId: tplId, overrides: {} },
    });
    assert.ok(migrated);
    assert.equal(migrated.appearance?.templateId, tplId);
  }
});

test('18. Dual Flow Editors & Visual Canvas Synchronization: rule mutations and canvas edge connections stay 100% synchronized, reject invalid connections, and persist node positions without altering question order or revision', () => {
  const form = createEventRsvpForm('rsvp_flow_sync');

  // 1. Derive initial flow graph from RSVP form
  const graph1 = deriveFlowGraph(form, { q_rsvp_attending: 'No' });
  // Nodes = welcome + 6 questions + completion = 8 nodes
  assert.equal(graph1.nodes.length, 8);
  assert.equal(graph1.nodes[0].id, 'welcome');
  assert.equal(graph1.nodes[graph1.nodes.length - 1].id, 'completion');

  // Verify the rule on q_rsvp_attending ("No" -> q_rsvp_note) is represented as a directed rule edge
  const ruleEdge = graph1.edges.find(
    (e) => e.sourceNodeId === 'q_rsvp_attending' && e.kind === 'rule'
  );
  assert.ok(ruleEdge);
  assert.equal(ruleEdge.targetNodeId, 'q_rsvp_note');
  assert.equal(ruleEdge.isOnActiveSimulatedPath, true);

  // 2. Connect a new branch rule from q_rsvp_dietary ("new-rule" handle) -> q_rsvp_note on the Visual Canvas
  const connectRes = applyFlowConnection(form, {
    sourceQuestionId: 'q_rsvp_dietary',
    sourceHandleId: 'new-rule',
    targetNodeId: 'q_rsvp_note',
    operator: 'equals',
    value: 'Gluten-Free',
  });
  assert.equal(connectRes.valid, true);
  assert.ok(connectRes.createdRuleId);

  const formAfterCanvasConnect = connectRes.form;
  const dietaryQ = formAfterCanvasConnect.questions.find(
    (q) => q.id === 'q_rsvp_dietary'
  )!;
  assert.equal(dietaryQ.logicRules.length, 1);
  assert.equal(dietaryQ.logicRules[0].targetId, 'q_rsvp_note');
  assert.equal(dietaryQ.logicRules[0].value, 'Gluten-Free');

  // Verify runtime branching engine immediately honors the visual canvas connection
  assert.equal(
    resolveNextNodeId(formAfterCanvasConnect, 'q_rsvp_dietary', {
      q_rsvp_dietary: 'Gluten-Free',
    }),
    'q_rsvp_note'
  );

  // 3. Retarget that existing rule handle (`rule:<id>`) to 'completion'
  const retargetRes = applyFlowConnection(formAfterCanvasConnect, {
    sourceQuestionId: 'q_rsvp_dietary',
    sourceHandleId: `rule:${connectRes.createdRuleId}`,
    targetNodeId: 'completion',
  });
  assert.equal(retargetRes.valid, true);
  assert.equal(
    resolveNextNodeId(retargetRes.form, 'q_rsvp_dietary', {
      q_rsvp_dietary: 'Gluten-Free',
    }),
    'completion'
  );

  // 4. Reject invalid connections (self-loop, connecting into welcome, completion outgoing, duplicate rule)
  assert.equal(
    validateFlowConnection(
      retargetRes.form,
      'q_rsvp_dietary',
      'new-rule',
      'q_rsvp_dietary'
    ).valid,
    false
  );
  assert.equal(
    validateFlowConnection(
      retargetRes.form,
      'q_rsvp_dietary',
      'new-rule',
      'welcome'
    ).valid,
    false
  );
  assert.equal(
    validateFlowConnection(
      retargetRes.form,
      'completion',
      'default',
      'q_rsvp_name'
    ).valid,
    false
  );
  const dupRes = applyFlowConnection(retargetRes.form, {
    sourceQuestionId: 'q_rsvp_dietary',
    sourceHandleId: 'new-rule',
    targetNodeId: 'completion',
    operator: 'equals',
    value: 'Gluten-Free',
  });
  assert.equal(dupRes.valid, false);

  // 5. Disconnect the edge on the Visual Canvas and verify rule is removed in Rule Editor model
  const edgeIdToDisconnect = `edge_rule_q_rsvp_dietary_${connectRes.createdRuleId}`;
  const formAfterDisconnect = disconnectFlowEdge(
    retargetRes.form,
    edgeIdToDisconnect
  );
  assert.equal(
    formAfterDisconnect.questions.find((q) => q.id === 'q_rsvp_dietary')!
      .logicRules.length,
    0
  );

  // 6. Dragging a node on the Visual Canvas updates flowCanvasLayout.positions without changing question order or revision
  const movedForm = updateFlowNodePosition(form, 'q_rsvp_attending', {
    x: 640,
    y: 410,
  });
  assert.deepEqual(
    movedForm.flowCanvasLayout?.positions['q_rsvp_attending'],
    { x: 640, y: 410 }
  );
  assert.deepEqual(
    movedForm.questions.map((q) => q.id),
    form.questions.map((q) => q.id)
  );
  // Node position changes alone do not count as respondent-facing content changes
  assert.equal(hasFormContentChanged(form, movedForm), false);

  // Migrating exported JSON preserves custom canvas node coordinates
  const migratedMoved = migrateFormSchema(JSON.parse(JSON.stringify(movedForm)));
  assert.deepEqual(
    migratedMoved?.flowCanvasLayout?.positions['q_rsvp_attending'],
    { x: 640, y: 410 }
  );

  // Auto-layout computes positions for welcome, all questions, and completion
  const autoArranged = applyAutoLayoutToForm(movedForm);
  assert.ok(autoArranged.flowCanvasLayout?.positions['welcome']);
  assert.ok(autoArranged.flowCanvasLayout?.positions['completion']);
});

test('19. Drag-and-Drop Reordering: reordering questions, choices, and library forms preserves stable IDs, branching rules, and historical answers', () => {
  const form = createEventRsvpForm('rsvp_dnd');
  const originalIds = form.questions.map((q) => q.id);

  // 1. Reorder Question index 3 (q_rsvp_dietary) to index 2 (before q_rsvp_guests)
  const reorderedForm = reorderQuestions(form, 3, 2);
  assert.equal(reorderedForm.questions[2].id, 'q_rsvp_dietary');
  assert.equal(reorderedForm.questions[3].id, 'q_rsvp_guests');
  assert.deepEqual(
    reorderedForm.questionOrder,
    reorderedForm.questions.map((q) => q.id)
  );
  assert.equal(reorderedForm.questions.length, originalIds.length);

  // Existing branching rule on q_rsvp_attending -> q_rsvp_note remains intact
  assert.equal(
    resolveNextNodeId(reorderedForm, 'q_rsvp_attending', {
      q_rsvp_attending: 'No',
    }),
    'q_rsvp_note'
  );

  // 2. Reorder choices within q_rsvp_dietary while preserving stable choice IDs and rules
  const dietaryWithRule = {
    ...reorderedForm.questions[2],
    logicRules: [
      {
        id: 'r_veg',
        operator: 'equals' as const,
        value: 'Vegetarian',
        targetId: 'q_rsvp_note',
      },
    ],
  };
  const reorderedDietary = reorderQuestionChoices(dietaryWithRule, 1, 0);
  // 'diet_veg' ("Vegetarian") moved from index 1 to index 0 with its stable ID preserved
  assert.equal(reorderedDietary.choices?.[0].id, 'diet_veg');
  assert.equal(reorderedDietary.choices?.[0].label, 'Vegetarian');
  assert.equal(reorderedDietary.choices?.[1].id, 'diet_none');
  assert.equal(reorderedDietary.logicRules.length, 1);
  assert.equal(reorderedDietary.logicRules[0].value, 'Vegetarian');

  // 3. Reorder forms in library workspace
  const f1 = createEventRsvpForm('f1');
  const f2 = createProductFeedbackForm('f2');
  const f3 = createWorkshopRegistrationForm('f3');
  const reorderedLibrary = reorderFormsList([f1, f2, f3], 2, 0);
  assert.deepEqual(
    reorderedLibrary.map((f) => f.id),
    ['f3', 'f1', 'f2']
  );
});

test('20. Per-Form Undo / Redo Engine: supports structural actions, debounced keystroke coalescing, redo invalidation, per-form isolation, and submission safety', () => {
  const history = new FormHistoryManager(50, 800);
  const formA = createEventRsvpForm('form_A');
  const formB = createProductFeedbackForm('form_B');

  // Initially neither form can undo or redo
  assert.equal(history.canUndo('form_A'), false);
  assert.equal(history.canRedo('form_A'), false);

  // 1. Coalesced text typing on Form A (3 rapid keystrokes produce 1 undo step)
  const formA_key1 = { ...formA, title: 'Autumn Studio Open House RSVP 1' };
  const formA_key2 = { ...formA, title: 'Autumn Studio Open House RSVP 12' };
  const formA_key3 = { ...formA, title: 'Autumn Studio Open House RSVP 2026' };

  history.recordChange('form_A', formA, formA_key1, {
    label: 'Rename form',
    coalesceKey: 'title-A',
    timestamp: 1000,
  });
  history.recordChange('form_A', formA_key1, formA_key2, {
    label: 'Rename form',
    coalesceKey: 'title-A',
    timestamp: 1200,
  });
  history.recordChange('form_A', formA_key2, formA_key3, {
    label: 'Rename form',
    coalesceKey: 'title-A',
    timestamp: 1450,
  });

  assert.equal(history.getHistoryCounts('form_A').undoCount, 1);
  assert.equal(history.getUndoLabel('form_A'), 'Rename form');

  // 2. Structural action on Form A: Reorder questions (separate undo step)
  const formA_reordered = reorderQuestions(formA_key3, 0, 1);
  history.recordChange('form_A', formA_key3, formA_reordered, {
    label: 'Reorder questions',
  });
  assert.equal(history.getHistoryCounts('form_A').undoCount, 2);
  assert.equal(history.getUndoLabel('form_A'), 'Reorder questions');

  // 3. Edit Form B and verify per-form isolation (Form B history never affects Form A)
  const formB_vamori = {
    ...formB,
    appearance: { schemaVersion: 1, templateId: 'vamori' as const, overrides: {} },
  };
  history.recordChange('form_B', formB, formB_vamori, {
    label: 'Apply vamori theme',
  });
  assert.equal(history.getHistoryCounts('form_B').undoCount, 1);
  assert.equal(history.getHistoryCounts('form_A').undoCount, 2);

  // 4. Undo on Form A restores question order first, then coalesced title
  const undoStep1 = history.undo('form_A', formA_reordered);
  assert.ok(undoStep1);
  assert.equal(undoStep1.entry.label, 'Reorder questions');
  assert.deepEqual(
    undoStep1.form.questions.map((q) => q.id),
    formA.questions.map((q) => q.id)
  );
  assert.equal(undoStep1.form.title, 'Autumn Studio Open House RSVP 2026');
  assert.equal(history.canRedo('form_A'), true);
  assert.equal(history.getRedoLabel('form_A'), 'Reorder questions');

  // Redo on Form A re-applies the question reorder
  const redoStep1 = history.redo('form_A', undoStep1.form);
  assert.ok(redoStep1);
  assert.deepEqual(
    redoStep1.form.questions.map((q) => q.id),
    formA_reordered.questions.map((q) => q.id)
  );

  // Undo twice on Form A to get back to the original Form A state
  const undoAgain1 = history.undo('form_A', redoStep1.form)!;
  const undoAgain2 = history.undo('form_A', undoAgain1.form)!;
  assert.equal(undoAgain2.form.title, formA.title);
  assert.equal(history.canUndo('form_A'), false);
  assert.equal(history.getHistoryCounts('form_A').redoCount, 2);

  // 5. Performing a new authoring action after Undo clears the Redo stack for Form A
  const formA_newBranch = applyFlowConnection(undoAgain2.form, {
    sourceQuestionId: 'q_rsvp_dietary',
    sourceHandleId: 'new-rule',
    targetNodeId: 'q_rsvp_note',
    operator: 'equals',
    value: 'Vegetarian',
  }).form;
  history.recordChange('form_A', undoAgain2.form, formA_newBranch, {
    label: 'Connect branch rule',
  });
  assert.equal(history.canRedo('form_A'), false);

  // 6. Verify submission safety: applying an undo snapshot via applyFormUpdateWithRevisionIntegrity
  // never deletes or duplicates existing respondent submissions
  const sub = processFormSubmission(formA, {
    q_rsvp_name: 'Clara Oswald',
    q_rsvp_attending: 'No',
    q_rsvp_note: 'Sending warm wishes!',
  });
  assert.ok(sub.record);
  assert.ok(sub.revisionSnapshot);
  const workspaceBeforeUndo = {
    forms: [formA_newBranch, formB_vamori],
    responses: [sub.record],
    revisions: [sub.revisionSnapshot],
  };
  const restoredA = history.undo('form_A', formA_newBranch)!.form;
  const workspaceAfterUndo = applyFormUpdateWithRevisionIntegrity(
    workspaceBeforeUndo,
    restoredA
  );
  assert.equal(workspaceAfterUndo.responses.length, 1);
  assert.equal(workspaceAfterUndo.responses[0].id, sub.record.id);
});

test('21. Visual Canvas Standalone Creation & Spaghetti Drop-to-Create Sync', () => {
  const baseForm = createEventRsvpForm('form_canvas_standalone');
  const initialCount = baseForm.questions.length;

  // 1. Dragging a spaghetti line from "+ Add branch" (new-rule) on Q4 (dietary) and dropping on empty canvas at (820, 460)
  // to spawn a brand-new Rating question
  const dropCreateRes = createAndConnectQuestionOnCanvas(baseForm, {
    questionType: 'rating',
    position: { x: 820, y: 460 },
    sourceQuestionId: 'q_rsvp_dietary',
    sourceHandleId: 'new-rule',
  });

  assert.equal(dropCreateRes.valid, true);
  assert.ok(dropCreateRes.createdRuleId);
  assert.equal(dropCreateRes.form.questions.length, initialCount + 1);
  const newRatingQ = dropCreateRes.createdQuestion;
  assert.equal(newRatingQ.type, 'rating');

  // Verify the newly created question is saved at the exact canvas drop coordinates
  assert.deepEqual(
    dropCreateRes.form.flowCanvasLayout?.positions?.[newRatingQ.id],
    { x: 820, y: 460 }
  );

  // Verify Q4 (dietary) now has a conditional branch rule targeting the newly created question
  const updatedDietaryQ = dropCreateRes.form.questions.find(
    (q) => q.id === 'q_rsvp_dietary'
  )!;
  assert.equal(updatedDietaryQ.logicRules.length, 1);
  assert.equal(updatedDietaryQ.logicRules[0].id, dropCreateRes.createdRuleId);
  assert.equal(updatedDietaryQ.logicRules[0].targetId, newRatingQ.id);

  // Verify deriveFlowGraph includes both the new question node and the new rule edge
  const derivedAfterDrop = deriveFlowGraph(dropCreateRes.form);
  assert.ok(derivedAfterDrop.nodes.some((n) => n.id === newRatingQ.id));
  assert.ok(
    derivedAfterDrop.edges.some(
      (e) =>
        e.sourceNodeId === 'q_rsvp_dietary' &&
        e.targetNodeId === newRatingQ.id &&
        e.kind === 'rule'
    )
  );

  // 2. Dragging a spaghetti line from the "default" handle of the new Rating question to create a Date question
  const defaultDropRes = createAndConnectQuestionOnCanvas(dropCreateRes.form, {
    questionType: 'date',
    position: { x: 1160, y: 460 },
    sourceQuestionId: newRatingQ.id,
    sourceHandleId: 'default',
  });
  assert.equal(defaultDropRes.valid, true);
  assert.equal(defaultDropRes.form.questions.length, initialCount + 2);
  const newDateQ = defaultDropRes.createdQuestion;
  assert.equal(newDateQ.type, 'date');

  // 3. Adding a standalone question from the Visual Canvas toolbar (no source handle)
  const toolbarAddRes = createAndConnectQuestionOnCanvas(defaultDropRes.form, {
    questionType: 'yes_no',
  });
  assert.equal(toolbarAddRes.valid, true);
  assert.equal(toolbarAddRes.form.questions.length, initialCount + 3);
  assert.equal(
    toolbarAddRes.form.questionOrder?.length,
    toolbarAddRes.form.questions.length
  );
});

test('22. UTM Parsing, Normalization, Missing Parameters, Malformed URLs & Safe Referrer Capture', () => {
  // 1. Standard and case-insensitive UTM parameter recognition
  const utmFromUrl = parseUtmParameters(
    'https://plyli.local/forms/rsvp?UTM_SOURCE=Substack&Utm_Medium=Email&utm_campaign=Autumn_Open_House&utm_content=Hero_CTA&utm_term=letterpress#section'
  );
  assert.deepEqual(utmFromUrl, {
    utm_source: 'Substack',
    utm_medium: 'Email',
    utm_campaign: 'Autumn_Open_House',
    utm_content: 'Hero_CTA',
    utm_term: 'letterpress',
  });

  // 2. Duplicate case variants keep the first non-empty match
  const dupUtm = parseUtmParameters(
    '?utm_source=&UTM_SOURCE=first_valid&utm_source=second_ignored'
  );
  assert.equal(dupUtm.utm_source, 'first_valid');

  // 3. Missing parameters are represented as null (never invented as Instagram/Telegram/etc.)
  const emptyUtm = parseUtmParameters('https://plyli.local/forms/rsvp');
  assert.deepEqual(emptyUtm, {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
  });

  // 4. Malformed URLs and sanitized HTML/length bounds
  const malformedUtm = parseUtmParameters(
    'http://[invalid-url?utm_source=<script>alert(1)</script>Newsletter&utm_campaign=' +
      'A'.repeat(200)
  );
  assert.equal(malformedUtm.utm_source, 'scriptalert(1)/scriptNewsletter');
  assert.equal(malformedUtm.utm_campaign?.length, 128);
  assert.equal(normalizeAttributionValue('   <img src=x>  '), 'img src=x');

  // 5. Referrer origin privacy: strips sensitive paths/queries, rejects javascript:, and ignores same-origin internal navigation
  assert.equal(
    extractSafeReferrerOrigin(
      'https://read.substack.com/p/autumn-issue?token=secret_123#top',
      'https://app.plyli.local'
    ),
    'https://read.substack.com'
  );
  assert.equal(
    extractSafeReferrerOrigin(
      'https://app.plyli.local/editor?formId=123',
      'https://app.plyli.local'
    ),
    null
  );
  assert.equal(extractSafeReferrerOrigin('javascript:alert(1)'), null);
  assert.equal(extractSafeReferrerOrigin('not-a-valid-url'), null);

  // 6. Direct/unknown session attribution when both UTM and referrer are absent
  const directAttr = captureSessionAttribution({
    urlOrSearch: '',
    rawReferrer: '',
    currentOrigin: 'http://localhost:3000',
  });
  assert.equal(directAttr.isDirectOrUnknown, true);
  assert.equal(directAttr.referrerOrigin, null);
  assert.equal(directAttr.utm.utm_source, null);

  // Viewport classification
  assert.equal(classifyViewportWidth(390), 'mobile');
  assert.equal(classifyViewportWidth(820), 'tablet');
  assert.equal(classifyViewportWidth(1440), 'desktop');
  assert.equal(classifyViewportWidth(undefined), 'unknown');
});

test('23. Campaign Link Builder: URL Encoding, Validation & Local Test URL Detection', () => {
  const built = buildCampaignUrl({
    baseUrl: 'http://localhost:3000/?existing=1',
    formId: 'form_seed_rsvp',
    includePreviewParam: true,
    utm_source: 'studio newsletter',
    utm_medium: 'email',
    utm_campaign: 'autumn & winter 2026',
    utm_content: 'top button',
    utm_term: 'printmaking + zines',
  });

  assert.equal(built.valid, true);
  assert.equal(built.isLocalTestUrl, true);
  assert.ok(built.url.includes('formId=form_seed_rsvp'));
  assert.ok(built.url.includes('preview=1'));
  assert.ok(built.url.includes('utm_source=studio+newsletter'));
  assert.ok(built.url.includes('utm_campaign=autumn+%26+winter+2026'));

  // Parsing the generated URL recovers the exact normalized UTM values
  const roundTrip = parseUtmParameters(built.url);
  assert.deepEqual(roundTrip, {
    utm_source: 'studio newsletter',
    utm_medium: 'email',
    utm_campaign: 'autumn & winter 2026',
    utm_content: 'top button',
    utm_term: 'printmaking + zines',
  });

  // Invalid base URL fails cleanly
  const invalidBase = buildCampaignUrl({
    baseUrl: 'javascript:alert(1)',
    utm_source: 'newsletter',
  });
  assert.equal(invalidBase.valid, false);
  assert.ok(invalidBase.errors.baseUrl);

  // Overlong parameter triggers validation error
  const overlong = buildCampaignUrl({
    baseUrl: 'http://localhost:3000',
    utm_source: 'x'.repeat(140),
  });
  assert.equal(overlong.valid, false);
  assert.ok(overlong.errors.utm_source);
});

test('24. Session Lifecycle, Attribution Persistence, Active-Time Pause/Resume & Privacy Enforcement', () => {
  const form = createEventRsvpForm('form_lifecycle_test');
  const entryAttr = captureSessionAttribution({
    urlOrSearch: '?utm_source=newsletter&utm_medium=email&utm_campaign=open_house',
    rawReferrer: 'https://newsletter.paperworks.org/issue-12?subscriber=secret',
    currentOrigin: 'http://localhost:3000',
    capturedAt: '2026-11-02T10:00:00.000Z',
  });

  const emitted: unknown[] = [];
  const tracker = new FormAnalyticsSessionTracker({
    formId: form.id,
    formRevision: form.revision,
    sessionId: 'sess_test_1',
    attribution: entryAttr,
    viewport: 'desktop',
    sessionSource: 'url_test',
    onEmit: (ev) => emitted.push(ev),
  });

  // Step 1: Form View at t=1000ms (duplicate call returns null)
  const viewEv = tracker.recordFormView(1000);
  assert.ok(viewEv);
  assert.equal(tracker.recordFormView(1200), null);

  // Step 2: Form Start at t=3000ms
  const startEv = tracker.recordFormStart(3000);
  assert.ok(startEv);
  assert.equal(tracker.recordFormStart(3100), null);

  // Step 3: View Q1 (name) at t=3000ms
  tracker.recordQuestionView('q_rsvp_name', 3000);

  // Trigger a validation error on Q1 at t=5000ms
  const valErrEv = tracker.recordValidationError(
    form.questions[0],
    'This question is required.',
    5000
  );
  assert.equal(valErrEv.errorCode, 'required');
  // Ensure raw answer is never stored on validation error event
  assert.equal(hasNoRawAnswerFields(valErrEv), true);

  // Pause session at t=8000ms (5s active on Q1 so far), stay in background tab for 60s until t=68000ms
  tracker.pause(8000);
  tracker.resume(68000);

  // Answer Q1 at t=71000ms (3s more active time -> total 8000ms active on Q1, excluding 60s hidden tab!)
  const ansQ1Ev = tracker.recordQuestionAnswered(
    form.questions[0],
    'Clara Oswald',
    'q_rsvp_attending',
    71000
  );
  assert.equal(ansQ1Ev.activeDurationMs, 8000);
  assert.equal(hasNoRawAnswerFields(ansQ1Ev), true);
  assert.equal(
    JSON.stringify(ansQ1Ev).includes('Clara Oswald'),
    false,
    'Behavioral event must never contain respondent raw text answer'
  );

  // Step 4: View Q2 (attending) at t=71000ms and answer "No" at t=75000ms (4s active), triggering rule_attending_no -> q_rsvp_note
  tracker.recordQuestionView('q_rsvp_attending', 71000);
  const ansQ2Ev = tracker.recordQuestionAnswered(
    form.questions[1],
    'No',
    'q_rsvp_note',
    75000
  );
  assert.equal(ansQ2Ev.ruleId, 'rule_attending_no');
  assert.equal(ansQ2Ev.targetNodeId, 'q_rsvp_note');

  // Step 5: View Q6 (note) at t=75000ms and complete form at t=79000ms (4s active)
  tracker.recordQuestionView('q_rsvp_note', 75000);
  tracker.recordQuestionAnswered(
    form.questions[5],
    'See you next spring!',
    'completion',
    79000
  );
  const completeRes = tracker.recordFormComplete(79000);
  assert.ok(completeRes.event);
  // Total active time = 5s (before pause) + 3s (Q1 after resume) + 4s (Q2) + 4s (Q6) = 16s
  assert.equal(completeRes.durationSeconds, 16);

  // Verify every emitted event preserved the original session-entry attribution
  const recordedEvents = tracker.getRecordedEvents();
  assert.ok(recordedEvents.length >= 6);
  for (const ev of recordedEvents) {
    assert.equal(ev.attribution?.utm.utm_source, 'newsletter');
    assert.equal(ev.attribution?.referrerOrigin, 'https://newsletter.paperworks.org');
    assert.equal(hasNoRawAnswerFields(ev), true);
  }

  // Sanitizing a malicious event object strips raw answer keys
  const sanitized = sanitizeAnalyticsEvent({
    ...recordedEvents[0],
    answer: 'secret@email.com',
    rawValue: 'Private note',
  }) as unknown as Record<string, unknown>;
  assert.equal(sanitized.answer, undefined);
  assert.equal(sanitized.rawValue, undefined);
});

test('25. Event Deduplication, Conversion Calculations, Completion Timing & Conditional Branch Analytics', () => {
  const form = createEventRsvpForm('form_conv_test');
  const nowMs = new Date('2026-11-02T12:00:00.000Z').getTime();

  // Session 1: Newsletter source, completes form via "No" branch in 20s
  const attrNewsletter = captureSessionAttribution({
    urlOrSearch: '?utm_source=newsletter&utm_medium=email&utm_campaign=launch',
  });
  const s1 = new FormAnalyticsSessionTracker({
    formId: form.id,
    sessionId: 's1',
    attribution: attrNewsletter,
    viewport: 'desktop',
  });
  s1.recordFormView(nowMs - 120_000);
  s1.recordFormStart(nowMs - 118_000);
  s1.recordQuestionView('q_rsvp_name', nowMs - 118_000);
  s1.recordQuestionAnswered(form.questions[0], 'Alice', 'q_rsvp_attending', nowMs - 110_000);
  s1.recordQuestionView('q_rsvp_attending', nowMs - 110_000);
  s1.recordQuestionAnswered(form.questions[1], 'No', 'q_rsvp_note', nowMs - 104_000);
  s1.recordQuestionView('q_rsvp_note', nowMs - 104_000);
  s1.recordQuestionAnswered(form.questions[5], 'Wish I could!', 'completion', nowMs - 98_000);
  const s1Comp = s1.recordFormComplete(nowMs - 98_000);

  const sub1 = processFormSubmission(
    form,
    {
      q_rsvp_name: 'Alice',
      q_rsvp_attending: 'No',
      q_rsvp_note: 'Wish I could!',
    },
    {
      durationSeconds: s1Comp.durationSeconds,
      visitedQuestionIds: ['q_rsvp_name', 'q_rsvp_attending', 'q_rsvp_note'],
      attribution: attrNewsletter,
      viewport: 'desktop',
      sessionId: 's1',
      submittedAt: new Date(nowMs - 98_000).toISOString(),
    }
  ).record!;

  // Session 2: Newsletter source, starts form, reaches Q2, hits validation error, then exits (incomplete)
  const s2 = new FormAnalyticsSessionTracker({
    formId: form.id,
    sessionId: 's2',
    attribution: attrNewsletter,
    viewport: 'mobile',
  });
  s2.recordFormView(nowMs - 90_000);
  s2.recordFormStart(nowMs - 88_000);
  s2.recordQuestionView('q_rsvp_name', nowMs - 88_000);
  s2.recordQuestionAnswered(form.questions[0], 'Bob', 'q_rsvp_attending', nowMs - 80_000);
  s2.recordQuestionView('q_rsvp_attending', nowMs - 80_000);
  s2.recordValidationError(form.questions[1], 'Please choose an option', nowMs - 75_000);
  s2.recordQuestionExit(nowMs - 70_000);

  // Session 3: Direct traffic, views welcome screen only and exits without starting
  const attrDirect = captureSessionAttribution({});
  const s3 = new FormAnalyticsSessionTracker({
    formId: form.id,
    sessionId: 's3',
    attribution: attrDirect,
    viewport: 'desktop',
  });
  s3.recordFormView(nowMs - 60_000);
  s3.recordQuestionExit(nowMs - 55_000);

  // Combine events and intentionally duplicate s1's events to test deduplication
  const allEvents = [
    ...s1.getRecordedEvents(),
    ...s1.getRecordedEvents(),
    ...s2.getRecordedEvents(),
    ...s3.getRecordedEvents(),
  ];
  const deduped = deduplicateAnalyticsEvents(allEvents);
  assert.equal(
    deduped.length,
    s1.getRecordedEvents().length +
      s2.getRecordedEvents().length +
      s3.getRecordedEvents().length
  );

  const report = computeFormAnalyticsReport(form, [sub1], allEvents, { nowMs });

  // 3 views (s1, s2, s3), 2 starts (s1, s2), 1 completed (s1), 2 incomplete (s2, s3)
  assert.equal(report.overview.formViews, 3);
  assert.equal(report.overview.formStarts, 2);
  assert.equal(report.overview.completedTrackedSessions, 1);
  assert.equal(report.overview.incompleteSessions, 2);
  assert.equal(report.overview.viewToStartRate, 66.7);
  assert.equal(report.overview.startToCompletionRate, 50);
  assert.equal(report.overview.viewToCompletionRate, 33.3);
  assert.equal(report.overview.avgCompletionSeconds, 20);
  assert.equal(report.overview.medianCompletionSeconds, 20);

  // Question-level & conditional flow analytics
  const q1Metric = report.questions.find((q) => q.questionId === 'q_rsvp_name')!;
  assert.equal(q1Metric.reachedCount, 2);
  assert.equal(q1Metric.answeredCount, 2);
  assert.equal(q1Metric.avgTimeSpentSeconds, 8);

  const q2Metric = report.questions.find((q) => q.questionId === 'q_rsvp_attending')!;
  assert.equal(q2Metric.reachedCount, 2);
  assert.equal(q2Metric.answeredCount, 1);
  assert.equal(q2Metric.exitCount, 1);
  assert.equal(q2Metric.validationErrorCount, 1);

  // Conditional branch rule edge (q_rsvp_attending -> q_rsvp_note via rule_attending_no) was traversed once
  const ruleEdge =
    report.flowOverlay.edgeTraversals['edge_rule_q_rsvp_attending_rule_attending_no'];
  assert.ok(ruleEdge);
  assert.equal(ruleEdge.count, 1);
  assert.equal(ruleEdge.targetNodeId, 'q_rsvp_note');

  // Acquisition source breakdown: newsletter (2 views, 1 completion -> 50% conversion) vs Direct / Unknown (1 view, 0 completions)
  const newsletterRow = report.acquisition.bySource.find(
    (r) => r.label === 'newsletter'
  )!;
  assert.equal(newsletterRow.views, 2);
  assert.equal(newsletterRow.completions, 1);
  assert.equal(newsletterRow.viewToCompletionRate, 50);

  const directRow = report.acquisition.bySource.find(
    (r) => r.isDirectOrUnknown
  )!;
  assert.equal(directRow.views, 1);
  assert.equal(directRow.completions, 0);
});

test('26. Historical Submissions Without Analytics Events: Zero Fabricated Views/UTMs & Preserved Answers', () => {
  const form = createEventRsvpForm('form_historical_only');
  const legacySub = processFormSubmission(
    form,
    {
      q_rsvp_name: 'Maren Lindqvist',
      q_rsvp_attending: 'No',
      q_rsvp_note: 'Historical submission before analytics tracking',
    },
    {
      durationSeconds: 42,
      visitedQuestionIds: ['q_rsvp_name', 'q_rsvp_attending', 'q_rsvp_note'],
    }
  ).record!;

  // Compute report with 1 historical submission and 0 behavioral analytics events
  const report = computeFormAnalyticsReport(form, [legacySub], []);

  // Views and starts are NEVER fabricated for historical submissions
  assert.equal(report.overview.hasTrackedBehavioralEvents, false);
  assert.equal(report.overview.formViews, 0);
  assert.equal(report.overview.formStarts, 0);
  assert.equal(report.overview.completedTrackedSessions, 0);
  assert.equal(report.overview.totalSubmissions, 1);
  assert.equal(report.overview.historicalPreAnalyticsSubmissions, 1);

  // Conversion rates are null (unavailable) when no view/start events have been recorded
  assert.equal(report.overview.viewToStartRate, null);
  assert.equal(report.overview.startToCompletionRate, null);
  assert.equal(report.overview.viewToCompletionRate, null);
  assert.equal(report.questions.find((question) => question.questionId === 'q_rsvp_name')?.reachedCount, 1);
  assert.equal(report.questions.find((question) => question.questionId === 'q_rsvp_guests')?.reachedCount, 0);

  // Completion time from the historical submission record is still accurately reported
  assert.equal(report.overview.avgCompletionSeconds, 42);
  assert.equal(report.overview.medianCompletionSeconds, 42);

  // Acquisition classifies the historical submission honestly as Direct / Unknown (never guessing a platform)
  assert.equal(report.acquisition.directOrUnknownSubmissions, 1);
  assert.equal(report.acquisition.attributedSubmissions, 0);
});

test('27. CSV & JSON Exports, Formula Injection Protection, and Storage Backup Persistence', () => {
  const form = createEventRsvpForm('form_export_test');
  const attr = captureSessionAttribution({
    urlOrSearch: '?utm_source=substack&utm_medium=email&utm_campaign=fall_rsvp',
    rawReferrer: 'https://substack.com/inbox',
  });

  const sub = processFormSubmission(
    form,
    {
      q_rsvp_name: '=cmd|\'/C calc\'!A0',
      q_rsvp_attending: 'No',
      q_rsvp_note: 'Hello, "studio" friends!',
    },
    {
      durationSeconds: 28,
      attribution: attr,
      viewport: 'mobile',
      sessionId: 'sess_csv_1',
    }
  ).record!;

  // 1. CSV export escapes quotes/commas and neutralizes spreadsheet formula injection (=cmd...)
  const csv = exportSubmissionsToCsv(form, [sub]);
  assert.ok(csv.includes('Submission ID,Submitted At,Duration (s),Form Revision,Viewport,UTM Source'));
  assert.ok(csv.includes("'=cmd|'/C calc'!A0"));
  assert.ok(csv.includes('"Hello, ""studio"" friends!"'));
  assert.ok(csv.includes('substack,email,fall_rsvp'));
  assert.equal(escapeCsvCell('=SUM(A1:A5)'), "'=SUM(A1:A5)");

  // 2. JSON export includes attribution, viewport, revision, and resolved historical items
  const jsonStr = exportSubmissionsToJson(form, [sub]);
  const parsedJson = JSON.parse(jsonStr);
  assert.equal(parsedJson.submissionCount, 1);
  assert.equal(parsedJson.submissions[0].attribution.utm.utm_source, 'substack');
  assert.equal(parsedJson.submissions[0].viewport, 'mobile');

  // 3. Storage adapter persists and migrates analyticsEvents alongside forms and responses
  const adapter = new InMemoryStorageAdapter();
  adapter.saveForm(form);
  adapter.saveSubmission(sub);

  const tracker = new FormAnalyticsSessionTracker({
    formId: form.id,
    sessionId: 'sess_csv_1',
    attribution: attr,
  });
  tracker.recordFormView();
  tracker.recordFormComplete();
  adapter.recordAnalyticsEvents(tracker.getRecordedEvents());

  const exportedBackup = adapter.exportData();
  const adapter2 = new InMemoryStorageAdapter();
  const importRes = adapter2.importData(exportedBackup);
  assert.equal(importRes.valid, true);
  assert.equal(adapter2.listAnalyticsEvents(form.id).length, tracker.getRecordedEvents().length);
  assert.equal(
    adapter2.listSubmissions(form.id)[0].attribution?.utm.utm_source,
    'substack'
  );

  // Bounded retention caps events per form
  const manyEvents = Array.from({ length: 15 }, (_, i) => ({
    id: `ev_${i}`,
    schemaVersion: 1,
    formId: form.id,
    formRevision: 1,
    sessionId: `s_${i}`,
    type: 'question_view' as const,
    questionId: 'q_rsvp_name',
    timestamp: new Date(10000 + i * 1000).toISOString(),
    sessionSource: 'local_preview' as const,
  }));
  const retained = appendAnalyticsEventsWithRetention([], manyEvents, {
    maxPerForm: 10,
    maxTotal: 10,
  });
  assert.equal(retained.length, 10);
  assert.equal(retained[0].id, 'ev_5');
});



