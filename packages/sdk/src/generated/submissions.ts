// Generated from Plyli core/submissions.ts; run pnpm sdk:sync in Plyli.
import {
  FormSchema,
  FormQuestion,
  AnswerValue,
  NormalizedAnswerEntry,
  FormResponseRecord,
  FormRevisionSnapshot,
  ExternalHostContext,
  QuestionType,
  generateId,
} from './types.js';
import { normalizeAnswerString } from './branching.js';
import { validateSubmission } from './validation.js';

export function normalizeQuestionAnswer(
  question: FormQuestion,
  value: AnswerValue
): NormalizedAnswerEntry {
  if (value === null || value === undefined) {
    return {
      questionId: question.id,
      value: null,
      displayValue: '',
    };
  }

  if (question.choices && question.choices.length > 0) {
    if (Array.isArray(value)) {
      const choiceIds: string[] = [];
      const labels: string[] = [];
      for (const item of value) {
        const str = String(item).trim();
        const found = question.choices.find(
          (c) =>
            c.id.toLowerCase() === str.toLowerCase() ||
            c.label.toLowerCase() === str.toLowerCase()
        );
        if (found) {
          choiceIds.push(found.id);
          labels.push(found.label);
        } else {
          labels.push(str);
        }
      }
      return {
        questionId: question.id,
        value: choiceIds.length > 0 ? choiceIds : value,
        choiceIds,
        displayValue: labels.join(', '),
      };
    }

    const str = String(value).trim();
    const found = question.choices.find(
      (c) =>
        c.id.toLowerCase() === str.toLowerCase() ||
        c.label.toLowerCase() === str.toLowerCase()
    );
    if (found) {
      return {
        questionId: question.id,
        value: found.id,
        choiceIds: [found.id],
        displayValue: found.label,
      };
    }
  }

  return {
    questionId: question.id,
    value,
    displayValue: normalizeAnswerString(value, question),
  };
}

export function createRevisionSnapshot(form: FormSchema): FormRevisionSnapshot {
  return {
    formId: form.id,
    revision: form.revision || 1,
    savedAt: new Date().toISOString(),
    title: form.title,
    questions: JSON.parse(JSON.stringify(form.questions)),
    completionScreen: JSON.parse(JSON.stringify(form.completionScreen)),
  };
}

export interface CreateSubmissionOptions {
  durationSeconds?: number;
  visitedQuestionIds?: string[];
  externalContext?: ExternalHostContext;
  submittedAt?: string;
  attribution?: FormResponseRecord['attribution'];
  viewport?: FormResponseRecord['viewport'];
  sessionId?: string;
  sessionSource?: FormResponseRecord['sessionSource'];
}

export function processFormSubmission(
  form: FormSchema,
  rawAnswers: Record<string, AnswerValue>,
  options: CreateSubmissionOptions = {}
): {
  valid: boolean;
  errors: Record<string, string>;
  record?: FormResponseRecord;
  revisionSnapshot?: FormRevisionSnapshot;
} {
  const validation = validateSubmission(form, rawAnswers);
  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
    };
  }

  // Derive persistence from the engine, not client-supplied navigation history.
  const visitedIds = validation.activeQuestionIds;

  const normalizedAnswers: Record<string, NormalizedAnswerEntry> = {};
  const compatibleAnswers: Record<string, AnswerValue> = {};

  for (const qId of visitedIds) {
    const question = form.questions.find((q) => q.id === qId);
    const rawVal = rawAnswers[qId];
    if (question) {
      const norm = normalizeQuestionAnswer(question, rawVal);
      normalizedAnswers[qId] = norm;
      compatibleAnswers[qId] = rawVal;
    } else if (rawVal !== undefined) {
      compatibleAnswers[qId] = rawVal;
    }
  }

  const record: FormResponseRecord = {
    id: generateId('resp'),
    formId: form.id,
    formRevision: form.revision || 1,
    submittedAt: options.submittedAt || new Date().toISOString(),
    durationSeconds: options.durationSeconds ?? 30,
    answers: compatibleAnswers,
    normalizedAnswers,
    visitedQuestionIds: visitedIds,
    ...(options.externalContext ? { externalContext: options.externalContext } : {}),
    ...(options.attribution ? { attribution: options.attribution } : {}),
    ...(options.viewport ? { viewport: options.viewport } : {}),
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    ...(options.sessionSource ? { sessionSource: options.sessionSource } : {}),
  };

  return {
    valid: true,
    errors: {},
    record,
    revisionSnapshot: createRevisionSnapshot(form),
  };
}

export interface ResolvedSubmissionItem {
  questionId: string;
  questionTitle: string;
  questionType: QuestionType;
  displayAnswer: string;
  wasVisited: boolean;
  isDeletedInCurrentForm: boolean;
}

/**
 * Resolves a historical submission against its referenced form revision snapshot
 * (if available) and the current form definition, ensuring renamed or deleted
 * questions and choices remain meaningful.
 */
export function resolveHistoricalSubmissionItems(
  currentForm: FormSchema,
  response: FormResponseRecord,
  revisions: FormRevisionSnapshot[] = []
): ResolvedSubmissionItem[] {
  const matchingSnapshot = revisions.find(
    (rev) =>
      rev.formId === response.formId && rev.revision === response.formRevision
  );

  const sourceQuestions = matchingSnapshot
    ? matchingSnapshot.questions
    : currentForm.questions;

  const currentQuestionIds = new Set(currentForm.questions.map((q) => q.id));
  const visitedSet = new Set(
    response.visitedQuestionIds || Object.keys(response.answers)
  );

  const items: ResolvedSubmissionItem[] = sourceQuestions.map((q) => {
    const normEntry = response.normalizedAnswers?.[q.id];
    const rawVal = response.answers[q.id];
    let displayAnswer = '';

    if (normEntry && normEntry.choiceIds && normEntry.choiceIds.length > 0 && q.choices) {
      const resolvedLabels = normEntry.choiceIds.map((cId) => {
        const found = q.choices?.find((c) => c.id === cId);
        return found ? found.label : normEntry.displayValue;
      });
      displayAnswer = resolvedLabels.join(', ');
    } else if (normEntry && normEntry.displayValue) {
      displayAnswer = normEntry.displayValue;
    } else {
      displayAnswer = normalizeAnswerString(rawVal, q);
    }

    return {
      questionId: q.id,
      questionTitle: q.title,
      questionType: q.type,
      displayAnswer,
      wasVisited: visitedSet.has(q.id),
      isDeletedInCurrentForm: !currentQuestionIds.has(q.id),
    };
  });

  // Also include any answered question IDs present in response that weren't in sourceQuestions
  const includedIds = new Set(items.map((i) => i.questionId));
  for (const qId of Object.keys(response.answers)) {
    if (!includedIds.has(qId)) {
      const norm = response.normalizedAnswers?.[qId];
      items.push({
        questionId: qId,
        questionTitle: `Archived Question (${qId})`,
        questionType: 'short_text',
        displayAnswer:
          norm?.displayValue || normalizeAnswerString(response.answers[qId]),
        wasVisited: true,
        isDeletedInCurrentForm: true,
      });
    }
  }

  return items;
}

export interface QuestionSummaryStats {
  questionId: string;
  questionTitle: string;
  questionType: QuestionType;
  answeredCount: number;
  skippedCount: number;
  choiceCounts?: { id: string; label: string; count: number; percentage: number }[];
  averageNumber?: number;
  recentTextAnswers?: string[];
}

export function computeQuestionSummaries(
  form: FormSchema,
  responses: FormResponseRecord[]
): QuestionSummaryStats[] {
  return form.questions.map((q) => {
    let answeredCount = 0;
    const rawEntries: { raw: AnswerValue; norm?: NormalizedAnswerEntry }[] = [];

    for (const resp of responses) {
      const val = resp.answers[q.id];
      const norm = resp.normalizedAnswers?.[q.id];
      const isEmpty =
        val === null ||
        val === undefined ||
        (typeof val === 'string' && val.trim() === '') ||
        (Array.isArray(val) && val.length === 0);

      if (!isEmpty) {
        answeredCount++;
        rawEntries.push({ raw: val, norm });
      }
    }

    const skippedCount = Math.max(0, responses.length - answeredCount);

    if (
      q.type === 'single_choice' ||
      q.type === 'multiple_choice' ||
      q.type === 'dropdown' ||
      q.type === 'yes_no'
    ) {
      const options =
        q.type === 'yes_no'
          ? [
              { id: 'yes', label: 'Yes' },
              { id: 'no', label: 'No' },
            ]
          : q.choices || [];

      const countById = new Map<string, number>();
      options.forEach((opt) => countById.set(opt.id, 0));

      for (const entry of rawEntries) {
        if (entry.norm?.choiceIds && entry.norm.choiceIds.length > 0) {
          for (const cId of entry.norm.choiceIds) {
            const matched = options.find(
              (o) => o.id.toLowerCase() === cId.toLowerCase()
            );
            if (matched) {
              countById.set(matched.id, (countById.get(matched.id) || 0) + 1);
            }
          }
          continue;
        }

        const tokens = Array.isArray(entry.raw) ? entry.raw : [entry.raw];
        for (const tok of tokens) {
          const str = String(tok).trim().toLowerCase();
          const matched = options.find(
            (o) =>
              o.id.toLowerCase() === str || o.label.toLowerCase() === str
          );
          if (matched) {
            countById.set(matched.id, (countById.get(matched.id) || 0) + 1);
          }
        }
      }

      const choiceCounts = options.map((opt) => {
        const count = countById.get(opt.id) || 0;
        return {
          id: opt.id,
          label: opt.label,
          count,
          percentage:
            answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0,
        };
      });

      return {
        questionId: q.id,
        questionTitle: q.title,
        questionType: q.type,
        answeredCount,
        skippedCount,
        choiceCounts,
      };
    }

    if (q.type === 'rating' || q.type === 'number') {
      const nums = rawEntries
        .map((e) => Number(e.raw))
        .filter((n) => !Number.isNaN(n));
      const averageNumber =
        nums.length > 0
          ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1))
          : undefined;

      let choiceCounts:
        | { id: string; label: string; count: number; percentage: number }[]
        | undefined;
      if (q.type === 'rating') {
        const max = q.maxRating || 5;
        choiceCounts = Array.from({ length: max }, (_, idx) => {
          const ratingNum = idx + 1;
          const count = nums.filter((n) => n === ratingNum).length;
          return {
            id: `star_${ratingNum}`,
            label: `${ratingNum} ★`,
            count,
            percentage:
              answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0,
          };
        });
      }

      return {
        questionId: q.id,
        questionTitle: q.title,
        questionType: q.type,
        answeredCount,
        skippedCount,
        averageNumber,
        choiceCounts,
      };
    }

    const recentTextAnswers = rawEntries
      .slice(-5)
      .reverse()
      .map((e) => e.norm?.displayValue || normalizeAnswerString(e.raw, q));

    return {
      questionId: q.id,
      questionTitle: q.title,
      questionType: q.type,
      answeredCount,
      skippedCount,
      recentTextAnswers,
    };
  });
}
